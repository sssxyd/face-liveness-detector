/**
 * DLP色轮检测器 - 检测DLP投影仪的特有伪影
 * 
 * 核心原理：
 * - DLP投影仪使用单色DMD芯片 + RGB色轮
 * - 色轮以高频率（120-144Hz）轮换RGB颜色
 * - 摄像头如果不同步捕捉，会看到RGB分离现象
 * 
 * 特征：
 * 1. 高对比度边界处出现"彩虹纹"（R左/B右分离）
 * 2. 快速移动物体边缘有明显的RGB分离
 * 3. 静止物体通常正常（因为色轮平均后是白色）
 * 
 * 检测方法：
 * 1. 找高对比度边界区域
 * 2. 分析边界处R、G、B通道的位置差异
 * 3. 如果R领先，B延后 → DLP特征
 */

import { ScreenFrameCollector } from "./screen-frame-collector"

export interface DLPColorWheelDetectorConfig {
  // 帧缓冲区大小
  bufferSize: number

  // 高对比度边界的最小亮度差异
  edgeThreshold: number // 0-255

  // RGB通道分离的最小像素距离
  minChannelSeparationPixels: number

  // RGB分离置信度阈值
  separationConfidenceThreshold: number

  // 采样步长（加快处理）
  samplingStride: number
}

export interface DLPColorWheelDetectionResult {
  isScreenCapture: boolean
  confidence: number

  // RGB分离检测
  hasColorSeparation: boolean
  colorSeparationPixels: number // 平均分离距离
  redLeadPixels?: number        // R通道领先像素
  blueDelayPixels?: number      // B通道延后像素

  // 检测涉及的边界像素数
  sampledEdgePixelCount: number

  // 色轮干涉的周期性
  estimatedColorWheelFrequency?: number // Hz

  details?: {
    edgeLocations: number[]        // 检测到的边界位置
    separationDistances: number[]  // 各边界的RGB分离距离
  }
}

export class DLPColorWheelDetector {
  private config: DLPColorWheelDetectorConfig
  private frameCollector: ScreenFrameCollector

  constructor(frameCollector: ScreenFrameCollector, config?: Partial<DLPColorWheelDetectorConfig>) {
    this.frameCollector = frameCollector
    this.config = {
      bufferSize: config?.bufferSize ?? 30,
      edgeThreshold: config?.edgeThreshold ?? 80, // 80级以上的亮度跳变
      minChannelSeparationPixels: config?.minChannelSeparationPixels ?? 2,
      separationConfidenceThreshold: config?.separationConfidenceThreshold ?? 0.65,
      samplingStride: config?.samplingStride ?? 2,
    }
  }



  /**
   * 获取当前缓冲区中的帧数
   */
  getBufferedFrameCount(): number {
    return this.frameCollector.getBufferedFrameCount()
  }

