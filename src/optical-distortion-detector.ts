/**
 * 光学畸变检测器 - 检测投影仪和其他光学系统的特有伪影
 * 
 * 核心原理：
 * - 投影仪通过光学透镜将图像投射到屏幕上
 * - 光学系统导致多种失真：梯形失真、桶形/枕形失真、模糊
 * - 真实人脸直接摄像，无这些光学失真
 * 
 * 检测特征：
 * 1. 梯形失真（Keystone）- 图像上下边宽度不同
 * 2. 桶形/枕形失真 - 直线边缘弯曲
 * 3. 光学模糊 - 边界清晰度在视场中不均匀
 * 4. 色差（Chromatic Aberration）- RGB通道空间分离
 * 5. 暗角（Vignetting）- 四角暗化
 */

import { ScreenFrameCollector } from "./screen-frame-collector"

export interface OpticalDistortionDetectorConfig {
  // 帧缓冲区大小
  bufferSize: number

  // 梯形失真检测的阈值（0-1）
  keystoneThreshold: number

  // 桶形/枕形失真检测的阈值（曲率）
  barrelDistortionThreshold: number

  // 色差检测的阈值
  chromaticAberrationThreshold: number

  // 暗角检测的阈值
  vignetteThreshold: number

  // 采样步长
  samplingStride: number

  // 各个特征的权重
  featureWeights: {
    keystone: number
    barrelDistortion: number
    chromaticAberration: number
    vignette: number
  }
}

export interface OpticalDistortionDetectionResult {
  isScreenCapture: boolean
  confidence: number

  // 各个失真特征的检测结果
  distortionFeatures: {
    keystoneDetected: boolean
    keystoneLevel: number // 0-1，越高越明显

    barrelDistortionDetected: boolean
    barrelDistortionLevel: number // 0-1

    chromaticAberrationDetected: boolean
    chromaticAberrationLevel: number // 0-1

    vignetteDetected: boolean
    vignetteLevel: number // 0-1
  }

  // 综合光学失真得分
  overallOpticalDistortionScore: number

  // 投影类型推断
  estimatedProjectorType?: 'dlp' | 'lcd' | 'lcos' | 'unknown'

  details?: any
}

export class OpticalDistortionDetector {
  private config: OpticalDistortionDetectorConfig
  private frameWidth: number = 0
  private frameHeight: number = 0
  private frameCollector: ScreenFrameCollector

  constructor(frameCollector: ScreenFrameCollector, config?: Partial<OpticalDistortionDetectorConfig>) {
    this.frameCollector = frameCollector
    
    // 初始化帧尺寸
    const frameSize = frameCollector.getFrameSize()
    this.frameWidth = frameSize.width
    this.frameHeight = frameSize.height
    
    this.config = {
      bufferSize: config?.bufferSize ?? 10,
      keystoneThreshold: config?.keystoneThreshold ?? 0.15, // 15% 宽度变化
      barrelDistortionThreshold: config?.barrelDistortionThreshold ?? 0.10,
      chromaticAberrationThreshold: config?.chromaticAberrationThreshold ?? 3.0, // 像素
      vignetteThreshold: config?.vignetteThreshold ?? 0.20, // 四角亮度下降20%
      samplingStride: config?.samplingStride ?? 4,
      featureWeights: config?.featureWeights ?? {
        keystone: 0.25,
        barrelDistortion: 0.25,
        chromaticAberration: 0.25,
        vignette: 0.25,
      },
    }
    
    console.log('[OpticalDistortion] Detector initialized with shared FrameCollector')
  }

  /**
   * 获取当前缓冲区中的帧数
   */
  getBufferedFrameCount(): number {
    return this.frameCollector.getBufferedFrameCount()
  }

