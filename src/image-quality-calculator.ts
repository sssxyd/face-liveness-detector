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

import { FaceResult } from '@vladmandic/human'
import { ImageQualityFeatures } from './types'

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
 * 计算图像质量（完整度 + 清晰度）
 * 
 * 综合检测：
 * - 人脸完整度（Human.js边界 + OpenCV轮廓）
 * - 图像清晰度（拉普拉斯方差 + Sobel梯度）
 * 
 * @param cv - OpenCV.js 对象，用于执行图像处理操作
 * @param matImage - OpenCV Mat 对象，包含灰度图像数据
 * @param face - 人脸检测结果，包含人脸框位置和其他检测信息
 * @param imageWidth - 图片宽度（像素），用于边界检查和完整度计算
 * @param imageHeight - 图片高度（像素），用于边界检查和完整度计算
 * @param config - 检测配置对象，包含：
 *   - require_full_face_in_bounds: 是否要求人脸完全在边界内
 *   - use_opencv_enhancement: 是否使用 OpenCV 增强检测
 *   - min_laplacian_variance: 拉普拉斯方差最小阈值
 *   - min_gradient_sharpness: 梯度清晰度最小阈值
 * @param threshold - 综合质量评分阈值 (0-1)，大于等于此值判定为通过
 * @returns 综合质量检测结果，包含：
 *   - passed: 是否通过质量检测
 *   - score: 综合质量评分 (0-1)
 *   - completenessReasons: 完整度不通过原因列表
 *   - blurReasons: 清晰度不通过原因列表
 *   - metrics: 各维度详细指标（完整度、拉普拉斯方差、梯度清晰度、综合质量）
 *   - suggestions: 改进建议列表
 */
export function calcImageQuality(
  cv: any,
  matImage: any,
  face: FaceResult,
  imageWidth: number,
  imageHeight: number,
  config: ImageQualityFeatures,
  threshold: number
): ImageQualityResult {
  const metrics: Record<string, QualityMetricResult> = {}
  const completenessReasons: string[] = []
  const blurReasons: string[] = []

  // ===== 第一部分：完整度检测 =====
  const completenessResult = checkFaceCompletenessInternal(
    cv,
    matImage,
    face,
    imageWidth,
    imageHeight,
    config
  )
  metrics.completeness = completenessResult as any
  if (!completenessResult.passed) {
    completenessReasons.push(completenessResult.description)
  }

  // ===== 第二部分：清晰度检测 =====
  const blurResult = checkImageSharpness(cv, matImage, face, config)
  metrics.laplacianVariance = blurResult.laplacianVariance
  metrics.gradientSharpness = blurResult.gradientSharpness
  if (!blurResult.laplacianVariance.passed) {
    blurReasons.push(blurResult.laplacianVariance.description)
  }
  if (!blurResult.gradientSharpness.passed) {
    blurReasons.push(blurResult.gradientSharpness.description)
  }

  // ===== 第三部分：综合评分 =====
  // 加权：完整度(40%) + 清晰度(60%)
  const completenessScore = Math.min(1, completenessResult.value)
  const sharpnessScore = blurResult.overallScore
  const overallScore = completenessScore * 0.4 + sharpnessScore * 0.6

  const overallMetric: QualityMetricResult = {
    name: '综合图像质量',
    value: overallScore,
    threshold: threshold,
    passed: overallScore >= threshold,
    description: `综合质量评分 ${(overallScore * 100).toFixed(1)}% (完整度: ${(completenessScore * 100).toFixed(0)}% | 清晰度: ${(sharpnessScore * 100).toFixed(0)}%)`
  }
  metrics.overallQuality = overallMetric

  const passed = overallScore >= threshold

  const suggestions: string[] = []
  if (!completenessResult.passed) {
    if (completenessResult.value < 0.5) {
      suggestions.push('请调整摄像头角度或位置，确保整个人脸都在画面内')
    }
  }
  if (!blurResult.laplacianVariance.passed) {
    suggestions.push('图像边缘不清晰，请确保光线充足且摄像头对焦清楚')
  }
  if (!blurResult.gradientSharpness.passed) {
    suggestions.push('图像纹理模糊，可能是运动模糊，请保持摄像头稳定')
  }

  return {
    passed,
    score: overallScore,
    completenessReasons,
    blurReasons,
    metrics: metrics as any,
    suggestions: suggestions.length > 0 ? suggestions : undefined
  }
}

