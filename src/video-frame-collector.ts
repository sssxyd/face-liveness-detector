/**
 * 公共帧采集器 - 统一管理多帧图像
 * 
 * 核心功能：
 * - 采集灰度和彩色帧
 * - 计算视频FPS
 * - 为多个检测器提供帧缓冲
 * - 支持时间戳记录
 */

export interface FrameCollectorConfig {
  // 帧缓冲区大小（足够大以满足所有检测器的需求）
  bufferSize: number
}

/**
 * 公共帧采集器
 * 
 * 多个检测器可以共用一个 VideoFrameCollector 实例，减少内存占用和代码重复
 */
export class VideoFrameCollector {
  private config: FrameCollectorConfig
  
  // 帧缓冲区
  private grayFrames: Uint8Array[] = []
  private bgrFrames: Uint8Array[] = [] 
  private frameTimestamps: number[] = []
  
  // 帧信息
  private frameWidth: number = 0
  private frameHeight: number = 0
  
  // FPS计算
  private averageFps: number = 0
  private fpsHistory: number[] = []

  constructor(config?: Partial<FrameCollectorConfig>) {
    this.config = {
      bufferSize: config?.bufferSize ?? 60, // 默认60帧（足够大）
    }
  }

  /**
   * 添加一帧（灰度 + 可选的彩色）
   * 
   * @param grayMat 灰度图像矩阵（必需）
   * @param bgrMat 彩色图像矩阵，BGR格式（可选）
   * @param frameTimestamp 帧时间戳，毫秒（可选，默认使用当前时间）
   */
  addFrame(grayMat: any, bgrMat?: any, frameTimestamp?: number): void {
    if (grayMat.empty?.()) {
      console.warn('[FrameCollector] Received empty gray frame')
      return
    }

    const timestamp = frameTimestamp ?? performance.now()

    // 初始化帧尺寸（首帧时）
    if (this.frameWidth === 0) {
      this.frameWidth = grayMat.cols
      this.frameHeight = grayMat.rows
      console.log(`[FrameCollector] Frame size initialized: ${this.frameWidth}x${this.frameHeight}`)
    }

    // 转换灰度帧为字节数组
    const grayData = new Uint8Array(grayMat.data)
    this.grayFrames.push(grayData)

    // 转换彩色帧为字节数组（如果提供）
    const bgrData = new Uint8Array(bgrMat.data)
    this.bgrFrames.push(bgrData)

    this.frameTimestamps.push(timestamp)

    // 计算瞬时FPS
    this.updateFpsStats(timestamp)

    // 维持缓冲区大小
    if (this.grayFrames.length > this.config.bufferSize) {
      this.grayFrames.shift()
      this.bgrFrames.shift()
      this.frameTimestamps.shift()
    }

    const fpsStr = this.averageFps > 0 ? ` (${this.averageFps.toFixed(1)} fps)` : ''
    console.log(
      `[FrameCollector] Frame added. Buffer: ${this.grayFrames.length}/${this.config.bufferSize}${fpsStr}`
    )
  }

  /**
   * 获取灰度帧缓冲区（直接引用，不复制）
   * @param n 返回最后n个帧，<=0或不提供则返回全部
   */
  getGrayFrames(n?: number): Uint8Array[] {
    if (n === undefined || n <= 0) {
      return this.grayFrames
    }
    return this.grayFrames.slice(-n)
  }

  /**
   * 获取彩色帧缓冲区（可能包含null值）
   * @param n 返回最后n个帧，<=0或不提供则返回全部
   */
  getBgrFrames(n?: number): (Uint8Array | null)[] {
    if (n === undefined || n <= 0) {
      return this.bgrFrames
    }
    return this.bgrFrames.slice(-n)
  }

  /**
   * 获取指定索引的灰度帧
   */
  getGrayFrame(index: number): Uint8Array | null {
    if (index >= 0 && index < this.grayFrames.length) {
      return this.grayFrames[index]
    }
    return null
  }

