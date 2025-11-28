/**
 * Face Detection Engine
 * Framework-agnostic face liveness detection engine
 * 
 * @module @sssxyd/face-liveness-detector
 */

// Export main class
export { FaceDetectionEngine, FaceDetectionEngine as default } from './index'

// Export library loader functions
export { preloadOpenCV, getOpenCVVersion, getCvSync } from './library-loader'

// Export event-related types for listening
export type {
  FaceDetectionEngineConfig,
  FaceFrontalFeatures,
  ImageQualityFeatures,  
  StatusPromptEventData,
  ActionPromptEventData,
  FaceDetectedEventData,
  DetectorFinishEventData,
  DetectorErrorEventData,
  DetectorDebugEventData,
  DetectorLoadedEventData,
  EventMap,
  EventListener,
  EventEmitter,
  ResolvedEngineConfig
} from './types'

// Export enums for event data
export {
  LivenessAction,
  LivenessActionStatus,
  PromptCode,
  ErrorCode,
  DetectionPeriod
} from './enums'