// ==================== 完整度检测 ====================

/**
 * Human.js 边界检测（基础层 - 60% 权重）
 * 计算人脸框在图片内的完整度
 * 
 * @param face - 人脸检测结果
 * @param imageWidth - 图片宽度
 * @param imageHeight - 图片高度
 * @param requireFullFaceInBounds - 是否要求完全在边界内
 * @returns 完整度评分 (0-1)
 */
function checkFaceCompletenessInternal(
  cv: any,
  matImage: any,
  face: any,
  imageWidth: number,
  imageHeight: number,
  config: ImageQualityFeatures
): QualityMetricResult {
  // 第一层：Human.js 边界检测 (80%)
  // require_full_face_in_bounds 设为 false 时允许 90% 的完整度即可
  let humanScore = calculateHumanCompleteness(face, imageWidth, imageHeight, config.require_full_face_in_bounds)

  // 第二、三层：OpenCV 增强检测
  let opencvContourScore = 1.0
  let opencvSharpnessScore = 1.0

  if (matImage) {
    try {
      if (face?.box) {
        opencvContourScore = detectFaceCompletenessOpenCVContour(cv, matImage, face.box)
        opencvSharpnessScore = detectFaceCompletenessOpenCVSharpness(cv, matImage, face.box)
      }
    } catch (error) {
      console.warn('[ImageQuality] OpenCV enhancement failed:', error)
    }
  }

  // 组合评分：减少对 OpenCV 辅助检测的依赖
  // Human.js 作为主要判据（权重提升到 80%），OpenCV 作为辅助增强（20%）
  const completenessScore =
    humanScore * 0.8 +
    Math.max(opencvContourScore, opencvSharpnessScore) * 0.2

  return {
    name: '人脸完整度',
    value: completenessScore,
    threshold: config.require_full_face_in_bounds ? 1.0 : 0.8,
    passed: completenessScore >= (config.require_full_face_in_bounds ? 1.0 : 0.8),
    description: `人脸完整度 ${(completenessScore * 100).toFixed(1)}% (Human: ${(humanScore * 100).toFixed(0)}% | Contour: ${(opencvContourScore * 100).toFixed(0)}% | Sharpness: ${(opencvSharpnessScore * 100).toFixed(0)}%)`
  }
}

/**
 * Human.js 边界检测
 */
function calculateHumanCompleteness(
  face: any,
  imageWidth: number,
  imageHeight: number,
  requireFullFaceInBounds: boolean
): number {
  const faceBox = face.box || face.boxRaw

  if (!faceBox || faceBox.length < 4) {
    return 0
  }

  const [x, y, width, height] = faceBox

  // 计算人脸框在图片内的比例
  const overlapX = Math.min(Math.max(x + width, 0), imageWidth) - Math.max(x, 0)
  const overlapY = Math.min(Math.max(y + height, 0), imageHeight) - Math.max(y, 0)
  const faceArea = width * height
  const overlapArea = Math.max(0, overlapX) * Math.max(0, overlapY)
  let completenessScore = faceArea > 0 ? overlapArea / faceArea : 0

  if (requireFullFaceInBounds) {
    const isFullyInBounds = x >= 0 && y >= 0 && x + width <= imageWidth && y + height <= imageHeight
    if (!isFullyInBounds) {
      // 改进：不是直接返回 0，而是按超出程度扣分
      // 90% 以上在边界内可以接受
      const minCompleteness = 0.9
      if (completenessScore < minCompleteness) {
        completenessScore = completenessScore * 0.5 // 超出较多时严重扣分
      }
    }
  }

  return completenessScore
}

/**
 * OpenCV 轮廓检测 (30%)
 */
