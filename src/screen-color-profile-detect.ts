/**
 * 屏幕色彩特征检测模块
 * 
 * 根据屏幕特有的色彩特征检测图像是否从屏幕上拍摄：
 * 1. 色彩饱和度分析 - 屏幕图像饱和度分布特殊
 * 2. RGB通道统计 - 屏幕各通道相关性强
 * 3. 像素值分布 - 屏幕像素分布更规则
 * 4. 色彩梯度平滑性 - 屏幕渐变更均匀
 * 5. 高频纹理分析 - 屏幕莫尔纹等伪影
 * 
 * 相比自然光照环境，屏幕拍摄图像有明显的色彩特征差异
 */

import type { FaceResult } from '@vladmandic/human'

// ==================== 类型定义 ====================

/**
 * 单个色彩特征检测结果
 */
export interface ColorFeatureMetric {
  name: string           // 特征名称
  value: number         // 实际值
  threshold: number     // 判定阈值
  isScreenLike: boolean // 是否符合屏幕特征
  score: number         // 该特征的屏幕概率分数 (0-1)
  description: string   // 描述
}

/**
 * 屏幕色彩检测配置
 */
export interface ScreenColorDetectionConfig {
  // 色彩饱和度阈值（0-100%，屏幕图像通常 < 40%）
  saturation_threshold?: number
  // RGB通道相关性阈值（0-1，屏幕通常 > 0.85）
  rgb_correlation_threshold?: number
  // 像素值熵阈值（0-8，屏幕通常 < 6.5）
  pixel_entropy_threshold?: number
  // 梯度平滑性阈值（0-1，屏幕通常 > 0.7）
  gradient_smoothness_threshold?: number
  // 综合置信度阈值（0-1，用于判定是否为屏幕拍摄）
  confidence_threshold?: number
}

/**
 * 屏幕色彩特征检测完整结果
 */
