/**
 * 优化版屏幕采集检测器 - 快速检测策略
 * 
 * 核心思想：级联检测 (Cascade Detection)
 * - 按检测速度从快到慢排序：RGB发光 → 色彩特征 → 莫尔纹
 * - 尽早排除，减少不必要的计算
 * - 平衡精准度和速度
 */

import { detectScreenColorProfile, ScreenColorDetectionConfig } from './screen-color-profile-detect'
import { detectMoirePattern, MoirePatternDetectionConfig } from './screen-moire-pattern-detect'
import { detectRGBEmissionPattern, RgbEmissionDetectionConfig } from './screen-rgb-emission-detect'
import { ScreenFlickerDetector, ScreenFlickerDetectorConfig } from './screen-flicker-detector'
import { ScreenResponseTimeDetector, ScreenResponseTimeDetectorConfig } from './screen-response-time-detector'
import { DLPColorWheelDetector, DLPColorWheelDetectorConfig } from './dlp-color-wheel-detector'
import { OpticalDistortionDetector, OpticalDistortionDetectorConfig } from './optical-distortion-detector'
import { ScreenFrameCollector } from './screen-frame-collector'

/**
 * 详细的级联检测过程日志
 */
export interface CascadeDetectionDebugInfo {
  startTime: number
  endTime: number
  totalTimeMs: number
  
  // 各阶段的执行状态
  stages: Array<{
    method: string
    completed: boolean
    timeMs: number
    result: {
      isScreenCapture: boolean
      confidence: number
    } | null
    reason?: string // 提前终止的原因
  }>
  
  // 最终决策
  finalDecision: {
    isScreenCapture: boolean
    confidenceScore: number
    decisiveMethod?: string // 哪个方法决定了最终结果
  }
}

/**
 * 优化版屏幕采集检测结果
 */
export class ScreenCaptureDetectionResult {
  isScreenCapture: boolean
  confidenceScore: number
  
  // 实际执行的检测方法结果
  executedMethods: Array<{
    method: string
    isScreenCapture: boolean
    confidence: number
    details?: any
  }>
  
  // 未执行的方法（因为已经有结论）
  skippedMethods?: string[]
  
  riskLevel: 'low' | 'medium' | 'high'
  processingTimeMs: number
  debug?: CascadeDetectionDebugInfo

  constructor(
    isScreenCapture: boolean,
    confidenceScore: number,
    executedMethods: Array<{
      method: string
      isScreenCapture: boolean
      confidence: number
      details?: any
    }>,
    riskLevel: 'low' | 'medium' | 'high',
    processingTimeMs: number,
    skippedMethods?: string[],
    debug?: CascadeDetectionDebugInfo
  ) {
    this.isScreenCapture = isScreenCapture
    this.confidenceScore = confidenceScore
    this.executedMethods = executedMethods
    this.skippedMethods = skippedMethods
    this.riskLevel = riskLevel
    this.processingTimeMs = processingTimeMs
    this.debug = debug
  }

  getMessage(): string {
    const timeInfo = ` (${this.processingTimeMs}ms)`
    
    if (!this.isScreenCapture) {
      return `success${timeInfo}`
    }

    const detectedMethods = this.executedMethods
      .filter(m => m.isScreenCapture)
      .map(m => `${m.method} (${(m.confidence * 100).toFixed(0)}%)`)
      .join('; ')

    return `Screen capture detected: ${detectedMethods}. Risk: ${this.riskLevel.toUpperCase()}${timeInfo}`
  }
}

export interface ScreenCaptureDetectorOptions {
  // 预期的视频帧率
  fpsEstimate?: number

  // 视频闪烁检测配置
  flickerBufferSize?: number
  flickerFpsEstimate?: number
  flickerMinPeriod?: number
  flickerMaxPeriod?: number
  flickerCorrelationThreshold?: number
  flickerPassingPixelRatio?: number
  flickerSamplingStride?: number

  // 响应时间检测配置（墨水屏）
  responseTimeBufferSize?: number
  responseTimeFpsEstimate?: number
  responseTimeThreshold?: number
  responseTimePassingPixelRatio?: number

  // DLP色轮检测配置 (DLP投影仪)
  dlpColorWheelBufferSize?: number
  dlpEdgeThreshold?: number
  dlpChannelSeparationThreshold?: number
  dlpConfidenceThreshold?: number

