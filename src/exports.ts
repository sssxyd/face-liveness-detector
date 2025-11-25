/**
 * Face Detection Engine
 * Framework-agnostic face liveness detection engine
 * 
 * @module @face-liveness/detection-engine
 */

// Export main class
export { FaceDetectionEngine, FaceDetectionEngine as default } from './index'

// Export configuration type
export type { FaceDetectionEngineConfig } from './types'

// Export event-related types for listening
export type {
  StatusPromptEventData as StatusPromptData,
  ActionPromptEventData as ActionPromptData,
  LivenessDetectedEventData as LivenessDetectedData,
  LivenessCompletedEventData as LivenessCompletedData,
  DetectorErrorEventData as ErrorData,
  DetectorDebugEventData as DebugData,
  EventMap
} from './types'

// Export enums for event data
export {
  LivenessAction,
  LivenessActionStatus,
  PromptCode,
  ErrorCode
} from './enums'
