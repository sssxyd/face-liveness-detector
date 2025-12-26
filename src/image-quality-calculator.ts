/**
 * 人脸图像质量检测模块 (统一版)
 * 
 * 综合检测人脸图像的：
 * 1. 完整度检测 - 人脸是否完整在框内
 * 2. 模糊度检测 - 图像是否清晰
 * 3. 轮廓清晰度 - 轮廓的连通性和完整度
 * 
 * 使用混合检测策略，结合 Human.js 和 OpenCV.js 优势
 */

import { Box } from '@vladmandic/human'
import { ImageQualityFeatures } from './types'

// ==================== 常量配置 ====================

/**
 * 质量检测的权重配置
 * 仅用于清晰度评估，权重之和应为 1.0
 */
const QUALITY_WEIGHTS = {
  laplacian: 0.6,         // 拉普拉斯方差权重（边缘清晰度）
  gradient: 0.4           // Sobel梯度权重（纹理梯度）
} as const

/**
 * OpenCV图像处理参数
 */
const OPENCV_PARAMS = {
  canny_threshold_low: 50,
  canny_threshold_high: 150,
  sobel_kernel_size: 3,
  sobel_type: 'CV_64F',
  laplacian_type: 'CV_64F',
  gradient_energy_scale: 100,
  laplacian_variance_scale: 150,
  edge_ratio_reference: 0.3,
  edge_ratio_low: 0.05,
  edge_ratio_high: 0.7
} as const

// ==================== 接口定义 ====================

/**
 * 单个检测指标的结果
 */
export interface QualityMetricResult {
  name: string           // 指标名称
  value: number         // 实际值
  threshold: number     // 阈值
  passed: boolean       // 是否通过
  description: string   // 描述
}

/**
 * 图像质量检测的综合结果
 */
export interface ImageQualityResult {
  // 总体是否通过
  passed: boolean
  // 综合质量评分 (0-1)
  score: number
  // 各类型不通过的原因列表
  completenessReasons: string[]
  blurReasons: string[]
  // 各个维度的详细指标
  metrics: {
    completeness: QualityMetricResult
    laplacianVariance: QualityMetricResult
    gradientSharpness: QualityMetricResult
    overallQuality: QualityMetricResult
  }
  // 建议
  suggestions?: string[]
}

// ==================== 主入口函数 ====================

/**
 * 计算图像清晰度评分
 * 
 * 综合检测图像的清晰度，使用两个指标：
 * - 拉普拉斯方差 (60%)：检测边缘清晰程度
 * - Sobel 梯度清晰度 (40%)：检测纹理梯度强度
 * 
 * @param cv - OpenCV.js 对象，用于执行图像处理操作
 * @param grayFrame - OpenCV Mat 对象，包含灰度图像数据（已ROI裁剪）
 * @param config - 检测配置对象，包含：
 *   - min_laplacian_variance: 拉普拉斯方差最小阈值（默认 40）
 *   - min_gradient_sharpness: 梯度清晰度最小阈值（默认 0.15）
 * @param threshold - 综合质量评分阈值 (0-1)，大于等于此值判定为通过
 * @returns 综合质量检测结果，包含：
 *   - passed: 是否通过质量检测
 *   - score: 综合质量评分 (0-1)
 *   - metrics: 各维度详细指标（拉普拉斯方差、梯度清晰度、综合质量）
 *   - blurReasons: 清晰度不通过原因列表
 *   - suggestions: 改进建议列表
 */
