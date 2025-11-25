/**
 * Face Detection Engine - Core Detection Engine
 * Framework-agnostic face liveness detection engine
 */

import Human, { FaceResult, GestureResult } from '@vladmandic/human'
import type {
  FaceDetectionEngineConfig,
  LivenessDetectedData,
  LivenessCompletedData,
  ErrorData,
  DebugData,
  StatusPromptData,
  ActionPromptData,
  EventMap,
  ScoredList,
  FaceFrontalFeatures,
  ImageQualityFeatures,
  EventListener
} from './types'
import { ScoredList as ScoredListClass } from './types'
import { LivenessAction, ErrorCode, PromptCode, LivenessActionStatus, DetectionMode } from './enums'
import { DEFAULT_CONFIG, mergeConfig, PROMPT_CODE_DESCRIPTIONS, BORDER_COLOR_STATES, ACTION_DESCRIPTIONS } from './config'
import { SimpleEventEmitter } from './event-emitter'
import { checkFaceFrontal } from './face-frontal-checker'
import { checkImageQuality } from './image-quality-checker'
import { loadOpenCV, loadHuman, getCvSync } from './library-loader'

/**
 * Internal detection state interface
 */
interface DetectionState {
  completedActions: Set<LivenessAction>
  currentAction: LivenessAction | null
  collectedImages: ScoredList<string>
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
  private config: FaceDetectionEngineConfig
  private human: Human | null = null
  private stream: MediaStream | null = null
  private isDetecting: boolean = false
  private isReady: boolean = false
  private isInitializing: boolean = false

  private videoElement: HTMLVideoElement | null = null
  private canvasElement: HTMLCanvasElement | null = null
  private canvasContext: CanvasRenderingContext2D | null = null

  private detectionFrameId: number | null = null
  private lastDetectionTime: number = 0
  private actionTimeoutId: ReturnType<typeof setTimeout> | null = null
  private detectionStartTime: number = 0

  private detectionState: DetectionState = {
    completedActions: new Set(),
    currentAction: null,
    collectedImages: new ScoredListClass(3) // COLLECTION_COUNT default
  }

  private actualVideoWidth: number = 0
  private actualVideoHeight: number = 0

