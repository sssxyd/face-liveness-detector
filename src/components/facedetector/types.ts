/**
 * 人脸检测 - 类型定义
 * 包含所有接口和类型定义
 */

import type { LivenessAction, LivenessActionStatus, PromptCode, ErrorCode } from './enums'

export interface FaceFrontalFeatures {
    // Yaw 角度阈值（度）- 左右摇晃不能超过此角度，超出则扣分
    yaw_threshold?: number,
    // Pitch 角度阈值（度）- 上下俯仰不能超过此角度，超出则扣分
    pitch_threshold?: number,
    // Roll 角度阈值（度）- 旋转不能超过此角度，超出则扣分
    roll_threshold?: number
}

export interface ImageQualityFeatures {
    // 是否要求人脸完全在图片内（不超出边界, 默认 true）
    require_full_face_in_bounds?: boolean,
    // 最小人脸检测框分数（0-1, 默认 0.8）- 检测框置信度低于此值表示检测不清晰
    min_box_score?: number,
    // 最小人脸网格分数（0-1, 默认 0.8）- 网格置信度低于此值表示图像模糊或质量差
    min_face_score?: number,
}

/**
 * FaceDetector 组件 Props 接口 - 所有配置都展开为扁平属性
 */
export interface FaceDetectorProps { 
  
  // ========== DetectionSettings ==========
  camera_max_size?: number
  video_load_timeout?: number
  detection_frame_delay?: number
  detection_idle_timeout?: number
  
  // ========== CollectionSettings ==========
  silent_detect_count?: number
  min_face_ratio?: number
  max_face_ratio?: number
  min_face_frontal?: number
  min_image_quality?: number
  min_live_score?: number
  min_real_score?: number
  face_frontal_features?: FaceFrontalFeatures
  image_quality_features?: ImageQualityFeatures
  
  // ========== LivenessSettings ==========
  show_action_prompt?: boolean
  liveness_action_timeout?: number
  liveness_action_list?: LivenessAction[]
  liveness_action_desc?: Record<LivenessAction, string>
  liveness_action_count?: number
  liveness_action_random?: boolean
  min_mouth_open_percent?: number
  
  // ========== StatusSettings ==========
  show_status_prompt?: boolean
  status_prompt_duration?: number
  prompt_code_desc?: Record<PromptCode, string>
  
  // ========== BorderColorsSettings ==========
  show_border_color?: boolean
  border_color_idle?: string
  border_color_warning?: string
  border_color_ready?: string
  border_color_success?: string
  border_color_error?: string
}

/**
 * 状态提示数据
 */
export interface StatusPromptData {
  code: PromptCode    // 提示码
  message: string     // 提示信息
  count?: number      // 人脸数量
  size?: number       // 人脸大小百分比
  frontal?: number    // 人脸正脸度百分比
  real?: number       // 反欺骗得分
  live?: number       // 活体检测得分
  quality?: number    // 图像质量得分
}

export interface ActionPromptData {
  action: LivenessAction
  status: LivenessActionStatus
}

/**
 * 静默活体检测数据
 */
export interface LivenessDetectedData {
  passed: boolean  // 是否通过静默活体检测
  size: number  // 人脸大小百分比 (0-1)
  frontal: number  // 人脸正脸度百分比 (0-1)
  quality: number  // 图像质量得分 (0-1)
  real: number  // 反欺骗（anti-spoofing）得分 (0-1)
  live: number  // 活体检测得分 (0-1)
}

/**
 * 动作/静默活体检测完成数据
 */
export interface LivenessCompletedData {
  qualityScore: number  // 图像质量评分 (0-1)
  imageData: string | null
  liveness: number  // 活体检测得分 (0-1)
}

/**
 * 错误数据
 */
export interface ErrorData {
  code: ErrorCode
  message: string
}

/**
 * 调试信息数据
 */
export interface DebugData {
  level: 'info' | 'warn' | 'error'  // 调试级别
  stage: string                      // 当前阶段 (initialization, video-setup, human-loading, detection 等)
  message: string                    // 主要信息
  details?: Record<string, any>      // 详细信息
  timestamp: number                  // 时间戳
}

export class ScoredList<T> {
  private maxSize: number
  private items: Array<{ item: T; score: number }>
  private totalCount: number = 0

  constructor(maxSize = 5) {
    this.maxSize = maxSize
    this.items = []
  }

  add(item: T, score: number): void {
    this.totalCount++
    this.items.push({ item, score })
    // 按 score 降序排序
    this.items.sort((a, b) => b.score - a.score)
    // 超出容量时删除最低分的
    if (this.items.length > this.maxSize) {
      this.items.pop()
    }
  }

  getBestItem(): T | null {
    return this.items[0]?.item ?? null
  }

  getBestScore(): number{
    return this.items[0]?.score ?? 0
  }

  getAll(): T[] {
    return this.items.map(x => x.item)
  }

  getAllWithScores(): Array<{ item: T; score: number }> {
    return [...this.items]
  }

  clear(): void {
    this.items = []
    this.totalCount = 0
  }

  size(): number {
    return this.items.length
  }

  total(): number {
    return this.totalCount
  }
}