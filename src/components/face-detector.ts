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
  READY: 'ready',           // Human.js 加载成功，组件已就绪
  STATUS_PROMPT: 'status-prompt', // 状态提示更新
  FACE_DETECTED: 'face-detected',   // 检测到人脸
  FACE_COLLECTED: 'face-collected', // 人脸采集完成
  LIVENESS_ACTION: 'liveness-action',    // 活体动作事件
  LIVENESS_DETECTED: 'liveness-detected', // 一次静默活体检测完成(未必通过)
  LIVENESS_COMPLETED: 'liveness-completed', // 动作/静默活体检测完成
  ERROR: 'error', // 错误事件
  DEBUG: 'debug'  // 调试事件 - 用于输出详细的诊断信息
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
 * 活体动作状态枚举
 */
export enum LivenessActionStatus {
  STARTED = 'started',
  COMPLETED = 'completed',
  TIMEOUT = 'timeout'
}

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

export const PROMPT_CODE_DESCRIPTIONS: Record<PromptCode, string> = {
  [PromptCode.NORMAL_STATE]: '检测正常',
  [PromptCode.NO_FACE_DETECTED]: '未检测到人脸',
  [PromptCode.MULTIPLE_FACES_DETECTED]: '检测到多人',
  [PromptCode.FACE_TOO_SMALL]: '请靠近摄像头',
  [PromptCode.FACE_TOO_LARGE]: '请远离摄像头',
  [PromptCode.FACE_NOT_FRONTAL]: '请正对摄像头',
  [PromptCode.GOOD_IMAGE_QUALITY]: '图像清晰',
  [PromptCode.POOR_IMAGE_QUALITY]: '图像模糊请调整',
  [PromptCode.PLEASE_PERFORM_ACTION]: '请完成指定动作',
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

/**
 * 错误码描述映射表
 */
export const ERROR_CODE_DESCRIPTIONS: Record<ErrorCode, string> = {
  [ErrorCode.DETECTOR_NOT_INITIALIZED]: '检测库未初始化',
  [ErrorCode.CAMERA_ACCESS_DENIED]: '无权访问摄像头',
  [ErrorCode.STREAM_ACQUISITION_FAILED]: '获取摄像头流失败',
  [ErrorCode.FACE_COUNT_CHANGED]: '检测到人脸数量变化',
  [ErrorCode.ACTION_TIMEOUT]: '活体动作检测超时',
  [ErrorCode.CAPTURE_FAILED]: '图片捕获失败',
  [ErrorCode.ENGINE_NOT_INITIALIZED]: 'AI 检测引擎未初始化',
  [ErrorCode.LIVENESS_ANALYSIS_FAILED]: '活体检测分析失败',
  [ErrorCode.NO_FACE_IN_IMAGE]: '采集图片中未检测到人脸',
  [ErrorCode.NO_LIVENESS_RESULT]: '无法获取活体检测结果',
  [ErrorCode.LIVENESS_DETECTION_FAILED]: '活体检测失败',
  [ErrorCode.FRAUD_DETECTED]: '疑似非真实人脸',
  [ErrorCode.IMAGE_LOAD_FAILED]: '图片加载失败',
  [ErrorCode.DETECTION_ERROR]: '检测异常'
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

export const CONFIG = Object.freeze({
  // 检测相关配置
  DETECTION: {
    // 视频加载超时时间（毫秒）- 等待视频元素可播放的最长时间
    VIDEO_LOAD_TIMEOUT: 5000,
    // 检测循环帧延迟（毫秒）- 两次检测之间的间隔，越小检测越频繁
    DETECTION_FRAME_DELAY: 100,
    // 错误重试延迟（毫秒）- 检测出错时的重试间隔
    ERROR_RETRY_DELAY: 200,
    // 默认视频宽度（像素）- 桌面设备使用的固定宽度 (1:1 比例)
    DEFAULT_VIDEO_WIDTH: 640,
    // 默认视频高度（像素）- 桌面设备使用的固定高度 (1:1 比例)
    DEFAULT_VIDEO_HEIGHT: 640,
    // 提示文本显示时长（毫秒）- 状态提示文本自动清空的时间间隔
    PROMPT_TEXT_DURATION: 3000
  },
  // 移动设备适配配置
  MOBILE: {
    // 视频宽度偏移（像素）- 移动设备视频宽度减少的像素数，用于留出边距
    VIDEO_WIDTH_OFFSET: 40,
    // 视频高度偏移（像素）- 移动设备视频高度减少的像素数，用于留出边距（包括顶部栏、底部操作栏等）
    VIDEO_HEIGHT_OFFSET: 200,
    // 移动设备最大视频尺寸（像素）- 移动设备边长上限 (1:1 比例)
    MAX_WIDTH: 640,
    // 移动设备判断阈值（像素）- 屏幕宽度小于此值则判定为移动设备
    WIDTH_THRESHOLD: 768
  },
  // 活体检测相关配置
  LIVENESS: {
    // 张嘴判定阈值（百分比）- 嘴巴打开度超过此百分比才算张嘴
    MIN_MOUTH_OPEN_PERCENT: 20,
    // 正脸Yaw角度阈值（度）- 左右摇晃不能超过此角度，超出则扣分
    FRONTAL_YAW_THRESHOLD: 3,
    // 正脸Pitch角度阈值（度）- 上下俯仰不能超过此角度，超出则扣分
    FRONTAL_PITCH_THRESHOLD: 4,
    // 正脸Roll角度阈值（度）- 旋转不能超过此角度，超出则扣分
    FRONTAL_ROLL_THRESHOLD: 2,
    // 反欺骗（anti-spoofing）阈值 - 如果 real 分数低于此值，判定为欺诈
    ANTI_SPOOFING_THRESHOLD: 0.5
  },
  // 图像质量相关配置
  IMAGE_QUALITY: {
    // 最小人脸检测框分数（0-1）- 检测框置信度低于此值表示检测不清晰
    MIN_BOX_SCORE: 0.9,
    // 最小人脸网格分数（0-1）- 网格置信度低于此值表示图像模糊或质量差
    MIN_FACE_SCORE: 0.9,
    // 最小综合分数（0-1）- 综合评分低于此值表示图像质量不足
    MIN_OVERALL_SCORE: 0.85,
    // 人脸完整性检测相关配置
    FACE_COMPLETENESS: {
      // 检测的关键部位是否存在
      EYES: {
        // 眼睛区域的关键点索引范围 (MediaPipe FaceMesh)
        START: 0,
        END: 21
      },
      MOUTH: {
        // 嘴巴区域的关键点索引范围 (MediaPipe FaceMesh)
        START: 61,
        END: 96
      },
      EARS: {
        // 耳朵区域的关键点索引范围 (MediaPipe FaceMesh)
        LEFT_START: 109,
        LEFT_END: 122,
        RIGHT_START: 338,
        RIGHT_END: 351
      },
      // 关键点置信度阈值 (0-1) - 低于此值的关键点不算有效
      KEYPOINT_CONFIDENCE_THRESHOLD: 0.3,
      // 各部位检测失败的扣分值（0-1，值越小越宽松）
      PENALTY_MISSING_EYES: 0.05,
      PENALTY_MISSING_MOUTH: 0.05,
      PENALTY_MISSING_EARS: 0.05,
      // 人脸超出边界的扣分值
      PENALTY_OUT_OF_BOUNDARY: 0.05,
      // 无关键点数据的扣分值
      PENALTY_NO_LANDMARKS: 0.1,
      // 眼睛检测要求：0 表示至少检测一只眼睛，1 表示两只都要检测（仅用于旁注）
      EYES_DETECTION_TYPE: 'any',  // 'any' = 一只眼睛, 'both' = 两只眼睛
      // 耳朵检测要求：0 表示至少检测一只耳朵，1 表示两只都要检测
      EARS_DETECTION_TYPE: 'any'   // 'any' = 一只耳朵, 'both' = 两只耳朵
    }
  },
  // 检测超时相关配置
  TIMEOUT: {
    // 检测总超时时长（毫秒）- 如果60秒内没有检测到合格人脸，则主动退出
    DETECTION_TIMEOUT: 60000
  }
})

// ===== 工具函数 =====

/**
 * 检测浏览器信息
 * @returns {BrowserInfo} 浏览器信息对象
 */
export function detectBrowserInfo(): BrowserInfo {
  const userAgent = navigator.userAgent.toLowerCase()
  
  return {
    isSafari: /safari/.test(userAgent) && !/chrome/.test(userAgent),
    isWeChat: /micromessenger/i.test(userAgent),
    isAlipay: /alipay/.test(userAgent),
    isQQ: /qq/.test(userAgent),
    isWebView: /(wechat|alipay|qq)webview/i.test(userAgent),
    isMobile: /android|iphone|ipad|ipod/.test(userAgent) || window.innerWidth < CONFIG.MOBILE.WIDTH_THRESHOLD
  }
}

/**
 * 检查 WebGL 是否可用（缓存结果以避免重复检测）
 */
let webglAvailableCache: boolean | null = null

export function isWebGLAvailable(): boolean {
  // 如果已经检测过，直接返回缓存结果
  if (webglAvailableCache !== null) {
    return webglAvailableCache
  }

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl') || canvas.getContext('webgl2')
    webglAvailableCache = !!context
    return webglAvailableCache
  } catch (e) {
    webglAvailableCache = false
    return false
  }
}

/**
 * 获取 WebGL 详细信息
 */
export function getWebGLInfo(): WebGLStatus {
  if (!isWebGLAvailable()) {
    return { available: false }
  }

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl') || canvas.getContext('webgl2')
    
    if (!context) {
      return { available: false }
    }

    const debugInfo = context.getExtension('WEBGL_debug_renderer_info')
    if (debugInfo) {
      return {
        available: true,
        vendor: context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
        version: context.getParameter(context.VERSION)
      }
    }

    return { available: true }
  } catch (e) {
    return { available: false }
  }
}
