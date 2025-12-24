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

  /** 视频流建议分辨率宽度（默认 1920） */
  detect_video_ideal_width?: number
  /** 视频流建议分辨率高度（默认 1080） */
  detect_video_ideal_height?: number
  /** 水平镜像视频（默认 true） */
  detect_video_mirror?: boolean
  /** 加载视频流的超时时间（毫秒，默认 5000） */
  detect_video_load_timeout?: number
  /** 检测帧之间的延迟（毫秒，默认 100） */
  detect_frame_delay?: number
  /** 错误后重试前的延迟（毫秒，默认 200） */
  detect_error_retry_delay?: number

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

  /** 活体检测动作列表（默认 [BLINK, MOUTH_OPEN, NOD]） */
  action_liveness_action_list?: LivenessAction[]
  /** 要执行的活体检测动作数量（默认 1） */
  action_liveness_action_count?: number
  /** 是否随机化活体检测动作（默认 true） */
  action_liveness_action_randomize?: boolean
  /** 活体验证超时时间（毫秒，默认 60000） */
  action_liveness_verify_timeout?: number
  /** 最小嘴部张开百分比（默认 0.2） */
  action_liveness_min_mouth_open_percent?: number

  /** 通过活体检查的最小运动分数（0-1，默认 0.15） */
  motion_liveness_min_motion_score?: number
  /** 自然运动的最小关键点方差（0-1，默认 0.02） */
  motion_liveness_min_keypoint_variance?: number
  /** 用于运动分析的帧缓冲区数量（默认 5） */
  motion_liveness_frame_buffer_size?: number
  /** 眨眼检测的眼睛长宽比阈值（默认 0.15） */
  motion_liveness_eye_aspect_ratio_threshold?: number
  /** 光流和关键点方差一致性阈值 (0-1，默认 0.3) - 防止照片微动 */
  motion_liveness_motion_consistency_threshold?: number
  /** 最小光流幅度阈值 - 照片几乎无光流 (0-1，默认 0.02) */
  motion_liveness_min_optical_flow_threshold?: number
  /** 是否启用严格照片检测模式（默认 false） */
  motion_liveness_strict_photo_detection?: boolean

  /** 屏幕采集的置信度阈值（0-1，默认 0.7） */
  screen_capture_confidence_threshold?: number

  /** 综合莫尔纹置信度阈值（0-1，默认 0.65） */
  screen_moire_pattern_threshold?: number
  /** 是否启用 DCT 分析（默认 true） */
  screen_moire_pattern_enable_dct?: boolean
  /** 是否启用边缘检测（默认 true） */
  screen_moire_pattern_enable_edge_detection?: boolean
  
  /** 色彩饱和度阈值（0-100%，屏幕图像通常 < 40%，默认 40） */
  screen_color_saturation_threshold?: number
  /** RGB通道相关性阈值（0-1，屏幕通常 > 0.85，默认 0.75） */
  screen_color_rgb_correlation_threshold?: number
  /** 像素值熵阈值（0-8，屏幕通常 < 6.5，默认 6.5） */
  screen_color_pixel_entropy_threshold?: number
  /** 梯度平滑性阈值（0-1，屏幕通常 > 0.7，默认 0.7） */
  screen_color_gradient_smoothness_threshold?: number
  /** 综合置信度阈值（0-1，用于判定是否为屏幕拍摄，默认 0.65） */
  screen_color_confidence_threshold?: number

  /** 低频段开始位置（相对于频谱长度的百分比，默认 0.15） */
  screen_rgb_low_freq_start_percent?: number
  /** 低频段结束位置（相对于频谱长度的百分比，默认 0.35） */
  screen_rgb_low_freq_end_percent?: number
  /** 能量比归一化因子（默认 10） */
  screen_rgb_energy_ratio_normalization_factor?: number
  /** 通道均值差异的归一化因子（默认 50） */
  screen_rgb_channel_difference_normalization_factor?: number
  /** RGB 周期性能量权重（默认 0.40） */
  screen_rgb_energy_score_weight?: number
  /** RGB 通道不同步程度权重（默认 0.40） */
  screen_rgb_asymmetry_score_weight?: number
  /** 通道均值差异权重（默认 0.20） */
  screen_rgb_difference_factor_weight?: number
  /** RGB 屏幕拍摄的置信度阈值（默认 0.65） */
  screen_rgb_confidence_threshold?: number
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

