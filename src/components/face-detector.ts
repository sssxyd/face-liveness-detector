/**
 * 人脸检测相关的类型定义
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
 * 活体检测动作描述映射表
 */
export const ACTION_DESCRIPTIONS: Record<string, string> = {
  [LivenessAction.BLINK]: '眨眼',
  [LivenessAction.MOUTH_OPEN]: '张嘴',
  [LivenessAction.NOD]: '点头'
}

/**
 * FaceDetector 组件事件名称常量
 */
export const FACE_DETECTOR_EVENTS = Object.freeze({
  FACE_DETECTED: 'face-detected',
  FACE_COLLECTED: 'face-collected',
  LIVENESS_ACTION: 'liveness-action',
  LIVENESS_COMPLETED: 'liveness-completed',
  ERROR: 'error'
})

/**
 * 视频容器边框颜色状态
 */
export const BORDER_COLOR_STATES = Object.freeze({
  IDLE: '#ddd',          // 未检测到人脸：灰色
  MULTIPLE_FACES: '#f56c6c',  // 检测到多个人脸：红色
  PERFECT: '#42b983',    // 条件都满足：绿色
  PARTIAL: '#ffc107',    // 条件部分满足：黄色
  INVALID: '#ff9800'     // 条件都不满足：橙色
})

/**
 * FaceDetector 组件 Props 接口
 */
export interface FaceDetectorProps {
  // 工作模式：COLLECTION(采集) / LIVENESS(动作活体) / SILENT_LIVENESS(静默活体)
  mode?: DetectionMode | string
  // 活体检测项目数组：可包含 LivenessAction.BLINK(眨眼) 等（仅用于 LIVENESS 模式）
  livenessChecks?: LivenessAction[]
  // 人脸占画面比例的最小值（百分比）
  minFaceRatio?: number
  // 人脸占画面比例的最大值（百分比）
  maxFaceRatio?: number
  // 正脸置信度的最小值（百分比）
  minFrontal?: number
  // 静默活体检测的阈值（0-100，默认 90）：用于判定是否为真实人脸
  silentLivenessThreshold?: number
  // 活体检测动作次数（默认1，表示进行几次活体动作检测）
  livenessActionCount?: number
  // 活体检测动作时间限制（秒，默认60秒）
  livenessActionTimeout?: number
  // 是否显示活体检测动作提示文本（默认 true）
  showActionPrompt?: boolean
}

/**
 * 人脸信息
 */
export interface FaceInfo {
    count: number
    size: number
    frontal: number
}

/**
 * 人脸采集数据
 */
export interface FaceCollectedData {
    faceImageData: string | null
}

/**
 * 活体检测完成数据
 */
export interface LivenessCompletedData {
    faceImageData: string | null
    liveness: number  // 活体检测得分 (0-1)
}

/**
 * 活体检测动作数据
 */
export interface LivenessActionData {
    action: LivenessAction
    description: string
    status: LivenessActionStatus
}

export enum LivenessActionStatus {
  STARTED = 'started',
  COMPLETED = 'completed',
  TIMEOUT = 'timeout'
}

export interface FaceDetectorEvents {
  // 检测到人脸时触发
  faceDetected: (data: FaceInfo) => void
  // 采集完成时触发
  faceCollected: (data: FaceCollectedData) => void
  // 活体检测完成时触发
  livenessCompleted: (data: LivenessCompletedData) => void
  // 活体检测动作开始时触发
  livenessActionStarted: (data: LivenessActionData) => void
}

/**
 * 错误数据
 */
export interface ErrorData {
  message: string
}
