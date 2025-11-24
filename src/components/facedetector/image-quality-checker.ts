/**
 * 人脸图像质量检测模块 (统一版)
 * 
 * 综合检测人脸图像的：
 * 1. 完整度检测 - 人脸是否完整在框内
 * 2. 模糊度检测 - 图像是否清晰
 * 3. 轮廓清晰度 - 轮廓的连通性和完整度
 * 
 * 使用混合检测策略，结合 Human.js 和 OpenCV WASM 优势
 */

import { FaceResult } from '@vladmandic/human'
import { cv } from '@dalongrong/opencv-wasm'

// ==================== 接口定义 ====================

/**
 * 图像质量检测配置接口
 */
export interface ImageQualityCheckConfig {
  // 完整度配置
  requireFullFaceInBounds?: boolean
  useOpenCVEnhancement?: boolean
  
  // 模糊度配置
  minLaplacianVariance?: number
  minGradientSharpness?: number
  minBlurScore?: number
}

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

// 默认配置
const DEFAULT_CONFIG: Required<ImageQualityCheckConfig> = {
  requireFullFaceInBounds: false,
  useOpenCVEnhancement: true,
  minLaplacianVariance: 100,
  minGradientSharpness: 0.3,
  minBlurScore: 0.6
}

// ==================== 主入口函数 ====================

/**
 * 检测图像质量（完整度 + 清晰度）
 * 
 * 综合检测：
 * - 人脸完整度（Human.js边界 + OpenCV轮廓）
 * - 图像清晰度（拉普拉斯方差 + Sobel梯度）
 * 
 * @param canvas - 图像源（画布元素）
 * @param face - 人脸检测结果
 * @param imageWidth - 图片宽度
 * @param imageHeight - 图片高度
 * @param config - 检测配置（可选）
 * @returns 综合质量检测结果
 * 
 * @example
 * const result = checkImageQuality(canvas, face, 640, 640)
 * if (result.passed) {
 *   console.log('图像质量良好')
 * } else {
 *   console.log('质量问题：', {
 *     completeness: result.completenessReasons,
 *     blur: result.blurReasons
 *   })
 * }
 */
export function checkImageQuality(
  canvas: HTMLCanvasElement,
  face: FaceResult,
  imageWidth: number,
  imageHeight: number,
  config?: ImageQualityCheckConfig
): ImageQualityResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  const metrics: Record<string, QualityMetricResult> = {}
  const completenessReasons: string[] = []
  const blurReasons: string[] = []

  // ===== 第一部分：完整度检测 =====
  const completenessResult = checkFaceCompletenessInternal(
    canvas,
    face,
    imageWidth,
    imageHeight,
    finalConfig
  )
  metrics.completeness = completenessResult as any
  if (!completenessResult.passed) {
    completenessReasons.push(completenessResult.description)
  }

  // ===== 第二部分：清晰度检测 =====
  const blurResult = checkImageSharpness(canvas, face, finalConfig)
  metrics.laplacianVariance = blurResult.laplacianVariance
  metrics.gradientSharpness = blurResult.gradientSharpness
  if (!blurResult.laplacianVariance.passed) {
    blurReasons.push(blurResult.laplacianVariance.description)
  }
  if (!blurResult.gradientSharpness.passed) {
    blurReasons.push(blurResult.gradientSharpness.description)
  }

  // ===== 第三部分：综合评分 =====
  // 加权：完整度(50%) + 清晰度(50%)
  const completenessScore = Math.min(1, completenessResult.value)
  const sharpnessScore = blurResult.overallScore
  const overallScore = completenessScore * 0.5 + sharpnessScore * 0.5

  const overallMetric: QualityMetricResult = {
    name: '综合图像质量',
    value: overallScore,
    threshold: 0.8,
    passed: overallScore >= 0.8,
    description: `综合质量评分 ${(overallScore * 100).toFixed(1)}% (完整度: ${(completenessScore * 100).toFixed(0)}% | 清晰度: ${(sharpnessScore * 100).toFixed(0)}%)`
  }
  metrics.overallQuality = overallMetric

  const passed = overallScore >= 0.8

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
  canvas: HTMLCanvasElement,
  face: any,
  imageWidth: number,
  imageHeight: number,
  config: Required<ImageQualityCheckConfig>
): QualityMetricResult {
  // 第一层：Human.js 边界检测 (60%)
  let humanScore = calculateHumanCompleteness(face, imageWidth, imageHeight, config.requireFullFaceInBounds)

  // 第二、三层：OpenCV 增强检测
  let opencvContourScore = 1.0
  let opencvSharpnessScore = 1.0

  if (config.useOpenCVEnhancement && canvas) {
    try {
      if (face?.box) {
        opencvContourScore = detectFaceCompletenessOpenCVContour(canvas, face.box)
        opencvSharpnessScore = detectFaceCompletenessOpenCVSharpness(canvas, face.box)
      }
    } catch (error) {
      console.warn('[ImageQuality] OpenCV enhancement failed:', error)
    }
  }

  // 组合评分
  const completenessScore =
    humanScore * 0.6 +
    opencvContourScore * 0.3 +
    opencvSharpnessScore * 0.1

  return {
    name: '人脸完整度',
    value: completenessScore,
    threshold: config.requireFullFaceInBounds ? 1.0 : 0.8,
    passed: completenessScore >= (config.requireFullFaceInBounds ? 1.0 : 0.8),
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
      completenessScore = 0
    }
  }

  return completenessScore
}

