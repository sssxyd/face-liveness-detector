/**
 * Face Detection Engine - Core Detection Engine
 * Framework-agnostic face liveness detection engine
 */

import Human, { Box, FaceResult, GestureResult } from '@vladmandic/human'
import type {
  FaceDetectionEngineConfig,
  LivenessDetectedEventData,
  LivenessCompletedEventData,
  DetectorErrorEventData,
  DetectorDebugEventData,
  StatusPromptEventData,
  ActionPromptEventData,
  EventMap,
  ScoredList,
  FaceFrontalFeatures,
  ImageQualityFeatures,
  EventListener,
  DetectorLoadedEventData,
  ResolvedEngineConfig
} from './types'
import { ScoredList as ScoredListClass } from './types'
import { LivenessAction, ErrorCode, PromptCode, LivenessActionStatus } from './enums'
import { DEFAULT_CONFIG, mergeConfig } from './config'
import { SimpleEventEmitter } from './event-emitter'
import { checkFaceFrontal } from './face-frontal-checker'
import { checkImageQuality } from './image-quality-checker'
import { loadOpenCV, loadHuman, getCvSync } from './library-loader'
import { min } from '@techstark/opencv-js'

/**
 * Internal detection state interface
 */
interface DetectionState {
  completedActions: Set<LivenessAction>
  currentAction: LivenessAction | null
  collectedImages: ScoredList<string>
  collectedFaces: ScoredList<string>
}

/**
 * Framework-agnostic face liveness detection engine
 * Provides core detection logic without UI dependencies
 *
 * @example
 * ```typescript
 * const engine = new FaceDetectionEngine({
 *   min_face_ratio: 0.5,
 *   max_face_ratio: 0.9,
 *   liveness_action_count: 1
 * })
 *
 * engine.on('detector-loaded', () => {
 *   console.log('Engine ready')
 *   engine.startDetection(videoElement, canvasElement)
 * })
 *
 * engine.on('liveness-completed', (data) => {
 *   console.log('Liveness detection completed:', data)
 * })
 *
 * engine.on('detector-error', (error) => {
 *   console.error('Detection error:', error)
 * })
 *
 * await engine.initialize()
 * ```
 */
export class FaceDetectionEngine extends SimpleEventEmitter {
  private config: ResolvedEngineConfig
  private human: Human | null = null
  private stream: MediaStream | null = null
  private isDetecting: boolean = false
  private isReady: boolean = false
  private isInitializing: boolean = false

  private videoElement: HTMLVideoElement | null = null
  private frameCanvasElement: HTMLCanvasElement | null = null
  private frameCanvasContext: CanvasRenderingContext2D | null = null
  private faceCanvasElement: HTMLCanvasElement | null = null
  private faceCanvasContext: CanvasRenderingContext2D | null = null

  private detectionFrameId: number | null = null
  private lastDetectionTime: number = 0
  private actionTimeoutId: ReturnType<typeof setTimeout> | null = null
  private detectionStartTime: number = 0

  private actualVideoWidth: number = 0
  private actualVideoHeight: number = 0

  private detectionState: DetectionState

  /**
   * Constructor
   * @param config - Configuration object
   */
  constructor(config?: Partial<FaceDetectionEngineConfig>) {
    super()
    this.config = mergeConfig(config)
    this.detectionState = {
      completedActions: new Set(),
      currentAction: null,
      collectedImages: new ScoredListClass(this.config.silent_detect_count), 
      collectedFaces: new ScoredListClass(this.config.silent_detect_count) 
    }
  }