  /**
   * 执行光学畸变检测分析
   */
  analyze(): OpticalDistortionDetectionResult {
    // 获取帧缓冲（从 FrameCollector）
    const frames = this.frameCollector.getGrayFrames(this.config.bufferSize)
    
    const minFramesNeeded = 1
    if (frames.length < minFramesNeeded) {
      console.warn(`[OpticalDistortion] Insufficient frames: ${frames.length}`)
      return {
        isScreenCapture: false,
        confidence: 0,
        distortionFeatures: {
          keystoneDetected: false,
          keystoneLevel: 0,
          barrelDistortionDetected: false,
          barrelDistortionLevel: 0,
          chromaticAberrationDetected: false,
          chromaticAberrationLevel: 0,
          vignetteDetected: false,
          vignetteLevel: 0,
        },
        overallOpticalDistortionScore: 0,
      }
    }

    const startTime = performance.now()

    try {
      const referenceFrame = frames[0]

      console.log(`[OpticalDistortion] Analyzing ${this.frameWidth}x${this.frameHeight}`)

      // 检测各个光学失真特征
      const keystoneResult = this.detectKeystone(referenceFrame)
      const barrelResult = this.detectBarrelDistortion(referenceFrame)
      const chromaticResult = this.detectChromaticAberration(referenceFrame)
      const vignetteResult = this.detectVignette(referenceFrame)

      // 综合评分
      const compositeScore =
        keystoneResult.level * this.config.featureWeights.keystone +
        barrelResult.level * this.config.featureWeights.barrelDistortion +
        chromaticResult.level * this.config.featureWeights.chromaticAberration +
        vignetteResult.level * this.config.featureWeights.vignette

      const isScreenCapture = compositeScore > 0.35 // 任何明显的光学失真都可能表示投影

      const analysisTime = performance.now() - startTime

      console.log(`[OpticalDistortion] Analysis complete in ${analysisTime.toFixed(1)}ms`)
      console.log(`[OpticalDistortion] Keystone: ${keystoneResult.level.toFixed(3)}, Barrel: ${barrelResult.level.toFixed(3)}, Chromatic: ${chromaticResult.level.toFixed(3)}, Vignette: ${vignetteResult.level.toFixed(3)}`)
      console.log(`[OpticalDistortion] Composite score: ${compositeScore.toFixed(3)}, IsCapture: ${isScreenCapture}`)

      return {
        isScreenCapture,
        confidence: Math.min(1, compositeScore),
        distortionFeatures: {
          keystoneDetected: keystoneResult.detected,
          keystoneLevel: keystoneResult.level,
          barrelDistortionDetected: barrelResult.detected,
          barrelDistortionLevel: barrelResult.level,
          chromaticAberrationDetected: chromaticResult.detected,
          chromaticAberrationLevel: chromaticResult.level,
          vignetteDetected: vignetteResult.detected,
          vignetteLevel: vignetteResult.level,
        },
        overallOpticalDistortionScore: compositeScore,
        estimatedProjectorType: this.inferProjectorType(
          keystoneResult,
          barrelResult,
          chromaticResult,
          vignetteResult
        ),
      }
    } catch (error) {
      console.error('[OpticalDistortion] Analysis error:', error)
      return {
        isScreenCapture: false,
        confidence: 0,
        distortionFeatures: {
          keystoneDetected: false,
          keystoneLevel: 0,
          barrelDistortionDetected: false,
          barrelDistortionLevel: 0,
          chromaticAberrationDetected: false,
          chromaticAberrationLevel: 0,
          vignetteDetected: false,
          vignetteLevel: 0,
        },
        overallOpticalDistortionScore: 0,
      }
    }
  }

  /**
   * 注意：重置由 FrameCollector 管理
   * 此检测器不持有任何帧缓冲
   */
  reset(): void {
    // 帧缓冲由 FrameCollector 管理，此处无需重置
    console.log('[OpticalDistortion] Detector state cleared (frames managed by FrameCollector)')
  }

  /**
   * 检测梯形失真（Keystone）
   * 
   * 原理：
   * - 梯形失真导致图像上下边宽度不同
   * - 计算上下边的宽度比
   */
  private detectKeystone(frame: Uint8Array): {
    detected: boolean
    level: number
  } {
    try {
      // 检测上边界
      const topEdgeWidth = this.findHorizontalEdgeWidth(frame, Math.floor(this.frameHeight * 0.1))

      // 检测下边界
      const bottomEdgeWidth = this.findHorizontalEdgeWidth(frame, Math.floor(this.frameHeight * 0.9))

      if (topEdgeWidth === 0 || bottomEdgeWidth === 0) {
        return { detected: false, level: 0 }
      }

      // 计算宽度变化比
      const widthRatio = Math.abs(topEdgeWidth - bottomEdgeWidth) / Math.max(topEdgeWidth, bottomEdgeWidth)

      const detected = widthRatio > this.config.keystoneThreshold
      const level = Math.min(1, widthRatio / 0.5) // 归一化

      console.log(`[OpticalDistortion] Keystone: top=${topEdgeWidth}px, bottom=${bottomEdgeWidth}px, ratio=${widthRatio.toFixed(3)}, level=${level.toFixed(3)}`)

      return { detected, level }
    } catch (error) {
      console.error('[OpticalDistortion] Keystone detection error:', error)
      return { detected: false, level: 0 }
    }
  }

