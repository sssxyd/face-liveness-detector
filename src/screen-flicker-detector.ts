/**
 * 屏幕闪烁检测器
 * 
 * 核心思路：利用视频帧序列的时间特性
 * - 屏幕显示内容时有屏幕刷新频率（60/120/144Hz），导致亮度周期性变化
 * - 真实人脸没有这种周期性闪烁，变化是随机的
 * 
 * 算法：
 * 1. 收集N帧视频（15-30帧）
 * 2. 对每个像素的时间序列计算自相关（autocorrelation）
 * 3. 如果在某个周期lag发现强自相关 → 存在周期性 → 屏幕闪烁
 * 4. 统计多少像素检测到周期性，若超过阈值则判定为屏幕
 */

import { VideoFrameCollector } from "./video-frame-collector"

export interface ScreenFlickerDetectorConfig {
  // 帧缓冲区大小（帧数）
  bufferSize: number
  
  // 屏幕刷新率范围对应的帧周期范围
  // 60Hz屏幕@30fps → 周期0.5帧 (检测不了)
  // 60Hz屏幕@60fps → 周期1帧
  // 120Hz屏幕@60fps → 周期2帧
  // 120Hz屏幕@30fps → 周期4帧
  // 240Hz屏幕@30fps → 周期8帧
  // 采用保守范围：检测周期为1-8帧的周期性（支持高刷屏）
  minFlickerPeriodFrames: number  // 最小周期帧数（如1）
  maxFlickerPeriodFrames: number  // 最大周期帧数（如8，支持高端手机）
  
  // 自相关峰值阈值（0-1）
  // 值越高越严格，越低越容易误检
  correlationThreshold: number
  
  // 样本通过率阈值（多少比例的像素显示周期性特征）
  // 屏幕应该全局周期性，所以需要较高的通过率
  passingPixelRatio: number
  
  // 是否启用对数采样加快计算（每隔N个像素采样一次）
  samplingStride: number
}

export interface ScreenFlickerDetectionResult {
  isScreenCapture: boolean
  confidence: number
  
  // 检测到的主要闪烁周期（帧数）
  dominantFlickerPeriod?: number
  
  // 根据fps推断的屏幕刷新频率（Hz）
  estimatedScreenRefreshRate?: number
  
  // 通过周期性检测的像素比例
  passingPixelRatio: number
  
  // 检测期间的平均fps
  averageFps?: number
  
  // 检测涉及的样本像素数
  sampledPixelCount: number
  
  details?: {
    correlationValues: number[] // 不同lag的相关系数
    pixelFlickerCounts: Map<number, number> // lag -> 检测到的像素数
  }
}

export class ScreenFlickerDetector {
  private config: ScreenFlickerDetectorConfig
  private frameCollector: VideoFrameCollector

  constructor(frameCollector: VideoFrameCollector, config: ScreenFlickerDetectorConfig) {
    this.frameCollector = frameCollector
    this.config = config
    
    console.log('[ScreenFlicker] Detector initialized with shared FrameCollector')
  }

  /**
   * 获取当前缓冲区中的帧数
   */
  getBufferedFrameCount(): number {
    return this.frameCollector.getBufferedFrameCount()
  }

