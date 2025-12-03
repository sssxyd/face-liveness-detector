/**
 * Face Liveness Detection SDK for UniApp
 * Complete SDK wrapper for UniApp integration
 * 
 * @example
 * ```javascript
 * import FaceLivenessDetector from '@sssxyd/face-liveness-detector/uniapp'
 * 
 * const detector = new FaceLivenessDetector({
 *   min_face_ratio: 0.5,
 *   max_face_ratio: 0.9,
 *   liveness_action_count: 1
 * })
 * 
 * detector.on('detector-loaded', () => {
 *   console.log('Detector ready')
 * })
 * 
 * await detector.initialize()
 * await detector.startDetection(videoElement)
 * ```
 */

import FaceDetectionEngine from './index'
import type { 
  FaceDetectionEngineConfig, 
  EventEmitter,
  DetectorFinishEventData,
  DetectorErrorEventData,
  DetectorLoadedEventData
} from './types'
import { 
  getModelBasePath, 
  getWasmPath, 
  detectUniAppEnvironment,
  initializeUniAppResources,
  preloadResources 
} from './uniapp-resource-manager'

/**
 * UniApp Face Liveness Detection SDK
 * Wrapper around FaceDetectionEngine optimized for UniApp
 */
export class FaceLivenessDetectorSDK extends FaceDetectionEngine {
  private resourcesInitialized: boolean = false
  private resourcesPreloaded: boolean = false

  /**
   * Constructor
   * @param config - Configuration object
   */
  constructor(config?: Partial<FaceDetectionEngineConfig>) {
    // Auto-configure paths for UniApp environment
    const uniAppConfig = detectUniAppEnvironment()
    
    const finalConfig: Partial<FaceDetectionEngineConfig> = {
      ...config,
      human_model_path: config?.human_model_path || getModelBasePath(),
      tensorflow_wasm_path: config?.tensorflow_wasm_path || getWasmPath()
    }
    
    super(finalConfig)
    
    // Initialize UniApp resources
    if (uniAppConfig.isUniApp) {
      initializeUniAppResources()
      this.resourcesInitialized = true
    } else {
      console.warn('[FaceLivenessDetectorSDK] Not running in UniApp environment')
    }
  }

  /**
   * Initialize the detection engine with UniApp optimizations
   * Includes automatic resource preloading for better UX
   */
  async initialize(): Promise<void> {
    // Optionally preload resources for better UX
    if (!this.resourcesPreloaded) {
      try {
        await preloadResources()
        this.resourcesPreloaded = true
      } catch (error) {
        console.warn('[FaceLivenessDetectorSDK] Resource preloading failed, continuing anyway:', error)
      }
    }

    // Call parent initialize
    return super.initialize()
  }

  /**
   * Start detection in UniApp
   * Automatically handles platform-specific requirements
   */
  async startDetection(videoElement: HTMLVideoElement): Promise<void> {
    const uniAppEnv = detectUniAppEnvironment()
    
    // Check if current platform supports face detection
    if (!uniAppEnv.isUniApp) {
      console.error('[FaceLivenessDetectorSDK] Not in UniApp environment')
      throw new Error('FaceLivenessDetectorSDK requires UniApp environment')
    }

    // Mini-program platforms are not supported
    if (uniAppEnv.platform.includes('mp-')) {
      const errorMsg = `Face detection is not supported in ${uniAppEnv.platform}. Supported platforms: App, H5, Web`
      console.error('[FaceLivenessDetectorSDK]', errorMsg)
      this.emit('detector-error' as any, {
        code: 'PLATFORM_NOT_SUPPORTED',
        message: errorMsg
      })
      throw new Error(errorMsg)
    }

    // Call parent startDetection
    return super.startDetection(videoElement)
  }

  /**
   * Get current resource status
   */
  getResourceStatus(): {
    initialized: boolean
    preloaded: boolean
    modelPath: string
    wasmPath: string
    environment: ReturnType<typeof detectUniAppEnvironment>
  } {
    const env = detectUniAppEnvironment()
    return {
      initialized: this.resourcesInitialized,
      preloaded: this.resourcesPreloaded,
      modelPath: getModelBasePath(),
      wasmPath: getWasmPath(),
      environment: env
    }
  }
}

/**
 * Create and return a new SDK instance
 * 
 * @param config - Configuration object
 * @returns SDK instance ready to use
 * 
 * @example
 * ```javascript
 * import { createSDK } from '@sssxyd/face-liveness-detector/uniapp'
 * 
 * const detector = createSDK({
 *   liveness_action_count: 2
 * })
 * ```
 */
export function createSDK(config?: Partial<FaceDetectionEngineConfig>): FaceLivenessDetectorSDK {
  return new FaceLivenessDetectorSDK(config)
}

/**
 * Check if environment supports the SDK
 * 
 * @returns Object with support information
 */
export function checkEnvironmentSupport(): {
  isSupported: boolean
  platform: string
  reason?: string
} {
  const env = detectUniAppEnvironment()
  
  if (!env.isUniApp) {
    return {
      isSupported: false,
      platform: 'unknown',
      reason: 'Not running in UniApp environment'
    }
  }

  if (env.platform.includes('mp-')) {
    return {
      isSupported: false,
      platform: env.platform,
      reason: `Mini-program platforms are not supported. Supported: App, H5, Web`
    }
  }

  return {
    isSupported: true,
    platform: env.platform
  }
}

// Export all types and enums from parent
export type {
  FaceDetectionEngineConfig,
  EventEmitter,
  DetectorFinishEventData,
  DetectorErrorEventData,
  DetectorLoadedEventData
} from './types'

export { 
  LivenessAction, 
  ErrorCode, 
  DetectionCode, 
  LivenessActionStatus, 
  DetectionPeriod 
} from './enums'

export {
  getModelBasePath,
  getWasmPath,
  detectUniAppEnvironment,
  initializeUniAppResources,
  preloadResources
} from './uniapp-resource-manager'

export default FaceLivenessDetectorSDK
