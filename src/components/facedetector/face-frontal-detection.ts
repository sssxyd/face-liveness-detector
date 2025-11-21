/**
 * 人脸正对度检测模块
 * 
 * 用于判断人脸是否正对摄像头，使用两种方法：
 * 1. 手势识别方法（优先）
 * 2. 角度分析方法（备选/精确）
 */

import { CONFIG } from './config'

/**
 * 人脸正对度检测配置接口（已废弃）
 * 
 * 该接口保留用于向后兼容，但不再使用。
 * 所有配置现在直接从 CONFIG.FACE_FRONTAL 中读取。
 */
export interface FrontalCheckConfig {
  // 已废弃：yaw 角度阈值 - 使用 CONFIG.FACE_FRONTAL.YAW_THRESHOLD
  yawThreshold?: number
  // 已废弃：pitch 角度阈值 - 使用 CONFIG.FACE_FRONTAL.PITCH_THRESHOLD
  pitchThreshold?: number
  // 已废弃：roll 角度阈值 - 使用 CONFIG.FACE_FRONTAL.ROLL_THRESHOLD
  rollThreshold?: number
}

/**
 * 角度分析结果接口
 */
export interface AngleAnalysisResult {
  yaw: number      // 左右摇晃角度（度）
  pitch: number    // 上下俯仰角度（度）
  roll: number     // 旋转角度（度）
  score: number    // 基于角度的正对度评分 (0-1)
}

/**
 * 检查人脸是否正对摄像头 - 主函数
 * 
 * 优先使用手势识别方法，如果不可用则使用角度分析
 * 直接使用 CONFIG.FACE_FRONTAL 中的参数，不支持运行时覆盖
 * 
 * @param {any} face - 人脸检测结果（包含 rotation 信息）
 * @param {any} gestures - 检测到的手势/表情数组
 * @returns {number} 正对度评分 (0-1)，1 表示完全正对
 * 
 * @example
 * const score = checkFaceFrontal(face, gestures)
 * if (score > 0.9) {
 *   console.log('人脸足够正对')
 * }
 */
export function checkFaceFrontal(face: any, gestures: any): number {
  // 优先使用 gestures 中的 facing center 判定
  if (gestures && gestures.length > 0) {
    const frontalScore = checkFaceFrontalWithGestures(gestures)
    if (frontalScore > 0) {
      return frontalScore
    }
  }
  
  // 备用方案：使用角度算法计算正对度评分
  return checkFaceFrontalWithAngles(face)
}

/**
 * 使用手势识别方法检查人脸正对度
 * 
 * 从 Human.js 返回的手势中查找 "facing center" 标志
 * 
 * @param {any} gestures - Human.js 检测到的手势数组
 * @returns {number} 评分 (0-1)，0 表示未检测到相关手势
 * 
 * @example
 * const score = checkFaceFrontalWithGestures(result.gesture)
 */
export function checkFaceFrontalWithGestures(gestures: any): number {
  if (!gestures || !Array.isArray(gestures)) {
    return 0
  }
  
  // 检查是否有 facing center 手势
  const hasFacingCenter = gestures.some((g: any) => {
    if (!g || !g.gesture) return false
    return g.gesture.includes('facing center') || g.gesture.includes('facing camera')
  })
  
  // 如果检测到正对手势，返回高分
  if (hasFacingCenter) {
    return 0.95  // 手势识别的准确度高，给予较高分
  }
  
  return 0  // 未检测到相关手势
}

/**
 * 使用角度分析方法检查人脸正对度
 * 
 * 分析人脸的 yaw、pitch、roll 三个角度
 * 使用加权评分：yaw (60%) + pitch (25%) + roll (15%)
 * 直接使用 CONFIG.FACE_FRONTAL 中的参数
 * 
 * @param {any} face - 人脸检测结果
 * @returns {number} 正对度评分 (0-1)
 * 
 * @example
 * const score = checkFaceFrontalWithAngles(face)
 */
