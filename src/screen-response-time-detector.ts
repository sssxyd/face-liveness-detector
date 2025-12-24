/**
 * 屏幕响应时间检测器 - 区分墨水屏和LCD/OLED
 * 
 * 核心原理：
 * - LCD/OLED: 像素状态变化极快 (<5ms)，直接从0跳到255
 * - 墨水屏: 像素状态变化缓慢 (200-500ms)，需要多帧逐渐过渡
 * 
 * 检测方法：
 * 1. 收集视频帧，跟踪像素值变化
 * 2. 测量从初始值到最终值需要多少帧
 * 3. 根据fps计算实际响应时间
 * 4. 响应时间 > 100ms → 墨水屏
 */

import { VideoFrameCollector } from "./video-frame-collector"

export interface ScreenResponseTimeDetectorConfig {
  // 帧缓冲区大小
  bufferSize: number

  // 像素值变化的最小阈值（忽略小变化）
  minPixelDelta: number

  // 响应时间判断阈值
  einkResponseTimeThreshold: number // 毫秒，>此值判定为墨水屏

  // 采样参数：减少计算量
  samplingStride: number

  // 像素通过率：多少比例的像素显示缓慢响应
  passingPixelRatio: number
}

export interface ScreenResponseTimeDetectionResult {
  isScreenCapture: boolean // 墨水屏判定
  confidence: number

  // 响应时间统计
  averageResponseTimeMs?: number // 平均响应时间
  maxResponseTimeMs?: number     // 最大响应时间
  minResponseTimeMs?: number     // 最小响应时间

  // 通过缓慢响应检测的像素比例
  passingPixelRatio: number

  // 检测涉及的样本像素数
  sampledPixelCount: number

  // 屏幕类型推断
  estimatedScreenType?: 'lcd' | 'oled' | 'eink' | 'unknown'

  // 平均fps
  averageFps?: number

  details?: {
    responseTimes: number[]      // 各采样像素的响应时间
    pixelResponsiveness: Map<number, number> // pixelIdx -> responseTime
  }
}

export class ScreenResponseTimeDetector {
  private config: ScreenResponseTimeDetectorConfig
  private frameCollector: VideoFrameCollector

  constructor(frameCollector: VideoFrameCollector, config: ScreenResponseTimeDetectorConfig) {
    this.frameCollector = frameCollector
    this.config = config
  }

  /**
   * 获取当前缓冲区中的帧数
   */
  getBufferedFrameCount(): number {
    return this.frameCollector.getBufferedFrameCount()
  }