  /**
   * 执行闪烁检测分析
   * 需要至少 maxFlickerPeriodFrames + 1 帧的数据
   * 
   * 根据实际fps自动调整检测周期范围，以支持不同刷新率的屏幕
   * 根据分辨率自动调整采样密度和通过率阈值
   */
  analyze(): ScreenFlickerDetectionResult {
    // 获取帧缓冲（从 FrameCollector）
    const frames = this.frameCollector.getGrayFrames(this.config.bufferSize)

    // 检查缓冲区是否有足够的帧
    const minFramesNeeded = this.config.maxFlickerPeriodFrames + 2
    if (frames.length < minFramesNeeded) {
      console.warn(
        `[ScreenFlicker] Insufficient frames: ${frames.length} < ${minFramesNeeded}`
      )
      return {
        isScreenCapture: false,
        confidence: 0,
        passingPixelRatio: 0,
        sampledPixelCount: 0,
      }
    }

    const startTime = performance.now()

    try {
      // 根据实测fps动态调整检测周期范围
      const effectiveMaxPeriod = this.getEffectiveMaxPeriod()

      // 根据分辨率动态调整采样参数
      const resolutionAdaptation = this.getResolutionAdaptation()
      
      // 采样像素位置（使用自适应采样步长）
      const sampledPixels = this.generateSampledPixels(resolutionAdaptation.effectiveSamplingStride)
      console.log(`[ScreenFlicker] Analyzing ${sampledPixels.length} sampled pixels`)
      console.log(`[ScreenFlicker] Resolution: ${this.frameCollector.getFrameWidth()}x${this.frameCollector.getFrameHeight()}, Adaptation: stride=${resolutionAdaptation.effectiveSamplingStride}, passingRatio=${(resolutionAdaptation.effectivePassingRatio * 100).toFixed(0)}%`)
      console.log(`[ScreenFlicker] Effective period range: 1-${effectiveMaxPeriod} frames (fps: ${this.frameCollector.getAverageFps().toFixed(1)})`)

      // 对每个采样像素计算自相关
      const pixelFlickerCounts = new Map<number, number>() // lag -> 通过的像素数
      const correlationValues: number[] = []

      for (let lag = this.config.minFlickerPeriodFrames; lag <= effectiveMaxPeriod; lag++) {
        pixelFlickerCounts.set(lag, 0)
      }

      for (const pixelIdx of sampledPixels) {
        // 提取该像素在所有帧中的亮度时间序列
        const timeSeries = this.extractPixelTimeSeries(pixelIdx, frames)

        // 对时间序列计算自相关
        const autoCorr = this.computeAutoCorrelation(timeSeries, effectiveMaxPeriod)

        // 检查是否在任何周期上有强自相关
        for (let lag = this.config.minFlickerPeriodFrames; lag <= effectiveMaxPeriod; lag++) {
          if (autoCorr[lag] >= this.config.correlationThreshold) {
            const count = pixelFlickerCounts.get(lag) ?? 0
            pixelFlickerCounts.set(lag, count + 1)
          }
        }
      }

      // 找出最强的周期
      let dominantLag = 0
      let maxCount = 0
      for (const [lag, count] of pixelFlickerCounts.entries()) {
        if (count > maxCount) {
          maxCount = count
          dominantLag = lag
        }
      }

      const passingPixelRatio = sampledPixels.length > 0 ? maxCount / sampledPixels.length : 0

      // 计算置信度
      const confidence = Math.min(1, passingPixelRatio * 1.5) // 归一化
      const isScreenCapture = passingPixelRatio >= resolutionAdaptation.effectivePassingRatio

      // 根据fps和周期推断屏幕刷新频率
      let estimatedScreenRefreshRate: number | undefined
      if (dominantLag > 0 && this.frameCollector.getAverageFps() > 0) {
        // 屏幕刷新频率 = fps / lag
        // 例如：60fps视频 + 1帧周期 = 60Hz屏幕
        // 例如：60fps视频 + 2帧周期 = 120Hz屏幕
        // 例如：30fps视频 + 4帧周期 = 120Hz屏幕
        estimatedScreenRefreshRate = this.frameCollector.getAverageFps() / dominantLag
      }

      const analysisTime = performance.now() - startTime

      console.log(`[ScreenFlicker] Analysis complete in ${analysisTime.toFixed(1)}ms`)
      console.log(`[ScreenFlicker] Dominant period: ${dominantLag} frames, Passing pixels: ${(passingPixelRatio * 100).toFixed(1)}%`)
      if (estimatedScreenRefreshRate) {
        console.log(`[ScreenFlicker] Estimated screen refresh rate: ${estimatedScreenRefreshRate.toFixed(0)}Hz`)
      }
      console.log(`[ScreenFlicker] Average FPS: ${this.frameCollector.getAverageFps().toFixed(1)}, Confidence: ${confidence.toFixed(3)}, Screen: ${isScreenCapture}`)

      return {
        isScreenCapture,
        confidence,
        dominantFlickerPeriod: dominantLag > 0 ? dominantLag : undefined,
        estimatedScreenRefreshRate: estimatedScreenRefreshRate,
        passingPixelRatio,
        averageFps: this.frameCollector.getAverageFps() > 0 ? this.frameCollector.getAverageFps() : undefined,
        sampledPixelCount: sampledPixels.length,
        details: {
          correlationValues,
          pixelFlickerCounts,
        },
      }
    } catch (error) {
      console.error('[ScreenFlicker] Analysis error:', error)
      return {
        isScreenCapture: false,
        confidence: 0,
        passingPixelRatio: 0,
        sampledPixelCount: 0,
      }
    }
  }

