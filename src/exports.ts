/**
 * Face Detection Engine
 * Framework-agnostic face liveness detection engine
 * 
 * @module @sssxyd/face-liveness-detector
 */

// Export main class
export { FaceDetectionEngine, FaceDetectionEngine as default } from './index'

// Export configuration type
export type { FaceDetectionEngineConfig } from './types'

// Export event-related types for listening
export type {
  StatusPromptEventData,
  ActionPromptEventData,
  FaceDetectedEventData,
  DetectorFinishEventData,
  DetectorErrorEventData,
  DetectorDebugEventData,
  EventMap
} from './types'

// Export enums for event data
export {
  LivenessAction,
  LivenessActionStatus,
  PromptCode,
  ErrorCode
} from './enums'
