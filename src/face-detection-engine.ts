/**
 * Face Detection Engine - Core Detection Engine
 * Framework-agnostic face liveness detection engine
 */

import Human, { Box, FaceResult, GestureResult } from '@vladmandic/human'
import type {
  FaceDetectionEngineOptions,
  DetectorInfoEventData,
  DetectorFinishEventData,
  DetectorErrorEventData,
  DetectorDebugEventData,
  DetectorActionEventData,
  DetectorLoadedEventData,
  ResolvedEngineOptions
} from './types'
import { LivenessAction, ErrorCode, DetectionCode, LivenessActionStatus, DetectionPeriod, EngineState } from './enums'
import { mergeOptions } from './config'
import { SimpleEventEmitter } from './event-emitter'
import { calcFaceFrontal } from './face-frontal-calculator'
import { calcImageQuality } from './image-quality-calculator'
import { loadOpenCV, loadHuman, getOpenCVVersion, detectBrowserEngine } from './library-loader'
import { drawCanvasToMat, matToGray } from './browser_utils'
import { createDetectionState, DetectionState } from './face-detection-state'

/**
 * Detector info parameters
 */
interface DetectorInfoParams {
  passed?: boolean
  code: DetectionCode
  message?: string
  faceCount?: number
  faceRatio?: number
  faceFrontal?: number
  imageQuality?: number
  motionScore?: number
  keypointVariance?: number
  motionType?: string
  screenConfidence?: number
}

/**
 * Framework-agnostic face liveness detection engine
 * Provides core detection logic without UI dependencies
 */
export class FaceDetectionEngine extends SimpleEventEmitter {
  private options: ResolvedEngineOptions
  // OpenCV instance
  private cv: any = null  
  private human: Human | null = null
  
  private engineState: EngineState = EngineState.IDLE

  // 视频及保存当前帧图片的Canvas元素
  private videoElement: HTMLVideoElement | null = null
  private stream: MediaStream | null = null  
  private frameCanvasElement: HTMLCanvasElement | null = null
  private frameCanvasContext: CanvasRenderingContext2D | null = null
  private faceCanvasElement: HTMLCanvasElement | null = null
  private faceCanvasContext: CanvasRenderingContext2D | null = null

  private detectionFrameId: number | null = null

  private actualVideoWidth: number = 0
  private actualVideoHeight: number = 0

  private detectionState: DetectionState

  /**
   * Constructor
   * @param config - Configuration object
   */
  constructor(options?: Partial<FaceDetectionEngineOptions>) {
    super()
    this.options = mergeOptions(options)
    this.detectionState = createDetectionState(this.options)
  }

  /**
   * 提取错误信息的辅助方法 - 处理各种错误类型
   * @param error - 任意类型的错误对象
   * @returns 包含错误消息和堆栈的对象
   */
  private extractErrorInfo(error: any): { message: string; stack: string; name?: string; cause?: string } {
    // 处理 Error 实例
    if (error instanceof Error) {
      let causeStr: string | undefined
      if (error.cause) {
        causeStr = error.cause instanceof Error ? error.cause.message : String(error.cause)
      }
      return {
        message: error.message || 'Unknown error',
        stack: error.stack || this.getStackTrace(),
        name: error.name,
        cause: causeStr
      }
    }

    // 处理其他对象类型
    if (typeof error === 'object' && error !== null) {
      let causeStr: string | undefined
      if ('cause' in error) {
        const cause = (error as any).cause
        causeStr = cause instanceof Error ? cause.message : String(cause)
      }
      return {
        message: error.message || JSON.stringify(error),
        stack: error.stack || this.getStackTrace(),
        name: error.name,
        cause: causeStr
      }
    }

    // 处理基本类型（string, number 等）
    return {
      message: String(error),
      stack: this.getStackTrace()
    }
  }

  /**
   * 获取当前调用栈信息
   */
  private getStackTrace(): string {
    try {
      // 创建一个Error对象来获取堆栈
      const err = new Error()
      if (err.stack) {
        // 移除前两行（Error 和 getStackTrace 本身）
        const lines = err.stack.split('\n')
        return lines.slice(2).join('\n') || 'Stack trace unavailable'
      }
      return 'Stack trace unavailable'
    } catch {
      return 'Stack trace unavailable'
    }
  }

  updateOptions(options?: Partial<FaceDetectionEngineOptions>): void {
    if(this.engineState == EngineState.DETECTING){
      this.stopDetection(false)
    }
    this.options = mergeOptions(options)
    this.detectionState = createDetectionState(this.options)
    this.detectionState.setCVInstance(this.cv)
  }

  getEngineState(): EngineState {
    return this.engineState
  }