  // 光学畸变检测配置 (其他光学投影仪)
  opticalDistortionBufferSize?: number
  opticalKeystoneThreshold?: number
  opticalBarrelThreshold?: number
  opticalChromaticThreshold?: number
  opticalVignetteThreshold?: number
}

/**
 * ScreenCaptureDetectorOptions 的默认值
 */
const DEFAULT_SCREEN_CAPTURE_DETECTOR_OPTIONS: Required<ScreenCaptureDetectorOptions> = {
  fpsEstimate: 30,
  flickerBufferSize: 30,
  flickerFpsEstimate: 30,
  flickerMinPeriod: 1,
  flickerMaxPeriod: 8,
  flickerCorrelationThreshold: 0.65,
  flickerPassingPixelRatio: 0.40,
  flickerSamplingStride: 2,
  responseTimeBufferSize: 60,
  responseTimeFpsEstimate: 30,
  responseTimeThreshold: 100,
  responseTimePassingPixelRatio: 0.45,
  dlpColorWheelBufferSize: 30,
  dlpEdgeThreshold: 80,
  dlpChannelSeparationThreshold: 2,
  dlpConfidenceThreshold: 0.65,
  opticalDistortionBufferSize: 1,
  opticalKeystoneThreshold: 0.15,
  opticalBarrelThreshold: 0.10,
  opticalChromaticThreshold: 3.0,
  opticalVignetteThreshold: 0.20,
}

/**
 * 优化版屏幕采集检测引擎
 * 
 * 使用级联检测策略，支持多种模式以平衡速度和精准度
 */
export class ScreenCaptureDetector {
  private cv: any = null
  
  private frameCollector: ScreenFrameCollector
  private flickerDetector: ScreenFlickerDetector
  private responseTimeDetector: ScreenResponseTimeDetector
  private dlpColorWheelDetector: DLPColorWheelDetector
  private opticalDistortionDetector: OpticalDistortionDetector

  constructor(options: Partial<ScreenCaptureDetectorOptions> = {}) {
    // 合并用户提供的选项和默认值
    const config = { ...DEFAULT_SCREEN_CAPTURE_DETECTOR_OPTIONS, ...options }

    const bufferSize = Math.max(
      config.flickerBufferSize,
      config.responseTimeBufferSize,
      config.dlpColorWheelBufferSize,
      config.opticalDistortionBufferSize,
      config.fpsEstimate
    )

    // 创建公共帧采集器
    this.frameCollector = new ScreenFrameCollector({
      bufferSize: bufferSize,
      fpsEstimate: config.fpsEstimate,
    })

    // 初始化视频闪烁检测器 (LCD/OLED)
    this.flickerDetector = new ScreenFlickerDetector(this.frameCollector, {
      bufferSize: config.flickerBufferSize,
      minFlickerPeriodFrames: config.flickerMinPeriod,
      maxFlickerPeriodFrames: config.flickerMaxPeriod,
      correlationThreshold: config.flickerCorrelationThreshold,
      passingPixelRatio: config.flickerPassingPixelRatio,
      samplingStride: config.flickerSamplingStride,
    })

    // 初始化响应时间检测器（墨水屏）
    this.responseTimeDetector = new ScreenResponseTimeDetector(this.frameCollector, {
      bufferSize: config.responseTimeBufferSize,
      minPixelDelta: 30,
      einkResponseTimeThreshold: config.responseTimeThreshold,
      samplingStride: 2,
      passingPixelRatio: config.responseTimePassingPixelRatio,
    })

    // 初始化DLP色轮检测器 (DLP投影仪)
    this.dlpColorWheelDetector = new DLPColorWheelDetector(this.frameCollector, {
      bufferSize: config.dlpColorWheelBufferSize,
      edgeThreshold: config.dlpEdgeThreshold,
      minChannelSeparationPixels: config.dlpChannelSeparationThreshold,
      separationConfidenceThreshold: config.dlpConfidenceThreshold,
    })

    // 初始化光学畸变检测器 (其他投影仪)
    this.opticalDistortionDetector = new OpticalDistortionDetector(this.frameCollector, {
      keystoneThreshold: config.opticalKeystoneThreshold,
      barrelDistortionThreshold: config.opticalBarrelThreshold,
      chromaticAberrationThreshold: config.opticalChromaticThreshold,
      vignetteThreshold: config.opticalVignetteThreshold,
    })
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
  }

