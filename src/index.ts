/**
 * Face Detection Engine - Core Detection Engine
 * Framework-agnostic face liveness detection engine
 */

import { FaceDetectionEngine } from './face-detection-engine'

// Export public API
export type {
  FaceDetectionEngineOptions,
  FaceFrontalFeatures,
  ImageQualityFeatures,
  DetectorInfoEventData,
  DetectorFinishEventData,
  DetectorErrorEventData,
  DetectorDebugEventData,
  DetectorActionEventData,
  DetectorLoadedEventData,  
  EventMap,
  EventEmitter,
  EventListener,
} from './types'

export { LivenessAction, ErrorCode, DetectionCode, LivenessActionStatus, DetectionPeriod, EngineState } from './enums'

export { preloadOpenCV, getCvSync, getOpenCVVersion, detectBrowserEngine } from './library-loader'

export { SimpleEventEmitter } from './event-emitter'

export { UniAppFaceDetectionEngine, createSDK, checkEnvironmentSupport } from './uniapp-sdk'

export { FaceDetectionEngine }

export default FaceDetectionEngine
