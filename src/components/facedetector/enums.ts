/**
 * 人脸检测 - 枚举定义
 * 包含所有业务相关的枚举类型
 */

/**
 * 工作模式枚举
 */
export enum DetectionMode {
  // 采集模式：检测到合格人脸后自动停止并返回图片
  COLLECTION = 'collection',
  // 活体检测模式：需要用户执行指定的活体动作
  LIVENESS = 'liveness',
  // 静默活体检测模式：采集后自动进行活体检测，无需用户执行动作
  SILENT_LIVENESS = 'silent_liveness'
}

/**
 * 活体检测动作枚举
 */
export enum LivenessAction {
  // 眨眼
  BLINK = 'blink',
  // 张嘴
  MOUTH_OPEN = 'mouth_open',
  // 点头
  NOD = 'nod'
}

/**
 * 活体动作状态枚举
 */
export enum LivenessActionStatus {
  STARTED = 'started',
  COMPLETED = 'completed',
  TIMEOUT = 'timeout'
}

/**
 * 提示码枚举 - 用于状态提示事件
 */
export enum PromptCode {
  NORMAL_STATE = 'NORMAL_STATE',
  NO_FACE_DETECTED = 'NO_FACE_DETECTED',
  MULTIPLE_FACES_DETECTED = 'MULTIPLE_FACES_DETECTED',
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',
  POOR_IMAGE_QUALITY = 'POOR_IMAGE_QUALITY',
  GOOD_IMAGE_QUALITY = 'GOOD_IMAGE_QUALITY',
  PLEASE_PERFORM_ACTION = 'PLEASE_PERFORM_ACTION',
}

/**
 * 错误码枚举
 */
export enum ErrorCode {
  // 库初始化失败
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',
  // 获取摄像头权限失败
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',
  // 视频流获取失败
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED',
  // 人脸数量变化
  FACE_COUNT_CHANGED = 'FACE_COUNT_CHANGED',
  // 活体动作检测超时
  ACTION_TIMEOUT = 'ACTION_TIMEOUT',
  // 图片捕获失败
  CAPTURE_FAILED = 'CAPTURE_FAILED',
  // AI 引擎未初始化
  ENGINE_NOT_INITIALIZED = 'ENGINE_NOT_INITIALIZED',
  // 活体检测分析失败
  LIVENESS_ANALYSIS_FAILED = 'LIVENESS_ANALYSIS_FAILED',
  // 采集图片中未检测到人脸
  NO_FACE_IN_IMAGE = 'NO_FACE_IN_IMAGE',
  // 无法获取活体检测结果
  NO_LIVENESS_RESULT = 'NO_LIVENESS_RESULT',
  // 活体检测失败
  LIVENESS_DETECTION_FAILED = 'LIVENESS_DETECTION_FAILED',
  // 欺诈检测：检测到非真实人脸
  FRAUD_DETECTED = 'FRAUD_DETECTED',
  // 图片加载失败
  IMAGE_LOAD_FAILED = 'IMAGE_LOAD_FAILED',
  // 检测异常
  DETECTION_ERROR = 'DETECTION_ERROR'
}