  /**
   * Constructor
   * @param config - Configuration object
   */
  constructor(config?: Partial<FaceDetectionEngineConfig>) {
    super()
    this.config = mergeConfig(config)
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
      this.human = await loadHuman('/models', '/wasm')
      if (!this.human) {
        throw new Error('Failed to load Human.js: instance is null')
      }
      this.emitDebug('initialization', 'Human.js loaded successfully', {
        version: this.human.version
      })

      this.isReady = true
      this.emit('detector-loaded' as any, undefined)
      this.emitDebug('initialization', 'Engine initialized and ready')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.emitDebug('initialization', 'Failed to load libraries', {
        error: errorMsg,
        stack: error instanceof Error ? error.stack : 'N/A'
      }, 'error')
      this.emit('detector-error' as any, {
        code: ErrorCode.ENGINE_NOT_INITIALIZED,
        message: `Failed to load detection libraries: ${errorMsg}`
      })
      throw error
    } finally {
      this.isInitializing = false
    }
  }

  /**
   * Start face detection
   * Requires initialize() to be called first and a video element to be provided
   *
   * @param videoElement - HTMLVideoElement to capture from
   * @param canvasElement - HTMLCanvasElement for drawing (optional)
   * @returns Promise that resolves when detection starts
   * @throws Error if not initialized or video setup fails
   */
  async startDetection(videoElement: HTMLVideoElement, canvasElement?: HTMLCanvasElement): Promise<void> {
    if (!this.isReady) {
      this.emitDebug('detection', 'Engine not ready', { ready: this.isReady }, 'warn')
      throw new Error('Engine not initialized. Call initialize() first.')
    }

    this.videoElement = videoElement
    this.canvasElement = canvasElement ?? null

    this.resetDetectionState()

    try {
      this.emitDebug('video-setup', 'Requesting camera access...')

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: this.config.camera_max_size },
            height: { ideal: this.config.camera_max_size },
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

      // Get actual video stream resolution
      const videoTrack = this.stream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings?.()
        if (settings) {
          this.actualVideoWidth = settings.width || this.config.camera_max_size || 640
          this.actualVideoHeight = settings.height || this.config.camera_max_size || 640
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
      this.isDetecting = false
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.emitDebug('video-setup', 'Failed to start detection', {
        error: errorMsg,
        stack: error instanceof Error ? error.stack : 'N/A'
      }, 'error')
      this.emit('detector-error' as any, {
        code: ErrorCode.STREAM_ACQUISITION_FAILED,
        message: errorMsg
      })
      throw error
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
  private scheduleNextDetection(delayMs: number = 100): void {
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
        this.scheduleNextDetection(200) // ERROR_RETRY_DELAY
        return
      }

      // Check detection timeout
      const elapsedTime = performance.now() - this.detectionStartTime
      if (elapsedTime > 60000) { // DETECTION_TIMEOUT
        this.emitDebug('detection', 'Detection timeout', {
          elapsedSeconds: Math.round(elapsedTime / 1000)
        }, 'error')
        this.emit('detector-error' as any, {
          code: ErrorCode.DETECTION_ERROR,
          message: `Detection timeout: Unable to detect qualified face in ${Math.round(elapsedTime / 1000)} seconds`
        })
        this.stopDetection()
        return
      }

      // Perform face detection
      const result = await this.human.detect(this.videoElement)

      if (!result) {
        this.scheduleNextDetection(100) // DETECTION_FRAME_DELAY
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
      this.scheduleNextDetection(200) // ERROR_RETRY_DELAY
    }
  }

  /**
   * Handle single face detection
   */
  private handleSingleFace(face: FaceResult, gestures: GestureResult[]): void {
    // Check if enough images collected
    if (this.detectionState.collectedImages.size() < 3) { // COLLECTION_COUNT
      this.scheduleNextDetection()
      return
    }

    // Check if action liveness needed
    const actionCount = Math.min(
      this.config.liveness_action_count ?? 0,
      (this.config.liveness_action_list ?? []).length
    )

    if (actionCount === 0) {
      this.completeLiveness()
      return
    }

    // Check if all actions completed
    if (this.detectionState.completedActions.size >= actionCount) {
      this.completeLiveness()
      return
    }

    // Get or select next action
    if (!this.detectionState.currentAction) {
      this.selectNextAction()
      this.scheduleNextDetection()
      return
    }

    // Check if action detected
    const detected = this.detectAction(this.detectionState.currentAction, gestures)

    if (detected) {
      this.detectionState.completedActions.add(this.detectionState.currentAction)
      this.detectionState.currentAction = null

      if (this.actionTimeoutId) {
        clearTimeout(this.actionTimeoutId)
        this.actionTimeoutId = null
      }

      if (this.detectionState.completedActions.size >= actionCount) {
        this.completeLiveness()
        return
      }

      this.selectNextAction()
    }

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
    const bestImage = this.detectionState.collectedImages.getBestItem()
    const bestScore = this.detectionState.collectedImages.getBestScore()

    if (!bestImage) {
      this.emit('detector-error' as any, {
        code: ErrorCode.DETECTION_ERROR,
        message: 'No images collected, unable to select best image'
      })
      this.stopDetection()
      return
    }

    this.emit('liveness-completed' as any, {
      qualityScore: bestScore,
      imageData: bestImage,
      liveness: 1
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

    // Random selection
    const randomIndex = Math.floor(Math.random() * availableActions.length)
    this.detectionState.currentAction = availableActions[randomIndex]

    const promptData: ActionPromptData = {
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
    const promptData: StatusPromptData = {
      code,
      message: this.config.prompt_code_desc?.[code] || PROMPT_CODE_DESCRIPTIONS[code] || '',
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
    const debugData: DebugData = {
      level,
      stage,
      message,
      details,
      timestamp: Date.now()
    }
    this.emit('detector-debug' as any, debugData)
  }
}

// Export types
export type {
  FaceDetectionEngineConfig,
  FaceFrontalFeatures,
  ImageQualityFeatures,
  StatusPromptData,
  ActionPromptData,
  LivenessDetectedData,
  LivenessCompletedData,
  ErrorData,
  DebugData,
  EventListener,
  EventMap,
  ScoredList
}

// Export enums
export { DetectionMode, LivenessAction, LivenessActionStatus, PromptCode, ErrorCode }

// Export config and utilities
export { DEFAULT_CONFIG, mergeConfig, PROMPT_CODE_DESCRIPTIONS, ACTION_DESCRIPTIONS, BORDER_COLOR_STATES }

// Export event emitter
export { SimpleEventEmitter }

// Export helpers
export { checkFaceFrontal, checkImageQuality, loadOpenCV, loadHuman, getCvSync }

export default FaceDetectionEngine