  /**
   * 执行DLP色轮检测分析
   */
  analyze(): DLPColorWheelDetectionResult {
    // 获取BGR帧缓冲（Uint8Array格式）
    const frames = this.frameCollector.getBgrFrames(this.config.bufferSize).filter((f: any) => f !== null) as Uint8Array[]
    
    const minFramesNeeded = 3 // 至少需要3帧来比较
    if (frames.length < minFramesNeeded) {
      console.warn(`[DLPColorWheel] Insufficient frames: ${frames.length} < ${minFramesNeeded}`)
      return {
        isScreenCapture: false,
        confidence: 0,
        hasColorSeparation: false,
        colorSeparationPixels: 0,
        sampledEdgePixelCount: 0,
      }
    }

    const startTime = performance.now()

    try {
      // 从frameCollector获取帧尺寸
      const { width: cols, height: rows } = this.frameCollector.getFrameSize()
      const referenceFrame = frames[0]

      console.log(`[DLPColorWheel] Analyzing frame size: ${cols}x${rows}`)

      // 检测高对比度边界
      const edges = this.detectHighContrastEdges(referenceFrame, rows, cols)
      console.log(`[DLPColorWheel] Found ${edges.length} edge regions`)

      if (edges.length === 0) {
        console.log('[DLPColorWheel] No significant edges found')
        return {
          isScreenCapture: false,
          confidence: 0,
          hasColorSeparation: false,
          colorSeparationPixels: 0,
          sampledEdgePixelCount: 0,
        }
      }

      // 分析每条边界的RGB分离
      const separationDistances: number[] = []
      let totalRedLead = 0
      let totalBlueLag = 0

      for (const edge of edges) {
        const separation = this.analyzeRGBSeparation(referenceFrame, rows, cols, edge)
        if (separation.distance > 0) {
          separationDistances.push(separation.distance)
          totalRedLead += separation.redLead
          totalBlueLag += separation.blueLag
        }
      }

      if (separationDistances.length === 0) {
        return {
          isScreenCapture: false,
          confidence: 0,
          hasColorSeparation: false,
          colorSeparationPixels: 0,
          sampledEdgePixelCount: edges.length,
        }
      }

      // 计算统计信息
      const avgSeparation = separationDistances.reduce((a, b) => a + b, 0) / separationDistances.length
      const avgRedLead = totalRedLead / separationDistances.length
      const avgBlueLag = totalBlueLag / separationDistances.length

      // 判定DLP特征
      const hasRGBSeparation = avgSeparation >= this.config.minChannelSeparationPixels
      const hasTypicalDLPPattern = avgRedLead > 1 && avgBlueLag < -1 // R领先，B延后

      // 置信度计算
      let confidence = 0
      if (hasTypicalDLPPattern) {
        // DLP特有特征：R领先 + B延后
        confidence = Math.min(1, (Math.abs(avgRedLead) + Math.abs(avgBlueLag)) / 5) // 归一化
      } else if (hasRGBSeparation) {
        // 有RGB分离但不是典型DLP模式
        confidence = avgSeparation / 10 * 0.5
      }

      const isScreenCapture = confidence > this.config.separationConfidenceThreshold

      // 推断色轮频率（如果有标准的周期）
      let estimatedFrequency: number | undefined
      if (hasTypicalDLPPattern) {
        // DLP色轮通常是刷新率的3倍（RGB轮换）
        // 60Hz刷新 → 180Hz色轮
        // 但我们无法直接测量，这里留作占位符
        estimatedFrequency = undefined
      }

      const analysisTime = performance.now() - startTime

      console.log(`[DLPColorWheel] Analysis complete in ${analysisTime.toFixed(1)}ms`)
      console.log(`[DLPColorWheel] RGB Separation: avg=${avgSeparation.toFixed(2)}px, R-lead=${avgRedLead.toFixed(2)}px, B-lag=${avgBlueLag.toFixed(2)}px`)
      console.log(`[DLPColorWheel] DLP Pattern: ${hasTypicalDLPPattern}, Confidence: ${confidence.toFixed(3)}, IsCapture: ${isScreenCapture}`)

      return {
        isScreenCapture,
        confidence,
        hasColorSeparation: hasRGBSeparation,
        colorSeparationPixels: avgSeparation,
        redLeadPixels: avgRedLead,
        blueDelayPixels: avgBlueLag,
        sampledEdgePixelCount: separationDistances.length,
        estimatedColorWheelFrequency: estimatedFrequency,
        details: {
          edgeLocations: edges,
          separationDistances,
        },
      }
    } catch (error) {
      console.error('[DLPColorWheel] Analysis error:', error)
      return {
        isScreenCapture: false,
        confidence: 0,
        hasColorSeparation: false,
        colorSeparationPixels: 0,
        sampledEdgePixelCount: 0,
      }
    }
  }

  /**
   * 重置检测器
   * 注意：帧缓冲由 FrameCollector 管理
   */
  reset(): void {
    // 帧缓冲由 FrameCollector 管理，此处无需重置
    console.log('[DLPColorWheel] Detector state cleared (frames managed by FrameCollector)')
  }