export function checkFaceFrontalWithAngles(face: any): number {
  // 获取角度信息
  const angles = extractFaceAngles(face)
  
  // 基础评分，从 1.0 开始
  let score = 1.0
  
  // Yaw 角度惩罚（左右摇晃）- 权重最高 (60%)
  // 目标：yaw 应该在阈值以内
  const yawThreshold = CONFIG.FACE_FRONTAL.YAW_THRESHOLD
  const yawExcess = Math.max(0, Math.abs(angles.yaw) - yawThreshold)
  // yaw 每超过 1° 扣 0.15 分
  score -= yawExcess * 0.15
  
  // Pitch 角度惩罚（上下俯仰）- 权重中等 (25%)
  // 目标：pitch 应该在阈值以内
  const pitchThreshold = CONFIG.FACE_FRONTAL.PITCH_THRESHOLD
  const pitchExcess = Math.max(0, Math.abs(angles.pitch) - pitchThreshold)
  // pitch 每超过 1° 扣 0.1 分
  score -= pitchExcess * 0.1
  
  // Roll 角度惩罚（旋转）- 权重最低 (15%)
  // 目标：roll 应该在阈值以内
  const rollThreshold = CONFIG.FACE_FRONTAL.ROLL_THRESHOLD
  const rollExcess = Math.max(0, Math.abs(angles.roll) - rollThreshold)
  // roll 每超过 1° 扣 0.12 分
  score -= rollExcess * 0.12
  
  // 确保评分在 0-1 之间
  return Math.max(0, Math.min(1, score))
}

/**
 * 从人脸检测结果中提取三维旋转角度
 * 
 * 返回标准化的 yaw、pitch、roll 角度值（单位：度）
 * 
 * @param {any} face - Human.js 人脸检测结果
 * @returns {AngleAnalysisResult} 包含角度和评分的结果对象
 */
export function extractFaceAngles(face: any): AngleAnalysisResult {
  // 从 face.rotation.angle 获取角度信息
  const ang = face?.rotation?.angle || { yaw: 0, pitch: 0, roll: 0 }
  
  return {
    yaw: ang.yaw || 0,
    pitch: ang.pitch || 0,
    roll: ang.roll || 0,
    score: 1.0  // 占位符，会被 checkFaceFrontalWithAngles 覆盖
  }
}

/**
 * 获取角度分析的详细信息
 * 
 * 返回每个角度维度的详细评分和状态
 * 直接使用 CONFIG.FACE_FRONTAL 中的参数
 * 
 * @param {any} face - 人脸检测结果
 * @returns {object} 包含各维度评分的详细对象
 * 
 * @example
 * const details = getAngleAnalysisDetails(face)
 * console.log(details.yawScore)  // 0.85
 * console.log(details.issues)    // ['Yaw 角度超过阈值']
 */
export function getAngleAnalysisDetails(face: any): Record<string, any> {
  const angles = extractFaceAngles(face)
  
  const yawThreshold = CONFIG.FACE_FRONTAL.YAW_THRESHOLD
  const pitchThreshold = CONFIG.FACE_FRONTAL.PITCH_THRESHOLD
  const rollThreshold = CONFIG.FACE_FRONTAL.ROLL_THRESHOLD
  
  const issues: string[] = []
  
  // Yaw 评分
  const yawExcess = Math.max(0, Math.abs(angles.yaw) - yawThreshold)
  const yawScore = Math.max(0, 1.0 - yawExcess * 0.15)
  if (yawExcess > 0) {
    issues.push(`左右倾斜过度 (${Math.abs(angles.yaw).toFixed(1)}° > ${yawThreshold}°)`)
  }
  
  // Pitch 评分
  const pitchExcess = Math.max(0, Math.abs(angles.pitch) - pitchThreshold)
  const pitchScore = Math.max(0, 1.0 - pitchExcess * 0.1)
  if (pitchExcess > 0) {
    issues.push(`上下俯仰过度 (${Math.abs(angles.pitch).toFixed(1)}° > ${pitchThreshold}°)`)
  }
  
  // Roll 评分
  const rollExcess = Math.max(0, Math.abs(angles.roll) - rollThreshold)
  const rollScore = Math.max(0, 1.0 - rollExcess * 0.12)
  if (rollExcess > 0) {
    issues.push(`头部旋转过度 (${Math.abs(angles.roll).toFixed(1)}° > ${rollThreshold}°)`)
  }
  
  const overallScore = checkFaceFrontalWithAngles(face)
  
  return {
    overall: {
      score: overallScore,
      isValid: overallScore >= 0.9
    },
    angles: {
      yaw: angles.yaw,
      pitch: angles.pitch,
      roll: angles.roll
    },
    dimensions: {
      yaw: { score: yawScore, threshold: yawThreshold, actual: angles.yaw },
      pitch: { score: pitchScore, threshold: pitchThreshold, actual: angles.pitch },
      roll: { score: rollScore, threshold: rollThreshold, actual: angles.roll }
    },
    issues
  }
}

