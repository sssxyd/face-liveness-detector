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
 * FaceDetector 组件 Props 接口
 */
export interface FaceDetectorProps {
  // 工作模式：COLLECTION(采集) / LIVENESS(动作活体) / SILENT_LIVENESS(静默活体)
  mode?: DetectionMode | string
  // 活体检测项目数组：可包含 LivenessAction.BLINK(眨眼) 等（仅用于 LIVENESS 模式）
  livenessChecks?: (LivenessAction | string)[]
  // 人脸占画面比例的最小值（百分比）
  minFaceRatio?: number
  // 人脸占画面比例的最大值（百分比）
  maxFaceRatio?: number
  // 正脸置信度的最小值（百分比）
  minFrontal?: number
  // 静默活体检测的阈值（0-100，默认 90）：用于判定是否为真实人脸
  silentLivenessThreshold?: number
  // 活体检测动作次数（默认1，表示每个动作只需做一次）
  livenessActionCount?: number
  // 活体检测动作时间限制（秒，默认60秒）
  livenessActionTimeout?: number
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
    action: string
    status: string
}

/**
 * 错误数据
 */
export interface ErrorData {
  message: string
}