  /**
   * 检测高对比度边界
   * 返回边界的x坐标位置
   */
  private detectHighContrastEdges(bgrData: Uint8Array, rows: number, cols: number): number[] {
    const edges: number[] = []

    try {
      // BGR数据，每像素3个字节
      const stride = this.config.samplingStride

      for (let y = stride; y < rows - stride; y += stride) {
        for (let x = stride; x < cols - stride; x += stride) {
          // 转换为灰度值进行边界检测
          const centerIdx = (y * cols + x) * 3
          const leftIdx = (y * cols + (x - stride)) * 3
          const rightIdx = (y * cols + (x + stride)) * 3

          // 计算灰度值：0.299*R + 0.587*G + 0.114*B
          const centerGray = Math.round(
            0.299 * bgrData[centerIdx + 2] + 0.587 * bgrData[centerIdx + 1] + 0.114 * bgrData[centerIdx]
          )
          const leftGray = Math.round(
            0.299 * bgrData[leftIdx + 2] + 0.587 * bgrData[leftIdx + 1] + 0.114 * bgrData[leftIdx]
          )
          const rightGray = Math.round(
            0.299 * bgrData[rightIdx + 2] + 0.587 * bgrData[rightIdx + 1] + 0.114 * bgrData[rightIdx]
          )

          // 检测水平边界
          const leftDiff = Math.abs(centerGray - leftGray)
          const rightDiff = Math.abs(centerGray - rightGray)

          if (leftDiff > this.config.edgeThreshold || rightDiff > this.config.edgeThreshold) {
            edges.push(x) // 记录边界x坐标
          }
        }
      }
    } catch (error) {
      console.error('[DLPColorWheel] Edge detection error:', error)
    }

    return edges
  }

  /**
   * 分析单条边界的RGB分离
   * 
   * DLP特征：
   * - R通道的边界比G靠前（向左）
   * - B通道的边界比G靠后（向右）
   */
  private analyzeRGBSeparation(
    bgrData: Uint8Array,
    rows: number,
    cols: number,
    edgeX: number
  ): {
    distance: number
    redLead: number
    blueLag: number
  } {
    try {
      // 提取边界附近的RGB数据
      const windowSize = 10 // 边界左右各10像素
      const startX = Math.max(0, edgeX - windowSize)
      const endX = Math.min(cols, edgeX + windowSize)

      // 计算各通道的亮度变化（边界处的导数）
      const rDerivatives: number[] = []
      const gDerivatives: number[] = []
      const bDerivatives: number[] = []

      const centerY = Math.floor(rows / 2) // 使用中间行
      const rowOffset = centerY * cols * 3 // BGR每像素3个字节

      for (let x = startX + 1; x < endX; x++) {
        const idx0 = rowOffset + (x - 1) * 3
        const idx1 = rowOffset + x * 3

        // BGR顺序
        const b0 = bgrData[idx0]
        const g0 = bgrData[idx0 + 1]
        const r0 = bgrData[idx0 + 2]

        const b1 = bgrData[idx1]
        const g1 = bgrData[idx1 + 1]
        const r1 = bgrData[idx1 + 2]

        rDerivatives.push(r1 - r0)
        gDerivatives.push(g1 - g0)
        bDerivatives.push(b1 - b0)
      }

      // 找最大导数位置（边界位置）
      const rEdge = this.findPeakPosition(rDerivatives)
      const gEdge = this.findPeakPosition(gDerivatives)
      const bEdge = this.findPeakPosition(bDerivatives)

      // 计算相位差
      const redLead = rEdge - gEdge // 正值表示R在G之前
      const blueLag = bEdge - gEdge // 负值表示B在G之后

      const totalSeparation = Math.abs(redLead - blueLag)

      return {
        distance: totalSeparation,
        redLead,
        blueLag,
      }
    } catch (error) {
      console.error('[DLPColorWheel] RGB separation analysis error:', error)
      return { distance: 0, redLead: 0, blueLag: 0 }
    }
  }

  /**
   * 找导数数组中的峰值位置
   */
  private findPeakPosition(derivatives: number[]): number {
    if (derivatives.length === 0) return 0

    let maxDerivative = -Infinity
    let peakPos = 0

    for (let i = 0; i < derivatives.length; i++) {
      const absDeriv = Math.abs(derivatives[i])
      if (absDeriv > maxDerivative) {
        maxDerivative = absDeriv
        peakPos = i
      }
    }

    return peakPos
  }
}