  /**
   * 重置检测器
   * 注意：帧缓冲由 FrameCollector 管理
   */
  reset(): void {
    // 帧缓冲由 FrameCollector 管理，此处无需重置
    console.log('[ScreenFlicker] Detector state cleared (frames managed by FrameCollector)')
  }

  /**
   * 获取当前平均fps
   */
  getAverageFps(): number {
    return this.frameCollector.getAverageFps()
  }

  /**
   * 根据实测fps动态调整最大检测周期
   * 
   * 高fps摄像头 + 高刷屏的周期较短
   * 低fps摄像头 + 高刷屏的周期较长
   * 
   * 例如：
   * - 60fps摄像头：120Hz屏 → 2帧周期 → max=2
   * - 30fps摄像头：120Hz屏 → 4帧周期 → max=4
   * - 15fps摄像头：120Hz屏 → 8帧周期 → max=8
   */
  private getEffectiveMaxPeriod(): number {
    // 如果fps尚未稳定，使用配置中的最大值
    if (this.frameCollector.getAverageFps() < 10) {
      return this.config.maxFlickerPeriodFrames
    }

    // 根据fps计算合理的最大周期范围
    let effectiveMax: number

    if (this.frameCollector.getAverageFps() >= 50) {
      // 高fps摄像头（50+fps）：60Hz屏幕 → 1帧, 120Hz屏幕 → 2-3帧
      effectiveMax = 3
    } else if (this.frameCollector.getAverageFps() >= 30) {
      // 中等fps摄像头（30-50fps）：60Hz屏幕 → 1-2帧, 120Hz屏幕 → 2-4帧
      effectiveMax = 4
    } else if (this.frameCollector.getAverageFps() >= 15) {
      // 低fps摄像头（15-30fps）：60Hz屏幕 → 2-4帧, 120Hz屏幕 → 4-8帧
      effectiveMax = 8
    } else {
      // 极低fps（<15fps）：使用最大值
      effectiveMax = this.config.maxFlickerPeriodFrames
    }

    // 不超过配置中的上限
    return Math.min(effectiveMax, this.config.maxFlickerPeriodFrames)
  }

