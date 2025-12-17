import { detectScreenColorProfile, ScreenColorDetectionConfig } from './screen-color-profile-detect'
import { detectMoirePattern, MoirePatternDetectionConfig } from './screen-moire-pattern-detect'
import { detectPixelGrid, PixelGridDetectionConfig } from './screen-pixel-grid-detect'

/**
 * 屏幕采集检测系统 - 识别是否从屏幕摄像的视频
 * 
 * 核心检测方法：
 * 1. 莫尔纹检测 (Moiré Pattern Detection) - 检测屏幕像素干涉
 * 2. 屏幕色彩检测 (Screen Color Profile Detection) - 检测屏幕特有的色彩特征
 * 3. 像素网格检测 (Pixel Grid Detection) - 直接检测屏幕像素网格
 */

export interface ScreenCaptureDetectorOptions {
  confidenceThreshold: number
  moireThreshold: number
  moireEnableDCT: boolean
  moireEnableEdgeDetection: boolean
  gridHighFreqThreshold: number
  gridStrengthThreshold: number
  colorSaturationThreshold: number
  colorRgbCorrelationThreshold: number
  colorPixelEntropyThreshold: number
  colorGradientSmoothnessThreshold: number
  colorConfidenceThreshold: number
}

/**
 * 屏幕采集检测结果
 */
export class ScreenCaptureDetectionResult {
  isScreenCapture: boolean
  confidenceScore: number
  detectionResults: Array<{
    method: string
    isScreenCapture: boolean
    confidence: number
    details: any
  }>
  riskLevel: 'low' | 'medium' | 'high'

  constructor(
    isScreenCapture: boolean,
    confidenceScore: number,
    detectionResults: Array<{
      method: string
      isScreenCapture: boolean
      confidence: number
      details: any
    }>,
    riskLevel: 'low' | 'medium' | 'high'
  ) {
    this.isScreenCapture = isScreenCapture
    this.confidenceScore = confidenceScore
    this.detectionResults = detectionResults
    this.riskLevel = riskLevel
  }

  /**
   * Get detection result message
   * Returns "success" if not screen capture, otherwise returns the reasons for detecting screen capture
   */
  getMessage(): string {
    if (!this.isScreenCapture) {
      return 'success'
    }

    // Collect all detection methods that identified screen capture
    const detectedMethods = this.detectionResults
      .filter(r => r.isScreenCapture)
      .map(r => {
        const confidence = (r.confidence * 100).toFixed(1)
        return `${r.method} (${confidence}% confidence)`
      })

    const reasons = detectedMethods.join('; ')
    return `Screen capture detected: ${reasons}. Risk level: ${this.riskLevel.toUpperCase()}`
  }
}

/**
 * 综合屏幕采集检测引擎
 */
export class ScreenCaptureDetector {
  // OpenCV instance
  private cv: any = null
  // 置信度阈值（默认 0.6）
  private confidenceThreshold: number = 0.6

  private moirePatternConfig: MoirePatternDetectionConfig
  
  private screenColorConfig: ScreenColorDetectionConfig

  private pixelGridConfig: PixelGridDetectionConfig

  constructor(options: ScreenCaptureDetectorOptions) {
    this.confidenceThreshold = options.confidenceThreshold
    this.moirePatternConfig = {
      moire_threshold: options.moireThreshold,
      enable_dct: options.moireEnableDCT,
      enable_edge_detection: options.moireEnableEdgeDetection,
    }
    this.screenColorConfig = {
      saturation_threshold: options.colorSaturationThreshold,
      rgb_correlation_threshold: options.colorRgbCorrelationThreshold,
      pixel_entropy_threshold: options.colorPixelEntropyThreshold,
      gradient_smoothness_threshold: options.colorGradientSmoothnessThreshold,
      confidence_threshold: options.colorConfidenceThreshold,
    }
    this.pixelGridConfig = {
      high_freq_threshold: options.gridHighFreqThreshold,
      grid_strength_threshold: options.gridStrengthThreshold,
    }
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
  }

  /**
   * 综合检测
   * @param frame - 原始帧（BGR格式)
   * @param gray - 灰度帧
   */
  detectScreenCapture(frame: any, gray: any): ScreenCaptureDetectionResult {
    if (!this.cv) {
      throw new Error('OpenCV instance not initialized. Call setCVInstance() first.')
    }

    const results: Array<{
      method: string
      isScreenCapture: boolean
      confidence: number
      details: any
    }> = []

      // 1. 莫尔纹检测（最可靠）
      const moireResult = detectMoirePattern(this.cv, gray, this.moirePatternConfig)
      results.push({
        method: 'Moiré Pattern Detection',
        isScreenCapture: moireResult.isScreenCapture,
        confidence: moireResult.confidence,
        details: {
          moireScore: moireResult.confidence.toFixed(3),
          threshold: this.moirePatternConfig.moire_threshold,
          usesDCT: this.moirePatternConfig.enable_dct,
          usesEdgeDetection: this.moirePatternConfig.enable_edge_detection
        }
      })

      // 3. 色彩异常检测
      const colorResult = detectScreenColorProfile(this.cv, frame, this.screenColorConfig)
      results.push({
        method: 'Screen Color Profile Detection',
        isScreenCapture: colorResult.isScreenCapture,
        confidence: colorResult.confidence,
        details: {
          confidenceScore: colorResult.confidence.toFixed(3),
          saturationMetric: colorResult.metrics.saturation,
          rgbCorrelationMetric: colorResult.metrics.rgbCorrelation,
          pixelEntropyMetric: colorResult.metrics.pixelEntropy,
          gradientSmoothnessMetric: colorResult.metrics.gradientSmoothness
        }
      })

      // 4. 像素网格检测
      const gridResult = detectPixelGrid(this.cv, gray, this.pixelGridConfig)
      results.push({
        method: 'Pixel Grid Detection',
        isScreenCapture: gridResult.isScreenCapture,
        confidence: gridResult.confidence,
        details: {
          gridStrength: gridResult.gridStrength.toFixed(3),
          period: gridResult.gridPeriod
        }
      })
      
    // 综合评分
    // 对于3种检测方法：
    // - 如果至少2种检测到屏幕采集，且平均置信度 > 阈值，则判定为屏幕采集
    // - 风险等级：3种全部检测到 = 高风险；2种检测到 = 中风险；其他 = 低风险
    const screenCaptureCount = results.filter(r => r.isScreenCapture).length
    const avgConfidence = results.length > 0 
      ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length 
      : 0

    // 使用配置的置信度阈值来判断是否是屏幕采集
    // 需要至少2种检测方法都判定为屏幕采集
    const isScreenCapture = screenCaptureCount >= 2 && avgConfidence > this.confidenceThreshold

    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    if (screenCaptureCount === 3) riskLevel = 'high'
    else if (screenCaptureCount === 2) riskLevel = 'medium'

    return new ScreenCaptureDetectionResult(
      isScreenCapture,
      isScreenCapture ? avgConfidence : 1 - avgConfidence,
      results,
      riskLevel
    )
  }
}
