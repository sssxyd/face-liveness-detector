/**
 * 人脸检测引擎 - 类型定义
 * 用于人脸活体检测的框架无关类型定义
 */

import type { LivenessAction, LivenessActionStatus, DetectionCode, ErrorCode } from './enums'

// ==================== 配置接口 ====================

export interface FaceFrontalFeatures {
  // 偏航角阈值（度）- 水平摇晃限制
  yaw_threshold: number
  // 俯仰角阈值（度）- 垂直倾斜限制
  pitch_threshold: number
  // 滚转角阈值（度）- 旋转限制
  roll_threshold: number
}

export interface ImageQualityFeatures {
  // 要求人脸完全在边界内（默认 true）
  require_full_face_in_bounds: boolean
  // 用于模糊检测的最小拉普拉斯方差（默认 100）
  min_laplacian_variance: number
  // 用于模糊检测的最小梯度锐度（默认 0.3）
  min_gradient_sharpness: number
  // 用于模糊检测的最小模糊分数（默认 0.6）
  min_blur_score: number
}

/**
 * 人脸检测引擎的主配置接口
 * 所有设置都作为单个属性展平
 */
export interface FaceDetectionEngineOptions {
  // 资源路径
  human_model_path?: string
  tensorflow_wasm_path?: string
  tensorflow_backend?: 'auto' | 'webgl' | 'wasm'  // TensorFlow 后端选择

  // ========== 检测设置 ==========
  detect_video_width?: number  // 视频流宽度
  detect_video_height?: number // 视频流高度
  detect_video_mirror?: boolean // 水平镜像视频
  detect_video_load_timeout?: number // 加载视频流的超时时间（毫秒）
  detect_frame_delay?: number // 检测帧之间的延迟（毫秒）
  detect_error_retry_delay?: number // 错误后重试前的延迟（毫秒）

  // ========== 采集设置 ==========
  collect_min_collect_count?: number // 要采集的静默检测次数
  collect_min_face_ratio?: number // 最小人脸尺寸比例
  collect_max_face_ratio?: number // 最大人脸尺寸比例
  collect_min_face_frontal?: number // 最小人脸正面度
  collect_min_image_quality?: number // 最小图像质量
  collect_face_frontal_features?: FaceFrontalFeatures // 人脸正面度特征
  collect_image_quality_features?: ImageQualityFeatures // 图像质量特征

  // ========== 活体检测设置 ==========
  action_liveness_action_list?: LivenessAction[] // 活体检测动作列表
  action_liveness_action_count?: number // 要执行的活体检测动作数量
  action_liveness_action_randomize?: boolean // 是否随机化活体检测动作
  action_liveness_verify_timeout?: number // 活体验证超时时间（毫秒）
  action_liveness_min_mouth_open_percent?: number // 最小嘴部张开百分比

  // ========== 动作活体检测设置（防止照片攻击）==========
  motion_liveness_min_motion_score?: number // 通过活体检查的最小运动分数（0-1）
  motion_liveness_min_keypoint_variance?: number // 自然运动的最小关键点方差（0-1）
  motion_liveness_frame_buffer_size?: number // 用于运动分析的帧缓冲区数量
  motion_liveness_eye_aspect_ratio_threshold?: number // 眨眼检测的眼睛长宽比阈值

  // ========== 屏幕采集检测设置 ==========
  screen_capture_confidence_threshold?: number // 屏幕采集的置信度阈值（0-1，默认 0.6）
  screen_capture_min_frames_required?: number // 检测器准备就绪所需的最小帧数（默认 5）

  // 莫尔纹检测参数
  screen_capture_moire_threshold?: number // 莫尔纹强度阈值（0-1，默认 0.65）
  screen_capture_fft_size?: number // 频率域分析的 FFT 大小（默认 256）
  
  // 频闪检测参数
  screen_capture_flicker_max_history?: number // 最大亮度历史样本数（约 10 秒 @ 30fps，默认 300）
  screen_capture_flicker_min_samples?: number // 频闪分析所需的最小样本数（默认 60）
  screen_capture_flicker_min_period?: number // 最小频率周期（帧数，默认 5）
  screen_capture_flicker_max_period?: number // 最大频率周期（帧数，默认 50）
  screen_capture_flicker_strength_threshold?: number // 频闪强度阈值（0-1，默认 0.3）
  
  // 像素网格检测参数
  screen_capture_grid_high_freq_threshold?: number // 高频能量阈值（0-1，默认 0.15）
  screen_capture_grid_strength_threshold?: number // 网格强度阈值（0-1，默认 0.6）
  
  // 色彩异常检测参数
  screen_capture_chromatic_shift_threshold?: number // 色彩通道偏移阈值（像素数，默认 0.5）
  
  // 帧重复检测参数
  screen_capture_duplication_max_history?: number // 最大帧历史（默认 30）
  screen_capture_duplication_similarity_threshold?: number // 帧相似度阈值（0-1，默认 0.98）
}

/**
 * 与默认值合并后的已解析配置
 * 所有属性都保证为非 undefined
 * 在内部用作 mergeOptions() 的返回类型
 */
export type ResolvedEngineOptions = Required<FaceDetectionEngineOptions>

// ==================== 事件数据接口 ====================

export interface DetectorLoadedEventData {
  success: boolean  // 检测器是否成功加载
  error?: string    // 错误消息（如果有）
  opencv_version?: string  // OpenCV.js 版本
  human_version?: string  // Human.js 版本
}

export interface DetectorActionEventData {
  action: LivenessAction
  status: LivenessActionStatus
}

/**
 * 人脸检测信息事件数据
 */
export interface DetectorInfoEventData {
  passed: boolean  // 静默活体检测是否通过
  code: DetectionCode // 提示代码
  message: string  // 主要消息
  faceCount: number   // 检测到的人脸数量
  faceRatio: number     // 人脸尺寸百分比（0-1）
  faceFrontal: number  // 人脸正面度百分比（0-1）
  imageQuality: number  // 图像质量分数（0-1）
  motionScore: number // 运动分数（0-1）
  keypointVariance: number  // 关键点方差分数（0-1）
  motionType: string  // 检测到的运动类型
  screenConfidence: number // 屏幕采集置信度（0-1）
}

/**
 * 动作/静默活体检测完成数据
 */
export interface DetectorFinishEventData {
  success: boolean        // 活体检测是否成功
  silentPassedCount: number   // 静默活体检测通过次数
  actionPassedCount: number  // 完成的动作次数
  totalTime: number       // 总耗时（毫秒）
  bestQualityScore: number  // 图像质量分数（0-1）
  bestFrameImage: string | null  // Base64 编码的帧图像
  bestFaceImage: string | null   // Base64 编码的人脸图像
}

/**
 * 错误数据
 */
export interface DetectorErrorEventData {
  code: ErrorCode
  message: string
}

/**
 * 调试信息数据
 */
export interface DetectorDebugEventData {
  level: 'info' | 'warn' | 'error'  // 调试级别
  stage: string                      // 当前阶段
  message: string                    // 主要消息
  details?: Record<string, any>      // 附加详情
  timestamp: number                  // 时间戳
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