  /**
   * 执行响应时间检测分析
   * 
   * 寻找像素值快速变化的情况，测量变化速度
   * 缓慢变化 → 墨水屏
   * 快速变化 → LCD/OLED
   */
  analyze(): ScreenResponseTimeDetectionResult {
    // 获取帧缓冲
    const frames = this.frameCollector.getGrayFrames(this.config.bufferSize)

    // 需要足够的帧来测量变化
    const minFramesNeeded = 10
    if (frames.length < minFramesNeeded) {
      console.warn(`[ResponseTime] Insufficient frames: ${frames.length} < ${minFramesNeeded}`)
      return {
        isScreenCapture: false,
        confidence: 0,
        passingPixelRatio: 0,
        sampledPixelCount: 0,
      }
    }

    const startTime = performance.now()

    try {
      // 生成采样像素列表
      const sampledPixels = this.generateSampledPixels()
      console.log(`[ResponseTime] Analyzing ${sampledPixels.length} sampled pixels`)
      console.log(`[ResponseTime] Resolution: ${this.frameCollector.getFrameWidth()}x${this.frameCollector.getFrameHeight()}`)

      const responseTimes: number[] = []
      const pixelResponsiveness = new Map<number, number>()

      // 对每个采样像素测量响应时间
      for (const pixelIdx of sampledPixels) {
        const responseTime = this.measurePixelResponseTime(pixelIdx, frames)

        if (responseTime > 0) {
          responseTimes.push(responseTime)
          pixelResponsiveness.set(pixelIdx, responseTime)
        }
      }

      // 统计响应时间
      if (responseTimes.length === 0) {
        console.warn('[ResponseTime] No significant pixel changes detected')
        return {
          isScreenCapture: false,
          confidence: 0,
          passingPixelRatio: 0,
          sampledPixelCount: sampledPixels.length,
        }
      }

      // 计算响应时间统计
      responseTimes.sort((a, b) => a - b)
      const minResponseTime = responseTimes[0]
      const maxResponseTime = responseTimes[responseTimes.length - 1]
      const medianResponseTime = responseTimes[Math.floor(responseTimes.length / 2)]
      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length

      // 统计缓慢响应的像素比例
      const slowResponsivePixels = responseTimes.filter(
        t => t > this.config.einkResponseTimeThreshold
      ).length
      const passingPixelRatio = slowResponsivePixels / responseTimes.length

      // 判定屏幕类型
      let estimatedScreenType: 'lcd' | 'oled' | 'eink' | 'unknown' = 'unknown'
      let isScreenCapture = false

      if (averageResponseTime > this.config.einkResponseTimeThreshold) {
        // 响应时间长 → 墨水屏
        estimatedScreenType = 'eink'
        isScreenCapture = passingPixelRatio >= this.config.passingPixelRatio
      } else if (averageResponseTime < 20) {
        // 响应时间极短 → LCD/OLED
        estimatedScreenType = 'lcd' // 无法区分LCD和OLED
      } else {
        estimatedScreenType = 'unknown'
      }

      // 置信度计算
      const confidence = Math.min(1, passingPixelRatio * 1.5)

      const analysisTime = performance.now() - startTime

      console.log(`[ResponseTime] Analysis complete in ${analysisTime.toFixed(1)}ms`)
      console.log(`[ResponseTime] Response times: min=${minResponseTime.toFixed(1)}ms, median=${medianResponseTime.toFixed(1)}ms, max=${maxResponseTime.toFixed(1)}ms, avg=${averageResponseTime.toFixed(1)}ms`)
      console.log(`[ResponseTime] Slow pixels (>${this.config.einkResponseTimeThreshold}ms): ${(passingPixelRatio * 100).toFixed(1)}%`)
      console.log(`[ResponseTime] Screen type: ${estimatedScreenType}, Confidence: ${confidence.toFixed(3)}, IsCapture: ${isScreenCapture}`)

      return {
        isScreenCapture,
        confidence,
        averageResponseTimeMs: averageResponseTime,
        maxResponseTimeMs: maxResponseTime,
        minResponseTimeMs: minResponseTime,
        passingPixelRatio,
        sampledPixelCount: responseTimes.length,
        estimatedScreenType,
        averageFps: this.frameCollector.getAverageFps() > 0 ? this.frameCollector.getAverageFps() : undefined,
        details: {
          responseTimes,
          pixelResponsiveness,
        },
      }
    } catch (error) {
      console.error('[ResponseTime] Analysis error:', error)
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
    console.log('[ResponseTime] Detector state cleared (frames managed by FrameCollector)')
  }

  /**
   * 测量单个像素的响应时间
   * 
   * 跟踪该像素的值变化，找出最大的变化
   * 计算这个变化需要多少帧（时间）完成
   */
  private measurePixelResponseTime(pixelIdx: number, frames: Uint8Array[]): number {
    const sourceFrames = frames
    
    if (sourceFrames.length === 0 || pixelIdx >= sourceFrames[0].length) {
      return -1
    }

    // 提取像素时间序列
    const timeSeries = sourceFrames.map((f: Uint8Array) => f[pixelIdx])

    // 找出最大的像素值变化
    let maxDelta = 0
    let maxDeltaStartFrame = 0
    let maxDeltaEndFrame = 0

    for (let i = 0; i < timeSeries.length - 1; i++) {
      const delta = Math.abs(timeSeries[i + 1] - timeSeries[i])
      if (delta > maxDelta) {
        maxDelta = delta
        maxDeltaStartFrame = i
        maxDeltaEndFrame = i + 1
      }
    }

    // 如果最大变化太小，忽略
    if (maxDelta < this.config.minPixelDelta) {
      return -1
    }

    // 找出完整的变化过程（从开始到结束需要多少帧）
    const initialValue = timeSeries[maxDeltaStartFrame]
    const finalValue = timeSeries[maxDeltaEndFrame]
    const direction = finalValue > initialValue ? 1 : -1

    let responseFrameCount = 1
    let currentValue = initialValue

    if (direction > 0) {
      // 上升过程
      for (let i = maxDeltaStartFrame + 1; i < timeSeries.length; i++) {
        if (Math.abs(timeSeries[i] - finalValue) < this.config.minPixelDelta / 2) {
          // 到达目标值
          responseFrameCount = i - maxDeltaStartFrame
          break
        }
      }
    } else {
      // 下降过程
      for (let i = maxDeltaStartFrame + 1; i < timeSeries.length; i++) {
        if (Math.abs(timeSeries[i] - finalValue) < this.config.minPixelDelta / 2) {
          responseFrameCount = i - maxDeltaStartFrame
          break
        }
      }
    }

    // 转换为毫秒
    const actualFps = this.frameCollector.getAverageFps()
    const msPerFrame = 1000 / actualFps
    const responseTimeMs = responseFrameCount * msPerFrame

    return responseTimeMs
  }

  /**
   * 生成采样像素列表
   */
  private generateSampledPixels(): number[] {
    const pixels: number[] = []
    const stride = this.config.samplingStride

    for (let y = 0; y < this.frameCollector.getFrameHeight(); y += stride) {
      for (let x = 0; x < this.frameCollector.getFrameWidth(); x += stride) {
        pixels.push(y * this.frameCollector.getFrameWidth() + x)
      }
    }

    console.log(
      `[ResponseTime] Generated ${pixels.length} sampled pixels from ${this.frameCollector.getFrameWidth()}x${this.frameCollector.getFrameHeight()} with stride ${stride}`
    )

    return pixels
  }
}
