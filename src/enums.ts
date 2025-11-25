/**
 * Liveness action enumeration
 */
export enum LivenessAction {
  // Blink
  BLINK = 'blink',
  // Mouth open
  MOUTH_OPEN = 'mouth_open',
  // Nod
  NOD = 'nod'
}

/**
 * Liveness action status enumeration
 */
export enum LivenessActionStatus {
  STARTED = 'started',
  COMPLETED = 'completed',
  TIMEOUT = 'timeout'
}

/**
 * Prompt code enumeration - for status prompt events
 */
export enum PromptCode {
  NO_FACE = 'NO_FACE',
  MULTIPLE_FACE = 'MULTIPLE_FACE',
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',
  BLURRY_IMAGE = 'BLURRY_IMAGE',
  LOW_QUALITY = 'LOW_QUALITY',
  FRAME_DETECTED = 'FRAME_DETECTED'
}

/**
 * Error code enumeration
 */
export enum ErrorCode {
  // Detector initialization failed
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',
  // Camera access denied
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',
  // Video stream acquisition failed
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED',
  // Face count changed
  FACE_COUNT_CHANGED = 'FACE_COUNT_CHANGED',
  // Image capture failed
  CAPTURE_FAILED = 'CAPTURE_FAILED',
  // AI engine not initialized
  ENGINE_NOT_INITIALIZED = 'ENGINE_NOT_INITIALIZED',
  // Liveness analysis failed
  LIVENESS_ANALYSIS_FAILED = 'LIVENESS_ANALYSIS_FAILED',
  // No face detected in image
  NO_FACE_IN_IMAGE = 'NO_FACE_IN_IMAGE',
  // Cannot get liveness result
  NO_LIVENESS_RESULT = 'NO_LIVENESS_RESULT',
  // Liveness detection failed
  LIVENESS_DETECTION_FAILED = 'LIVENESS_DETECTION_FAILED',
  // Fraud detected: non-real face
  FRAUD_DETECTED = 'FRAUD_DETECTED',
  // Image load failed
  IMAGE_LOAD_FAILED = 'IMAGE_LOAD_FAILED',
  // Detection error
  DETECTION_ERROR = 'DETECTION_ERROR'
}