/**
 * OpenCV 轮廓检测 (30%)
 */
function detectFaceCompletenessOpenCVContour(
  canvas: HTMLCanvasElement,
  faceBox: [number, number, number, number]
): number {
  try {
    if (!cv) {
      console.warn('[ImageQuality] OpenCV not available')
      return 1.0
    }
    
    const img = cv.imread(canvas)
    const gray = new cv.Mat()

    try {
      cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY)

      const edges = new cv.Mat()
      cv.Canny(gray, edges, 50, 150)

      try {
        const [x, y, w, h] = faceBox
        const x_int = Math.max(0, Math.floor(x))
        const y_int = Math.max(0, Math.floor(y))
        const w_int = Math.min(w, canvas.width - x_int)
        const h_int = Math.min(h, canvas.height - y_int)

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
    } finally {
      img.delete()
      gray.delete()
    }
  } catch (error) {
    console.warn('[ImageQuality] OpenCV contour detection failed:', error)
    return 1.0
  }
}

/**
 * OpenCV 边界清晰度检测 (10%)
 */
function detectFaceCompletenessOpenCVSharpness(
  canvas: HTMLCanvasElement,
  faceBox: [number, number, number, number]
): number {
  try {
    if (!cv) {
      console.warn('[ImageQuality] OpenCV not available')
      return 1.0
    }

    const img = cv.imread(canvas)
    const [x, y, w, h] = faceBox
    const x_int = Math.max(0, Math.floor(x))
    const y_int = Math.max(0, Math.floor(y))
    const w_int = Math.min(w, canvas.width - x_int)
    const h_int = Math.min(h, canvas.height - y_int)

    if (w_int <= 0 || h_int <= 0) {
      return 0
    }

    const faceRegion = img.roi(new cv.Rect(x_int, y_int, w_int, h_int))
    const gray = new cv.Mat()

    try {
      cv.cvtColor(faceRegion, gray, cv.COLOR_RGBA2GRAY)

      const sobelX = new cv.Mat()
      const sobelY = new cv.Mat()

      try {
        cv.Sobel(gray, sobelX, cv.CV_32F, 1, 0, 3)
        cv.Sobel(gray, sobelY, cv.CV_32F, 0, 1, 3)

        const gradient = new cv.Mat()

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
    } finally {
      faceRegion.delete()
      gray.delete()
    }
  } catch (error) {
    console.warn('[ImageQuality] OpenCV sharpness detection failed:', error)
    return 1.0
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
  canvas: HTMLCanvasElement,
  face: any,
  config: Required<ImageQualityCheckConfig>
): {
  laplacianVariance: QualityMetricResult
  gradientSharpness: QualityMetricResult
  overallScore: number
} {
  try {
    if (!cv) {
      console.warn('[ImageQuality] OpenCV not available for sharpness check')
      return {
        laplacianVariance: {
          name: '拉普拉斯方差',
          value: 1,
          threshold: config.minLaplacianVariance,
          passed: true,
          description: '无法检测（OpenCV不可用），跳过检查'
        },
        gradientSharpness: {
          name: '梯度清晰度',
          value: 1,
          threshold: config.minGradientSharpness,
          passed: true,
          description: '无法检测（OpenCV不可用），跳过检查'
        },
        overallScore: 1.0
      }
    }

    const img = cv.imread(canvas)

    try {
      // 提取人脸区域（如果可用）
      let roi = img
      if (face?.box && face.box.length >= 4) {
        const [x, y, w, h] = face.box
        const padding = Math.min(w, h) * 0.1

        const x1 = Math.max(0, Math.floor(x - padding))
        const y1 = Math.max(0, Math.floor(y - padding))
        const x2 = Math.min(img.cols, Math.floor(x + w + padding))
        const y2 = Math.min(img.rows, Math.floor(y + h + padding))

        roi = img.roi(new cv.Rect(x1, y1, x2 - x1, y2 - y1))
      }

      try {
        // 方法 1：拉普拉斯方差
        const laplacianResult = calculateLaplacianVariance(roi, cv, config.minLaplacianVariance)

        // 方法 2：梯度清晰度
        const gradientResult = calculateGradientSharpness(roi, cv, config.minGradientSharpness)

        // 综合评分
        const laplacianScore = Math.min(1, laplacianResult.value / 200)
        const gradientScore = gradientResult.value
        const overallScore = 0.6 * laplacianScore + 0.4 * gradientScore

        return {
          laplacianVariance: laplacianResult,
          gradientSharpness: gradientResult,
          overallScore: Math.min(1, overallScore)
        }
      } finally {
        if (roi !== img) {
          roi.delete()
        }
      }
    } finally {
      img.delete()
    }
  } catch (error) {
    console.error('[ImageQuality] Sharpness check error:', error)
    return {
      laplacianVariance: {
        name: '拉普拉斯方差',
        value: 0,
        threshold: config.minLaplacianVariance,
        passed: false,
        description: '检测失败'
      },
      gradientSharpness: {
        name: '梯度清晰度',
        value: 0,
        threshold: config.minGradientSharpness,
        passed: false,
        description: '检测失败'
      },
      overallScore: 0
    }
  }
}

/**
 * 计算拉普拉斯方差
 */
function calculateLaplacianVariance(
  roi: any,
  cv: any,
  minThreshold: number
): QualityMetricResult {
  try {
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
  roi: any,
  cv: any,
  minThreshold: number
): QualityMetricResult {
  try {
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

      const sharpnessScore = Math.min(1, gradientEnergy / 150)

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
