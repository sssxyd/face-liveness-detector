/**
 * Face Detection Engine - Core Detection Engine
 * Framework-agnostic face liveness detection engine
 */

import Human, { Box, FaceResult, GestureResult } from '@vladmandic/human'
import type {
  FaceDetectionEngineConfig,
  LivenessDetectedEventData,
  DetectorFinishEventData,
  DetectorErrorEventData,
  DetectorDebugEventData,
  StatusPromptEventData,
  ActionPromptEventData,
  EventMap,
  FaceFrontalFeatures,
  ImageQualityFeatures,
  EventListener,
  DetectorLoadedEventData,
  ResolvedEngineConfig
} from './types'
import { LivenessAction, ErrorCode, PromptCode, LivenessActionStatus, DetectionPeriod } from './enums'
import { mergeConfig } from './config'
import { SimpleEventEmitter } from './event-emitter'
import { checkFaceFrontal } from './face-frontal-checker'
import { checkImageQuality } from './image-quality-checker'
import { loadOpenCV, loadHuman } from './library-loader'
import { error } from 'console'

/**
 * Internal detection state interface
 */
interface DetectionState {
  period: DetectionPeriod
  startTime: number
  collectCount: number
  suspectedFraudsCount: number
  bestQualityScore: number
  bestFrameImage: string | null
  bestFaceImage: string | null
  completedActions: Set<LivenessAction>
  currentAction: LivenessAction | null
  actionVerifyTimeout: ReturnType<typeof setTimeout> | null
  lastFrontalScore: number
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
      period: DetectionPeriod.DETECT,
      startTime: performance.now(),
      collectCount: 0,
      suspectedFraudsCount: 0,
      bestQualityScore: 0,
      bestFrameImage: null,
      bestFaceImage: null,
      completedActions: new Set(),
      currentAction: null,
      actionVerifyTimeout: null,
      lastFrontalScore: 1,
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
      if(!cv || !(cv as any).Mat) {
        this.emit('detector-error' as any, {
          success: false,
          error: 'Failed to load OpenCV.js: module is null or invalid'
        })
        this.emit('detector-error' as any, {
          code: ErrorCode.DETECTOR_NOT_INITIALIZED,
          message: 'Failed to load OpenCV.js: module is null or invalid'
        })
        return
      }

      this.emitDebug('initialization', 'OpenCV loaded successfully', {
        version: cv?.getBuildInformation?.() || 'unknown'
      })

      // Load Human.js
      this.emitDebug('initialization', 'Loading Human.js...')
      this.human = await loadHuman(this.config.human_model_path, this.config.tensorflow_wasm_path)
      if (!this.human) {
        this.emit('detector-loaded' as any, {
          success: false,
          error: 'Failed to load Human.js: instance is null'
        })
        this.emit('detector-error' as any, {
          code: ErrorCode.DETECTOR_NOT_INITIALIZED,
          message: 'Failed to load Human.js: instance is null'
        })
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
            aspectRatio: { ideal: this.config.video_width / this.config.video_height }
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
      if (this.config.video_mirror) {
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
        }, this.config.video_load_timeout)

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
  stopDetection(success: boolean): void {
    this.isDetecting = false

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
    this.detectionState = {
      period: DetectionPeriod.DETECT,
      startTime: performance.now(),
      collectCount: 0,
      suspectedFraudsCount: 0,
      bestQualityScore: 0,
      bestFrameImage: null,
      bestFaceImage: null,
      completedActions: new Set(),
      currentAction: null,
      actionVerifyTimeout: null,
      lastFrontalScore: 1,
    }
    this.actualVideoWidth = 0
    this.actualVideoHeight = 0
    this.clearFrameCanvas()
    this.clearFaceCanvas()
  }