function detectFaceCompletenessOpenCVContour(
  cv: any,
  matImage: any,
  faceBox: [number, number, number, number]
): number {
  let gray = matImage.clone()
  try {
    const edges = new cv.Mat()
    cv.Canny(gray, edges, 50, 150)

    try {
      const [x, y, w, h] = faceBox
      const x_int = Math.max(0, Math.floor(x))
      const y_int = Math.max(0, Math.floor(y))
      const w_int = Math.min(w, matImage.cols - x_int)
      const h_int = Math.min(h, matImage.rows - y_int)

      if (w_int <= 0 || h_int <= 0) {
        return 0
      }

      const roi = edges.roi(new cv.Rect(x_int, y_int, w_int, h_int))
      const nonZeroCount = cv.countNonZero(roi)
      const regionPixels = w_int * h_int

      const edgeRatio = nonZeroCount / regionPixels
      const referencedEdgeRatio = 0.3
      let completenessScore = Math.min(1, edgeRatio / referencedEdgeRatio)

      if (edgeRatio < 0.05) {
        completenessScore = 0
      } else if (edgeRatio > 0.7) {
        completenessScore = Math.max(0.3, 1 - (edgeRatio - 0.3) / 2)
      }

      roi.delete()
      return completenessScore
    } finally {
      edges.delete()
    }
  } catch (error) {
    console.warn('[ImageQuality] OpenCV contour detection failed:', error)
    return 1.0
  } finally {
    gray.delete()
  }
}

/**
 * OpenCV 边界清晰度检测 (10%)
 */
function detectFaceCompletenessOpenCVSharpness(
  cv: any,
  matImage: any,
  faceBox: [number, number, number, number]
): number {

  const [x, y, w, h] = faceBox
  const x_int = Math.max(0, Math.floor(x))
  const y_int = Math.max(0, Math.floor(y))
  const w_int = Math.min(w, matImage.cols - x_int)
  const h_int = Math.min(h, matImage.rows - y_int)

  if (w_int <= 0 || h_int <= 0) {
    return 0
  }  

  let gray = matImage.roi(new cv.Rect(x_int, y_int, w_int, h_int))
  try {
    const sobelX = new cv.Mat()
    const sobelY = new cv.Mat()
    cv.Sobel(gray, sobelX, cv.CV_32F, 1, 0, 3)
    cv.Sobel(gray, sobelY, cv.CV_32F, 0, 1, 3)

    const gradient = new cv.Mat()
    try {
      try {
        cv.magnitude(sobelX, sobelY, gradient)

        const mean = cv.mean(gradient)
        const meanValue = mean[0]

        const sharpnessScore = Math.min(1, meanValue / 100)

        return sharpnessScore
      } finally {
        gradient.delete()
      }
    } finally {
      sobelX.delete()
      sobelY.delete()
    }
  } catch (error) {
    console.warn('[ImageQuality] OpenCV sharpness detection failed:', error)
    return 1.0
  } finally {
      gray.delete()
  }
}

// ==================== 清晰度检测 ====================

/**
 * 检测图像清晰度（内部函数）
 * 
 * 使用混合算法：
 * 1. 拉普拉斯方差 (Laplacian Variance) - 60%
 * 2. Sobel 梯度清晰度 - 40%
 */
function checkImageSharpness(
  cv: any,
  matImage: any,
  face: any,
  config: ImageQualityFeatures
): {
  laplacianVariance: QualityMetricResult
  gradientSharpness: QualityMetricResult
  overallScore: number
} {
  let roi = matImage
  try {
    // 提取人脸区域（如果可用）
    if (face?.box && face.box.length >= 4) {
      const [x, y, w, h] = face.box
      const padding = Math.min(w, h) * 0.1

      const x1 = Math.max(0, Math.floor(x - padding))
      const y1 = Math.max(0, Math.floor(y - padding))
      const x2 = Math.min(matImage.cols, Math.floor(x + w + padding))
      const y2 = Math.min(matImage.rows, Math.floor(y + h + padding))

      roi = matImage.roi(new cv.Rect(x1, y1, x2 - x1, y2 - y1))
    }

    // 方法 1：拉普拉斯方差
    const laplacianResult = calculateLaplacianVariance(cv, roi, config.min_laplacian_variance)

    // 方法 2：梯度清晰度
    const gradientResult = calculateGradientSharpness(cv, roi, config.min_gradient_sharpness)

    // 综合评分
    const laplacianScore = Math.min(1, laplacianResult.value / 150)
    const gradientScore = gradientResult.value
    const overallScore = 0.4 * laplacianScore + 0.6 * gradientScore

    return {
      laplacianVariance: laplacianResult,
      gradientSharpness: gradientResult,
      overallScore: Math.min(1, overallScore)
    }
  } catch (error) {
    console.error('[ImageQuality] Sharpness check error:', error)
    return {
      laplacianVariance: {
        name: '拉普拉斯方差',
        value: 0,
        threshold: config.min_laplacian_variance,
        passed: false,
        description: '检测失败'
      },
      gradientSharpness: {
        name: '梯度清晰度',
        value: 0,
        threshold: config.min_gradient_sharpness,
        passed: false,
        description: '检测失败'
      },
      overallScore: 0
    }
  } finally {
    if (roi !== matImage) {
      roi.delete()
    }
  }
}