export interface ScreenColorDetectionResult {
  // 是否为屏幕拍摄（基于综合置信度）
  isScreenCapture: boolean
  // 屏幕拍摄的置信度分数 (0-1)，1 表示确定为屏幕拍摄
  confidence: number
  // 各个维度的详细指标
  metrics: {
    saturation: ColorFeatureMetric
    rgbCorrelation: ColorFeatureMetric
    pixelEntropy: ColorFeatureMetric
    gradientSmoothness: ColorFeatureMetric
    colorGradientUniformity: ColorFeatureMetric
  }
  // 屏幕拍摄的可能原因
  reasons?: string[]
  // 调试信息
  debug?: Record<string, any>
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: Required<ScreenColorDetectionConfig> = {
  saturation_threshold: 40,
  rgb_correlation_threshold: 0.85,
  pixel_entropy_threshold: 6.5,
  gradient_smoothness_threshold: 0.7,
  confidence_threshold: 0.65,
}

// ==================== 主入口函数 ====================

/**
 * 检测cv.Mat图像是否从屏幕拍摄
 * 
 * 综合分析图像的色彩特征：
 * - 饱和度分布（屏幕图像饱和度低且均匀）
 * - RGB通道相关性（屏幕各通道高度相关）
 * - 像素值熵（屏幕像素分布规则性强）
 * - 梯度平滑性（屏幕色彩渐变均匀）
 * - 色彩梯度均匀性（屏幕缺乏自然纹理变化）
 * 
 * @param cv - OpenCV 对象
 * @param matImage - OpenCV Mat 对象（应为BGR格式）
 * @param imageWidth - 图片宽度
 * @param imageHeight - 图片高度
 * @param face - 人脸检测结果（可选，用于ROI提取）
 * @param config - 检测配置
 * @returns 屏幕色彩特征检测结果
 * 
 * @example
 * const result = detectScreenColorProfile(
 *   cv,
 *   matImage,
 *   1920,
 *   1080,
 *   faceResult,
 *   { saturation_threshold: 40 }
 * )
 * if (result.isScreenCapture) {
 *   console.log('检测到屏幕拍摄，置信度:', result.confidence)
 * }
 */
export function detectScreenColorProfile(
  cv: any,
  matImage: any,
  config?: Partial<ScreenColorDetectionConfig>
): ScreenColorDetectionResult {
  try {
    const finalConfig = { ...DEFAULT_CONFIG, ...config }
    
    // 提取ROI（如果配置启用且提供了人脸数据）
    let workMat = matImage

    // 计算各项色彩特征
    const saturationMetric = analyzeSaturation(cv, workMat, finalConfig)
    const rgbMetric = analyzeRGBCorrelation(cv, workMat, finalConfig)
    const entropyMetric = analyzePixelEntropy(cv, workMat, finalConfig)
    const smoothnessMetric = analyzeGradientSmoothness(cv, workMat, finalConfig)
    const uniformityMetric = analyzeColorGradientUniformity(cv, workMat, finalConfig)

    // 计算综合置信度
    const confidence = calculateScreenConfidence(
      saturationMetric,
      rgbMetric,
      entropyMetric,
      smoothnessMetric,
      uniformityMetric
    )

    const isScreenCapture = confidence >= finalConfig.confidence_threshold

    // 收集屏幕拍摄的原因
    const reasons: string[] = []
    if (saturationMetric.isScreenLike) {
      reasons.push(`色彩饱和度低 (${saturationMetric.value.toFixed(1)}%)`)
    }
    if (rgbMetric.isScreenLike) {
      reasons.push(`RGB通道相关性强 (${rgbMetric.value.toFixed(3)})`)
    }
    if (entropyMetric.isScreenLike) {
      reasons.push(`像素分布规则 (熵=${entropyMetric.value.toFixed(2)})`)
    }
    if (smoothnessMetric.isScreenLike) {
      reasons.push(`梯度过于平滑 (${smoothnessMetric.value.toFixed(3)})`)
    }
    if (uniformityMetric.isScreenLike) {
      reasons.push(`色彩梯度均匀 (${uniformityMetric.value.toFixed(3)})`)
    }

    return {
      isScreenCapture,
      confidence,
      metrics: {
        saturation: saturationMetric,
        rgbCorrelation: rgbMetric,
        pixelEntropy: entropyMetric,
        gradientSmoothness: smoothnessMetric,
        colorGradientUniformity: uniformityMetric,
      },
      reasons: reasons.length > 0 ? reasons : undefined,
    }
  } catch (error) {
    console.warn('[ScreenColorProfile] Detection failed:', error)
    // 错误时返回默认结果
    return {
      isScreenCapture: false,
      confidence: 0,
      metrics: {
        saturation: { name: 'saturation', value: 0, threshold: 0, isScreenLike: false, score: 0, description: '检测失败' },
        rgbCorrelation: { name: 'rgbCorrelation', value: 0, threshold: 0, isScreenLike: false, score: 0, description: '检测失败' },
        pixelEntropy: { name: 'pixelEntropy', value: 0, threshold: 0, isScreenLike: false, score: 0, description: '检测失败' },
        gradientSmoothness: { name: 'gradientSmoothness', value: 0, threshold: 0, isScreenLike: false, score: 0, description: '检测失败' },
        colorGradientUniformity: { name: 'colorGradientUniformity', value: 0, threshold: 0, isScreenLike: false, score: 0, description: '检测失败' },
      },
    }
  }
}

// ==================== 特征分析函数 ====================

/**
 * 分析图像的色彩饱和度
 * 屏幕图像通常饱和度较低且分布均匀
 */
function analyzeSaturation(
  cv: any,
  matImage: any,
  config: Required<ScreenColorDetectionConfig>
): ColorFeatureMetric {
  try {
    // 转换到HSV色彩空间
    const hsvMat = cv.matFromArray(matImage.rows, matImage.cols, cv.CV_8UC3)
    cv.cvtColor(matImage, hsvMat, cv.COLOR_BGR2HSV)

    // 提取饱和度通道
    const saturationMat = cv.matFromArray(matImage.rows, matImage.cols, cv.CV_8U)
    const channels = new cv.MatVector()
    cv.split(hsvMat, channels)
    channels.get(1).copyTo(saturationMat)

    // 计算饱和度统计
    const meanSaturation = cv.mean(saturationMat)[0]
    const saturationPercent = (meanSaturation / 255) * 100

    // 屏幕图像饱和度通常较低 (< 40%)
    const isScreenLike = saturationPercent < config.saturation_threshold
    const score = isScreenLike ? Math.max(0, 1 - saturationPercent / config.saturation_threshold) : 0

    hsvMat.delete()
    saturationMat.delete()
    channels.delete()

    return {
      name: 'saturation',
      value: saturationPercent,
      threshold: config.saturation_threshold,
      isScreenLike,
      score,
      description: `色彩饱和度: ${saturationPercent.toFixed(1)}%`,
    }
  } catch (error) {
    console.warn('[ScreenColor] Saturation analysis failed:', error)
    return {
      name: 'saturation',
      value: 0,
      threshold: config.saturation_threshold,
      isScreenLike: false,
      score: 0,
      description: '分析失败',
    }
  }
}

/**
 * 分析RGB通道相关性
 * 屏幕图像RGB通道高度相关（会导致去饱和）
 */
function analyzeRGBCorrelation(
  cv: any,
  matImage: any,
  config: Required<ScreenColorDetectionConfig>
): ColorFeatureMetric {
  try {
    // 分离RGB通道
    const channels = new cv.MatVector()
    cv.split(matImage, channels)

    const bChannel = channels.get(0)
    const gChannel = channels.get(1)
    const rChannel = channels.get(2)

    // 转换为浮点数用于计算
    const bFloat = cv.matFromArray(bChannel.rows, bChannel.cols, cv.CV_32F)
    const gFloat = cv.matFromArray(gChannel.rows, gChannel.cols, cv.CV_32F)
    const rFloat = cv.matFromArray(rChannel.rows, rChannel.cols, cv.CV_32F)

    bChannel.convertTo(bFloat, cv.CV_32F)
    gChannel.convertTo(gFloat, cv.CV_32F)
    rChannel.convertTo(rFloat, cv.CV_32F)

    // 计算Pearson相关系数
    const correlation = calculateCorrelation(bFloat, gFloat) * 0.33 +
                       calculateCorrelation(bFloat, rFloat) * 0.33 +
                       calculateCorrelation(gFloat, rFloat) * 0.33

    // 屏幕图像RGB相关性通常较高 (> 0.85)
    const isScreenLike = correlation > config.rgb_correlation_threshold
    const score = isScreenLike ? Math.min(1, (correlation - config.rgb_correlation_threshold) / (1 - config.rgb_correlation_threshold)) : 0

    bChannel.delete()
    gChannel.delete()
    rChannel.delete()
    bFloat.delete()
    gFloat.delete()
    rFloat.delete()
    channels.delete()

    return {
      name: 'rgbCorrelation',
      value: correlation,
      threshold: config.rgb_correlation_threshold,
      isScreenLike,
      score,
      description: `RGB通道相关性: ${correlation.toFixed(3)}`,
    }
  } catch (error) {
    console.warn('[ScreenColor] RGB correlation analysis failed:', error)
    return {
      name: 'rgbCorrelation',
      value: 0,
      threshold: config.rgb_correlation_threshold,
      isScreenLike: false,
      score: 0,
      description: '分析失败',
    }
  }
}

/**
 * 分析像素值分布的熵
 * 屏幕图像像素分布更规则，熵值较低
 */
function analyzePixelEntropy(
  cv: any,
  matImage: any,
  config: Required<ScreenColorDetectionConfig>
): ColorFeatureMetric {
  try {
    // 转换为灰度图
    const grayMat = cv.matFromArray(matImage.rows, matImage.cols, cv.CV_8U)
    cv.cvtColor(matImage, grayMat, cv.COLOR_BGR2GRAY)

    // 计算直方图
    const histSize = 256
    const ranges = [0, 256]
    const hist = cv.matFromArray(histSize, 1, cv.CV_32F)
    const mask = cv.Mat.zeros(grayMat.rows, grayMat.cols, cv.CV_8U)

    const histParams = {
      images: [grayMat],
      channels: [0],
      mask: mask,
      histSize: [histSize],
      ranges: ranges,
      accumulate: false,
    }

    // 使用OpenCV计算直方图
    const histResult = cv.calcHist(
      [grayMat],
      [0],
      new cv.Mat(),
      [histSize],
      [0, 256],
      false
    )

    // 计算熵
    const pixelCount = grayMat.rows * grayMat.cols
    let entropy = 0

    for (let i = 0; i < histSize; i++) {
      const p = histResult.data32F[i] / pixelCount
      if (p > 0) {
        entropy -= p * Math.log2(p)
      }
    }

    // 屏幕图像熵通常较低 (< 6.5)
    const isScreenLike = entropy < config.pixel_entropy_threshold
    const score = isScreenLike ? Math.max(0, 1 - entropy / config.pixel_entropy_threshold) : 0

    grayMat.delete()
    hist.delete()
    mask.delete()
    histResult.delete()

    return {
      name: 'pixelEntropy',
      value: entropy,
      threshold: config.pixel_entropy_threshold,
      isScreenLike,
      score,
      description: `像素值熵: ${entropy.toFixed(2)}`,
    }
  } catch (error) {
    console.warn('[ScreenColor] Pixel entropy analysis failed:', error)
    return {
      name: 'pixelEntropy',
      value: 0,
      threshold: config.pixel_entropy_threshold,
      isScreenLike: false,
      score: 0,
      description: '分析失败',
    }
  }
}

/**
 * 分析梯度平滑性
 * 屏幕图像梯度分布更平滑（缺乏自然纹理）
 */
function analyzeGradientSmoothness(
  cv: any,
  matImage: any,
  config: Required<ScreenColorDetectionConfig>
): ColorFeatureMetric {
  try {
    // 转换为灰度图
    const grayMat = cv.matFromArray(matImage.rows, matImage.cols, cv.CV_8U)
    cv.cvtColor(matImage, grayMat, cv.COLOR_BGR2GRAY)

    // 计算Laplacian梯度（用于检测边缘）
    const laplacianMat = cv.matFromArray(grayMat.rows, grayMat.cols, cv.CV_32F)
    cv.Laplacian(grayMat, laplacianMat, cv.CV_32F, 1, 1, 0)

    // 计算梯度标准差（低标准差表示梯度平滑）
    const mean = cv.matFromArray(1, 1, cv.CV_32F)
    const stddev = cv.matFromArray(1, 1, cv.CV_32F)
    cv.meanStdDev(laplacianMat, mean, stddev)

    const stddevValue = stddev.data32F[0]
    const maxGradient = Math.abs(cv.minMaxLoc(laplacianMat).maxVal)
    
    // 归一化到0-1范围
    const smoothness = maxGradient > 0 ? 1 - Math.min(1, stddevValue / maxGradient) : 1

    // 屏幕图像梯度平滑性通常较高 (> 0.7)
    const isScreenLike = smoothness > config.gradient_smoothness_threshold
    const score = isScreenLike ? Math.min(1, (smoothness - config.gradient_smoothness_threshold) / (1 - config.gradient_smoothness_threshold)) : 0

    grayMat.delete()
    laplacianMat.delete()
    mean.delete()
    stddev.delete()

    return {
      name: 'gradientSmoothness',
      value: smoothness,
      threshold: config.gradient_smoothness_threshold,
      isScreenLike,
      score,
      description: `梯度平滑性: ${smoothness.toFixed(3)}`,
    }
  } catch (error) {
    console.warn('[ScreenColor] Gradient smoothness analysis failed:', error)
    return {
      name: 'gradientSmoothness',
      value: 0,
      threshold: config.gradient_smoothness_threshold,
      isScreenLike: false,
      score: 0,
      description: '分析失败',
    }
  }
}

/**
 * 分析色彩梯度的均匀性
 * 屏幕图像色彩梯度在空间上分布均匀
 */
function analyzeColorGradientUniformity(
  cv: any,
  matImage: any,
  config: Required<ScreenColorDetectionConfig>
): ColorFeatureMetric {
  try {
    // 分离RGB通道并计算梯度
    const channels = new cv.MatVector()
    cv.split(matImage, channels)

    let totalUniformity = 0
    const channelCount = 3

    for (let i = 0; i < channelCount; i++) {
      const channel = channels.get(i)
      
      // 计算Sobel梯度
      const gradX = cv.matFromArray(channel.rows, channel.cols, cv.CV_32F)
      const gradY = cv.matFromArray(channel.rows, channel.cols, cv.CV_32F)
      
      cv.Sobel(channel, gradX, cv.CV_32F, 1, 0, 3)
      cv.Sobel(channel, gradY, cv.CV_32F, 0, 1, 3)

      // 计算梯度幅值
      const magnitude = cv.matFromArray(channel.rows, channel.cols, cv.CV_32F)
      
      for (let row = 0; row < channel.rows; row++) {
        for (let col = 0; col < channel.cols; col++) {
          const gx = gradX.data32F[row * channel.cols + col]
          const gy = gradY.data32F[row * channel.cols + col]
          magnitude.data32F[row * channel.cols + col] = Math.sqrt(gx * gx + gy * gy)
        }
      }

      // 计算梯度的标准差（低标准差表示均匀）
      const mean = cv.matFromArray(1, 1, cv.CV_32F)
      const stddev = cv.matFromArray(1, 1, cv.CV_32F)
      cv.meanStdDev(magnitude, mean, stddev)

      const meanValue = mean.data32F[0]
      const stddevValue = stddev.data32F[0]
      
      // 变异系数（CV = 标准差 / 平均值）
      const cv_value = meanValue > 0 ? stddevValue / meanValue : 0
      // 均匀性 = 1 - CV（CV越小，均匀性越好）
      const uniformity = Math.max(0, 1 - Math.min(1, cv_value))
      totalUniformity += uniformity

      gradX.delete()
      gradY.delete()
      magnitude.delete()
      mean.delete()
      stddev.delete()
    }

    const avgUniformity = totalUniformity / channelCount
    channels.delete()

    // 屏幕图像梯度均匀性通常较高 (> 0.65)
    const threshold = 0.65
    const isScreenLike = avgUniformity > threshold
    const score = isScreenLike ? Math.min(1, (avgUniformity - threshold) / (1 - threshold)) : 0

    return {
      name: 'colorGradientUniformity',
      value: avgUniformity,
      threshold,
      isScreenLike,
      score,
      description: `色彩梯度均匀性: ${avgUniformity.toFixed(3)}`,
    }
  } catch (error) {
    console.warn('[ScreenColor] Color gradient uniformity analysis failed:', error)
    return {
      name: 'colorGradientUniformity',
      value: 0,
      threshold: 0.65,
      isScreenLike: false,
      score: 0,
      description: '分析失败',
    }
  }
}

// ==================== 辅助函数 ====================

/**
 * 计算两个矩阵之间的Pearson相关系数
 */
function calculateCorrelation(mat1: any, mat2: any): number {
  try {
    const mean1Val = cv.mean(mat1)[0]
    const mean2Val = cv.mean(mat2)[0]

    let numerator = 0
    let denominator1 = 0
    let denominator2 = 0

    const total = mat1.rows * mat1.cols

    for (let i = 0; i < total; i++) {
      const val1 = mat1.data32F[i] - mean1Val
      const val2 = mat2.data32F[i] - mean2Val

      numerator += val1 * val2
      denominator1 += val1 * val1
      denominator2 += val2 * val2
    }

    const correlation = numerator / Math.sqrt(denominator1 * denominator2)
    return isNaN(correlation) ? 0 : Math.abs(correlation)
  } catch (error) {
    console.warn('[ScreenColor] Correlation calculation failed:', error)
    return 0
  }
}

/**
 * 从人脸位置提取ROI
 */
function extractFaceROI(cv: any, matImage: any, face: FaceResult): any {
  try {
    if (!face.box) return matImage

    const [x, y, width, height] = face.box
    const roi = new cv.Rect(
      Math.max(0, Math.floor(x)),
      Math.max(0, Math.floor(y)),
      Math.min(matImage.cols - Math.floor(x), Math.ceil(width)),
      Math.min(matImage.rows - Math.floor(y), Math.ceil(height))
    )

    return matImage.roi(roi)
  } catch (error) {
    console.warn('[ScreenColor] Face ROI extraction failed:', error)
    return matImage
  }
}

/**
 * 从图像中心提取ROI（约80%区域）
 */
function extractCenterROI(cv: any, matImage: any): any {
  try {
    const width = Math.floor(matImage.cols * 0.8)
    const height = Math.floor(matImage.rows * 0.8)
    const x = Math.floor((matImage.cols - width) / 2)
    const y = Math.floor((matImage.rows - height) / 2)

    const roi = new cv.Rect(x, y, width, height)
    return matImage.roi(roi)
  } catch (error) {
    console.warn('[ScreenColor] Center ROI extraction failed:', error)
    return matImage
  }
}

/**
 * 计算综合屏幕拍摄置信度
 * 基于各项特征指标的加权平均
 */
function calculateScreenConfidence(
  saturation: ColorFeatureMetric,
  rgbCorrelation: ColorFeatureMetric,
  entropy: ColorFeatureMetric,
  smoothness: ColorFeatureMetric,
  uniformity: ColorFeatureMetric
): number {
  // 加权平均：各特征的贡献度
  const weights = {
    saturation: 0.25,        // 饱和度：25%
    rgbCorrelation: 0.25,    // RGB相关性：25%
    entropy: 0.20,           // 像素熵：20%
    smoothness: 0.15,        // 梯度平滑性：15%
    uniformity: 0.15,        // 梯度均匀性：15%
  }

  const confidence =
    saturation.score * weights.saturation +
    rgbCorrelation.score * weights.rgbCorrelation +
    entropy.score * weights.entropy +
    smoothness.score * weights.smoothness +
    uniformity.score * weights.uniformity

  return Math.min(1, Math.max(0, confidence))
}