export function calcImageQuality(
  cv: any,
  grayFrame: any,
  config: ImageQualityFeatures,
  threshold: number
): ImageQualityResult {
  const metrics: Record<string, QualityMetricResult> = {}
  const completenessReasons: string[] = []
  const blurReasons: string[] = []
  
  try {
    const blurResult = checkImageSharpness(cv, grayFrame, config)
    metrics.laplacianVariance = blurResult.laplacianVariance
    metrics.gradientSharpness = blurResult.gradientSharpness
    if (!blurResult.laplacianVariance.passed) {
      blurReasons.push(blurResult.laplacianVariance.description)
    }
    if (!blurResult.gradientSharpness.passed) {
      blurReasons.push(blurResult.gradientSharpness.description)
    }

    const overallMetric: QualityMetricResult = {
      name: '综合图像质量',
      value: blurResult.overallScore,
      threshold: threshold,
      passed: blurResult.overallScore >= threshold,
      description: `综合质量评分 ${(blurResult.overallScore * 100).toFixed(1)}%  | 清晰度: ${(blurResult.overallScore * 100).toFixed(0)}%)`
    }
    metrics.overallQuality = overallMetric

    const passed = blurResult.overallScore >= threshold

    const suggestions: string[] = []
    if (!blurResult.laplacianVariance.passed) {
      suggestions.push('图像边缘不清晰，请确保光线充足且摄像头对焦清楚')
    }
    if (!blurResult.gradientSharpness.passed) {
      suggestions.push('图像纹理模糊，可能是运动模糊，请保持摄像头稳定')
    }

    return {
      passed,
      score: overallMetric.value,
      completenessReasons,
      blurReasons,
      metrics: metrics as any,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    }
  } catch (error) {
    console.error('[ImageQuality] calcImageQuality failed:', error)
    return {
      passed: false,
      score: 0,
      completenessReasons: [`质量检测异常: ${error instanceof Error ? error.message : String(error)}`],
      blurReasons: [],
      metrics: {
        completeness: {
          name: '人脸完整度',
          value: 0,
          threshold: 0.8,
          passed: false,
          description: '检测异常'
        },
        laplacianVariance: {
          name: '拉普拉斯方差',
          value: 0,
          threshold: config.min_laplacian_variance,
          passed: false,
          description: '检测异常'
        },
        gradientSharpness: {
          name: '梯度清晰度',
          value: 0,
          threshold: config.min_gradient_sharpness,
          passed: false,
          description: '检测异常'
        },
        overallQuality: {
          name: '综合图像质量',
          value: 0,
          threshold: threshold,
          passed: false,
          description: '检测异常'
        }
      }
    }
  }
}



// ==================== 清晰度检测 ====================

/**
 * 检测图像清晰度（内部函数）
 * 
 * 使用混合算法：
 * 1. 拉普拉斯方差 (Laplacian Variance) - 60%
 * 2. Sobel 梯度清晰度 - 40%
 * 
 * @param cv - OpenCV.js 对象
 * @param grayFrame - 灰度图像 Mat 对象
 * @param config - 清晰度检测配置
 * @returns 各指标结果及综合评分
 */