  /**
   * Initialize the detection engine
   * Loads Human.js and OpenCV.js libraries
   *
   * @returns Promise that resolves when initialization is complete
   * @throws Error if initialization fails
   */
  async initialize(): Promise<void> {
    if (this.isInitializing || this.isReady) {
      return
    }

    this.isInitializing = true
    this.emitDebug('initialization', 'Starting to load detection libraries...')

    try {
      // Load OpenCV
      this.emitDebug('initialization', 'Loading OpenCV...')
      const { cv } = await loadOpenCV()
      this.emitDebug('initialization', 'OpenCV loaded successfully', {
        version: cv?.getBuildInformation?.() || 'unknown'
      })

      // Load Human.js
      this.emitDebug('initialization', 'Loading Human.js...')
      this.human = await loadHuman(this.config.human_model_path, this.config.tensorflow_wasm_path)
      if (!this.human) {
        const errorData: DetectorLoadedEventData = {
          success: false,
          error: 'Failed to load Human.js: instance is null'
        }
        this.emit('detector-loaded', errorData)
        return
      }

      this.isReady = true
      const loadedData: DetectorLoadedEventData = {
        success: true,
        opencv_version: cv?.getBuildInformation?.() || 'unknown',
        human_version: this.human.version
      }
      this.emit('detector-loaded', loadedData)
      this.emitDebug('initialization', 'Engine initialized and ready', loadedData)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      const errorData: DetectorLoadedEventData = {
        success: false,
        error: errorMsg
      }
      this.emit('detector-loaded', errorData)
      this.emitDebug('initialization', 'Failed to load libraries', {
        error: errorMsg,
        stack: error instanceof Error ? error.stack : 'N/A'
      }, 'error')
    } finally {
      this.isInitializing = false
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
    if (!this.isReady) {
      this.emitDebug('detection', 'Engine not ready', { ready: this.isReady }, 'warn')
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
            width: { ideal: this.config.video_width },
            height: { ideal: this.config.video_height },
            aspectRatio: { ideal: 1.0 }
          },
          audio: false
        })
        this.emitDebug('video-setup', 'Camera access granted', {
          trackCount: this.stream.getTracks().length
        })
      } catch (err) {
        this.emitDebug('video-setup', 'Camera access denied', {
          error: (err as Error).message
        }, 'error')
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
      if (this.config.video_mirror) {
        this.videoElement.style.transform = 'scaleX(-1)'
      }

      // Get actual video stream resolution
      const videoTrack = this.stream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings?.()
        if (settings) {
          this.actualVideoWidth = settings.width || this.config.video_width || 640
          this.actualVideoHeight = settings.height || this.config.video_height || 640
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
          reject(new Error('Video loading timeout'))
        }, this.config.video_load_timeout || 5000)

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
          this.videoElement.play().catch(err => {
            clearTimeout(timeout)
            cleanup()
            reject(err)
          })
        }
      })

      this.isDetecting = true
      this.detectionStartTime = performance.now()
      this.scheduleNextDetection(0)

      this.emitDebug('video-setup', 'Detection started')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.emitDebug('video-setup', 'Failed to start detection', {
        error: errorMsg,
        stack: error instanceof Error ? error.stack : 'N/A'
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
  stopDetection(success: boolean = false): void {
    this.isDetecting = false
    this.cancelPendingDetection()
    this.clearAllTimers()

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
   * Update configuration
   * Note: Some settings may not take effect if called during detection
   *
   * @param config - Configuration overrides
   */
  updateConfig(config: Partial<FaceDetectionEngineConfig>): void {
    this.config = mergeConfig({ ...this.config, ...config })
    this.emitDebug('config', 'Configuration updated', { keys: Object.keys(config) })
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): FaceDetectionEngineConfig {
    return { ...this.config }
  }

  /**
   * Get detection status
   * @returns Object with status information
   */
  getStatus(): {
    isReady: boolean
    isDetecting: boolean
    isInitializing: boolean
  } {
    return {
      isReady: this.isReady,
      isDetecting: this.isDetecting,
      isInitializing: this.isInitializing
    }
  }

  // ==================== Private Methods ====================

  /**
   * Reset detection state
   */
  private resetDetectionState(): void {
    this.isDetecting = true
    this.detectionState.completedActions.clear()
    this.detectionState.collectedImages.clear()
    this.detectionState.currentAction = null
    this.clearAllTimers()
    this.detectionStartTime = performance.now()
    this.actualVideoWidth = 0
    this.actualVideoHeight = 0
  }

  /**
   * Schedule next detection frame
   */
  private scheduleNextDetection(delayMs: number = this.config.detection_frame_delay): void {
    if (!this.isDetecting) return

    if (this.detectionFrameId !== null) {
      cancelAnimationFrame(this.detectionFrameId)
    }

    const loop = (timestamp: number) => {
      const timeSinceLastDetection = timestamp - this.lastDetectionTime
      if (timeSinceLastDetection >= delayMs) {
        this.lastDetectionTime = timestamp
        this.detect()
      } else {
        this.detectionFrameId = requestAnimationFrame(loop)
      }
    }

    this.detectionFrameId = requestAnimationFrame(loop)
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
   * Clear all timers
   */
  private clearAllTimers(): void {
    if (this.actionTimeoutId) {
      clearTimeout(this.actionTimeoutId)
      this.actionTimeoutId = null
    }
  }

  /**
   * Main detection loop
   */
  private async detect(): Promise<void> {
    if (!this.isDetecting || !this.videoElement || !this.human) {
      this.scheduleNextDetection()
      return
    }

    try {
      // Check video is ready
      if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.scheduleNextDetection(this.config.error_retry_delay) // ERROR_RETRY_DELAY
        return
      }

      // Perform face detection
      const result = await this.human.detect(this.videoElement)

      if (!result) {
        this.scheduleNextDetection(this.config.error_retry_delay) // DETECTION_FRAME_DELAY
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
      this.emitDebug('detection', 'Detection error', {
        error: (error as Error).message,
        stack: (error as Error).stack
      }, 'error')
      this.scheduleNextDetection(this.config.error_retry_delay) // ERROR_RETRY_DELAY
    }
  }

  private getPerformActionCount(): number{
    if (this.config.liveness_action_count <= 0){
      return 0
    }
    return Math.min(this.config.liveness_action_count, this.config.liveness_action_list.length)
  }

  /**
   * 当前帧是否处于采集照片阶段
   * @returns 
   */
  private isCollectingPhotos(): boolean {
    return this.detectionState.collectedImages.size() < this.config.silent_detect_count
  }

  private hasCollectedEnoughImages(): boolean {
    return this.detectionState.collectedImages.size() >= this.config.silent_detect_count
  }

  /**
   * Handle single face detection
   */
  private handleSingleFace(face: FaceResult, gestures: GestureResult[]): void {
    const faceBox = face.box || face.boxRaw

    if (!faceBox) {
      console.warn('[FaceDetector] Face detected but no box/boxRaw property:', Object.keys(face).slice(0, 10))
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    }

    // 计算人脸占视频画面的比例 (0-1)
    const faceRatio = (faceBox[2] * faceBox[3]) / (this.actualVideoWidth * this.actualVideoHeight)
    if (faceRatio <= this.config.min_face_ratio!) {
      this.emitDebug('detection', '人脸太小', { ratio: faceRatio.toFixed(4), minRatio: this.config.min_face_ratio!, maxRatio: this.config.max_face_ratio! }, 'info')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    } 
    if (faceRatio >= this.config.max_face_ratio!) {
      this.emitStatusPrompt(PromptCode.FACE_TOO_LARGE, { size: faceRatio })
      this.emitDebug('detection', '人脸太大', { ratio: faceRatio.toFixed(4), minRatio: this.config.min_face_ratio!, maxRatio: this.config.max_face_ratio! }, 'info')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    }

    // 一次性绘制视频帧到 canvas，后续多次使用
    const frameCanvas = this.drawVideoToCanvas()
    if (!frameCanvas) {
      this.emitDebug('detection', '绘制视频帧到 canvas 失败', {}, 'warn')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    }

    // 检查人脸是否正对摄像头 (0-1 评分)
    let frontal = 1
    // 非动作检测阶段，需要校验人脸正对度
    if(this.isCollectingPhotos()){
        frontal = checkFaceFrontal(face, gestures, frameCanvas, this.config.face_frontal_features)
        if(frontal < this.config.min_face_frontal){
            this.emitStatusPrompt(PromptCode.FACE_NOT_FRONTAL, { frontal })
            this.emitDebug('detection', '人脸未正对摄像头', { frontal: frontal.toFixed(4), minFrontal: this.config.min_face_frontal! }, 'info')
            this.scheduleNextDetection(this.config.error_retry_delay)
            return
        }
    }

    // 图片质量检测
    const qualityResult = checkImageQuality(frameCanvas, face, this.actualVideoWidth, this.actualVideoHeight, this.config.image_quality_features)
    if (!qualityResult.passed || qualityResult.score < this.config.min_image_quality ) {
      this.emitStatusPrompt(PromptCode.IMAGE_QUALITY_LOW, { result: qualityResult, minImageQuality: this.config.min_image_quality })
      this.emitDebug('detection', '图像质量不符合要求', { result: qualityResult, minImageQuality: this.config.min_image_quality }, 'info')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    }

    // 静默活体检测
    if (face.real == undefined || typeof face.real !== 'number') {
      this.emitDebug('detection', '人脸实度评分缺失，无法进行活体判断', {}, 'warn')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    }

    if (face.real < this.config.min_real_score) {
      this.emitDebug('detection', '人脸实度评分不足，疑似非活体', { realScore: face.real.toFixed(4), minRealScore: this.config.min_real_score }, 'info')
      this.emit('detector-error' as any, { 
        code: ErrorCode.LIVENESS_DETECTION_FAILED, 
        message: '活体检测失败：检测到疑似非活体人脸，请重新尝试。' 
      })
      this.stopDetection()
      return
    }
    
    if (face.live == undefined || typeof face.live !== 'number') {
      this.emitDebug('detection', '人脸活度评分缺失，无法进行活体判断', {}, 'warn')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    }

    if (face.live < this.config.min_live_score) {
      this.emitDebug('detection', '人脸活度评分不足，本次不通过', { liveScore: face.live.toFixed(4), minLiveScore: this.config.min_live_score }, 'info')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    }

    // Capture face image
    const frameImageData = this.captureFrame()
    if (!frameImageData) {
      this.emitDebug('detection', '捕获当前帧图像失败', {}, 'warn')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    }
    const faceImageData = this.captureFrame(faceBox)
    if (!faceImageData) {
      this.emitDebug('detection', '捕获人脸图像失败', {}, 'warn')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    }
    this.detectionState.collectedImages.add(frameImageData, qualityResult.score)
    this.detectionState.collectedFaces.add(faceImageData, qualityResult.score)

    // 未采集到足够的图片时，继续采集
    if(!this.hasCollectedEnoughImages()){
      this.scheduleNextDetection(this.config.detection_frame_delay * 2.5)
      return
    }

    // 不需要动作检测时，直接结束
    if(this.getPerformActionCount() <= 0){
      this.completeLiveness()
      return
    }

    // 当前还没有设定动作，设定后继续
    if (!this.detectionState.currentAction) {
      this.selectNextAction()
      this.scheduleNextDetection(this.config.detection_frame_delay * 3)
      return
    }

    // Check if action detected
    const detected = this.detectAction(this.detectionState.currentAction, gestures)
    if (!detected) {
      this.scheduleNextDetection()
      return
    }

    this.detectionState.completedActions.add(this.detectionState.currentAction)
    this.detectionState.currentAction = null

    if (this.actionTimeoutId) {
      clearTimeout(this.actionTimeoutId)
      this.actionTimeoutId = null
    }

    // 已经完成规定次数的动作验证，结束检测
    if (this.detectionState.completedActions.size >= this.getPerformActionCount()) {
      this.completeLiveness()
      return
    }

    this.selectNextAction()
    this.scheduleNextDetection()
  }

  /**
   * Handle multiple or no faces
   */
  private handleMultipleFaces(faceCount: number): void {
    if (faceCount === 0) {
      this.emitStatusPrompt(PromptCode.NO_FACE, { count: faceCount })
    } else if (faceCount > 1) {
      this.emitStatusPrompt(PromptCode.MULTIPLE_FACE, { count: faceCount })
    }

    if (this.detectionState.collectedImages.size() > 0) {
      this.resetDetectionState()
    }

    this.scheduleNextDetection()
  }

  /**
   * Complete liveness detection
   */
  private completeLiveness(): void {
    const bestFrame = this.detectionState.collectedImages.getBestItem()
    const bestFace = this.detectionState.collectedFaces.getBestItem()
    const bestScore = this.detectionState.collectedImages.getBestScore()

    if (!bestFrame || !bestFace || bestScore === null) {
      this.emit('detector-error' as any, {
        code: ErrorCode.DETECTION_ERROR,
        message: 'No images collected, unable to select best image'
      })
      this.stopDetection()
      return
    }

    this.emit('liveness-completed' as any, {
      qualityScore: bestScore,
      imageData: bestFrame,
      faceData: bestFace,
    })

    this.stopDetection(true)
  }

  /**
   * Select next action
   */
  private selectNextAction(): void {
    const availableActions = (this.config.liveness_action_list ?? []).filter(
      action => !this.detectionState.completedActions.has(action)
    )

    if (availableActions.length === 0) {
      return
    }

    let nextAction = availableActions[0]
    if (this.config.liveness_action_randomize) {
        // Random selection
        const randomIndex = Math.floor(Math.random() * availableActions.length)
        nextAction = availableActions[randomIndex]
    }

    this.detectionState.currentAction = nextAction

    const promptData: ActionPromptEventData = {
      action: this.detectionState.currentAction,
      status: LivenessActionStatus.STARTED
    }

    this.emit('action-prompt' as any, promptData)
    this.emitDebug('liveness', 'Action selected', { action: this.detectionState.currentAction })

    // Set timeout
    if (this.actionTimeoutId) {
      clearTimeout(this.actionTimeoutId)
    }

    this.actionTimeoutId = setTimeout(() => {
      if (this.detectionState.currentAction) {
        this.emitDebug('liveness', 'Action timeout', {
          action: this.detectionState.currentAction
        }, 'warn')
        this.resetDetectionState()
      }
    }, (this.config.liveness_action_timeout ?? 60) * 1000)

    return
  }

  /**
   * Detect specific action
   */
  private detectAction(action: LivenessAction, gestures: GestureResult[]): boolean {
    if (!gestures) return false

    switch (action) {
      case LivenessAction.BLINK:
        return gestures.some(g => g.gesture?.includes('blink'))
      case LivenessAction.MOUTH_OPEN:
        return gestures.some(g => {
          const gestureStr = g.gesture
          if (!gestureStr?.includes('mouth')) return false
          const percentMatch = gestureStr.match(/mouth (\d+)% open/)?.[1]
          const percent = percentMatch ? parseInt(percentMatch) : 0
          return percent > (this.config.min_mouth_open_percent ?? 20)
        })
      case LivenessAction.NOD:
        return gestures.some(g => {
          const headDirection = g.gesture?.match(/(up|down)/)?.[0]
          return !!headDirection
        })
      default:
        return false
    }
  }

  /**
   * Emit status prompt event
   */
  private emitStatusPrompt(code: PromptCode, data?: Record<string, any>): void {
    const promptData: StatusPromptEventData = {
      code,
      ...data
    }
    this.emit('status-prompt' as any, promptData)
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
   * 从视频帧绘制到 canvas（内部使用，不转 Base64）
   * @returns {HTMLCanvasElement | null} 绘制后的 canvas，如果失败返回 null
   */
  private drawVideoToCanvas(): HTMLCanvasElement | null {
    try {
      if (!this.videoElement) return null
      
      // 使用缓存的实际视频流分辨率（从 getSettings 获取）
      // 如果缓存为空，则尝试从 video 元素的 videoWidth/videoHeight 获取
      let videoWidth_actual = this.actualVideoWidth || this.videoElement.videoWidth 
      let videoHeight_actual = this.actualVideoHeight || this.videoElement.videoHeight 
      
      this.actualVideoWidth = videoWidth_actual
      this.actualVideoHeight = videoHeight_actual
      
      // 再次检查是否为有效值
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
      
      // 如果缓存的 canvas 尺寸不匹配，重新创建
      if (!this.frameCanvasElement || this.frameCanvasElement.width !== videoWidth_actual || this.frameCanvasElement.height !== videoHeight_actual) {
        this.frameCanvasElement = document.createElement('canvas')
        this.frameCanvasElement.width = videoWidth_actual
        this.frameCanvasElement.height = videoHeight_actual
        this.frameCanvasContext = this.frameCanvasElement.getContext('2d')
        this.emitDebug('capture', 'Canvas 创建/调整大小', { width: videoWidth_actual, height: videoHeight_actual })
      }
      
      if (!this.frameCanvasContext) return null
      
      // 在尝试绘制前，验证视频的可绘制性
      if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.emitDebug('capture', 'draw video image failed', { 
          readyState: this.videoElement.readyState, 
          HAVE_CURRENT_DATA: HTMLMediaElement.HAVE_CURRENT_DATA 
        }, 'warn')
        return null
      }
      
      this.frameCanvasContext.drawImage(this.videoElement, 0, 0, videoWidth_actual, videoHeight_actual)
      this.emitDebug('capture', '帧已绘制到 canvas')
      
      return this.frameCanvasElement
    } catch (e) {
      this.emitDebug('capture', '绘制帧到 canvas 失败', { error: (e as Error).message }, 'error')
      return null
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
      this.emitDebug('capture', '图片已转换为 Base64', { size: imageData.length })
      return imageData
    } catch (e) {
      this.emitDebug('capture', '转换为 Base64 失败', { error: (e as Error).message }, 'error')
      return null
    }
  }

  /**
   * 捕获当前视频帧（返回 Base64）
   * @param {Box} box - 人脸框
   * @returns {string | null} Base64 格式的 JPEG 图片数据
   */
  private captureFrame(box?: Box): string | null {
    if(!this.frameCanvasElement) {
      return null
    }
    if (!box) {
      return this.canvasToBase64(this.frameCanvasElement)
    }
    const x = box[0], y = box[1], width = box[2], height = box[3]
    // 如果缓存的 canvas 尺寸不匹配，重新创建
    if (!this.faceCanvasElement || this.faceCanvasElement.width !== width || this.faceCanvasElement.height !== height) {
      this.faceCanvasElement = document.createElement('canvas')
      this.faceCanvasElement.width = width
      this.faceCanvasElement.height = height
      this.faceCanvasContext = this.faceCanvasElement.getContext('2d')
    }
    if(!this.faceCanvasContext) return null
    this.faceCanvasElement.width = width
    this.faceCanvasElement.height = height
    this.faceCanvasContext.drawImage(this.frameCanvasElement, x, y, width, height, 0, 0, width, height)
    return this.canvasToBase64(this.faceCanvasElement)
  }
}

// Export types
export type {
  FaceDetectionEngineConfig,
  FaceFrontalFeatures,
  ImageQualityFeatures,
  StatusPromptEventData as StatusPromptData,
  ActionPromptEventData as ActionPromptData,
  LivenessDetectedEventData as LivenessDetectedData,
  LivenessCompletedEventData as LivenessCompletedData,
  DetectorErrorEventData as ErrorData,
  DetectorDebugEventData as DebugData,
  EventListener,
  EventMap,
  ScoredList
}

export default FaceDetectionEngine
