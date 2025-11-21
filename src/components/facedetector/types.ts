/**
 * 人脸检测 - 类型定义
 * 包含所有接口和类型定义
 */

import type { DetectionMode, LivenessAction, LivenessActionStatus, PromptCode, ErrorCode } from './enums'

/**
 * FaceDetector 组件 Props 接口
 */
export interface FaceDetectorProps {
  // 工作模式：COLLECTION(采集) / LIVENESS(动作活体) / SILENT_LIVENESS(静默活体)
  mode?: DetectionMode | string
  // 活体检测项目数组：可包含 LivenessAction.BLINK(眨眼) 等（仅用于 LIVENESS 模式）
  livenessChecks?: LivenessAction[]
  // 人脸占画面比例的最小值（0-1）
  minFaceRatio?: number
  // 人脸占画面比例的最大值（0-1）
  maxFaceRatio?: number
  // 正脸置信度的最小值（0-1）
  minFrontal?: number
  // 静默活体检测的阈值（0-1，默认 0.85）：用于判定是否为真实人脸
  silentLivenessThreshold?: number
  // 活体检测动作次数（默认1，表示进行几次活体动作检测）
  livenessActionCount?: number
  // 活体检测动作时间限制（秒，默认60秒）
  livenessActionTimeout?: number
  // 是否显示活体检测动作提示文本（默认 true）
  showActionPrompt?: boolean
  // 是否显示状态提示文本（默认 true）
  showStatusPrompt?: boolean
  // Human.js 自定义配置（可选）：允许用户自定义模型路径、启用/禁用各个模块等
  // 详见 Human.js Config 接口：https://github.com/vladmandic/human/blob/main/src/config.ts
  humanConfig?: Record<string, any>
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
  action?: LivenessAction // 活体动作
}

/**
 * 人脸检测数据
 */
export interface FaceDetectedData {
  count: number
  size: number
  frontal: number
}

/**
 * 静默活体检测数据
 */
export interface LivenessDetectedData {
  real: number  // 反欺骗（anti-spoofing）得分 (0-1)
  live: number  // 活体检测得分 (0-1)
}

/**
 * 人脸采集数据
 */
export interface FaceCollectedData {
  imageData: string | null
}

/**
 * 动作/静默活体检测完成数据
 */
export interface LivenessCompletedData {
  imageData: string | null
  liveness: number  // 活体检测得分 (0-1)
}

/**
 * 动作活体检测动作数据
 */
export interface LivenessActionData {
  action: LivenessAction
  description: string
  status: LivenessActionStatus
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

/**
 * 浏览器信息接口
 */
export interface BrowserInfo {
  isSafari: boolean
  isWeChat: boolean
  isAlipay: boolean
  isQQ: boolean
  isWebView: boolean
  isMobile: boolean
}

/**
 * Human.js 加载状态
 */
export interface HumanLoadingStatus {
  loaded: boolean
  modelsLoaded: boolean
  modelsStatus: Record<string, any>
  backend: string
  error?: string
}

/**
 * WebGL 状态
 */
export interface WebGLStatus {
  available: boolean
  vendor?: string
  renderer?: string
  version?: string
  error?: string
}