  /**
   * Initialize the detection engine
   * Loads Human.js and OpenCV.js libraries
   *
   * @returns Promise that resolves when initialization is complete
   * @throws Error if initialization fails
   */
  async initialize(): Promise<void> {
    if (this.engineState === EngineState.INITIALIZING || this.engineState === EngineState.READY || this.engineState === EngineState.DETECTING) {
      return
    }

    this.engineState = EngineState.INITIALIZING
    this.emitDebug('initialization', 'Starting to load detection libraries...')

    try {
      // Load OpenCV
      this.emitDebug('initialization', 'Loading OpenCV...')
      const { cv } = await loadOpenCV(60000) // 1 minute timeout
      if(!cv || !(cv as any).Mat) {
        const cvError: DetectorErrorEventData = {
          code: ErrorCode.DETECTOR_NOT_INITIALIZED,
          message: 'Failed to load OpenCV.js: module is null or invalid'
        }
        this.emit('detector-error', cvError)
        this.emitDebug('initialization', 'OpenCV loading failed: module is null or invalid', {}, 'error')
        return
      }
      this.cv = cv
      const cv_version = getOpenCVVersion()
      this.emitDebug('initialization', 'OpenCV loaded successfully', {
        version: cv_version
      })
      console.log('[FaceDetectionEngine] OpenCV loaded successfully', {
        version: cv_version
      })

      // Inject OpenCV instance into motion detector and screen detector
      this.detectionState.setCVInstance(this.cv)

      // Load Human.js
      console.log('[FaceDetectionEngine] Loading Human.js models...')
      this.emitDebug('initialization', 'Loading Human.js...')
      const humanStartTime = performance.now()
      
      try {
        this.human = await loadHuman(this.options.human_model_path, this.options.tensorflow_wasm_path, this.options.tensorflow_backend)
      } catch (humanError) {
        const errorInfo = this.extractErrorInfo(humanError)
        const errorMsg = errorInfo.message
        
        // 分析错误类型，提供针对性的建议
        let errorContext: any = {
          error: errorMsg,
          stack: errorInfo.stack,
          name: errorInfo.name,
          cause: errorInfo.cause,
          userAgent: navigator.userAgent,
          platform: (navigator as any).userAgentData?.platform || 'unknown',
          browser: detectBrowserEngine(navigator.userAgent),
          backend: this.options.tensorflow_backend,
          source: 'human.js'
        }
        
        // 特定错误类型的诊断
        if (errorMsg.includes('inputs')) {
          errorContext.diagnosis = 'Human.js internal error: Model structure incomplete'
          errorContext.rootCause = 'Human.js library issue - models not fully loaded or WASM backend initialization incomplete'
          errorContext.suggestion = 'This is a Human.js library issue. Models may not have proper executor or inputs structure. Check WASM initialization and model integrity.'
        } else if (errorMsg.includes('timeout')) {
          errorContext.diagnosis = 'Model loading timeout'
          errorContext.suggestion = 'Network issue or model file too large - check network conditions'
        } else if (errorMsg.includes('Critical models not loaded')) {
          errorContext.diagnosis = 'Human.js failed to load required models'
          errorContext.rootCause = 'Models (face, antispoof, liveness) are missing or incomplete'
          errorContext.suggestion = 'Check model files and ensure WASM backend is properly initialized'
        } else if (errorMsg.includes('empty')) {
          errorContext.diagnosis = 'Models object is empty after loading'
          errorContext.suggestion = 'Model path may be incorrect or HTTP response failed'
        } else if (errorMsg.includes('incomplete')) {
          errorContext.diagnosis = 'Models loaded but structure is incomplete'
          errorContext.rootCause = 'Human.js internal issue - missing executor, inputs, or modelUrl'
          errorContext.suggestion = 'Ensure all model resources are fully loaded and accessible'
        }
        
        const humanErrorEventData: DetectorErrorEventData = {
          code: ErrorCode.DETECTOR_NOT_INITIALIZED,
          message: `Human.js loading error: ${errorContext.diagnosis || errorMsg}`,
        }
        console.error('[FaceDetectionEngine] Human.js loading failed with detailed error:', errorContext)
        this.emitDebug('initialization', 'Human.js loading failed with exception', errorContext, 'error')
        this.emit('detector-loaded' as any, {
          success: false,
          error: `Failed to load Human.js: ${errorMsg}`,
          details: errorContext
        })
        this.emit('detector-error', humanErrorEventData)
        return
      }
      
      const humanLoadTime = performance.now() - humanStartTime
      
      if (!this.human) {
        const errorMsg = 'Failed to load Human.js: instance is null'
        console.error('[FaceDetectionEngine] ' + errorMsg)
        this.emitDebug('initialization', errorMsg, { loadTime: humanLoadTime }, 'error')
        this.emit('detector-loaded' as any, {
          success: false,
          error: errorMsg
        })
        this.emit('detector-error' as any, {
          code: ErrorCode.DETECTOR_NOT_INITIALIZED,
          message: errorMsg
        })
        return
      }
      
      // Verify Human.js instance has required properties
      if (!this.human.version || typeof this.human.detect !== 'function') {
        const errorMsg = 'Human.js instance is incomplete: missing version or detect method'
        console.error('[FaceDetectionEngine] ' + errorMsg)
        this.emitDebug('initialization', errorMsg, {
          hasVersion: !!this.human.version,
          hasDetect: typeof this.human.detect === 'function',
          instanceKeys: Object.keys(this.human || {})
        }, 'error')
        this.emit('detector-loaded' as any, {
          success: false,
          error: errorMsg
        })
        this.emit('detector-error' as any, {
          code: ErrorCode.DETECTOR_NOT_INITIALIZED,
          message: errorMsg
        })
        return
      }
      
      this.emitDebug('initialization', 'Human.js loaded successfully', {
        loadTime: `${humanLoadTime.toFixed(2)}ms`,
        version: this.human.version,
        backend: this.human.config?.backend || 'unknown',
        config: this.human.config
      })
      console.log('[FaceDetectionEngine] Human.js loaded successfully', {
        loadTime: `${humanLoadTime.toFixed(2)}ms`,
        version: this.human.version,
        backend: this.human.config?.backend || 'unknown'
      })

      this.engineState = EngineState.READY
      const loadedData: DetectorLoadedEventData = {
        success: true,
        opencv_version: cv_version,
        human_version: this.human.version
      }
      console.log('[FaceDetectionEngine] Engine initialized and ready', {
        opencv_version: loadedData.opencv_version,
        human_version: loadedData.human_version
      })
      this.emit('detector-loaded', loadedData)
      this.emitDebug('initialization', 'Engine initialized and ready', loadedData)
    } catch (error) {
      const errorInfo = this.extractErrorInfo(error)
      const errorMsg = errorInfo.message
      this.emit('detector-loaded' as any, {
        success: false,
        error: errorMsg
      })
      this.emit('detector-error' as any, {
        code: ErrorCode.DETECTOR_NOT_INITIALIZED,
        message: errorMsg
      })
      this.emitDebug('initialization', 'Failed to load libraries', {
        error: errorMsg,
        stack: errorInfo.stack,
        name: errorInfo.name,
        cause: errorInfo.cause
      }, 'error')
    } finally {
      if (this.engineState === EngineState.INITIALIZING) {
        this.engineState = EngineState.IDLE
      }
    }
  }