  /**
   * Schedule next detection frame
   */
  private scheduleNextDetection(delayMs: number = this.config.detection_frame_delay): void {
    if (!this.isDetecting) return

    if (this.detectionFrameId !== null) {
      clearTimeout(this.detectionFrameId as any)
    }

    this.detectionFrameId = setTimeout(() => {
      if (this.isDetecting) {
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
   * Handle single face detection
   */
  private handleSingleFace(face: FaceResult, gestures: GestureResult[]): void {
    const faceBox = face.box || face.boxRaw

    if (!this.validateFaceBox(faceBox)) {
      return
    }

    const faceRatio = (faceBox[2] * faceBox[3]) / (this.actualVideoWidth * this.actualVideoHeight)
    if (!this.validateFaceSize(faceRatio, faceBox)) {
      return
    }

    const frameCanvas = this.drawVideoToCanvas()
    if (!frameCanvas) {
      this.emitDebug('detection', 'Failed to draw video frame to canvas', {}, 'warn')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return
    }

    let frontal = 1
    if (this.detectionState.period === DetectionPeriod.DETECT || this.detectionState.period === DetectionPeriod.COLLECT) {
      if (!this.validateFaceFrontal(face, gestures, frameCanvas, faceRatio)) {
        return
      }
      frontal = this.detectionState.lastFrontalScore
    }

    const qualityResult = checkImageQuality(frameCanvas, face, this.actualVideoWidth, this.actualVideoHeight, this.config.image_quality_features)
    if (!this.validateImageQuality(qualityResult, faceRatio, frontal)) {
      return
    }

    if (!this.validateSilentLiveness(face, faceRatio, frontal, qualityResult.score)) {
      return
    }

    this.emitLivenessDetected(true, faceRatio, frontal, qualityResult.score, face.real || 0, face.live || 0)

    // Process detection phases based on current period
    if (this.detectionState.period === DetectionPeriod.DETECT) {
      this.handleDetectPhase()
    }

    if (this.detectionState.period === DetectionPeriod.COLLECT) {
      this.handleCollectPhase(qualityResult.score, faceBox)
    }

    if (this.detectionState.period === DetectionPeriod.VERIFY) {
      this.handleVerifyPhase(gestures)
    }
  }

  /**
   * Validate face box existence
   */
  private validateFaceBox(faceBox: Box | undefined): boolean {
    if (!faceBox) {
      console.warn('[FaceDetector] Face detected but no box/boxRaw property')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return false
    }
    return true
  }

  /**
   * Validate face size ratio
   */
  private validateFaceSize(faceRatio: number, faceBox: Box): boolean {
    if (faceRatio <= this.config.min_face_ratio!) {
      this.emitLivenessDetected(false, faceRatio)
      this.emitDebug('detection', 'Face is too small', { ratio: faceRatio.toFixed(4), minRatio: this.config.min_face_ratio!, maxRatio: this.config.max_face_ratio! }, 'info')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return false
    }

    if (faceRatio >= this.config.max_face_ratio!) {
      this.emitLivenessDetected(false, faceRatio)
      this.emitStatusPrompt(PromptCode.FACE_TOO_LARGE, { size: faceRatio })
      this.emitDebug('detection', 'Face is too large', { ratio: faceRatio.toFixed(4), minRatio: this.config.min_face_ratio!, maxRatio: this.config.max_face_ratio! }, 'info')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return false
    }

    return true
  }

  /**
   * Validate face frontal angle
   */
  private validateFaceFrontal(face: FaceResult, gestures: GestureResult[], frameCanvas: HTMLCanvasElement, faceRatio: number): boolean {
    const frontal = checkFaceFrontal(face, gestures, frameCanvas, this.config.face_frontal_features)
    this.detectionState.lastFrontalScore = frontal

    if (frontal < this.config.min_face_frontal) {
      this.emitLivenessDetected(false, faceRatio, frontal)
      this.emitStatusPrompt(PromptCode.FACE_NOT_FRONTAL, { frontal })
      this.emitDebug('detection', 'Face is not frontal to camera', { frontal: frontal.toFixed(4), minFrontal: this.config.min_face_frontal! }, 'info')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return false
    }

    return true
  }

  /**
   * Validate image quality
   */
  private validateImageQuality(qualityResult: any, faceRatio: number, frontal: number): boolean {
    if (!qualityResult.passed || qualityResult.score < this.config.min_image_quality) {
      this.emitLivenessDetected(false, faceRatio, frontal, qualityResult.score)
      this.emitStatusPrompt(PromptCode.IMAGE_QUALITY_LOW, { result: qualityResult, minImageQuality: this.config.min_image_quality })
      this.emitDebug('detection', 'Image quality does not meet requirements', { result: qualityResult, minImageQuality: this.config.min_image_quality }, 'info')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return false
    }

    return true
  }

  /**
   * Validate silent liveness scores
   */
  private validateSilentLiveness(face: FaceResult, faceRatio: number, frontal: number, quality: number): boolean {
    // Check reality score
    if (face.real === undefined || typeof face.real !== 'number') {
      this.emitLivenessDetected(false, faceRatio, frontal, quality)
      this.emitDebug('detection', 'Face reality score is missing, cannot perform liveness check', {}, 'warn')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return false
    }

    if (face.real < this.config.min_real_score) {
      this.detectionState.suspectedFraudsCount++
      this.emitLivenessDetected(false, faceRatio, frontal, quality, face.real)
      this.emitDebug('detection', 'Face reality score is insufficient, suspected non-liveness', { realScore: face.real.toFixed(4), minRealScore: this.config.min_real_score }, 'info')

      if (this.detectionState.suspectedFraudsCount < this.config.suspected_frauds_count) {
        this.emitStatusPrompt(PromptCode.IMAGE_QUALITY_LOW, { count: this.detectionState.suspectedFraudsCount, realScore: face.real })
        this.scheduleNextDetection(this.config.error_retry_delay)
        return false
      }

      this.emit('detector-error' as any, {
        code: ErrorCode.SUSPECTED_FRAUDS_DETECTED,
        message: 'Liveness detection failed: Suspected non-liveness face detected, please try again.'
      })
      this.stopDetection(false)
      return false
    }

    // Check liveness score
    if (face.live === undefined || typeof face.live !== 'number') {
      this.emitLivenessDetected(false, faceRatio, frontal, quality, face.real)
      this.emitDebug('detection', 'Face liveness score is missing, cannot perform liveness check', {}, 'warn')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return false
    }

    if (face.live < this.config.min_live_score) {
      this.emitLivenessDetected(false, faceRatio, frontal, quality, face.real, face.live)
      this.emitDebug('detection', 'Face liveness score is insufficient, this frame does not pass', { liveScore: face.live.toFixed(4), minLiveScore: this.config.min_live_score }, 'info')
      this.scheduleNextDetection(this.config.error_retry_delay)
      return false
    }

    return true
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
  private handleCollectPhase(qualityScore: number, faceBox: Box): void {
    this.collectHighQualityImage(qualityScore, faceBox)

    if (this.detectionState.collectCount >= this.config.silent_detect_count) {
      if (this.getPerformActionCount() > 0) {
        this.detectionState.period = DetectionPeriod.VERIFY
        this.emitDebug('detection', 'Entering action verification phase')
      } else {
        this.stopDetection(true)
      }
    }
  }

  /**
   * Handle verify phase
   */
  private handleVerifyPhase(gestures: GestureResult[]): void {
    // No action set yet, will continue after setting
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

    // Action completed
    this.emit('action-prompt' as any, {
      action: this.detectionState.currentAction,
      status: LivenessActionStatus.COMPLETED
    })

    this.clearActionVerifyTimeout()
    this.detectionState.completedActions.add(this.detectionState.currentAction)
    this.detectionState.currentAction = null

    // Check if all required actions completed
    if (this.detectionState.completedActions.size >= this.getPerformActionCount()) {
      this.stopDetection(true)
      return
    }

    // Select next action
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
    const frameImageData = this.captureFrame()
    if (!frameImageData) {
      this.emitDebug('detection', 'Failed to capture current frame image', {}, 'warn')
      return
    }
    const faceImageData = this.captureFrame(faceBox)
    if (!faceImageData) {
      this.emitDebug('detection', 'Failed to capture face image', {}, 'warn')
      return
    }
    this.detectionState.collectCount++
    this.detectionState.bestQualityScore = frameQuality
    this.detectionState.bestFrameImage = frameImageData
    this.detectionState.bestFaceImage = faceImageData
  }

  private emitLivenessDetected(passed: boolean, size: number, frontal: number = 0, quality: number = 0, real: number = 0, live: number = 0): void {
    this.emit('liveness-detected' as any, {passed, size, frontal, quality, real, live} as LivenessDetectedEventData)
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

    // Start action verification timeout timer
    this.clearActionVerifyTimeout()
    this.detectionState.actionVerifyTimeout = setTimeout(() => {
      if (this.detectionState.currentAction) {
        this.emitDebug('liveness', 'Action verify timeout', {
          action: this.detectionState.currentAction,
          timeout: this.config.liveness_verify_timeout
        }, 'warn')
        this.emit('action-prompt' as any, {
          action: this.detectionState.currentAction,
          status: LivenessActionStatus.TIMEOUT
        })
        this.resetDetectionState()
      }
    }, this.config.liveness_verify_timeout)

    return
  }

  /**
   * Clear action verify timeout
   */
  private clearActionVerifyTimeout(): void {
    if (this.detectionState.actionVerifyTimeout !== null) {
      clearTimeout(this.detectionState.actionVerifyTimeout)
      this.detectionState.actionVerifyTimeout = null
    }
  }

  /**
   * Detect specific action
   */
  private detectAction(action: LivenessAction, gestures: GestureResult[]): boolean {
    if (!gestures || gestures.length === 0) return false

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
          return percent > (this.config.min_mouth_open_percent ?? 0.2)
        })
      case LivenessAction.NOD:
        return gestures.some(g => {
          if (!g.gesture) return false
          // Check for continuous head movement (up -> down or down -> up)
          const headPattern = g.gesture.match(/head\s+(up|down)/i)
          return !!headPattern && !!headPattern[1]
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
      this.emitDebug('capture', 'Frame drawn to canvas')
      
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
      return null
    }
    if (!box) {
      return this.canvasToBase64(this.frameCanvasElement)
    }
    const x = box[0], y = box[1], width = box[2], height = box[3]
    // If cached canvas size does not match, recreate it
    if (!this.faceCanvasElement || this.faceCanvasElement.width !== width || this.faceCanvasElement.height !== height) {
      this.clearFaceCanvas()
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
  StatusPromptEventData,
  ActionPromptEventData,
  LivenessDetectedEventData,
  DetectorFinishEventData,
  DetectorErrorEventData,
  DetectorDebugEventData,
  EventListener,
  EventMap,
}

export default FaceDetectionEngine