function checkImageSharpness(
  cv: any,
  grayFrame: any,
  config: ImageQualityFeatures
): {
  laplacianVariance: QualityMetricResult
  gradientSharpness: QualityMetricResult
  overallScore: number
} {

  try {
    // 方法 1：拉普拉斯方差
    const laplacianResult = calculateLaplacianVariance(cv, grayFrame, config.min_laplacian_variance)

    // 方法 2：梯度清晰度
    const gradientResult = calculateGradientSharpness(cv, grayFrame, config.min_gradient_sharpness)

    // 综合评分
    const laplacianScore = Math.min(1, laplacianResult.value / OPENCV_PARAMS.laplacian_variance_scale)
    const gradientScore = gradientResult.value
    const overallScore = 
      QUALITY_WEIGHTS.laplacian * laplacianScore + 
      QUALITY_WEIGHTS.gradient * gradientScore

    return {
      laplacianVariance: laplacianResult,
      gradientSharpness: gradientResult,
      overallScore: Math.min(1, overallScore)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[ImageQuality] Sharpness check error:', errorMsg)
    return {
      laplacianVariance: {
        name: '拉普拉斯方差',
        value: 0,
        threshold: config.min_laplacian_variance,
        passed: false,
        description: `检测失败: ${errorMsg}`
      },
      gradientSharpness: {
        name: '梯度清晰度',
        value: 0,
        threshold: config.min_gradient_sharpness,
        passed: false,
        description: `检测失败: ${errorMsg}`
      },
      overallScore: 0
    }
  }
}

/**
 * 计算拉普拉斯方差
 */
function calculateLaplacianVariance(
  cv: any,
  grayFrame: any,
  minThreshold: number
): QualityMetricResult {
  let laplacian: any = null
  let mean: any = null
  let stddev: any = null

  try {
    laplacian = new cv.Mat()
    cv.Laplacian(grayFrame, laplacian, cv.CV_64F)

    mean = new cv.Mat()
    stddev = new cv.Mat()
    cv.meanStdDev(laplacian, mean, stddev)

    const variance = stddev.doubleAt(0, 0) ** 2
    const passed = variance >= minThreshold

    return {
      name: '拉普拉斯方差',
      value: variance,
      threshold: minThreshold,
      passed,
      description: `拉普拉斯方差 ${variance.toFixed(1)} ${passed ? '✓' : '✗ 需 ≥' + minThreshold}`
    }    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    return {
      name: '拉普拉斯方差',
      value: 0,
      threshold: minThreshold,
      passed: false,
      description: `计算失败: ${errorMsg}`
    }
  } finally {
    if (laplacian) laplacian.delete()
    if (mean) mean.delete()
    if (stddev) stddev.delete()
  }
}

/**
 * 计算 Sobel 梯度清晰度
 */
function calculateGradientSharpness(
  cv: any,
  grayFrame: any,
  minThreshold: number
): QualityMetricResult {
  let gradX: any = null
  let gradY: any = null
  let gradMagnitude: any = null

  try {
    gradX = new cv.Mat()
    gradY = new cv.Mat()

    cv.Sobel(grayFrame, gradX, cv[OPENCV_PARAMS.sobel_type], 1, 0, OPENCV_PARAMS.sobel_kernel_size)
    cv.Sobel(grayFrame, gradY, cv[OPENCV_PARAMS.sobel_type], 0, 1, OPENCV_PARAMS.sobel_kernel_size)

    gradMagnitude = new cv.Mat()
    cv.magnitude(gradX, gradY, gradMagnitude)

    const mean = cv.mean(gradMagnitude)
    const gradientEnergy = mean[0]

    const sharpnessScore = Math.min(1, gradientEnergy / OPENCV_PARAMS.gradient_energy_scale)
    const passed = sharpnessScore >= minThreshold

    return {
      name: '梯度清晰度',
      value: sharpnessScore,
      threshold: minThreshold,
      passed,
      description: `梯度清晰度 ${(sharpnessScore * 100).toFixed(1)}% ${passed ? '✓' : '✗ 需 ≥' + (minThreshold * 100).toFixed(0) + '%'}`
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    return {
      name: '梯度清晰度',
      value: 0,
      threshold: minThreshold,
      passed: false,
      description: `计算失败: ${errorMsg}`
    }
  } finally {
    if (gradX) gradX.delete()
    if (gradY) gradY.delete()
    if (gradMagnitude) gradMagnitude.delete()
  }
}

/**
 * 验证并计算有效的ROI区域
 * 
 * 提取并验证感兴趣区域(ROI)的有效性，确保坐标在图像边界内
 * 
 * @param x - 人脸框左上角X坐标
 * @param y - 人脸框左上角Y坐标
 * @param w - 人脸框宽度
 * @param h - 人脸框高度
 * @param image - OpenCV Mat图像对象
 * @returns ROI参数和有效性标记 { valid, x, y, width, height }
 */
function validateAndCalculateROI(
  x: number,
  y: number,
  w: number,
  h: number,
  image: any
): { valid: boolean; x: number; y: number; width: number; height: number } {
  const x_int = Math.max(0, Math.floor(x))
  const y_int = Math.max(0, Math.floor(y))
  const w_int = Math.min(w, image.cols - x_int)
  const h_int = Math.min(h, image.rows - y_int)

  const isValid = w_int > 0 && h_int > 0

  return {
    valid: isValid,
    x: x_int,
    y: y_int,
    width: w_int,
    height: h_int
  }
}