  /**
   * 获取指定索引的彩色帧
   */
  getBgrFrame(index: number): Uint8Array | null {
    if (index >= 0 && index < this.bgrFrames.length) {
      return this.bgrFrames[index]
    }
    return null
  }

  /**
   * 获取当前缓冲区中的帧数
   */
  getBufferedFrameCount(): number {
    return this.grayFrames.length
  }

  /**
   * 获取帧时间戳
   */
  getFrameTimestamp(index: number): number | null {
    if (index >= 0 && index < this.frameTimestamps.length) {
      return this.frameTimestamps[index]
    }
    return null
  }

  /**
   * 获取所有帧的时间戳
   */
  getFrameTimestamps(): number[] {
    return this.frameTimestamps
  }

  /**
   * 获取帧尺寸
   */
  getFrameSize(): { width: number; height: number } {
    return {
      width: this.frameWidth,
      height: this.frameHeight,
    }
  }

  getFrameWidth(): number {
    return this.frameWidth
  }

  getFrameHeight(): number {
    return this.frameHeight
  }

  /**
   * 获取平均FPS
   */
  getAverageFps(): number {
    return this.averageFps
  }

  /**
   * 重置收集器，清空所有缓冲区
   */
  reset(): void {
    this.grayFrames = []
    this.bgrFrames = []
    this.frameTimestamps = []
    this.fpsHistory = []
    this.averageFps = 0
    console.log('[FrameCollector] Collector reset')
  }

  /**
   * 清空帧缓冲区，但保留配置和FPS统计
   */
  clearFrames(): void {
    this.grayFrames = []
    this.bgrFrames = []
    this.frameTimestamps = []
    console.log('[FrameCollector] Frames cleared')
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    bufferedFrames: number
    bufferSize: number
    frameWidth: number
    frameHeight: number
    averageFps: number
    fpsHistory: number[]
  } {
    return {
      bufferedFrames: this.grayFrames.length,
      bufferSize: this.config.bufferSize,
      frameWidth: this.frameWidth,
      frameHeight: this.frameHeight,
      averageFps: this.averageFps,
      fpsHistory: [...this.fpsHistory],
    }
  }

  /**
   * 获取最近N帧（用于批量处理）
   */
  getLastNFrames(n: number): {
    grayFrames: Uint8Array[]
    bgrFrames: (Uint8Array | null)[]
    timestamps: number[]
  } {
    const startIdx = Math.max(0, this.grayFrames.length - n)
    return {
      grayFrames: this.grayFrames.slice(startIdx),
      bgrFrames: this.bgrFrames.slice(startIdx),
      timestamps: this.frameTimestamps.slice(startIdx),
    }
  }

  /**
   * 更新FPS统计
   */
  private updateFpsStats(currentTimestamp: number): void {
    if (this.frameTimestamps.length < 2) {
      return
    }

    const prevTimestamp = this.frameTimestamps[this.frameTimestamps.length - 2]
    const deltaMs = currentTimestamp - prevTimestamp

    if (deltaMs > 0) {
      const instantFps = 1000 / deltaMs

      // 保留FPS历史（用于计算平均值，最多30个）
      this.fpsHistory.push(instantFps)
      if (this.fpsHistory.length > 30) {
        this.fpsHistory.shift()
      }

      // 计算加权平均FPS（更重视最近的值）
      if (this.fpsHistory.length >= 5) {
        let weightedSum = 0
        let weightSum = 0
        for (let i = 0; i < this.fpsHistory.length; i++) {
          const weight = (i + 1) / this.fpsHistory.length
          weightedSum += this.fpsHistory[i] * weight
          weightSum += weight
        }
        this.averageFps = weightedSum / weightSum
      } else if (this.fpsHistory.length > 0) {
        // FPS历史不足5个时，计算简单平均
        this.averageFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
      }
    }
  }
}
