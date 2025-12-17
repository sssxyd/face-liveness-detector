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

export enum DetectionPeriod {
  DETECT = 'detect',
  COLLECT = 'collect',
  VERIFY = 'verify'
}

/**
 * Detect code enumeration - for detector info events
 */
export enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',
  MULTIPLE_FACE = 'MULTIPLE_FACE',
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',
  FACE_NOT_REAL = 'FACE_NOT_REAL',
  FACE_NOT_LIVE = 'FACE_NOT_LIVE',
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',
  FACE_CHECK_PASS = 'FACE_CHECK_PASS'
}

/**
 * Error code enumeration
 */
export enum ErrorCode {
  // 检测器初始化失败
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',
  // 摄像头访问被拒绝
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',
  // 视频流获取失败
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED',
  // 内部错误
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export enum EngineState {
  IDLE = 'idle',                    // 初始状态
  INITIALIZING = 'initializing',    // 正在初始化
  READY = 'ready',                  // 初始化完成，就绪
  DETECTING = 'detecting'           // 检测中
}