/**
 * 计算拉普拉斯方差
 */
function calculateLaplacianVariance(
  cv: any,
  roi: any,
  minThreshold: number
): QualityMetricResult {
  try {
    if (!cv) {
      return {
        name: '拉普拉斯方差',
        value: 1,
        threshold: minThreshold,
        passed: true,
        description: 'OpenCV 不可用'
      }
    }

    let gray = roi
    if (roi.channels() !== 1) {
      gray = new cv.Mat()
      cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY)
    }

    try {
      const laplacian = new cv.Mat()
      cv.Laplacian(gray, laplacian, cv.CV_64F)

      const mean = new cv.Mat()
      const stddev = new cv.Mat()
      cv.meanStdDev(laplacian, mean, stddev)

      const variance = stddev.doubleAt(0, 0) ** 2

      laplacian.delete()
      mean.delete()
      stddev.delete()

      const passed = variance >= minThreshold

      return {
        name: '拉普拉斯方差',
        value: variance,
        threshold: minThreshold,
        passed,
        description: `拉普拉斯方差 ${variance.toFixed(1)} ${passed ? '✓' : '✗ 需 ≥' + minThreshold}`
      }
    } finally {
      if (gray !== roi) {
        gray.delete()
      }
    }
  } catch (error) {
    console.error('[ImageQuality] Laplacian calculation error:', error)
    return {
      name: '拉普拉斯方差',
      value: 0,
      threshold: minThreshold,
      passed: false,
      description: '计算失败'
    }
  }
}

/**
 * 计算 Sobel 梯度清晰度
 */
function calculateGradientSharpness(
  cv: any,
  roi: any,
  minThreshold: number
): QualityMetricResult {
  try {
    if (!cv) {
      return {
        name: '梯度清晰度',
        value: 1,
        threshold: minThreshold,
        passed: true,
        description: 'OpenCV 不可用'
      }
    }

    let gray = roi
    if (roi.channels() !== 1) {
      gray = new cv.Mat()
      cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY)
    }

    try {
      const gradX = new cv.Mat()
      const gradY = new cv.Mat()

      cv.Sobel(gray, gradX, cv.CV_64F, 1, 0, 3)
      cv.Sobel(gray, gradY, cv.CV_64F, 0, 1, 3)

      const gradMagnitude = new cv.Mat()
      cv.magnitude(gradX, gradY, gradMagnitude)

      const mean = cv.mean(gradMagnitude)
      const gradientEnergy = mean[0]

      const sharpnessScore = Math.min(1, gradientEnergy / 100)

      gradX.delete()
      gradY.delete()
      gradMagnitude.delete()

      const passed = sharpnessScore >= minThreshold

      return {
        name: '梯度清晰度',
        value: sharpnessScore,
        threshold: minThreshold,
        passed,
        description: `梯度清晰度 ${(sharpnessScore * 100).toFixed(1)}% ${passed ? '✓' : '✗ 需 ≥' + (minThreshold * 100).toFixed(0) + '%'}`
      }
    } finally {
      if (gray !== roi) {
        gray.delete()
      }
    }
  } catch (error) {
    console.error('[ImageQuality] Gradient calculation error:', error)
    return {
      name: '梯度清晰度',
      value: 0,
      threshold: minThreshold,
      passed: false,
      description: '计算失败'
    }
  }
}