/**
 * 验证人脸是否满足正对度要求
 * 
 * @param {any} face - 人脸检测结果
 * @param {number} minScore - 最小要求评分 (默认 0.9)
 * @param {any} gestures - 可选的手势数据
 * @returns {boolean} 是否满足要求
 * 
 * @example
 * if (isFaceFrontal(face, 0.85, gestures)) {
 *   console.log('人脸正对要求通过')
 * }
 */
export function isFaceFrontal(face: any, minScore: number = 0.9, gestures?: any): boolean {
  const score = checkFaceFrontal(face, gestures)
  return score >= minScore
}

/**
 * 获取人脸正对度的描述文本
 * 
 * 将评分转换为用户友好的描述
 * 
 * @param {number} score - 正对度评分 (0-1)
 * @returns {string} 描述文本
 * 
 * @example
 * console.log(getFrontalDescription(0.95))  // "非常正对"
 * console.log(getFrontalDescription(0.6))   // "请调整角度"
 */
export function getFrontalDescription(score: number): string {
  if (score >= 0.95) return '非常正对'
  if (score >= 0.85) return '正对'
  if (score >= 0.75) return '基本正对'
  if (score >= 0.6) return '请调整角度'
  if (score >= 0.4) return '请调整至正脸'
  return '需要完全正对摄像头'
}

/**
 * 根据人脸角度给出具体的调整建议
 * 
 * 直接使用 CONFIG.FACE_FRONTAL 中的参数
 * 
 * @param {any} face - 人脸检测结果
 * @returns {string[]} 调整建议列表
 * 
 * @example
 * const suggestions = getAdjustmentSuggestions(face)
 * suggestions.forEach(s => console.log(s))
 * // 输出:
 * // "请向左转动头部"
 * // "请抬起头部"
 */
export function getAdjustmentSuggestions(face: any): string[] {
  const angles = extractFaceAngles(face)
  const suggestions: string[] = []
  
  const yawThreshold = CONFIG.FACE_FRONTAL.YAW_THRESHOLD
  const pitchThreshold = CONFIG.FACE_FRONTAL.PITCH_THRESHOLD
  const rollThreshold = CONFIG.FACE_FRONTAL.ROLL_THRESHOLD
  
  // Yaw 调整建议
  if (Math.abs(angles.yaw) > yawThreshold) {
    if (angles.yaw > 0) {
      suggestions.push('请向左转动头部')
    } else {
      suggestions.push('请向右转动头部')
    }
  }
  
  // Pitch 调整建议
  if (Math.abs(angles.pitch) > pitchThreshold) {
    if (angles.pitch > 0) {
      suggestions.push('请抬起头部')
    } else {
      suggestions.push('请低下头部')
    }
  }
  
  // Roll 调整建议
  if (Math.abs(angles.roll) > rollThreshold) {
    if (angles.roll > 0) {
      suggestions.push('请向左倾斜头部')
    } else {
      suggestions.push('请向右倾斜头部')
    }
  }
  
  if (suggestions.length === 0) {
    suggestions.push('保持当前姿态')
  }
  
  return suggestions
}