  /**
   * 检测桶形/枕形失真
   * 
   * 原理：
   * - 提取图像边界
   * - 拟合边界为曲线，计算曲率
   * - 高曲率表示失真
   */
  private detectBarrelDistortion(frame: Uint8Array): {
    detected: boolean
    level: number
  } {
    try {
      // 检测左右边界的垂直直线度
      const leftBoundaryDeviation = this.measureBoundaryDeviation(frame, 'left')
      const rightBoundaryDeviation = this.measureBoundaryDeviation(frame, 'right')

      const maxDeviation = Math.max(leftBoundaryDeviation, rightBoundaryDeviation)

      // 偏差转换为失真水平
      const distortionLevel = Math.min(1, maxDeviation / (this.frameHeight * 0.1)) // 如果边界弯曲超过高度10%

      const detected = distortionLevel > this.config.barrelDistortionThreshold
      const level = distortionLevel

      console.log(`[OpticalDistortion] Barrel: left-dev=${leftBoundaryDeviation.toFixed(1)}px, right-dev=${rightBoundaryDeviation.toFixed(1)}px, level=${level.toFixed(3)}`)

      return { detected, level }
    } catch (error) {
      console.error('[OpticalDistortion] Barrel distortion detection error:', error)
      return { detected: false, level: 0 }
    }
  }

  /**
   * 检测色差（RGB通道分离）
   */
  private detectChromaticAberration(frame: Uint8Array): {
    detected: boolean
    level: number
  } {
    // 注意：此处输入是灰度图，无法检测RGB分离
    // 实际使用时应输入BGR彩色图像
    // 这里为简化，返回低值
    return {
      detected: false,
      level: 0,
    }
  }

  /**
   * 检测暗角（四角暗化）
   * 
   * 原理：
   * - 计算四个角区域的平均亮度
   * - 与中心区域对比
   * - 大幅下降表示暗角
   */
  private detectVignette(frame: Uint8Array): {
    detected: boolean
    level: number
  } {
    try {
      // 计算中心区域亮度
      const centerBrightness = this.getAverageBrightness(
        frame,
        Math.floor(this.frameWidth * 0.25),
        Math.floor(this.frameHeight * 0.25),
        Math.floor(this.frameWidth * 0.75),
        Math.floor(this.frameHeight * 0.75)
      )

      // 计算四个角区域的平均亮度
      const cornerSize = Math.min(Math.floor(this.frameWidth * 0.1), Math.floor(this.frameHeight * 0.1))

      const topLeftBrightness = this.getAverageBrightness(frame, 0, 0, cornerSize, cornerSize)
      const topRightBrightness = this.getAverageBrightness(
        frame,
        this.frameWidth - cornerSize,
        0,
        this.frameWidth,
        cornerSize
      )
      const bottomLeftBrightness = this.getAverageBrightness(
        frame,
        0,
        this.frameHeight - cornerSize,
        cornerSize,
        this.frameHeight
      )
      const bottomRightBrightness = this.getAverageBrightness(
        frame,
        this.frameWidth - cornerSize,
        this.frameHeight - cornerSize,
        this.frameWidth,
        this.frameHeight
      )

      const avgCornerBrightness =
        (topLeftBrightness + topRightBrightness + bottomLeftBrightness + bottomRightBrightness) / 4

      // 计算暗角程度
      const vignetteLevel = Math.max(0, (centerBrightness - avgCornerBrightness) / centerBrightness)

      const detected = vignetteLevel > this.config.vignetteThreshold
      const level = Math.min(1, vignetteLevel)

      console.log(`[OpticalDistortion] Vignette: center=${centerBrightness.toFixed(1)}, corners=${avgCornerBrightness.toFixed(1)}, level=${level.toFixed(3)}`)

      return { detected, level }
    } catch (error) {
      console.error('[OpticalDistortion] Vignette detection error:', error)
      return { detected: false, level: 0 }
    }
  }