  /**
   * 向视频检测器添加一帧（用于实时视频处理）
   * 建议每收到一帧就调用此方法
   */
  addVideoFrame(grayMat: any, bgrMat?: any): void {
    // 将帧添加到公共采集器
    this.frameCollector.addFrame(grayMat, bgrMat)
  }

  /**
   * 获取视频帧缓冲状态
   */
  getVideoFrameBufferStatus(): { 
    flicker: { buffered: number; required: number }
    responseTime: { buffered: number; required: number }
    dlpColorWheel: { buffered: number; required: number }
    opticalDistortion: { buffered: number; required: number }
  } {
    return {
      flicker: {
        buffered: this.flickerDetector.getBufferedFrameCount(),
        required: 5,
      },
      responseTime: {
        buffered: this.responseTimeDetector.getBufferedFrameCount(),
        required: 10,
      },
      dlpColorWheel: {
        buffered: this.dlpColorWheelDetector.getBufferedFrameCount(),
        required: 3,
      },
      opticalDistortion: {
        buffered: this.opticalDistortionDetector.getBufferedFrameCount(),
        required: 1,
      },
    }
  }

  /**
   * 重置所有视频帧缓冲区
   */
  resetVideoFrameBuffer(): void {
    this.frameCollector.reset()
    this.flickerDetector.reset()
    this.responseTimeDetector.reset()
    this.dlpColorWheelDetector.reset()
    this.opticalDistortionDetector.reset()
  }

  /**
   * 检测屏幕捕捉
   * 使用三层判定逻辑：
   * 1. 任意方法能明确判定为屏幕捕捉时，直接返回
   * 2. 都不能明确判定时，计算加权置信度
   * 3. 用加权置信度判定最终结果
   * 
   * @param bgrMat - BGR格式图像
   * @param grayMat - 灰度图像（用于莫尔纹检测）
   * @param debugMode - 是否启用调试模式，返回详细日志
   * @param useVideoAnalysis - 是否使用已积累的视频帧进行闪烁检测
   * @returns 检测结果
   */
  detect(bgrMat: any, grayMat: any, debugMode: boolean = false, useVideoAnalysis: boolean = false): ScreenCaptureDetectionResult {
    return this.detectWithLogic(bgrMat, grayMat, debugMode, useVideoAnalysis)
  }

