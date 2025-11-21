/**
 * 人脸检测 - 常量和配置
 * 包含所有事件名、颜色、描述、配置等
 */

import { LivenessAction, PromptCode, ErrorCode } from './enums'

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
 * 用于组件与父容器通信的事件名
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
 * 不同检测状态对应的颜色值
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
 * 提示码描述映射表
 * 将提示码映射到用户友好的提示文本
 */
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
  [PromptCode.ACTION_TIMEOUT]: '动作检测超时'
}

/**
 * 错误码描述映射表
 * 将错误码映射到用户友好的错误描述
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
