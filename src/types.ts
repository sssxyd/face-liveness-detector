/**
 * 人脸检测引擎 - 类型定义
 * 用于人脸活体检测的框架无关类型定义
 */

import type { LivenessAction, LivenessActionStatus, DetectionCode, ErrorCode } from './enums'

// ==================== 配置接口 ====================

export interface FaceFrontalFeatures {
  /** 偏航角阈值（度）- 水平摇晃限制（默认 3） */
  yaw_threshold: number
  /** 俯仰角阈值（度）- 垂直倾斜限制（默认 4） */
  pitch_threshold: number
  /** 滚转角阈值（度）- 旋转限制（默认 2） */
  roll_threshold: number
}

export interface ImageQualityFeatures {
  /** 要求人脸完全在边界内（默认 false） */
  require_full_face_in_bounds: boolean
  /** 用于模糊检测的最小拉普拉斯方差（默认 40） */
  min_laplacian_variance: number
  /** 用于模糊检测的最小梯度锐度（默认 0.15） */
  min_gradient_sharpness: number
  /** 用于模糊检测的最小模糊分数（默认 0.6） */
  min_blur_score: number
}

/**
 * 人脸检测引擎的主配置接口
 * 所有设置都作为单个属性展平
 */
export interface FaceDetectionEngineOptions {
  /** 人脸检测模型路径 */
  human_model_path?: string
  /** TensorFlow WASM 文件路径 */
  tensorflow_wasm_path?: string
  /** TensorFlow 后端选择 */
  tensorflow_backend?: 'auto' | 'webgl' | 'wasm'
  /** 调试模式 */
  debug_mode?: boolean
  /** 调试日志最低级别（默认 'info'） */
  debug_log_level?: 'info' | 'warn' | 'error'
  /** 调试日志阶段过滤（默认全部）- 可选择特定阶段 */
  debug_log_stages?: string[]
  /** 调试日志节流间隔（毫秒，默认 0 表示不节流） */
  debug_log_throttle?: number

  /** 是否启用人脸运动检测（默认 true） */
  enable_face_moving_detection?: boolean
  /** 是否启用照片攻击检测（默认 true） */
  enable_photo_attack_detection?: boolean
  /** 是否启用屏幕攻击检测（默认 true） */
  enable_screen_attack_detection?: boolean

  /** 视频流建议分辨率宽度（默认 1280） */
  detect_video_ideal_width?: number
  /** 视频流建议分辨率高度（默认 720） */
  detect_video_ideal_height?: number
  /** 水平镜像视频（默认 true） */
  detect_video_mirror?: boolean
  /** 加载视频流的超时时间（毫秒，默认 5000） */
  detect_video_load_timeout?: number

  /** 要采集的静默检测次数（默认 3） */
  collect_min_collect_count?: number
  /** 最小人脸尺寸比例（默认 0.5） */
  collect_min_face_ratio?: number
  /** 最大人脸尺寸比例（默认 0.9） */
  collect_max_face_ratio?: number
  /** 最小人脸正面度（默认 0.9） */
  collect_min_face_frontal?: number
  /** 最小图像质量（默认 0.5） */
  collect_min_image_quality?: number
  /** 人脸正面度特征 */
  collect_face_frontal_features?: FaceFrontalFeatures
  /** 图像质量特征 */
  collect_image_quality_features?: ImageQualityFeatures

  /** 活体检测动作列表（默认 [BLINK, MOUTH_OPEN, NOD_DOWN, NOD_UP]） */
  action_liveness_action_list?: LivenessAction[]
  /** 要执行的活体检测动作数量（默认 1） */
  action_liveness_action_count?: number
  /** 是否随机化活体检测动作（默认 true） */
  action_liveness_action_randomize?: boolean
  /** 单一动作活体验证超时时间（毫秒，默认 15000） */
  action_liveness_verify_timeout?: number
  /** 最小嘴部张开百分比（默认 0.2） */
  action_liveness_min_mouth_open_percent?: number

  /** 最大允许的照片攻击检测次数（默认 5） */
  photo_attack_detected_max_count?: number

}

/**
 * 与默认值合并后的已解析配置
 * 所有属性都保证为非 undefined
 * 在内部用作 mergeOptions() 的返回类型
 */
export type ResolvedEngineOptions = Required<FaceDetectionEngineOptions>

// ==================== 事件数据接口 ====================

export interface DetectorLoadedEventData {
  /** 检测器是否成功加载 */
  success: boolean
  /** 错误消息（如果有） */
  error?: string
  /** OpenCV.js 版本 */
  opencv_version?: string
  /** Human.js 版本 */
  human_version?: string
}

export interface DetectorActionEventData {
  action: LivenessAction
  detected: LivenessAction[]
  status: LivenessActionStatus
}

/**
 * 人脸检测信息事件数据
 */
export interface DetectorInfoEventData {
  /** 静默活体检测是否通过 */
  passed: boolean
  /** 提示代码 */
  code: DetectionCode
  /** 主要消息 */
  message: string
  /** 检测到的人脸数量 */
  faceCount: number
  /** 人脸尺寸百分比（0-1） */
  faceRatio: number
  /** 人脸正面度百分比（0-1） */
  faceFrontal: number
  /** 图像质量分数（0-1） */
  imageQuality: number
  /** 运动分数（0-1） */
  motionScore: number
  /** 关键点方差分数（0-1） */
  keypointVariance: number
  /** 检测到的运动类型 */
  motionType: string
  /** 屏幕采集置信度（0-1） */
  screenConfidence: number
}

/**
 * 动作/静默活体检测完成数据
 */
export interface DetectorFinishEventData {
  /** 活体检测是否成功 */
  success: boolean
  /** 静默活体检测通过次数 */
  silentPassedCount: number
  /** 完成的动作次数 */
  actionPassedCount: number
  /** 总耗时（毫秒） */
  totalTime: number
  /** 图像质量分数（0-1） */
  bestQualityScore: number
  /** Base64 编码的帧图像 */
  bestFrameImage: string | null
  /** Base64 编码的人脸图像 */
  bestFaceImage: string | null
}

/**
 * 错误数据
 */
export interface DetectorErrorEventData {
  /** 错误代码 */
  code: ErrorCode
  /** 错误消息 */
  message: string
}

/**
 * 调试信息数据
 */
export interface DetectorDebugEventData {
  /** 调试级别 */
  level: 'info' | 'warn' | 'error'
  /** 当前阶段 */
  stage: string
  /** 主要消息 */
  message: string
  /** 附加详情 */
  details?: Record<string, any>
  /** 时间戳 */
  timestamp: number
}

// ==================== 事件监听器类型 ====================

export type EventListener<T> = (data: T) => void

export interface EventEmitter {
  on<K extends keyof EventMap>(event: K, listener: EventListener<EventMap[K]>): void
  off<K extends keyof EventMap>(event: K, listener: EventListener<EventMap[K]>): void
  once<K extends keyof EventMap>(event: K, listener: EventListener<EventMap[K]>): void
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void
}

export interface EventMap {
  'detector-loaded': DetectorLoadedEventData
  'detector-info': DetectorInfoEventData
  'detector-action': DetectorActionEventData
  'detector-finish': DetectorFinishEventData
  'detector-error': DetectorErrorEventData
  'detector-debug': DetectorDebugEventData
}