  /**
   * 核心检测方法：多屏幕类型级联检测
   * 
   * 检测顺序（按可靠性排序）：
   * 1. 视频闪烁（LCD/OLED）- 最可靠的物理特性
   * 2. 响应时间（墨水屏）- 像素变化速度特征
   * 3. DLP色轮（DLP投影）- 色轮干涉的独特特征
   * 4. 光学畸变（其他投影）- 投影光学系统的失真
   */
  private detectWithLogic(
    bgrMat: any,
    grayMat: any | null = null,
    enableDebug: boolean = false,
    useVideoAnalysis: boolean = false
  ): ScreenCaptureDetectionResult {
    if (!this.cv) {
      throw new Error('OpenCV instance not initialized. Call setCVInstance() first.')
    }

    const startTime = performance.now()
    const executedMethods: Array<{
      method: string
      isScreenCapture: boolean
      confidence: number
      details?: any
    }> = []

    const debug: CascadeDetectionDebugInfo | undefined = enableDebug ? {
      startTime,
      endTime: 0,
      totalTimeMs: 0,
      stages: [],
      finalDecision: {
        isScreenCapture: false,
        confidenceScore: 0,
      }
    } : undefined

    try {
      // ========== Stage 0: 视频闪烁检测 (LCD/OLED) ==========
      let flickerResult: any = { isScreenCapture: false, confidence: 0 }
      
      if (useVideoAnalysis && this.flickerDetector.getBufferedFrameCount() >= 5) {
        const stage0Start = performance.now()
        flickerResult = this.flickerDetector.analyze()
        const stage0Time = performance.now() - stage0Start

        executedMethods.push({
          method: 'Screen Flicker Detection (LCD/OLED)',
          isScreenCapture: flickerResult.isScreenCapture,
          confidence: flickerResult.confidence,
          details: {
            dominantPeriod: flickerResult.dominantFlickerPeriod,
            estimatedRefreshRate: flickerResult.estimatedScreenRefreshRate,
          },
        })

        if (debug) {
          debug.stages.push({
            method: 'Screen Flicker Detection (LCD/OLED)',
            completed: true,
            timeMs: stage0Time,
            result: {
              isScreenCapture: flickerResult.isScreenCapture,
              confidence: flickerResult.confidence,
            }
          })
        }

        if (flickerResult.isScreenCapture && flickerResult.confidence > 0.70) {
          const totalTime = performance.now() - startTime
          if (debug) {
            debug.endTime = performance.now()
            debug.totalTimeMs = totalTime
            debug.finalDecision = {
              isScreenCapture: true,
              confidenceScore: flickerResult.confidence,
              decisiveMethod: 'Screen Flicker Detection',
            }
          }
          
          return new ScreenCaptureDetectionResult(
            true,
            flickerResult.confidence,
            executedMethods,
            'high',
            totalTime,
            [],
            debug
          )
        }
      }

      // ========== Stage 1: 响应时间检测 (墨水屏) ==========
      let responseTimeResult: any = { isScreenCapture: false, confidence: 0 }
      
      if (useVideoAnalysis && this.responseTimeDetector.getBufferedFrameCount() >= 10) {
        const stage1Start = performance.now()
        responseTimeResult = this.responseTimeDetector.analyze()
        const stage1Time = performance.now() - stage1Start

        executedMethods.push({
          method: 'Response Time Detection (E-Ink)',
          isScreenCapture: responseTimeResult.isScreenCapture,
          confidence: responseTimeResult.confidence,
          details: {
            averageResponseTime: responseTimeResult.averageResponseTimeMs,
            estimatedScreenType: responseTimeResult.estimatedScreenType,
          },
        })

        if (debug) {
          debug.stages.push({
            method: 'Response Time Detection (E-Ink)',
            completed: true,
            timeMs: stage1Time,
            result: {
              isScreenCapture: responseTimeResult.isScreenCapture,
              confidence: responseTimeResult.confidence,
            }
          })
        }

        if (responseTimeResult.isScreenCapture && responseTimeResult.confidence > 0.65) {
          const totalTime = performance.now() - startTime
          if (debug) {
            debug.endTime = performance.now()
            debug.totalTimeMs = totalTime
            debug.finalDecision = {
              isScreenCapture: true,
              confidenceScore: responseTimeResult.confidence,
              decisiveMethod: 'Response Time Detection (E-Ink)',
            }
          }

          return new ScreenCaptureDetectionResult(
            true,
            responseTimeResult.confidence,
            executedMethods,
            'high',
            totalTime,
            [],
            debug
          )
        }
      }

      // ========== Stage 2: DLP色轮检测 (DLP投影) ==========
      let dlpResult: any = { isScreenCapture: false, confidence: 0 }
      
      if (useVideoAnalysis && bgrMat && this.dlpColorWheelDetector.getBufferedFrameCount() >= 3) {
        const stage2Start = performance.now()
        dlpResult = this.dlpColorWheelDetector.analyze()
        const stage2Time = performance.now() - stage2Start

        executedMethods.push({
          method: 'DLP Color Wheel Detection',
          isScreenCapture: dlpResult.isScreenCapture,
          confidence: dlpResult.confidence,
          details: {
            hasColorSeparation: dlpResult.hasColorSeparation,
            colorSeparationPixels: dlpResult.colorSeparationPixels,
          },
        })

        if (debug) {
          debug.stages.push({
            method: 'DLP Color Wheel Detection',
            completed: true,
            timeMs: stage2Time,
            result: {
              isScreenCapture: dlpResult.isScreenCapture,
              confidence: dlpResult.confidence,
            }
          })
        }

        if (dlpResult.isScreenCapture && dlpResult.confidence > 0.65) {
          const totalTime = performance.now() - startTime
          if (debug) {
            debug.endTime = performance.now()
            debug.totalTimeMs = totalTime
            debug.finalDecision = {
              isScreenCapture: true,
              confidenceScore: dlpResult.confidence,
              decisiveMethod: 'DLP Color Wheel Detection',
            }
          }

          return new ScreenCaptureDetectionResult(
            true,
            dlpResult.confidence,
            executedMethods,
            'high',
            totalTime,
            [],
            debug
          )
        }
      }

      // ========== Stage 3: 光学畸变检测 (其他投影) ==========
      let opticalResult: any = { isScreenCapture: false, confidence: 0 }
      
      if (useVideoAnalysis && grayMat && this.opticalDistortionDetector.getBufferedFrameCount() >= 1) {
        const stage3Start = performance.now()
        opticalResult = this.opticalDistortionDetector.analyze()
        const stage3Time = performance.now() - stage3Start

        executedMethods.push({
          method: 'Optical Distortion Detection',
          isScreenCapture: opticalResult.isScreenCapture,
          confidence: opticalResult.confidence,
          details: {
            distortionFeatures: opticalResult.distortionFeatures,
            estimatedProjectorType: opticalResult.estimatedProjectorType,
          },
        })

        if (debug) {
          debug.stages.push({
            method: 'Optical Distortion Detection',
            completed: true,
            timeMs: stage3Time,
            result: {
              isScreenCapture: opticalResult.isScreenCapture,
              confidence: opticalResult.confidence,
            }
          })
        }

        if (opticalResult.isScreenCapture && opticalResult.confidence > 0.60) {
          const totalTime = performance.now() - startTime
          if (debug) {
            debug.endTime = performance.now()
            debug.totalTimeMs = totalTime
            debug.finalDecision = {
              isScreenCapture: true,
              confidenceScore: opticalResult.confidence,
              decisiveMethod: 'Optical Distortion Detection',
            }
          }

          return new ScreenCaptureDetectionResult(
            true,
            opticalResult.confidence,
            executedMethods,
            'medium',
            totalTime,
            [],
            debug
          )
        }
      }

      // 综合多个视频检测器的结果
      if (useVideoAnalysis) {
        const compositeConfidence = Math.max(
          flickerResult.confidence,
          responseTimeResult.confidence,
          dlpResult.confidence,
          opticalResult.confidence
        )

        const isScreenCapture = compositeConfidence > 0.50
        const riskLevel = compositeConfidence > 0.7 ? 'high' : (compositeConfidence > 0.5 ? 'medium' : 'low')

        const totalTime = performance.now() - startTime

        if (debug) {
          debug.endTime = performance.now()
          debug.totalTimeMs = totalTime
          debug.finalDecision = {
            isScreenCapture,
            confidenceScore: compositeConfidence,
            decisiveMethod: isScreenCapture ? 'Video Analysis (Composite)' : undefined,
          }
        }

        console.log(`[ScreenCaptureDetector] Video composite: flicker=${flickerResult.confidence?.toFixed(3) ?? '0'}, responseTime=${responseTimeResult.confidence?.toFixed(3) ?? '0'}, dlp=${dlpResult.confidence?.toFixed(3) ?? '0'}, optical=${opticalResult.confidence?.toFixed(3) ?? '0'}, composite=${compositeConfidence.toFixed(3)}`)

        return new ScreenCaptureDetectionResult(
          isScreenCapture,
          compositeConfidence,
          executedMethods,
          riskLevel,
          totalTime,
          [],
          debug
        )
      }

      // 没有视频分析，返回中立结果
      const totalTime = performance.now() - startTime
      if (debug) {
        debug.endTime = performance.now()
        debug.totalTimeMs = totalTime
        debug.finalDecision = {
          isScreenCapture: false,
          confidenceScore: 0,
        }
      }

      return new ScreenCaptureDetectionResult(
        false,
        0,
        executedMethods,
        'low',
        totalTime,
        [],
        debug
      )
    } catch (error) {
      console.error('[ScreenCaptureDetector] Detection error:', error)
      
      const totalTime = performance.now() - startTime
      const avgConfidence = executedMethods.length > 0
        ? executedMethods.reduce((sum, m) => sum + m.confidence, 0) / executedMethods.length
        : 0

      if (debug) {
        debug.endTime = performance.now()
        debug.totalTimeMs = totalTime
        debug.finalDecision = {
          isScreenCapture: false,
          confidenceScore: avgConfidence,
        }
      }

      return new ScreenCaptureDetectionResult(
        false,
        avgConfidence,
        executedMethods,
        'low',
        totalTime,
        undefined,
        debug
      )
    }
  }
}
