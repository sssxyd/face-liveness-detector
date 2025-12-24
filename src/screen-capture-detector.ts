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
  confidenceThreshold?: number
  moireThreshold?: number
  moireEnableDCT?: boolean
  moireEnableEdgeDetection?: boolean
  colorSaturationThreshold?: number
  colorRgbCorrelationThreshold?: number
  colorPixelEntropyThreshold?: number
  colorConfidenceThreshold?: number


  rgbLowFreqStartPercent?: number
  rgbLowFreqEndPercent?: number
  rgbEnergyRatioNormalizationFactor?: number
  rgbChannelDifferenceNormalizationFactor?: number
  rgbEnergyScoreWeight?: number
  rgbAsymmetryScoreWeight?: number
  rgbDifferenceFactorWeight?: number
  rgbConfidenceThreshold?: number  
}

/**
 * 优化版屏幕采集检测引擎
 * 
 * 使用级联检测策略，支持多种模式以平衡速度和精准度
 */
export class ScreenCaptureDetector {
  private cv: any = null
  private confidenceThreshold: number = 0.6
  
  private moirePatternConfig: MoirePatternDetectionConfig
  private screenColorConfig: ScreenColorDetectionConfig
  private rgbEmissionConfig: RgbEmissionDetectionConfig

  constructor(options: Partial<ScreenCaptureDetectorOptions> = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.6
    
    this.moirePatternConfig = {
      moire_threshold: options.moireThreshold ?? 0.65,
      enable_dct: options.moireEnableDCT ?? true,
      enable_edge_detection: options.moireEnableEdgeDetection ?? true,
    }
    
    this.screenColorConfig = {
      saturation_threshold: options.colorSaturationThreshold ?? 40,
      rgb_correlation_threshold: options.colorRgbCorrelationThreshold ?? 0.85,
      pixel_entropy_threshold: options.colorPixelEntropyThreshold ?? 6.5,
      confidence_threshold: options.colorConfidenceThreshold ?? 0.65,
    }
    
    this.rgbEmissionConfig = {
      low_freq_start_percent: options.rgbLowFreqStartPercent ?? 0.15,
      low_freq_end_percent: options.rgbLowFreqEndPercent ?? 0.35,
      energy_ratio_normalization_factor: options.rgbEnergyRatioNormalizationFactor ?? 10,
      channel_difference_normalization_factor: options.rgbChannelDifferenceNormalizationFactor ?? 50,
      energy_score_weight: options.rgbEnergyScoreWeight ?? 0.40,
      asymmetry_score_weight: options.rgbAsymmetryScoreWeight ?? 0.40,
      difference_factor_weight: options.rgbDifferenceFactorWeight ?? 0.20,
      confidence_threshold: options.rgbConfidenceThreshold ?? 0.60,
    }
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
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
   * @returns 检测结果
   */
  detect(bgrMat: any, grayMat: any, debugMode: boolean = false): ScreenCaptureDetectionResult {
    return this.detectWithLogic(bgrMat, grayMat, debugMode)
  }

  /**
   * 核心检测方法：三层判定逻辑
   * 1. 任意方法能明确判定为屏幕捕捉时，直接返回
   * 2. 都不能明确判定时，计算加权置信度
   * 3. 用加权置信度判定最终结果
   * 
   * 检测顺序：RGB 发光 → 颜色异常 → 莫尔纹
   */
  private detectWithLogic(
    bgrMat: any,
    grayMat: any | null = null,
    enableDebug: boolean = false
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
      // ========== 阶段1: RGB发光检测 ==========
      const stage1Start = performance.now()
      const rgbEmissionResult = detectRGBEmissionPattern(this.cv, bgrMat, this.rgbEmissionConfig)
      const stage1Time = performance.now() - stage1Start
      
      executedMethods.push({
        method: 'RGB Emission Pattern Detection',
        isScreenCapture: rgbEmissionResult.isScreenCapture,
        confidence: rgbEmissionResult.confidence,
        details: rgbEmissionResult.details,
      })

      if (debug) {
        debug.stages.push({
          method: 'RGB Emission Pattern Detection',
          completed: true,
          timeMs: stage1Time,
          result: {
            isScreenCapture: rgbEmissionResult.isScreenCapture,
            confidence: rgbEmissionResult.confidence,
          }
        })
      }

      // 明确判定为屏幕捕捉时，直接返回
      const rgbCanDetermine = rgbEmissionResult.isScreenCapture && rgbEmissionResult.confidence > 0.75
      if (rgbCanDetermine) {
        const totalTime = performance.now() - startTime
        if (debug) {
          debug.endTime = performance.now()
          debug.totalTimeMs = totalTime
          debug.finalDecision = {
            isScreenCapture: true,
            confidenceScore: rgbEmissionResult.confidence,
            decisiveMethod: 'RGB Emission Pattern Detection',
          }
        }
        
        return new ScreenCaptureDetectionResult(
          true,
          rgbEmissionResult.confidence,
          executedMethods,
          'medium',
          totalTime,
          ['Screen Color Profile Detection', 'Moiré Pattern Detection'],
          debug
        )
      }

      // ========== 阶段2: 颜色异常检测 ==========
      const stage2Start = performance.now()
      const colorResult = detectScreenColorProfile(this.cv, bgrMat, this.screenColorConfig)
      const stage2Time = performance.now() - stage2Start

      executedMethods.push({
        method: 'Screen Color Profile Detection',
        isScreenCapture: colorResult.isScreenCapture,
        confidence: colorResult.confidence,
        details: colorResult.metrics,
      })

      if (debug) {
        debug.stages.push({
          method: 'Screen Color Profile Detection',
          completed: true,
          timeMs: stage2Time,
          result: {
            isScreenCapture: colorResult.isScreenCapture,
            confidence: colorResult.confidence,
          }
        })
      }

      // 明确判定为屏幕捕捉时，直接返回
      const colorCanDetermine = colorResult.isScreenCapture && colorResult.confidence > 0.75
      if (colorCanDetermine) {
        const totalTime = performance.now() - startTime
        if (debug) {
          debug.endTime = performance.now()
          debug.totalTimeMs = totalTime
          debug.finalDecision = {
            isScreenCapture: true,
            confidenceScore: colorResult.confidence,
            decisiveMethod: 'Screen Color Profile Detection',
          }
        }
        
        return new ScreenCaptureDetectionResult(
          true,
          colorResult.confidence,
          executedMethods,
          'medium',
          totalTime,
          ['Moiré Pattern Detection'],
          debug
        )
      }

      // ========== 阶段3: 莫尔纹检测 ==========
      let moireResult: any = { isScreenCapture: false, confidence: 0, moireStrength: 0, dominantFrequencies: [] }
      
      if (grayMat) {
        const stage3Start = performance.now()
        moireResult = detectMoirePattern(this.cv, grayMat, this.moirePatternConfig)
        const stage3Time = performance.now() - stage3Start

        executedMethods.push({
          method: 'Moiré Pattern Detection',
          isScreenCapture: moireResult.isScreenCapture,
          confidence: moireResult.confidence,
          details: {
            moireStrength: moireResult.moireStrength,
            dominantFrequencies: moireResult.dominantFrequencies,
          },
        })

        if (debug) {
          debug.stages.push({
            method: 'Moiré Pattern Detection',
            completed: true,
            timeMs: stage3Time,
            result: {
              isScreenCapture: moireResult.isScreenCapture,
              confidence: moireResult.confidence,
            }
          })
        }

        // 明确判定为屏幕捕捉时，直接返回
        const moireCanDetermine = moireResult.isScreenCapture && moireResult.confidence > 0.75
        if (moireCanDetermine) {
          const totalTime = performance.now() - startTime
          if (debug) {
            debug.endTime = performance.now()
            debug.totalTimeMs = totalTime
            debug.finalDecision = {
              isScreenCapture: true,
              confidenceScore: moireResult.confidence,
              decisiveMethod: 'Moiré Pattern Detection',
            }
          }
          
          return new ScreenCaptureDetectionResult(
            true,
            moireResult.confidence,
            executedMethods,
            'medium',
            totalTime,
            undefined,
            debug
          )
        }
      }

      // 都不能明确判定，计算加权置信度
      const weightedConfidence = 
        rgbEmissionResult.confidence * 0.5 +    // RGB权重 50%
        colorResult.confidence * 0.3 +            // Color权重 30%
        moireResult.confidence * 0.2              // Moiré权重 20%
      
      // 第 3 层：用加权置信度判定最终结果
      const isScreenCapture = weightedConfidence > this.confidenceThreshold
      
      // 根据加权置信度判断风险等级
      let riskLevel: 'low' | 'medium' | 'high' = 'low'
      if (isScreenCapture) {
        if (weightedConfidence > 0.8) {
          riskLevel = 'high'
        } else if (weightedConfidence > 0.6) {
          riskLevel = 'medium'
        } else {
          riskLevel = 'low'
        }
      }

      const totalTime = performance.now() - startTime

      if (debug) {
        debug.endTime = performance.now()
        debug.totalTimeMs = totalTime
        debug.finalDecision = {
          isScreenCapture,
          confidenceScore: weightedConfidence,
          decisiveMethod: isScreenCapture ? 'Weighted Decision (RGB + Color + Moiré)' : undefined,
        }
      }

      return new ScreenCaptureDetectionResult(
        isScreenCapture,
        weightedConfidence,
        executedMethods,
        riskLevel,
        totalTime,
        undefined,
        debug
      )
    } catch (error) {
      console.error('[ScreenCaptureDetector] Detection error:', error)
      
      // 出错时，返回保守结果
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
