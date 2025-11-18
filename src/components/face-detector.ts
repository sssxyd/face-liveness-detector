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
  INVALID: '#ff9800',    // 条件都不满足：橙色
  SUCCESS: '#42b983',    // 成功：绿色
  ERROR: '#f5222d'       // 错误：红色
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
    cameraImageData: string | null
    faceImageData: string | null
}

/**
 * 活体检测完成数据
 */
export interface LivenessCompletedData {
    cameraImageData: string | null
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

export const CONFIG = Object.freeze({
  // 检测相关配置
  DETECTION: {
    // 视频加载超时时间（毫秒）- 等待视频元素可播放的最长时间
    VIDEO_LOAD_TIMEOUT: 5000,
    // 检测循环帧延迟（毫秒）- 两次检测之间的间隔，越小检测越频繁
    DETECTION_FRAME_DELAY: 100,
    // 错误重试延迟（毫秒）- 检测出错时的重试间隔
    ERROR_RETRY_DELAY: 200,
    // 默认视频宽度（像素）- 桌面设备使用的固定宽度
    DEFAULT_VIDEO_WIDTH: 640,
    // 默认视频高度（像素）- 桌面设备使用的固定高度
    DEFAULT_VIDEO_HEIGHT: 480
  },
  // 移动设备适配配置
  MOBILE: {
    // 视频宽度偏移（像素）- 移动设备视频宽度减少的像素数，用于留出边距
    VIDEO_WIDTH_OFFSET: 40,
    // 视频高度偏移（像素）- 移动设备视频高度减少的像素数，用于留出边距（包括顶部栏、底部操作栏等）
    VIDEO_HEIGHT_OFFSET: 200,
    // 移动设备最大视频宽度（像素）- 移动设备宽度上限
    MAX_WIDTH: 480,
    // 移动设备最大视频高度（像素）- 移动设备高度上限
    MAX_HEIGHT: 640,
    // 移动设备判断阈值（像素）- 屏幕宽度小于此值则判定为移动设备
    WIDTH_THRESHOLD: 768
  },
  // 活体检测相关配置
  LIVENESS: {
    // 张嘴判定阈值（百分比）- 嘴巴打开度超过此百分比才算张嘴
    MIN_MOUTH_OPEN_PERCENT: 20,
    // 点头动作序列长度 - 需要检测到的头部运动序列数（up -> down -> up）
    NOD_SEQUENCE_LENGTH: 3,
    // 正脸Yaw角度阈值（度）- 左右摇晃不能超过此角度，超出则扣分
    FRONTAL_YAW_THRESHOLD: 3,
    // 正脸Pitch角度阈值（度）- 上下俯仰不能超过此角度，超出则扣分
    FRONTAL_PITCH_THRESHOLD: 4,
    // 正脸Roll角度阈值（度）- 旋转不能超过此角度，超出则扣分
    FRONTAL_ROLL_THRESHOLD: 2
  }
})
