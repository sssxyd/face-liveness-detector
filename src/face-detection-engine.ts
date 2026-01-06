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
import { drawCanvasToMat, matToBase64Jpeg, matToGray } from './browser_utils'
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

  private videoFPS: number = 30

  // Debug log throttling
  private lastDebugLogTime: Map<string, number> = new Map()
  private debugLogLevelPriority: Record<string, number> = { info: 0, warn: 1, error: 2 }

  // 视频及保存当前帧图片的Canvas元素
  private videoElement: HTMLVideoElement | null = null
  private stream: MediaStream | null = null  
  private frameCanvasElement: HTMLCanvasElement | null = null
  private frameCanvasContext: CanvasRenderingContext2D | null = null

  private animationFrameId: number | null = null

  private actualVideoWidth: number = 0
  private actualVideoHeight: number = 0

  // Pre-allocated Mat objects for frame capture (reused to avoid frequent allocation)
  // Using getImageData() approach allows both BGR and Gray Mat to be preallocated
  private preallocatedBgrFrame: any = null
  private preallocatedGrayFrame: any = null

  // 竞态条件控制：防止detect()并发执行
  private isDetectingFrameActive: boolean = false

  // Frame-based detection scheduling
  private frameIndex: number = 0
  private lastDetectionFrameIndex: number = 0
  private lastScreenFeatureDetectionFrameIndex: number = 0

  // Frame Mat objects created per-frame, cleaned up immediately after use

  private detectionState: DetectionState

  /**
   * Constructor
   * @param config - Configuration object
   */
  constructor(options?: Partial<FaceDetectionEngineOptions>) {
    super()
    this.options = mergeOptions(options)
    this.adjustDetectFrameDelay()
    this.detectionState = createDetectionState(this.videoFPS, this.options.motion_liveness_strict_photo_detection)
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
    // 如果正在检测，先停止检测
    const wasDetecting = this.engineState === EngineState.DETECTING
    if (wasDetecting) {
      this.stopDetection(false)
    }
    
    this.options = mergeOptions(options)
    this.adjustDetectFrameDelay()
    this.detectionState = createDetectionState(this.videoFPS, this.options.motion_liveness_strict_photo_detection)
    this.detectionState.setCVInstance(this.cv)
    
    this.emitDebug('config', 'Engine options updated', { wasDetecting }, 'info')
  }

  getEngineState(): EngineState {
    return this.engineState
  }

  // ==================== State Management Methods ====================

  /**
   * Atomically transition engine state with validation
   * Ensures state transitions follow the valid state machine
   * @param newState - Target engine state
   * @param context - Debug context for logging
   * @returns true if transition succeeded, false otherwise
   */
  private transitionEngineState(newState: EngineState, context?: string): boolean {
    const oldState = this.engineState
    
    // Validate transition
    const isValidTransition = this.isValidStateTransition(oldState, newState)
    if (!isValidTransition) {
      this.emitDebug('state-management', 'Invalid state transition blocked', {
        from: oldState,
        to: newState,
        context: context || 'unknown'
      }, 'warn')
      return false
    }
    
    this.engineState = newState
    this.emitDebug('state-management', 'State transitioned', {
      from: oldState,
      to: newState,
      context: context || 'unknown'
    }, 'info')
    
    return true
  }

  /**
   * Check if state transition is valid according to state machine rules
   * Valid transitions:
   * - IDLE -> INITIALIZING, INITIALIZING -> READY, READY -> DETECTING, DETECTING -> READY
   * - Any -> IDLE (error recovery)
   */
  private isValidStateTransition(from: EngineState, to: EngineState): boolean {
    // Same state is not a transition
    if (from === to) return true
    
    // Allow recovery to IDLE from any state
    if (to === EngineState.IDLE) return true
    
    // Valid forward transitions
    const validTransitions: Record<EngineState, EngineState[]> = {
      [EngineState.IDLE]: [EngineState.INITIALIZING],
      [EngineState.INITIALIZING]: [EngineState.READY, EngineState.IDLE],
      [EngineState.READY]: [EngineState.DETECTING, EngineState.INITIALIZING],
      [EngineState.DETECTING]: [EngineState.READY, EngineState.IDLE]
    }
    
    return validTransitions[from]?.includes(to) ?? false
  }

  /**
   * Transition detection period state
   * @param newPeriod - Target detection period
   * @returns true if transition succeeded
   */
  private transitionDetectionPeriod(newPeriod: DetectionPeriod): boolean {
    const oldPeriod = this.detectionState.period
    
    if (oldPeriod === newPeriod) return true
    
    this.detectionState.period = newPeriod
    this.emitDebug('detection-period', 'Period transitioned', {
      from: oldPeriod,
      to: newPeriod
    }, 'info')
    
    return true
  }

  /**
   * Partially reset detection state (keeps engine initialized)
   * Used when detection fails but engine should remain ready
   */
  private partialResetDetectionState(): void {
    this.emitDebug('detection', 'Partial reset: Resetting detection state only')
    this.detectionState.reset()
    
    // Reset frame counters
    this.frameIndex = 0
    this.lastDetectionFrameIndex = 0
    this.lastScreenFeatureDetectionFrameIndex = 0
    
    // Keep Mat pool and canvas (they'll be reused)
    // Don't set isDetectingFrameActive = false here (let finally handle it)
  }

  /**
   * Fully reset detection state and resources
   * Used when stopping detection or reinitializing
   */
  private fullResetDetectionState(): void {
    this.emitDebug('detection', 'Full reset: Resetting all detection resources')
    
    // Reset detection state (includes clearing large image buffers)
    try {
      this.detectionState.reset()
    } catch (error) {
      this.emitDebug('detection', 'Error resetting detection state', { error: (error as Error).message }, 'warn')
    }
    
    // Reset frame counters
    this.frameIndex = 0
    this.lastDetectionFrameIndex = 0
    this.lastScreenFeatureDetectionFrameIndex = 0
    
    // Clear frame canvas (releases memory)
    try {
      this.clearFrameCanvas()
    } catch (error) {
      this.emitDebug('detection', 'Error clearing frame canvas', { error: (error as Error).message }, 'warn')
    }
    
    // Clear preallocated Mat objects
    this.clearPreallocatedMats()
    
    // Ensure detection frame flag is cleared
    this.isDetectingFrameActive = false
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

    // Transition to INITIALIZING state
    if (!this.transitionEngineState(EngineState.INITIALIZING, 'initialize() start')) {
      return
    }

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
        this.emit('detector-loaded' as any, { success: false, error: cvError.message })
        throw new Error(cvError.message)
      }
      
      this.cv = cv
      const cv_version = getOpenCVVersion()
      this.emitDebug('initialization', 'OpenCV loaded successfully', { version: cv_version })
      console.log('[FaceDetectionEngine] OpenCV loaded successfully', { version: cv_version })

      // Inject OpenCV instance into motion detector and screen detector
      this.detectionState.setCVInstance(this.cv)

      // Load Human.js
      console.log('[FaceDetectionEngine] Loading Human.js models...')
      this.emitDebug('initialization', 'Loading Human.js...')
      const humanStartTime = performance.now()
      
      let loadError: any = null
      try {
        this.human = await loadHuman(this.options.human_model_path, this.options.tensorflow_wasm_path, this.options.tensorflow_backend)
      } catch (humanError) {
        loadError = humanError
      }

      if (loadError) {
        const errorInfo = this.extractErrorInfo(loadError)
        const errorMsg = errorInfo.message
        
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
        
        // Diagnostic hints
        if (errorMsg.includes('inputs')) {
          errorContext.diagnosis = 'Human.js internal error: Model structure incomplete'
        } else if (errorMsg.includes('timeout')) {
          errorContext.diagnosis = 'Model loading timeout'
        } else if (errorMsg.includes('Critical models not loaded')) {
          errorContext.diagnosis = 'Human.js failed to load required models'
        } else if (errorMsg.includes('empty')) {
          errorContext.diagnosis = 'Models object is empty after loading'
        } else if (errorMsg.includes('incomplete')) {
          errorContext.diagnosis = 'Models loaded but structure is incomplete'
        }
        
        console.error('[FaceDetectionEngine] Human.js loading failed:', errorContext)
        this.emitDebug('initialization', 'Human.js loading failed', errorContext, 'error')
        const errorEventData: DetectorErrorEventData = {
          code: ErrorCode.DETECTOR_NOT_INITIALIZED,
          message: `Human.js loading error: ${errorContext.diagnosis || errorMsg}`
        }
        this.emit('detector-loaded' as any, { success: false, error: errorMsg, details: errorContext })
        this.emit('detector-error', errorEventData)
        throw new Error(errorMsg)
      }

      const humanLoadTime = performance.now() - humanStartTime
      
      if (!this.human) {
        const errorMsg = 'Failed to load Human.js: instance is null'
        console.error('[FaceDetectionEngine] ' + errorMsg)
        this.emitDebug('initialization', errorMsg, { loadTime: humanLoadTime }, 'error')
        this.emit('detector-loaded' as any, { success: false, error: errorMsg })
        const errorEventData: DetectorErrorEventData = {
          code: ErrorCode.DETECTOR_NOT_INITIALIZED,
          message: errorMsg
        }
        this.emit('detector-error', errorEventData)
        throw new Error(errorMsg)
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
        this.emit('detector-loaded' as any, { success: false, error: errorMsg })
        const errorEventData: DetectorErrorEventData = {
          code: ErrorCode.DETECTOR_NOT_INITIALIZED,
          message: errorMsg
        }
        this.emit('detector-error', errorEventData)
        throw new Error(errorMsg)
      }
      
      this.emitDebug('initialization', 'Human.js loaded successfully', {
        loadTime: `${humanLoadTime.toFixed(2)}ms`,
        version: this.human.version,
        backend: this.human.config?.backend || 'unknown'
      })
      console.log('[FaceDetectionEngine] Human.js loaded successfully', {
        loadTime: `${humanLoadTime.toFixed(2)}ms`,
        version: this.human.version
      })

      // Transition to READY state on success
      if (!this.transitionEngineState(EngineState.READY, 'initialize() success')) {
        throw new Error('Failed to transition to READY state')
      }

      const loadedData: DetectorLoadedEventData = {
        success: true,
        opencv_version: getOpenCVVersion(),
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
      
      // Transition back to IDLE on error
      this.transitionEngineState(EngineState.IDLE, 'initialize() error')
      
      this.emit('detector-loaded' as any, { success: false, error: errorMsg })
      this.emit('detector-error' as any, {
        code: ErrorCode.DETECTOR_NOT_INITIALIZED,
        message: errorMsg
      })
      this.emitDebug('initialization', 'Failed to load libraries', {
        error: errorMsg,
        stack: errorInfo.stack
      }, 'error')
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
    // Reset frame counters and detection state, but keep engine initialized
    // (fullResetDetectionState will be called in stopDetection on error)
    this.partialResetDetectionState()

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

      const videoTrack = this.stream.getVideoTracks()[0]
      if(videoTrack) {
        const settings = videoTrack.getSettings?.()
        if (settings) {
          if(settings.width && settings.height) {
            this.actualVideoWidth = settings.width
            this.actualVideoHeight = settings.height
          }
          const fps = settings.frameRate
          this.emitDebug('video-setup', 'Video stream resolution detected', {
            width: this.actualVideoWidth,
            height: this.actualVideoHeight,
            fps: fps
          })
          if(fps){
            this.updateVideoFPS(fps)
          }
        }
      }
      this.emitDebug('video-setup', 'Camera access granted', {
        trackCount: this.stream.getTracks().length
      })

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

      // Transition to DETECTING state atomically
      if (!this.transitionEngineState(EngineState.DETECTING, 'startDetection() video ready')) {
        throw new Error('Failed to transition to DETECTING state')
      }

      this.cancelPendingDetection()

      this.animationFrameId = requestAnimationFrame(() => {
        this.detect()
      })  
      
      // Mat objects will be created per-frame on demand
      
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
   * Performs comprehensive cleanup to prevent memory leaks and UI freezing
   * @param success - Whether to display the best collected image
   */
  stopDetection(success: boolean): void {
    this.emitDebug('detection', 'stopDetection called', { 
      success, 
      engineState: this.engineState,
      isDetectingFrameActive: this.isDetectingFrameActive,
      hasPendingFrame: this.animationFrameId !== null
    }, 'info')
    
    // Step 1: Stop the animation frame immediately
    this.cancelPendingDetection()
    
    // Step 2: Transition state - force transition to prevent detect() finally from rescheduling
    // Use direct assignment instead of transitionEngineState to bypass validation
    // This ensures no animationFrame gets scheduled after cancellation
    const prevState = this.engineState
    if (prevState === EngineState.DETECTING) {
      this.engineState = EngineState.READY
      this.emitDebug('state-management', 'State transitioned (forced stop)', {
        from: prevState,
        to: EngineState.READY,
        context: 'stopDetection()'
      }, 'info')
    }

    // Step 3: Prepare finish data (before clearing images)
    // Create a finishData object for emission (with image data)
    const finishData: DetectorFinishEventData = {
      success: success,
      silentPassedCount: this.detectionState.collectCount,
      actionPassedCount: this.detectionState.completedActions.size,
      totalTime: performance.now() - this.detectionState.startTime,
      bestQualityScore: this.detectionState.bestQualityScore,
      bestFrameImage: this.detectionState.bestFrameImage,
      bestFaceImage: this.detectionState.bestFaceImage
    }

    // Step 4: Emit finish event (emit immediately, before any cleanup)
    try {
      this.emit('detector-finish' as any, finishData)
    } catch (error) {
      this.emitDebug('detection', 'Error emitting detector-finish event', { error: (error as Error).message }, 'error')
    }
    
    // Clear image references from the original finishData object immediately after emit
    // to prevent external listeners from accessing stale data if they store the reference
    finishData.bestFrameImage = undefined as any
    finishData.bestFaceImage = undefined as any

    // Step 5: Stop video playback
    if (this.videoElement) {
      try {
        // 检查是否已经暂停，避免重复操作
        if (!this.videoElement.paused) {
          this.videoElement.pause()
        }
      } catch (error) {
        this.emitDebug('detection', 'Error pausing video', { error: (error as Error).message }, 'warn')
      }
    }

    // Step 6: Stop and release media stream tracks
    if (this.stream) {
      try {
        this.stream.getTracks().forEach(track => {
          try {
            // 可在stop()前检查轨道状态
            if (track.readyState === 'live') {
              track.stop()
            }
          } catch (trackError) {
            this.emitDebug('detection', 'Error stopping media track', { 
              error: (trackError as Error).message,
              trackKind: track.kind 
            }, 'warn')
          }
        })
      } catch (streamError) {
        this.emitDebug('detection', 'Error processing media stream', { error: (streamError as Error).message }, 'warn')
      }
      this.stream = null
    }

    // Step 7: Disconnect video element from stream
    if (this.videoElement) {
      try {
        this.videoElement.srcObject = null
      } catch (error) {
        this.emitDebug('detection', 'Error clearing video element', { error: (error as Error).message }, 'warn')
      }
    }

    // Step 8: Full cleanup of detection state
    this.fullResetDetectionState()

    this.emitDebug('detection', 'Detection stopped completely (FINISH)', { success })
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getOptions(): FaceDetectionEngineOptions {
    return { ...this.options }
  }

  // ==================== Private Methods ====================

  private updateVideoFPS(fps: number): void {
    if(this.videoFPS === fps) return

    console.log(`[FaceDetectionEngine] Video FPS changed: ${this.videoFPS} -> ${fps}`)
    this.videoFPS = fps
    this.detectionState.updateVideoFPS(fps)
    
    // 当FPS变化时，检查是否需要调整检测延迟以保证最小周期
    this.adjustDetectFrameDelay()
  }

  /**
   * Adjust detect_frame_delay to ensure main detection interval is at least 3 frames
   * This is important for proper spacing of corner detection, feature detection, and main detection
   */
  private adjustDetectFrameDelay(): void {
    const minInterval = 3
    const currentInterval = this.getDetectionFrameInterval()
    
    if (currentInterval < minInterval) {
      // 计算所需的最小 detect_frame_delay
      // getDetectionFrameInterval() = Math.round(detect_frame_delay * videoFPS / 1000)
      // 需要: detect_frame_delay * videoFPS / 1000 >= minInterval
      // 所以: detect_frame_delay >= minInterval * 1000 / videoFPS
      const minDetectFrameDelay = Math.ceil(minInterval * 1000 / this.videoFPS)
      
      const oldDelay = this.options.detect_frame_delay
      this.options.detect_frame_delay = minDetectFrameDelay
      
      this.emitDebug('config', 'Adjusted detect_frame_delay to maintain minimum interval', {
        reason: 'main detection interval was less than 3 frames',
        oldDelay: oldDelay,
        newDelay: minDetectFrameDelay,
        oldInterval: currentInterval,
        newInterval: this.getDetectionFrameInterval(),
        videoFPS: this.videoFPS
      })
      
      console.log(`[FaceDetectionEngine] Adjusted detect_frame_delay: ${oldDelay}ms -> ${minDetectFrameDelay}ms (interval: ${currentInterval} -> ${this.getDetectionFrameInterval()})`)
    }
  }

  /**
   * Get the frame interval for main face detection based on videoFPS and detect_frame_delay
   * Uses Math.ceil to ensure actual interval >= configured delay
   * @returns Number of frames between detections
   */
  private getDetectionFrameInterval(): number {
    // Ceil ensures actual delay never goes below configured detect_frame_delay
    return Math.max(1, Math.ceil(this.options.detect_frame_delay * this.videoFPS / 1000))
  }

  /**
   * Check if main face detection should be performed this frame
   * @returns true if enough frames have passed since last detection
   */
  private shouldPerformMainDetection(): boolean {
    const mainInterval = this.getDetectionFrameInterval()
    return (this.frameIndex - this.lastDetectionFrameIndex) >= mainInterval
  }

  /**
   * Check if screen corner detection should be performed this frame
   * Executes once per main detection interval
   * Logic: 
   * - If mainInterval <= 2: disabled (insufficient frames)
   * - If mainInterval > 2: executes at calculated point, unless it's the last frame
   * @returns true if conditions are met
   */
  private shouldPerformScreenCornersDetection(): boolean {
    // 未开始采集前，不执行屏幕检测
    if(this.detectionState.period === DetectionPeriod.DETECT)
      return false
    
    const mainInterval = this.getDetectionFrameInterval()
    
    // 周期太短，无法同时执行主检测、特征检测和边缘检测
    if (mainInterval <= 2) {
      return false
    }
    
    const currentPositionInCycle = this.frameIndex % mainInterval
    
    // 边缘检测在周期的约80%位置
    let cornersExecutionPoint = Math.floor(mainInterval * 0.8)
    
    // 如果计算出的位置是最后一帧，则往前退一位
    // 这确保边缘检测不会被当作"周期最后一帧的备选特征检测"
    if (cornersExecutionPoint === mainInterval - 1 && mainInterval > 3) {
      cornersExecutionPoint = Math.floor(mainInterval * 0.6)
    }
    
    return currentPositionInCycle === cornersExecutionPoint
  }

  /**
   * Check if screen feature detection (multi-frame) should be performed this frame
   * Logic:
   * - Executes at calculated point in the cycle (40% position)
   * - If missed, can execute at last frame of cycle (fallback)
   * @returns true if conditions are met
   */
  private shouldPerformScreenFeatureDetection(): boolean {
    // 未开始采集前，不执行屏幕检测
    if(this.detectionState.period === DetectionPeriod.DETECT)
      return false
    
    const mainInterval = this.getDetectionFrameInterval()
    const currentPositionInCycle = this.frameIndex % mainInterval
    
    // 特征检测在周期的40%位置执行（标准点）
    const featureExecutionPoint = Math.floor(mainInterval * 0.4)
    
    // 在标准执行点执行
    if (currentPositionInCycle === featureExecutionPoint) {
      return true
    }
    
    // 备选方案：如果是周期的最后一帧，且本周期还未执行过特征检测
    const isLastFrameInCycle = currentPositionInCycle === (mainInterval - 1)
    if (isLastFrameInCycle) {
      // 计算当前周期的起始帧（>=0 的最小值）
      const cycleStartFrame = Math.floor(this.frameIndex / mainInterval) * mainInterval
      // 检查此周期是否已执行过特征检测
      const hasExecutedInThisCycle = this.lastScreenFeatureDetectionFrameIndex >= cycleStartFrame
      return !hasExecutedInThisCycle
    }
    
    return false
  }

  /**
   * Cancel pending detection frame
   */
  private cancelPendingDetection(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  /**
   * Main detection loop
   * Called every frame via requestAnimationFrame
   * Orchestrates the detection pipeline with clear separation of concerns
   */
  private async detect(): Promise<void> {
    // 防止并发调用
    if (this.isDetectingFrameActive) {
      this.emitDebug('detection', '检测帧正在处理中，跳过本帧', {}, 'info')
      return
    }

    // 状态和前置条件检查
    if (this.engineState !== EngineState.DETECTING) {
      this.emitDebug('detection', '引擎状态不是DETECTING，无法继续检测', {
        currentState: this.engineState,
        expectedState: EngineState.DETECTING
      }, 'warn')
      return
    }

    if (!this.videoElement) {
      this.emitDebug('detection', '视频元素未初始化', {}, 'error')
      return
    }

    if (!this.human) {
      this.emitDebug('detection', 'Human.js实例未初始化', {}, 'error')
      return
    }

    if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.emitDebug('detection', '视频尚未准备好，readyState不足', {
        readyState: this.videoElement.readyState,
        requiredState: HTMLMediaElement.HAVE_CURRENT_DATA
      }, 'info')
      return
    }

    // 设置检测帧活跃标志
    this.isDetectingFrameActive = true
    this.frameIndex++
    
    this.emitDebug('detection', '进入检测帧循环', {
      frameIndex: this.frameIndex,
      frameInterval: this.getDetectionFrameInterval(),
      period: this.detectionState.period,
      engineState: this.engineState,
      videoReadyState: this.videoElement.readyState
    }, 'info')
    
    let bgrFrame: any = null
    let grayFrame: any = null
    
    try {
      // 确定是否需要捕获帧
      if (!this.shouldCaptureFrame()) {
        return
      }
      
      this.emitDebug('detection', '准备采集帧数据', { frameIndex: this.frameIndex }, 'info')
      const frameData = this.captureAndPrepareFrames()
      if (!frameData) {
        this.emitDebug('detection', '帧采集失败，无法继续检测', {
          frameIndex: this.frameIndex
        }, 'warn')
        return
      }
      // 帧采集成功日志已移除，减少高频输出
      bgrFrame = frameData.bgrFrame
      grayFrame = frameData.grayFrame

      // 添加到屏幕检测器缓冲
      if (this.detectionState.period !== DetectionPeriod.DETECT) {
        this.detectionState.screenDetector?.addVideoFrame(grayFrame, bgrFrame)
        // 帧添加日志已移除，减少高频输出
      }

      // 执行屏幕检测（边角 + 多帧特征）
      if (this.performScreenDetection(grayFrame)) {
        this.emitDebug('detection', '屏幕检测：检测到屏幕，返回', {
          frameIndex: this.frameIndex
        }, 'warn')
        return
      }

      // 执行主人脸检测
      await this.performFaceDetection(grayFrame, bgrFrame)
      // 人脸检测完成日志已移除，减少高频输出
    } catch (error) {
      const errorInfo = this.extractErrorInfo(error)
      this.emitDebug('detection', 'Unexpected error in detection loop', {
        error: errorInfo.message,
        stack: errorInfo.stack,
        name: errorInfo.name,
        cause: errorInfo.cause
      }, 'error')
    } finally {
      // 清理非池化的Mat对象（必须执行，即使发生错误也要释放内存）
      try {
        this.cleanupFrames(bgrFrame, grayFrame)
      } catch (cleanupError) {
        this.emitDebug('detection', 'Error in finally cleanup', {
          error: (cleanupError as Error).message
        }, 'error')
      }
      
      // 清除检测帧活跃标志
      this.isDetectingFrameActive = false

      // 调度下一帧的检测（仅当引擎仍在检测状态时）
      if (this.engineState === EngineState.DETECTING) {
        this.animationFrameId = requestAnimationFrame(() => {
          this.detect()
        })
      }
    }
  }

  /**
   * Check if current frame should be captured based on detection scheduling
   */
  private shouldCaptureFrame(): boolean {
    return this.shouldPerformMainDetection() 
      || this.shouldPerformScreenCornersDetection()
      || this.shouldPerformScreenFeatureDetection()
      || this.detectionState.period !== DetectionPeriod.DETECT
  }

  /**
   * Capture video frame and convert to BGR and Grayscale Mat objects
   * @returns {Object | null} Object with bgrFrame and grayFrame, or null if failed
   */
  private captureAndPrepareFrames(): { bgrFrame: any; grayFrame: any } | null {
    const frameCapturStartTime = performance.now()

    // Draw video frame to canvas
    const frameCanvas = this.drawVideoToCanvas()
    if (!frameCanvas) {
      this.emitDebug('detection', 'Failed to draw video frame to canvas', {}, 'warn')
      return null
    }
    
    // Ensure preallocated Mat objects exist (created once, reused)
    if (!this.preallocatedBgrFrame || !this.preallocatedGrayFrame) {
      this.ensurePreallocatedMats()
      if (!this.preallocatedBgrFrame || !this.preallocatedGrayFrame) {
        this.emitDebug('detection', 'Failed to create preallocated Mat objects', {}, 'error')
        return null
      }
    }
    
    // Copy canvas ImageData to preallocated BGR Mat using helper function
    const bgrFrame = drawCanvasToMat(this.cv, frameCanvas, this.preallocatedBgrFrame)
    if (!bgrFrame) {
      this.emitDebug('detection', 'Failed to copy canvas data to BGR Mat', {}, 'warn')
      return null
    }

    const bgrFrameTime = performance.now() - frameCapturStartTime
    
    // Convert BGR to grayscale (reuse preallocated Mat)
    const grayConversionStartTime = performance.now()
    try {
      this.cv.cvtColor(bgrFrame, this.preallocatedGrayFrame, this.cv.COLOR_RGBA2GRAY)
    } catch (cvtError) {
      this.emitDebug('detection', 'cvtColor failed', { error: (cvtError as Error).message }, 'warn')
      return null
    }
    const grayConversionTime = performance.now() - grayConversionStartTime
    
    const grayFrame = this.preallocatedGrayFrame

    // Log performance metrics if slow
    const totalFrameProcessingTime = bgrFrameTime + grayConversionTime
    if (totalFrameProcessingTime > 50) {
      this.emitDebug('performance', 'Frame capture slow', {
        bgrFrameCapture: bgrFrameTime.toFixed(2) + 'ms',
        grayConversion: grayConversionTime.toFixed(2) + 'ms',
        total: totalFrameProcessingTime.toFixed(2) + 'ms',
        videoResolution: `${this.actualVideoWidth}x${this.actualVideoHeight}`
      }, 'warn')
    }

    return { bgrFrame, grayFrame }
  }

  /**
   * Perform screen detection (corners and multi-frame features)
   * @returns true if screen is detected, false otherwise
   */
  private performScreenDetection(grayFrame: any): boolean {
    // 执行屏幕边角检测
    if (this.shouldPerformScreenCornersDetection()) {
      try {
        const isScreenDetected = this.detectScreenCorners(grayFrame)
        if (isScreenDetected) {
          this.partialResetDetectionState()
          return true
        }
      } catch (screenDetectError) {
        const errorInfo = this.extractErrorInfo(screenDetectError)
        this.emitDebug('screen-detection', 'Screen corners detection failed', {
          error: errorInfo.message,
          stack: errorInfo.stack,
          name: errorInfo.name
        }, 'error')
      }
    }

    // 执行屏幕多帧特征检测
    if (this.shouldPerformScreenFeatureDetection()) {
      this.lastScreenFeatureDetectionFrameIndex = this.frameIndex
      try {
        const isScreenDetected = this.detectScreenFeatures()
        if (isScreenDetected) {
          this.partialResetDetectionState()
          return true
        }
      } catch (screenDetectError) {
        const errorInfo = this.extractErrorInfo(screenDetectError)
        this.emitDebug('screen-detection', 'Screen feature detection failed', {
          error: errorInfo.message,
          stack: errorInfo.stack,
          name: errorInfo.name
        }, 'error')
      }
    }

    return false
  }

  /**
   * Perform main face detection and handle results
   */
  private async performFaceDetection(grayFrame: any, bgrFrame: any): Promise<void> {
    if (!this.shouldPerformMainDetection()) {
      return
    }

    this.lastDetectionFrameIndex = this.frameIndex

    // Perform face detection
    let result
    try {
      result = await this.human?.detect(this.videoElement)
      if (!result) {
        this.emitDebug('detection', 'Face detection returned null result', {}, 'warn')
        return
      }          
    } catch (detectError) {
      const errorInfo = this.extractErrorInfo(detectError)
      this.emitDebug('detection', 'Human.detect() call failed', {
        error: errorInfo.message,
        stack: errorInfo.stack,
        name: errorInfo.name,
        hasHuman: !!this.human,
        humanVersion: this.human?.version,
        videoReadyState: this.videoElement?.readyState,
        videoWidth: this.videoElement?.videoWidth,
        videoHeight: this.videoElement?.videoHeight
      }, 'error')
      return
    }

    const faces = result.face || []
    const gestures = result.gesture || []

    if (faces.length === 1) {
      this.handleSingleFace(faces[0], gestures, grayFrame, bgrFrame)
    } else {
      this.handleMultipleFaces(faces.length)
    }
  }

  /**
   * Clean up frame Mat objects
   * Note: Both BGR and Gray Mats are preallocated and reused
   * They are only deleted in clearPreallocatedMats()
   */
  private cleanupFrames(bgrFrame: any, grayFrame: any): void {
    // No-op: both Mats are preallocated and cleaned up separately
  }

  private getPerformActionCount(): number{
    if (this.options.action_liveness_action_count <= 0){
      this.emitDebug('config', 'liveness_action_count is 0 or negative', { count: this.options.action_liveness_action_count }, 'info')
      return 0
    }
    const actionListLength = this.options.action_liveness_action_list?.length ?? 0
    if (actionListLength === 0) {
      this.emitDebug('config', 'liveness_action_list is empty', { actionListLength }, 'info')
    }
    return Math.min(this.options.action_liveness_action_count, actionListLength)
  }

  /**
   * Detect screen by corners and contours analysis (fast detection)
   */
  private detectScreenCorners(grayFrame: any): boolean {
    const cornersContourResult = this.detectionState.cornersContourDetector?.detect(grayFrame)
    if (cornersContourResult?.isScreenCapture) {
      this.emitDebug('screen-corners-detection', 'Screen boundary detected - possible screen capture', {
        confidence: cornersContourResult.confidence,
        contourCount: cornersContourResult.contourCount,
        screenBoundaryRatio: cornersContourResult.screenBoundaryRatio,
        processingTimeMs: cornersContourResult.processingTimeMs,
      }, 'warn')
      this.emitDetectorInfo({
        code: DetectionCode.FACE_NOT_REAL,
        message: 'Screen capture detected by corners/contour analysis',
        screenConfidence: cornersContourResult.confidence
      })
      return true
    }
    if (cornersContourResult) {
      this.emitDebug('screen-corners-detection', 'Screen boundary not detected', {
        confidence: cornersContourResult.confidence,
        contourCount: cornersContourResult.contourCount,
        screenBoundaryRatio: cornersContourResult.screenBoundaryRatio,
        processingTimeMs: cornersContourResult.processingTimeMs
      }, 'info')
    }
    return false
  }

  /**
   * Detect screen by multi-frame feature analysis
   */
  private detectScreenFeatures(): boolean {
    // 屏幕捕获检测（多帧特征检测）
    const screenResult = this.detectionState.screenDetector?.detect(this.options.debug_mode, true)
    if(screenResult?.isScreenCapture){
      this.emitDebug('screen-detection', 'Screen capture detected - possible video replay attack', {
        screenConfidence: screenResult.confidenceScore,
        riskLevel: screenResult.riskLevel,
        processingTimeMs: screenResult.processingTimeMs,
        executedMethodsCount: screenResult.executedMethods?.length || 0,
        executedMethodsSummary: screenResult.executedMethods?.map((m: any) => ({
          method: m.method,
          isScreenCapture: m.isScreenCapture,
          confidence: m.confidence
          // details 字段已移除，避免输出超大数据
        })),
        stageCount: screenResult.debug?.stages?.length || 0,
        finalDecision: screenResult.debug?.finalDecision
      }, 'warn')
      this.emitDetectorInfo({
        code: DetectionCode.FACE_NOT_REAL,
        message: screenResult.getMessage(),
        screenConfidence: screenResult.confidenceScore
      })
      return true
    }
    if(screenResult) {
      this.emitDebug('screen-detection', 'Screen capture not detected', {
        screenConfidence: screenResult.confidenceScore,
        riskLevel: screenResult.riskLevel,
        processingTimeMs: screenResult.processingTimeMs,
        executedMethodsCount: screenResult.executedMethods?.length || 0,
        methodsSummary: screenResult.executedMethods?.map((m: any) => `${m.method}:${m.confidence?.toFixed(2)}`).join(', ') || 'none',
        stageCount: screenResult.debug?.stages?.length || 0
        // 移除了 executedMethods 和 stageDetails 的完整数据，避免超大输出
      }, 'info')
    }
    
    // 只有ready状态的检测器的success结果才可信
    if (this.detectionState.screenDetector?.isReady()) {
      this.detectionState.realness = !screenResult?.isScreenCapture
    }

    return false
  }

  /**
   * Handle single face detection
   */
  private handleSingleFace(face: FaceResult, gestures: GestureResult[], grayFrame: any, bgrFrame: any): void {
    const faceBox = face.box || face.boxRaw

    if (!faceBox) {
      console.warn('[FaceDetector] Face detected but no box/boxRaw property')
      this.emitDebug('detection', 'Face box is missing - face detected but no box/boxRaw property', {}, 'warn')
      return
    }

    if(!this.detectionState.motionDetector){
      this.emit('detector-error' as any, {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Motion liveness detector is not initialized'
      })
      // Clear the detecting flag before stopping to avoid deadlock
      this.isDetectingFrameActive = false
      this.stopDetection(false)
      return
    }
    
    try {
      // 运动检测
      const motionResult = this.detectionState.motionDetector.analyzeMotion(grayFrame, face, faceBox)
      // 只有ready状态的检测器的结果才可信
      if(this.detectionState.motionDetector.isReady()){
        if(!motionResult.isLively) {
          this.emitDebug('motion-detection', 'Motion liveness check failed - possible photo attack', {
            motionScore: motionResult.motionScore,
            keypointVariance: motionResult.keypointVariance,
            opticalFlowMagnitude: motionResult.opticalFlowMagnitude,
            eyeMotionScore: motionResult.eyeMotionScore,
            mouthMotionScore: motionResult.mouthMotionScore,
            motionType: motionResult.motionType,
            details: motionResult.details
          }, 'warn')
          this.emitDetectorInfo({
            code: DetectionCode.FACE_NOT_LIVE,
            message: motionResult.getMessage(this.detectionState.motionDetector.getOptions().minMotionThreshold, this.detectionState.motionDetector.getOptions().minKeypointVariance),
            motionScore: motionResult.motionScore,
            keypointVariance: motionResult.keypointVariance,
            motionType: motionResult.motionType
          })
          this.partialResetDetectionState()
          return        
        }
        this.detectionState.liveness = true
      }

      // 计算面部大小比例，不达标则跳过当前帧
      const faceRatio = (faceBox[2] * faceBox[3]) / (this.actualVideoWidth * this.actualVideoHeight)
      if (faceRatio <= this.options.collect_min_face_ratio!) {
        this.emitDetectorInfo({ code: DetectionCode.FACE_TOO_SMALL, faceRatio: faceRatio })
        this.emitDebug('detection', 'Face is too small', { ratio: faceRatio.toFixed(4), minRatio: this.options.collect_min_face_ratio!, maxRatio: this.options.collect_max_face_ratio! }, 'info')
        return
      }

      if (faceRatio >= this.options.collect_max_face_ratio!) {
        this.emitDetectorInfo({ code: DetectionCode.FACE_TOO_LARGE, faceRatio: faceRatio })
        this.emitDebug('detection', 'Face is too large', { ratio: faceRatio.toFixed(4), minRatio: this.options.collect_min_face_ratio!, maxRatio: this.options.collect_max_face_ratio! }, 'info')
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
          return
        }
      }

      const qualityResult = calcImageQuality(this.cv, grayFrame, this.options.collect_image_quality_features, this.options.collect_min_image_quality)
      if (!qualityResult.passed || qualityResult.score < this.options.collect_min_image_quality) {
        this.emitDetectorInfo({ code: DetectionCode.FACE_LOW_QUALITY, faceRatio: faceRatio, faceFrontal: frontal, imageQuality: qualityResult.score})
        this.emitDebug('detection', 'Image quality does not meet requirements', { 
          score: qualityResult.score,
          passed: qualityResult.passed,
          minRequired: this.options.collect_min_image_quality,
          frameSize: grayFrame?.cols && grayFrame?.rows ? `${grayFrame.cols}x${grayFrame.rows}` : 'unknown'
          // 移除了冗余的帧信息和 qualityResult 完整对象，避免大数据输出
        }, 'warn')
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
        this.handleCollectPhase(bgrFrame, qualityResult.score, faceBox)
      }

      if (this.detectionState.isReadyToVerify(this.options.collect_min_collect_count)) {
        this.emitDebug('detection', 'Ready to enter action verification phase', {
          collectCount: this.detectionState.collectCount,
          minCollectCount: this.options.collect_min_collect_count
        })
        if (this.getPerformActionCount() > 0) {
          this.transitionDetectionPeriod(DetectionPeriod.VERIFY)
          this.emitDebug('detection', 'Entering action verification phase')
        } else {
          this.stopDetection(true)
          return
        }
      }

      if (this.detectionState.period === DetectionPeriod.VERIFY) {
        this.handleVerifyPhase(gestures)
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
    }
  }

  /**
   * Handle detect phase
   */
  private handleDetectPhase(): void {
    this.transitionDetectionPeriod(DetectionPeriod.COLLECT)
    this.emitDebug('detection', 'Entering image collection phase')
  }

  /**
   * Handle collect phase
   */
  private handleCollectPhase(bgrFrame: any, qualityScore: number, faceBox: Box): void {
    this.collectHighQualityImage(bgrFrame, qualityScore, faceBox)
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
      return
    }

    // Check if action detected
    const detected = this.detectAction(this.detectionState.currentAction, gestures)
    if (!detected) {
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
      this.emitDebug('detection', 'Multiple or no faces detected, resetting detection state', { faceCount })
      this.partialResetDetectionState()
    }
  }

  private collectHighQualityImage(bgrFrame: any, frameQuality: number, faceBox: Box): void{
    // 检查期间周期不变（防止竞态条件）
    const currentPeriod = this.detectionState.period
    if (currentPeriod !== DetectionPeriod.COLLECT){
      return
    }
    if (frameQuality <= this.detectionState.bestQualityScore){
      // Current frame quality is not better than saved best frame, skip without saving
      this.detectionState.collectCount++
      return
    }
    try {
      // 再次检查周期确保一致性
      if (this.detectionState.period !== currentPeriod) {
        return
      }
      
      const frameImageData = matToBase64Jpeg(this.cv, bgrFrame)
      if (!frameImageData) {
        this.emitDebug('detection', 'Failed to capture current frame image', { frameQuality, bestQualityScore: this.detectionState.bestQualityScore }, 'warn')
        return
      }
      const faceMat = bgrFrame.roi(new this.cv.Rect(faceBox[0], faceBox[1], faceBox[2], faceBox[3]))
      const faceImageData = matToBase64Jpeg(this.cv, faceMat)
      faceMat.delete()
      if (!faceImageData) {
        this.emitDebug('detection', 'Failed to capture face image', { faceBox }, 'warn')
        return
      }
      
      // 最后检查周期，确保收集的图像与当前周期匹配
      if (this.detectionState.period === currentPeriod) {
        this.detectionState.collectCount++
        this.detectionState.bestQualityScore = frameQuality
        this.detectionState.bestFrameImage = frameImageData
        this.detectionState.bestFaceImage = faceImageData
      }
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
    this.emitDebug('liveness', 'Action selected', { action: nextAction })

    this.detectionState.onActionStarted(nextAction, this.options.action_liveness_verify_timeout, () => {
        this.emitDebug('liveness', 'Action verify timeout', {
          action: nextAction,
          timeout: this.options.action_liveness_verify_timeout
        }, 'warn')
        this.emit('detector-action' as any, {
          action: nextAction,
          status: LivenessActionStatus.TIMEOUT
        })
        this.partialResetDetectionState()      
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
    if(this.options.debug_mode !== true) return

    // 日志级别过滤
    const configuredLevel = this.options.debug_log_level || 'info'
    if (this.debugLogLevelPriority[level] < this.debugLogLevelPriority[configuredLevel]) {
      return
    }

    // 阶段过滤
    if (this.options.debug_log_stages && this.options.debug_log_stages.length > 0) {
      if (!this.options.debug_log_stages.includes(stage)) {
        return
      }
    }

    // 节流机制（仅对 info 级别日志）
    if (level === 'info' && this.options.debug_log_throttle && this.options.debug_log_throttle > 0) {
      const throttleKey = `${stage}:${message}`
      const now = Date.now()
      const lastTime = this.lastDebugLogTime.get(throttleKey) || 0
      
      if (now - lastTime < this.options.debug_log_throttle) {
        return // 在节流时间内，跳过
      }
      
      this.lastDebugLogTime.set(throttleKey, now)
    }

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
   * Handles potential runtime resolution changes from camera stream
   * @returns {HTMLCanvasElement | null} Canvas after drawing, returns null if failed
   */
  private drawVideoToCanvas(): HTMLCanvasElement | null {
    try {
      if (!this.videoElement) return null
      
      // Check actual video resolution every frame (accounts for runtime changes)
      const currentVideoWidth = this.videoElement.videoWidth
      const currentVideoHeight = this.videoElement.videoHeight
      
      // Update cached resolution if initial or changed
      if(this.actualVideoWidth <= 0 || this.actualVideoHeight <= 0 || 
         this.actualVideoWidth !== currentVideoWidth || 
         this.actualVideoHeight !== currentVideoHeight) {
        
        const resolutionChanged = this.actualVideoWidth > 0 && 
                                  (this.actualVideoWidth !== currentVideoWidth || 
                                   this.actualVideoHeight !== currentVideoHeight)
        
        if (resolutionChanged) {
          this.emitDebug('capture', 'Video resolution changed at runtime', {
            oldResolution: `${this.actualVideoWidth}x${this.actualVideoHeight}`,
            newResolution: `${currentVideoWidth}x${currentVideoHeight}`
          }, 'warn')
        }
        
        this.actualVideoWidth = currentVideoWidth
        this.actualVideoHeight = currentVideoHeight
        this.clearFrameCanvas()
      }

      // If cached canvas size does not match actual resolution, recreate it
      if (!this.frameCanvasElement || 
          this.frameCanvasElement.width !== this.actualVideoWidth || 
          this.frameCanvasElement.height !== this.actualVideoHeight) {
        
        this.clearFrameCanvas()
        // Clear preallocated Mats since resolution changed
        this.clearPreallocatedMats()
        
        this.frameCanvasElement = document.createElement('canvas')
        this.frameCanvasElement.width = this.actualVideoWidth
        this.frameCanvasElement.height = this.actualVideoHeight
        this.frameCanvasContext = this.frameCanvasElement.getContext('2d')
        this.emitDebug('capture', 'Canvas created/resized', { 
          width: this.actualVideoWidth, 
          height: this.actualVideoHeight,
          timestamp: Date.now()
        })
      }
      
      if (!this.frameCanvasContext) return null
      
      // Before attempting to draw, verify video drawability
      if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.emitDebug('capture', 'Video not ready for frame capture', { 
          readyState: this.videoElement.readyState, 
          HAVE_CURRENT_DATA: HTMLMediaElement.HAVE_CURRENT_DATA 
        }, 'warn')
        return null
      }
      
      this.frameCanvasContext.drawImage(this.videoElement, 0, 0, this.actualVideoWidth, this.actualVideoHeight)
      // 帧绘制成功日志已移除，减少高频输出
      
      return this.frameCanvasElement
    } catch (e) {
      this.emitDebug('capture', 'Failed to draw frame to canvas', { error: (e as Error).message }, 'error')
      return null
    }
  }

  private clearFrameCanvas(): void {
    if (this.frameCanvasContext) {
      try {
        this.frameCanvasContext.clearRect(0, 0, this.frameCanvasElement?.width ?? 0, this.frameCanvasElement?.height ?? 0)
      } catch (error) {
        this.emitDebug('detection', 'Error clearing canvas context', { error: (error as Error).message }, 'warn')
      }
      this.frameCanvasContext = null
    }

    if (this.frameCanvasElement) {
      try {
        this.frameCanvasElement.width = 0
        this.frameCanvasElement.height = 0
      } catch (error) {
        this.emitDebug('detection', 'Error resizing canvas', { error: (error as Error).message }, 'warn')
      }
      this.frameCanvasElement = null
    }
  }

  /**
   * Ensure preallocated Mat objects exist with correct dimensions
   * Creates both BGR and Gray Mat for reuse
   */
  private ensurePreallocatedMats(): void {
    if (!this.cv || this.actualVideoWidth <= 0 || this.actualVideoHeight <= 0) {
      return
    }

    try {
      // Create BGR Mat if not exists (RGBA format from canvas ImageData)
      if (!this.preallocatedBgrFrame) {
        this.preallocatedBgrFrame = new this.cv.Mat(
          this.actualVideoHeight,
          this.actualVideoWidth,
          this.cv.CV_8UC4 // RGBA format from canvas
        )
        this.emitDebug('capture', 'Created preallocated BGR Mat', {
          width: this.actualVideoWidth,
          height: this.actualVideoHeight
        })
      }

      // Create grayscale Mat if not exists
      if (!this.preallocatedGrayFrame) {
        this.preallocatedGrayFrame = new this.cv.Mat(
          this.actualVideoHeight,
          this.actualVideoWidth,
          this.cv.CV_8UC1 // Grayscale single channel
        )
        this.emitDebug('capture', 'Created preallocated Gray Mat', {
          width: this.actualVideoWidth,
          height: this.actualVideoHeight
        })
      }
    } catch (error) {
      this.emitDebug('capture', 'Failed to create preallocated Mats', {
        error: (error as Error).message
      }, 'error')
      this.clearPreallocatedMats()
    }
  }

  /**
   * Clear preallocated Mat objects
   * Called when resolution changes or detection stops
   */
  private clearPreallocatedMats(): void {
    try {
      if (this.preallocatedBgrFrame) {
        this.preallocatedBgrFrame.delete()
        this.preallocatedBgrFrame = null
        this.emitDebug('capture', 'Cleared preallocated BGR Mat')
      }
    } catch (error) {
      this.emitDebug('capture', 'Error clearing preallocated BGR Mat', {
        error: (error as Error).message
      }, 'warn')
      this.preallocatedBgrFrame = null
    }

    try {
      if (this.preallocatedGrayFrame) {
        this.preallocatedGrayFrame.delete()
        this.preallocatedGrayFrame = null
        this.emitDebug('capture', 'Cleared preallocated Gray Mat')
      }
    } catch (error) {
      this.emitDebug('capture', 'Error clearing preallocated Gray Mat', {
        error: (error as Error).message
      }, 'warn')
      this.preallocatedGrayFrame = null
    }
  }
}