  /**
   * Start face detection
   * Requires initialize() to be called first and a video element to be provided
   *
   * @param videoElement - HTMLVideoElement to capture from
   * @returns Promise that resolves when detection starts
   * @throws Error if not initialized or video setup fails
   */
  async startDetection(videoElement: HTMLVideoElement): Promise<void> {
    if (this.engineState !== EngineState.READY) {
      this.emitDebug('detection', 'Engine not ready', { state: this.engineState }, 'warn')
      throw new Error('Engine not initialized. Call initialize() first.')
    }

    this.videoElement = videoElement

    this.resetDetectionState()

    try {
      this.emitDebug('video-setup', 'Requesting camera access...')

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: this.options.detect_video_ideal_width },
            height: { ideal: this.options.detect_video_ideal_height },
            aspectRatio: { ideal: this.options.detect_video_ideal_width / this.options.detect_video_ideal_height }
          },
          audio: false
        })
        this.emitDebug('video-setup', 'Camera access granted', {
          trackCount: this.stream.getTracks().length
        })
      } catch (err) {
        const error = err as DOMException
        const isCameraAccessDenied = 
          error.name === 'NotAllowedError' || 
          error.name === 'PermissionDeniedError' ||
          error.message.includes('Permission denied') ||
          error.message.includes('Permission dismissed')
        
        this.emitDebug('video-setup', 'Camera access failed', {
          errorName: error.name,
          errorMessage: error.message,
          isCameraAccessDenied
        }, 'error')
        
        if (isCameraAccessDenied) {
          this.emit('detector-error' as any, {
            code: ErrorCode.CAMERA_ACCESS_DENIED,
            message: 'Camera access denied by user'
          })
        } else {
          this.emit('detector-error' as any, {
            code: ErrorCode.STREAM_ACQUISITION_FAILED,
            message: error.name || 'UnknownError' + ": " + error.message || 'Unknown error message'
          })
        }
        
        throw err
      }

      if (!this.stream) {
        throw new Error('Media stream is null')
      }

      // Set up video element
      this.videoElement.srcObject = this.stream
      this.videoElement.autoplay = true
      this.videoElement.playsInline = true
      this.videoElement.muted = true
      
      // Apply mirror effect if configured
      if (this.options.detect_video_mirror) {
        this.videoElement.style.transform = 'scaleX(-1)'
      }

      // Get actual video stream resolution
      const videoTrack = this.stream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings?.()
        if (settings) {
          this.actualVideoWidth = settings.width || this.videoElement.videoWidth
          this.actualVideoHeight = settings.height || this.videoElement.videoHeight
          this.emitDebug('video-setup', 'Video stream resolution detected', {
            width: this.actualVideoWidth,
            height: this.actualVideoHeight
          })
        }
      }

      // Wait for video to be ready
      this.emitDebug('video-setup', 'Waiting for video to be ready...')
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup()
          this.emit('detector-error' as any, {
            code: ErrorCode.STREAM_ACQUISITION_FAILED,
            message: 'Video loading timeout'
          })
          this.stopDetection(false)
          reject(new Error('Video loading timeout'))
        }, this.options.detect_video_load_timeout)

        const onCanPlay = () => {
          clearTimeout(timeout)
          cleanup()
          this.emitDebug('video-setup', 'Video is ready')
          resolve()
        }

        const cleanup = () => {
          if (this.videoElement) {
            this.videoElement.removeEventListener('canplay', onCanPlay)
          }
        }

        if (this.videoElement) {
          this.videoElement.addEventListener('canplay', onCanPlay, { once: true })
          this.videoElement.play().catch((err: any) => {
            clearTimeout(timeout)
            cleanup()
            const errorInfo = this.extractErrorInfo(err)
            this.emitDebug('video-setup', 'Failed to play video', {
              error: errorInfo.message,
              stack: errorInfo.stack,
              name: errorInfo.name,
              cause: errorInfo.cause
            }, 'error')
            reject(err)
          })
        }
      })

      this.engineState = EngineState.DETECTING
      this.scheduleNextDetection(0)

      this.emitDebug('video-setup', 'Detection started')
    } catch (error) {
      const errorInfo = this.extractErrorInfo(error)
      const errorMsg = errorInfo.message
      this.emitDebug('video-setup', 'Failed to start detection', {
        error: errorMsg,
        stack: errorInfo.stack,
        name: errorInfo.name,
        cause: errorInfo.cause
      }, 'error')
      this.emit('detector-error' as any, {
        code: ErrorCode.STREAM_ACQUISITION_FAILED,
        message: errorMsg
      })
      this.stopDetection(false)
    }
  }

  /**
   * Stop face detection
   * @param success - Whether to display the best collected image
   */
  stopDetection(success: boolean): void {
    this.engineState = EngineState.READY

    const finishData: DetectorFinishEventData = {
      success: success,
      silentPassedCount: this.detectionState.collectCount,
      actionPassedCount: this.detectionState.completedActions.size,
      totalTime: performance.now() - this.detectionState.startTime,
      bestQualityScore: this.detectionState.bestQualityScore,
      bestFrameImage: this.detectionState.bestFrameImage,
      bestFaceImage: this.detectionState.bestFaceImage
    }
    this.emit('detector-finish' as any, finishData)

    this.cancelPendingDetection()

    this.resetDetectionState()

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null
    }

    this.emitDebug('detection', 'Detection stopped', { success })
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getOptions(): FaceDetectionEngineOptions {
    return { ...this.options }
  }

  // ==================== Private Methods ====================

  /**
   * Reset detection state
   */
  private resetDetectionState(): void {
    this.detectionState.reset()
    this.actualVideoWidth = 0
    this.actualVideoHeight = 0
    this.clearFrameCanvas()
    this.clearFaceCanvas()
  }

  /**
   * Schedule next detection frame
   */
  private scheduleNextDetection(delayMs: number = this.options.detect_frame_delay): void {
    if (this.engineState !== EngineState.DETECTING) return

    if (this.detectionFrameId !== null) {
      clearTimeout(this.detectionFrameId as any)
    }

    this.detectionFrameId = setTimeout(() => {
      if (this.engineState === EngineState.DETECTING) {
        this.detect()
      }
    }, delayMs) as any
  }

  /**
   * Cancel pending detection frame
   */
  private cancelPendingDetection(): void {
    if (this.detectionFrameId !== null) {
      cancelAnimationFrame(this.detectionFrameId)
      this.detectionFrameId = null
    }
  }

  /**
   * Main detection loop
   */
  private async detect(): Promise<void> {
    if (this.engineState !== EngineState.DETECTING || !this.videoElement || !this.human) {
      this.scheduleNextDetection()
      return
    }

    try {
      // Check video is ready
      if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.scheduleNextDetection(this.options.detect_error_retry_delay)
        return
      }

      // Perform face detection
      let result
      try {
        result = await this.human.detect(this.videoElement)
      } catch (detectError) {
        const errorInfo = this.extractErrorInfo(detectError)
        const errorMsg = errorInfo.message
        this.emitDebug('detection', 'Human.detect() call failed', {
          error: errorMsg,
          stack: errorInfo.stack,
          name: errorInfo.name,
          hasHuman: !!this.human,
          humanVersion: this.human?.version,
          videoReadyState: this.videoElement?.readyState,
          videoWidth: this.videoElement?.videoWidth,
          videoHeight: this.videoElement?.videoHeight
        }, 'error')
        this.scheduleNextDetection(this.options.detect_error_retry_delay)
        return
      }

      if (!result) {
        this.emitDebug('detection', 'Face detection returned null result', {}, 'warn')
        this.scheduleNextDetection(this.options.detect_error_retry_delay)
        return
      }

      const faces = result.face || []
      const gestures = result.gesture || []

      if (faces.length === 1) {
        this.handleSingleFace(faces[0], gestures)
      } else {
        this.handleMultipleFaces(faces.length)
      }
    } catch (error) {
      const errorInfo = this.extractErrorInfo(error)
      const errorMsg = errorInfo.message
      this.emitDebug('detection', 'Unexpected error in detection loop', {
        error: errorMsg,
        stack: errorInfo.stack,
        name: errorInfo.name,
        cause: errorInfo.cause
      }, 'error')
      this.scheduleNextDetection(this.options.detect_error_retry_delay)
    }
  }

  private getPerformActionCount(): number{
    if (this.options.action_liveness_action_count <= 0){
      this.emitDebug('config', 'liveness_action_count is 0 or negative', { count: this.options.action_liveness_action_count }, 'warn')
      return 0
    }
    const actionListLength = this.options.action_liveness_action_list?.length ?? 0
    if (actionListLength === 0) {
      this.emitDebug('config', 'liveness_action_list is empty', { actionListLength }, 'warn')
    }
    return Math.min(this.options.action_liveness_action_count, actionListLength)
  }

  /**
   * Handle single face detection
   */
  private handleSingleFace(face: FaceResult, gestures: GestureResult[]): void {
    const faceBox = face.box || face.boxRaw

    if (!faceBox) {
      console.warn('[FaceDetector] Face detected but no box/boxRaw property')
      this.emitDebug('detection', 'Face box is missing - face detected but no box/boxRaw property', {}, 'warn')
      this.scheduleNextDetection(this.options.detect_error_retry_delay)
      return
    }

    // 采集当前帧，转为gray mat
    const frameCanvas = this.drawVideoToCanvas()
    if (!frameCanvas) {
      this.emitDebug('detection', 'Failed to draw video frame to canvas', {}, 'warn')
      this.scheduleNextDetection(this.options.detect_error_retry_delay)
      return
    }
    
    // 所有需要删除的 Mat 对象
    let bgrFrame: any = null
    let grayFrame: any = null
    let bgrFace: any = null
    let grayFace: any = null

    try {
      // 当前帧图片
      bgrFrame = drawCanvasToMat(this.cv, frameCanvas, false)
      if (!bgrFrame) {
        this.emitDebug('detection', 'Failed to convert canvas to OpenCV Mat', {}, 'warn')
        this.scheduleNextDetection(this.options.detect_error_retry_delay)
        return
      }

      // 当前帧灰度图片
      grayFrame = matToGray(this.cv, bgrFrame)
      if (!grayFrame) {
        this.emitDebug('detection', 'Failed to convert frame Mat to grayscale', {}, 'warn')
        this.scheduleNextDetection(this.options.detect_error_retry_delay)
        return
      }    

      // 提取人脸区域图片及灰度图片
      bgrFace = bgrFrame.roi(new this.cv.Rect(faceBox[0], faceBox[1], faceBox[2], faceBox[3]))
      grayFace = matToGray(this.cv, bgrFace)
      if (!grayFace) {
        this.emitDebug('detection', 'Failed to convert face Mat to grayscale', {}, 'warn')
        this.scheduleNextDetection(this.options.detect_error_retry_delay)
        return
      }

      if(!this.detectionState.screenDetector) {
        this.emit('detector-error' as any, {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Screen capture detector is not initialized'
        })
        this.stopDetection(false)
        return
      }

      if(!this.detectionState.motionDetector){
        this.emit('detector-error' as any, {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Motion liveness detector is not initialized'
        })
        this.stopDetection(false)
        return
      }

      // 屏幕捕获检测, 只关心脸部区域
      const screenResult = this.detectionState.screenDetector.detectAuto(bgrFace, grayFace)
      // 屏幕捕获检测器已经准备就绪，其验证结果可信
      if(screenResult.isScreenCapture){
        this.emitDetectorInfo({ code: DetectionCode.FACE_NOT_REAL, message: screenResult.getMessage(), screenConfidence: screenResult.confidenceScore })
        this.emitDebug('screen-capture-detection', 'Screen capture detected - possible video replay attack', {
          confidence: screenResult.confidenceScore,
          minConfidence: this.options.screen_capture_confidence_threshold
        }, 'warn')
        this.resetDetectionState()
        this.scheduleNextDetection(this.options.detect_error_retry_delay)
        return
      }

      // 运动检测
      const motionResult = this.detectionState.motionDetector.analyzeMotion(grayFrame, face, faceBox)
      if(this.detectionState.motionDetector.isReady()){
        // 运动检测器已经准备就绪，其验证结果可信
        if (!motionResult.isLively) {
          this.emitDebug('motion-detection', 'Motion liveness check failed - possible photo attack', {
            motionScore: motionResult.motionScore,
            keypointVariance: motionResult.keypointVariance,
            opticalFlowMagnitude: motionResult.opticalFlowMagnitude,
            eyeMotionScore: motionResult.eyeMotionScore,
            mouthMotionScore: motionResult.mouthMotionScore,
            motionType: motionResult.motionType,
            minMotionScore: this.options.motion_liveness_min_motion_score,
            minKeypointVariance: this.options.motion_liveness_min_keypoint_variance,
            minOpticalFlowThreshold: this.options.motion_liveness_min_optical_flow_threshold,
            minMotionConsistencyThreshold: this.options.motion_liveness_motion_consistency_threshold,
            details: motionResult.details
          }, 'warn')
          this.emitDetectorInfo({
            code: DetectionCode.FACE_NOT_LIVE,
            message: motionResult.getMessage(this.options.motion_liveness_min_motion_score, this.options.motion_liveness_min_keypoint_variance),
            motionScore: motionResult.motionScore,
            keypointVariance: motionResult.keypointVariance,
            motionType: motionResult.motionType
          })
          this.resetDetectionState()
          this.scheduleNextDetection(this.options.detect_error_retry_delay)
          return
        }
        this.detectionState.liveness = true
      }

      // 计算面部大小比例，不达标则跳过当前帧
      const faceRatio = (faceBox[2] * faceBox[3]) / (this.actualVideoWidth * this.actualVideoHeight)
      if (faceRatio <= this.options.collect_min_face_ratio!) {
        this.emitDetectorInfo({ code: DetectionCode.FACE_TOO_SMALL, faceRatio: faceRatio })
        this.emitDebug('detection', 'Face is too small', { ratio: faceRatio.toFixed(4), minRatio: this.options.collect_min_face_ratio!, maxRatio: this.options.collect_max_face_ratio! }, 'info')
        this.scheduleNextDetection(this.options.detect_error_retry_delay)
        return
      }
      if (faceRatio >= this.options.collect_max_face_ratio!) {
        this.emitDetectorInfo({ code: DetectionCode.FACE_TOO_LARGE, faceRatio: faceRatio })
        this.emitDebug('detection', 'Face is too large', { ratio: faceRatio.toFixed(4), minRatio: this.options.collect_min_face_ratio!, maxRatio: this.options.collect_max_face_ratio! }, 'info')
        this.scheduleNextDetection(this.options.detect_error_retry_delay)
        return
      }

      let frontal = 1
      // 计算面部正对度，不达标则跳过当前帧
      if(this.detectionState.needFrontalFace()){
        frontal = calcFaceFrontal(this.cv, face, gestures, grayFrame, this.options.collect_face_frontal_features)
        this.detectionState.lastFrontalScore = frontal

        if (frontal < this.options.collect_min_face_frontal) {
          this.emitDetectorInfo({ code: DetectionCode.FACE_NOT_FRONTAL, faceRatio: faceRatio, faceFrontal: frontal})
          this.emitDebug('detection', 'Face is not frontal to camera', { frontal: frontal.toFixed(4), minFrontal: this.options.collect_min_face_frontal! }, 'info')
          this.scheduleNextDetection(this.options.detect_error_retry_delay)
          return
        }
      }

      // 计算面部质量，不达标则跳过当前帧
      const qualityResult = calcImageQuality(this.cv, grayFrame, face, this.actualVideoWidth, this.actualVideoHeight, this.options.collect_image_quality_features, this.options.collect_min_image_quality)
      if (!qualityResult.passed || qualityResult.score < this.options.collect_min_image_quality) {
        this.emitDetectorInfo({ code: DetectionCode.FACE_LOW_QUALITY, faceRatio: faceRatio, faceFrontal: frontal, imageQuality: qualityResult.score})
        this.emitDebug('detection', 'Image quality does not meet requirements', { result: qualityResult, minImageQuality: this.options.collect_min_image_quality }, 'info')
        this.scheduleNextDetection(this.options.detect_error_retry_delay)
        return
      }

      // 当前帧通过常规检查
      this.emitDetectorInfo({passed: true, code: DetectionCode.FACE_CHECK_PASS, faceRatio: faceRatio, faceFrontal: frontal, imageQuality: qualityResult.score })

      // 处理不同检测阶段的逻辑
      // 检测阶段，图像各方面合规，进入采集阶段
      if (this.detectionState.period === DetectionPeriod.DETECT) {
        this.handleDetectPhase()
      }

      // 采集阶段，采集当前帧图像，记录采集次数, 达到指定次数后进入验证阶段
      if (this.detectionState.period === DetectionPeriod.COLLECT) {
        this.handleCollectPhase(qualityResult.score, faceBox, face, frameCanvas)
      }

      if (this.detectionState.isReadyToVerify(this.options.collect_min_collect_count)) {
        this.emitDebug('detection', 'Ready to enter action verification phase', {
          collectCount: this.detectionState.collectCount,
          minCollectCount: this.options.collect_min_collect_count
        })
        if (this.getPerformActionCount() > 0) {
          this.detectionState.period = DetectionPeriod.VERIFY
          this.emitDebug('detection', 'Entering action verification phase')
        } else {
          this.stopDetection(true)
          return
        }
      }

      if (this.detectionState.period === DetectionPeriod.VERIFY) {
        this.handleVerifyPhase(gestures)
      } else {
        // 采集阶段，继续调度下一次检测
        this.scheduleNextDetection(this.options.detect_frame_delay * 2.5)
      }
    } catch (error) {
      const errorInfo = this.extractErrorInfo(error)
      const errorMsg = errorInfo.message
      this.emitDebug('detection', 'Unexpected error in single face handling', {
        error: errorMsg,
        stack: errorInfo.stack,
        name: errorInfo.name,
        cause: errorInfo.cause
      }, 'error')
      this.scheduleNextDetection(this.options.detect_error_retry_delay)
    }
    finally{
      // 统一在 finally 块中删除所有 Mat 对象
      if (grayFrame) grayFrame.delete()
      if (bgrFrame) bgrFrame.delete()
      if (bgrFace) bgrFace.delete()
      if (grayFace) grayFace.delete()
    }
  }

  /**
   * Handle detect phase
   */
  private handleDetectPhase(): void {
    this.detectionState.period = DetectionPeriod.COLLECT
    this.emitDebug('detection', 'Entering image collection phase')
  }

  /**
   * Handle collect phase
   */
  private handleCollectPhase(qualityScore: number, faceBox: Box, face: FaceResult, frameCanvas: HTMLCanvasElement): void {
    this.collectHighQualityImage(qualityScore, faceBox)
  }

  /**
   * Handle verify phase
   */
  private handleVerifyPhase(gestures: GestureResult[]): void {
    // No action set yet, will continue after setting
    if (!this.detectionState.currentAction) {
      if(!this.selectNextAction()) {
        this.emit('detector-error' as any, {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'No available actions to perform for liveness verification'
        })
        this.stopDetection(false)
        return
      }
      this.scheduleNextDetection(this.options.detect_frame_delay * 3)
      return
    }

    // Check if action detected
    const detected = this.detectAction(this.detectionState.currentAction, gestures)
    if (!detected) {
      this.scheduleNextDetection()
      return
    }

    const actionComplete: DetectorActionEventData = {
      action: this.detectionState.currentAction,
      status: LivenessActionStatus.COMPLETED
    }

    // Action completed
    this.emit('detector-action', actionComplete)
    this.emitDebug('liveness', 'Action detected', { action: this.detectionState.currentAction })
    this.detectionState.onActionCompleted()

    // Check if all required actions completed
    if (this.detectionState.completedActions.size >= this.getPerformActionCount()) {
      this.stopDetection(true)
      return
    }

    // Select next action
    if(!this.selectNextAction()) {
      this.emit('detector-error' as any, {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'No available actions to perform for liveness verification'
      })
      this.stopDetection(false)
      return
    }
    this.scheduleNextDetection()
  }

  /**
   * Handle multiple or no faces
   */
  private handleMultipleFaces(faceCount: number): void {
    if (faceCount === 0) {
      this.emitDetectorInfo({ code: DetectionCode.VIDEO_NO_FACE, faceCount: 0 })
    } else if (faceCount > 1) {
      this.emitDetectorInfo({ code: DetectionCode.MULTIPLE_FACE, faceCount: faceCount })
    }

    if (this.detectionState.period !== DetectionPeriod.DETECT){
      this.resetDetectionState()
    }

    this.scheduleNextDetection()
  }

  private collectHighQualityImage(frameQuality: number, faceBox: Box): void{
    if (this.detectionState.period !== DetectionPeriod.COLLECT){
      return
    }
    if (frameQuality <= this.detectionState.bestQualityScore){
      // Current frame quality is not better than saved best frame, skip without saving
      this.detectionState.collectCount++
      return
    }
    try {
      const frameImageData = this.captureFrame()
      if (!frameImageData) {
        this.emitDebug('detection', 'Failed to capture current frame image', { frameQuality, bestQualityScore: this.detectionState.bestQualityScore }, 'warn')
        return
      }
      const faceImageData = this.captureFrame(faceBox)
      if (!faceImageData) {
        this.emitDebug('detection', 'Failed to capture face image', { faceBox }, 'warn')
        return
      }
      this.detectionState.collectCount++
      this.detectionState.bestQualityScore = frameQuality
      this.detectionState.bestFrameImage = frameImageData
      this.detectionState.bestFaceImage = faceImageData
    } catch (error) {
      this.emitDebug('detection', 'Error during image collection', { error: (error as Error).message }, 'error')
    }
  }

  private emitDetectorInfo(params: DetectorInfoParams): void {
    this.emit('detector-info' as any, {
      passed: params.passed ?? false,
      code: params.code,
      message: params.message ?? '',
      faceCount: params.faceCount ?? 1,
      faceRatio: params.faceRatio ?? 0,
      faceFrontal: params.faceFrontal ?? 0,
      imageQuality: params.imageQuality ?? 0,
      motionScore: params.motionScore ?? 0,
      keypointVariance: params.keypointVariance ?? 0,
      motionType: params.motionType ?? '',
      screenConfidence: params.screenConfidence ?? 0
    } as DetectorInfoEventData)
  }  

  /**
   * Select next action
   */
  private selectNextAction(): boolean {
    const availableActions = (this.options.action_liveness_action_list ?? []).filter(
      action => !this.detectionState.completedActions.has(action)
    )

    if (availableActions.length === 0) {
      this.emitDebug('liveness', 'No available actions to perform', { completedActions: Array.from(this.detectionState.completedActions), totalActions: this.options.action_liveness_action_list?.length ?? 0 }, 'warn')
      return false
    }

    let nextAction = availableActions[0]
    if (this.options.action_liveness_action_randomize) {
        // Random selection
        const randomIndex = Math.floor(Math.random() * availableActions.length)
        nextAction = availableActions[randomIndex]
    }

    const actionStart: DetectorActionEventData = {
      action: nextAction,
      status: LivenessActionStatus.STARTED
    }
    this.emit('detector-action', actionStart)
    this.emitDebug('liveness', 'Action selected', { action: this.detectionState.currentAction })

    this.detectionState.onActionStarted(nextAction, this.options.action_liveness_verify_timeout, () => {
        this.emitDebug('liveness', 'Action verify timeout', {
          action: nextAction,
          timeout: this.options.action_liveness_verify_timeout
        }, 'warn')
        this.emit('detector-action' as any, {
          action: nextAction,
          status: LivenessActionStatus.TIMEOUT
        })
        this.resetDetectionState()      
    })

    return true
  }

  /**
   * Detect specific action
   */
  private detectAction(action: LivenessAction, gestures: GestureResult[]): boolean {
    if (!gestures || gestures.length === 0) {
      this.emitDebug('liveness', 'No gestures detected for action verification', { action, gestureCount: gestures?.length ?? 0 }, 'info')
      return false
    }

    try {
      switch (action) {
        case LivenessAction.BLINK:
          return gestures.some(g => {
            if (!g.gesture) return false
            return g.gesture.includes('blink')
          })
        case LivenessAction.MOUTH_OPEN:
          return gestures.some(g => {
            const gestureStr = g.gesture
            if (!gestureStr || !gestureStr.includes('mouth')) return false
            const percentMatch = gestureStr.match(/mouth\s+(\d+)%\s+open/)
            if (!percentMatch || !percentMatch[1]) return false
            const percent = parseInt(percentMatch[1]) / 100 // Convert to 0-1 range
            return percent > (this.options.action_liveness_min_mouth_open_percent)
          })
        case LivenessAction.NOD:
          return gestures.some(g => {
            if (!g.gesture) return false
            // Check for continuous head movement (up -> down or down -> up)
            const headPattern = g.gesture.match(/head\s+(up|down)/i)
            return !!headPattern && !!headPattern[1]
          })
        default:
          this.emitDebug('liveness', 'Unknown action type in detection', { action }, 'warn')
          return false
      }
    } catch (error) {
      this.emitDebug('liveness', 'Error during action detection', { action, error: (error as Error).message }, 'error')
      return false
    }
  }

  /**
   * Emit debug event
   */
  private emitDebug(
    stage: string,
    message: string,
    details?: Record<string, any>,
    level: 'info' | 'warn' | 'error' = 'info'
  ): void {
    const debugData: DetectorDebugEventData = {
      level,
      stage,
      message,
      details,
      timestamp: Date.now()
    }
    this.emit('detector-debug' as any, debugData)
  }

  /**
   * Draw video frame to canvas (internal use, not converted to Base64)
   * @returns {HTMLCanvasElement | null} Canvas after drawing, returns null if failed
   */
  private drawVideoToCanvas(): HTMLCanvasElement | null {
    try {
      if (!this.videoElement) return null
      
      // Use cached actual video stream resolution (obtained from getSettings)
      // If cache is empty, try to get from video element's videoWidth/videoHeight
      let videoWidth_actual = this.actualVideoWidth || this.videoElement.videoWidth 
      let videoHeight_actual = this.actualVideoHeight || this.videoElement.videoHeight 
      
      this.actualVideoWidth = videoWidth_actual
      this.actualVideoHeight = videoHeight_actual
      
      // Check again if values are valid
      if (!videoWidth_actual || !videoHeight_actual) {
        this.emitDebug('capture', 'invalid video size', { 
          videoWidth_actual, 
          videoHeight_actual, 
          videoWidth: this.videoElement.videoWidth, 
          videoHeight: this.videoElement.videoHeight,
          width: this.videoElement.width,
          height: this.videoElement.height
        }, 'error')
        return null
      }
      
      // If cached canvas size does not match, recreate it
      if (!this.frameCanvasElement || this.frameCanvasElement.width !== videoWidth_actual || this.frameCanvasElement.height !== videoHeight_actual) {
        this.clearFrameCanvas()
        this.frameCanvasElement = document.createElement('canvas')
        this.frameCanvasElement.width = videoWidth_actual
        this.frameCanvasElement.height = videoHeight_actual
        this.frameCanvasContext = this.frameCanvasElement.getContext('2d')
        this.emitDebug('capture', 'Canvas created/resized', { width: videoWidth_actual, height: videoHeight_actual })
      }
      
      if (!this.frameCanvasContext) return null
      
      // Before attempting to draw, verify video drawability
      if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.emitDebug('capture', 'draw video image failed', { 
          readyState: this.videoElement.readyState, 
          HAVE_CURRENT_DATA: HTMLMediaElement.HAVE_CURRENT_DATA 
        }, 'warn')
        return null
      }
      
      this.frameCanvasContext.drawImage(this.videoElement, 0, 0, videoWidth_actual, videoHeight_actual)
      this.emitDebug('capture', 'Frame drawn to canvas as ' + videoHeight_actual + 'x' + videoWidth_actual)
      
      return this.frameCanvasElement
    } catch (e) {
      this.emitDebug('capture', 'Failed to draw frame to canvas', { error: (e as Error).message }, 'error')
      return null
    }
  }

  private clearFrameCanvas(): void {
    if(this.frameCanvasElement == null) return
    this.frameCanvasElement.width = 0
    this.frameCanvasElement.height = 0
    this.frameCanvasElement = null
    if (this.frameCanvasContext != null){
      this.frameCanvasContext.clearRect(0, 0, 0, 0)
      this.frameCanvasContext = null
    }
  }

  private clearFaceCanvas(): void {
    if(this.faceCanvasElement == null) return
    this.faceCanvasElement.width = 0
    this.faceCanvasElement.height = 0
    this.faceCanvasElement = null
    if (this.faceCanvasContext != null){
      this.faceCanvasContext.clearRect(0, 0, 0, 0)
      this.faceCanvasContext = null
    }
  }

  /**
   * 将 canvas 转换为 Base64 JPEG 图片数据
   * @param {HTMLCanvasElement} canvas - 输入的 canvas
   * @returns {string | null} Base64 格式的 JPEG 图片数据
   */
  private canvasToBase64(canvas: HTMLCanvasElement): string | null {
    try {
      const imageData = canvas.toDataURL('image/jpeg', 0.9)
      this.emitDebug('capture', 'Image converted to Base64', { size: imageData.length })
      return imageData
    } catch (e) {
      this.emitDebug('capture', 'Failed to convert to Base64', { error: (e as Error).message }, 'error')
      return null
    }
  }

  /**
   * Capture current video frame (returns Base64)
   * @param {Box} box - Face box
   * @returns {string | null} Base64 encoded JPEG image data
   */
  private captureFrame(box?: Box): string | null {
    if(!this.frameCanvasElement) {
      this.emitDebug('capture', 'Frame canvas element is null, cannot capture frame', {}, 'error')
      return null
    }
    if (!box) {
      return this.canvasToBase64(this.frameCanvasElement)
    }
    try {
      const x = box[0], y = box[1], width = box[2], height = box[3]
      // If cached canvas size does not match, recreate it
      if (!this.faceCanvasElement || this.faceCanvasElement.width !== width || this.faceCanvasElement.height !== height) {
        this.clearFaceCanvas()
        this.faceCanvasElement = document.createElement('canvas')
        this.faceCanvasElement.width = width
        this.faceCanvasElement.height = height
        this.faceCanvasContext = this.faceCanvasElement.getContext('2d')
      }
      if(!this.faceCanvasContext) {
        this.emitDebug('capture', 'Failed to get face canvas 2D context', { width, height }, 'error')
        return null
      }
      this.faceCanvasElement.width = width
      this.faceCanvasElement.height = height
      this.faceCanvasContext.drawImage(this.frameCanvasElement, x, y, width, height, 0, 0, width, height)
      return this.canvasToBase64(this.faceCanvasElement)
    } catch (error) {
      this.emitDebug('capture', 'Error during face frame capture', { box, error: (error as Error).message }, 'error')
      return null
    }
  }
}
