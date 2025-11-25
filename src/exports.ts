/**
 * Face Detection Engine
 * Framework-agnostic face liveness detection engine
 * 
 * @module @face-liveness/detection-engine
 */

// Export main class
export { FaceDetectionEngine, FaceDetectionEngine as default } from './index'

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
  EventEmitter,
  EventMap,
  ScoredList
} from './types'

// Export enums
export {
  DetectionMode,
  LivenessAction,
  LivenessActionStatus,
  PromptCode,
  ErrorCode
} from './enums'

// Export config and utilities
export {
  DEFAULT_CONFIG,
  mergeConfig,
  PROMPT_CODE_DESCRIPTIONS,
  ACTION_DESCRIPTIONS,
  BORDER_COLOR_STATES
} from './config'

// Export event emitter
export { SimpleEventEmitter } from './event-emitter'

// Export detection utilities
export { checkFaceFrontal } from './face-frontal-checker'
export { checkImageQuality, type ImageQualityResult } from './image-quality-checker'
export { loadOpenCV, loadHuman, getCvSync } from './library-loader'