  /**
   * 找水平边界的宽度
   */
  private findHorizontalEdgeWidth(frame: Uint8Array, y: number): number {
    const stride = this.config.samplingStride
    let firstEdge = -1
    let lastEdge = -1

    const threshold = 50 // 亮度变化阈值

    for (let x = 0; x < this.frameWidth - stride; x += stride) {
      const idx1 = y * this.frameWidth + x
      const idx2 = y * this.frameWidth + (x + stride)

      if (idx1 >= frame.length || idx2 >= frame.length) break

      const diff = Math.abs(frame[idx2] - frame[idx1])

      if (diff > threshold) {
        if (firstEdge === -1) {
          firstEdge = x
        }
        lastEdge = x
      }
    }

    if (firstEdge === -1 || lastEdge === -1) {
      return 0
    }

    return lastEdge - firstEdge
  }

  /**
   * 测量边界的垂直直线度（曲率）
   */
  private measureBoundaryDeviation(frame: Uint8Array, side: 'left' | 'right'): number {
    const stride = this.config.samplingStride
    const x = side === 'left' ? Math.floor(this.frameWidth * 0.05) : Math.floor(this.frameWidth * 0.95)

    // 沿垂直方向跟踪边界位置
    const positions: number[] = []

    for (let y = 0; y < this.frameHeight; y += stride) {
      const edgeX = this.findVerticalEdgeAtY(frame, y, x, side)
      positions.push(edgeX)
    }

    if (positions.length < 2) {
      return 0
    }

    // 计算位置的标准差作为曲率指标
    const mean = positions.reduce((a, b) => a + b, 0) / positions.length
    const variance = positions.reduce((sum, p) => sum + (p - mean) ** 2, 0) / positions.length
    const stdDev = Math.sqrt(variance)

    return stdDev
  }

  /**
   * 找在特定y处的垂直边界
   */
  private findVerticalEdgeAtY(frame: Uint8Array, y: number, startX: number, side: 'left' | 'right'): number {
    const stride = 2
    const threshold = 50

    if (side === 'left') {
      // 从左向右找边界
      for (let x = Math.max(0, startX - 50); x < startX + 50; x += stride) {
        const idx1 = y * this.frameWidth + x
        const idx2 = y * this.frameWidth + (x + stride)

        if (idx1 >= frame.length || idx2 >= frame.length) continue

        if (Math.abs(frame[idx2] - frame[idx1]) > threshold) {
          return x
        }
      }
    } else {
      // 从右向左找边界
      for (let x = Math.min(this.frameWidth - 1, startX + 50); x > startX - 50; x -= stride) {
        const idx1 = y * this.frameWidth + x
        const idx2 = y * this.frameWidth + (x - stride)

        if (idx1 >= frame.length || idx2 >= frame.length) continue

        if (Math.abs(frame[idx1] - frame[idx2]) > threshold) {
          return x
        }
      }
    }

    return startX
  }

  /**
   * 计算矩形区域的平均亮度
   */
  private getAverageBrightness(frame: Uint8Array, x1: number, y1: number, x2: number, y2: number): number {
    let sum = 0
    let count = 0

    const stride = Math.max(1, this.config.samplingStride)

    for (let y = y1; y < y2; y += stride) {
      for (let x = x1; x < x2; x += stride) {
        const idx = y * this.frameWidth + x
        if (idx >= 0 && idx < frame.length) {
          sum += frame[idx]
          count++
        }
      }
    }

    return count > 0 ? sum / count : 0
  }

  /**
   * 推断投影仪类型
   */
  private inferProjectorType(
    keystoneResult: any,
    barrelResult: any,
    chromaticResult: any,
    vignetteResult: any
  ): 'dlp' | 'lcd' | 'lcos' | 'unknown' {
    // 基于特征组合推断类型
    // 这是一个简化的启发式方法

    const totalScore = keystoneResult.level + barrelResult.level + chromaticResult.level + vignetteResult.level

    if (totalScore < 0.3) {
      return 'unknown'
    }

    // DLP: 通常有色差
    if (chromaticResult.level > 0.3) {
      return 'dlp'
    }

    // LCD投影: 通常有明显暗角
    if (vignetteResult.level > 0.3) {
      return 'lcd'
    }

    // LCoS: 通常有梯形失真
    if (keystoneResult.level > 0.3) {
      return 'lcos'
    }

    return 'unknown'
  }
}
