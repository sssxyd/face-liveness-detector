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

// Export screen capture detection modules
export { ScreenCaptureDetector, ScreenCaptureDetectionResult } from './screen-capture-detector'
export type { ScreenCaptureDetectorOptions, CascadeDetectionDebugInfo } from './screen-capture-detector'

export { ScreenFlickerDetector } from './screen-flicker-detector'
export type { ScreenFlickerDetectorConfig, ScreenFlickerDetectionResult } from './screen-flicker-detector'

export { ScreenResponseTimeDetector } from './screen-response-time-detector'
export type { ScreenResponseTimeDetectorConfig, ScreenResponseTimeDetectionResult } from './screen-response-time-detector'

export { DLPColorWheelDetector } from './dlp-color-wheel-detector'
export type { DLPColorWheelDetectorConfig, DLPColorWheelDetectionResult } from './dlp-color-wheel-detector'

export { OpticalDistortionDetector } from './optical-distortion-detector'
export type { OpticalDistortionDetectorConfig, OpticalDistortionDetectionResult } from './optical-distortion-detector'

export { FaceDetectionEngine }

export default FaceDetectionEngine