  /**
   * 根据分辨率动态调整采样参数
   * 
   * 低分辨率时：
   * - 增加采样密度（减小stride）以获得足够的样本
   * - 降低通过率阈值以适应噪声影响
   * 
   * 高分辨率时：
   * - 可以使用较大的stride来加快处理
   * - 提高通过率阈值以提高准确性
   */
  private getResolutionAdaptation(): {
    effectiveSamplingStride: number
    effectivePassingRatio: number
  } {
    const totalPixels = this.frameCollector.getFrameWidth() * this.frameCollector.getFrameHeight()
    const currentStride = this.config.samplingStride
    
    // 估计当前配置下会采样多少像素
    const estimatedSampledPixels = Math.ceil((this.frameCollector.getFrameWidth() / currentStride) * (this.frameCollector.getFrameHeight() / currentStride))
    let effectiveStride = currentStride
    let effectivePassingRatio = this.config.passingPixelRatio

    // 根据像素数调整
    if (totalPixels < 100000) {
      // 低分辨率（< 316×316）
      // 策略：采样所有像素 + 降低通过率阈值
      effectiveStride = 1
      effectivePassingRatio = 0.35 // 从0.40降低到0.35
      console.log('[ScreenFlicker] Low-res mode: stride=1, passing=35%')
    } else if (totalPixels < 300000) {
      // 中低分辨率（316×316 ~ 548×548）
      // 策略：采样每2个像素 + 略微降低阈值
      effectiveStride = 2
      effectivePassingRatio = 0.38
      console.log('[ScreenFlicker] Mid-low-res mode: stride=2, passing=38%')
    } else if (totalPixels < 900000) {
      // 中等分辨率（548×548 ~ 949×949）
      // 策略：标准采样
      effectiveStride = 2
      effectivePassingRatio = 0.40
      console.log('[ScreenFlicker] Mid-res mode: stride=2, passing=40%')
    } else {
      // 高分辨率（≥949×949，包括1080p）
      // 策略：降低采样密度 + 提高准确率要求
      effectiveStride = 3
      effectivePassingRatio = 0.42
      console.log('[ScreenFlicker] High-res mode: stride=3, passing=42%')
    }

    return {
      effectiveSamplingStride: effectiveStride,
      effectivePassingRatio: effectivePassingRatio,
    }
  }

  /**
   * 生成采样像素的索引
   * @param stride 采样步长（默认使用配置中的值）
   */
  private generateSampledPixels(stride?: number): number[] {
    const pixels: number[] = []
    const effectiveStride = stride ?? this.config.samplingStride

    for (let y = 0; y < this.frameCollector.getFrameHeight(); y += effectiveStride) {
      for (let x = 0; x < this.frameCollector.getFrameWidth(); x += effectiveStride) {
        pixels.push(y * this.frameCollector.getFrameWidth() + x)
      }
    }

    console.log(
      `[ScreenFlicker] Generated ${pixels.length} sampled pixels from ${this.frameCollector.getFrameWidth()}x${this.frameCollector.getFrameHeight()} with stride ${effectiveStride}`
    )

    return pixels
  }

  /**
   * 提取单个像素在所有帧中的亮度时间序列
   */
  private extractPixelTimeSeries(pixelIdx: number, frames: Uint8Array[]): number[] {
    const timeSeries: number[] = []
    const sourceFrames = frames

    for (const frame of sourceFrames) {
      if (pixelIdx < frame.length) {
        timeSeries.push(frame[pixelIdx])
      }
    }

    return timeSeries
  }

  /**
   * 计算时间序列的自相关系数
   * 返回在不同lag值下的相关系数（归一化到0-1）
   * 
   * @param timeSeries 像素亮度时间序列
   * @param maxLag 最大检查的lag值
   */
  private computeAutoCorrelation(timeSeries: number[], maxLag?: number): number[] {
    const n = timeSeries.length
    if (n < 2) return []

    // 使用提供的maxLag或者配置中的值
    const effectiveMaxLag = maxLag ?? this.config.maxFlickerPeriodFrames

    // 计算均值
    let mean = 0
    for (const val of timeSeries) {
      mean += val
    }
    mean /= n

    // 计算方差
    let variance = 0
    for (const val of timeSeries) {
      const diff = val - mean
      variance += diff * diff
    }
    variance /= n

    if (variance < 1e-6) {
      // 常数序列，无周期性
      return []
    }

    // 计算自相关系数
    const autoCorr: number[] = [1.0] // lag 0 总是1

    for (let lag = 1; lag <= effectiveMaxLag; lag++) {
      if (lag >= n) break

      let covariance = 0
      for (let i = 0; i < n - lag; i++) {
        const diff1 = timeSeries[i] - mean
        const diff2 = timeSeries[i + lag] - mean
        covariance += diff1 * diff2
      }
      covariance /= (n - lag)

      const correlation = covariance / variance
      autoCorr[lag] = Math.max(0, correlation) // 只保留正相关
    }

    return autoCorr
  }
}
