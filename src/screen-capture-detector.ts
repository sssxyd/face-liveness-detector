/**
 * 屏幕采集检测系统 - 识别是否从屏幕摄像的视频
 * 
 * 核心检测方法：
 * 1. 莫尔纹检测 (Moiré Pattern Detection) - 检测屏幕像素干涉
 * 2. 频闪检测 (Flicker Detection) - 检测屏幕刷新率闪烁
 * 3. 色彩异常检测 (Color Anomaly Detection) - 检测 RGB 色彩分离
 * 4. 像素网格检测 (Pixel Grid Detection) - 直接检测屏幕像素网格
 * 5. 帧重复检测 (Frame Duplication Detection) - 检测视频是否有重复帧
 */

export interface ScreenCaptureDetectorOptions {
  confidenceThreshold: number
  moireThreshold: number
  fftSize: number
  flickerMaxHistory: number
  flickerMinSamples: number
  flickerMinPeriod: number
  flickerMaxPeriod: number
  flickerStrengthThreshold: number
  duplicationMaxHistory: number
  duplicationSimilarityThreshold: number
  gridHighFreqThreshold: number
  gridStrengthThreshold: number
  chromaticShiftThreshold: number
  minFramesRequired: number  // 检测器准备就绪所需的最小帧数（默认 5）
}

/**
 * Moire pattern detection result
 */
export interface MoirePatternDetectionResult {
  isScreenCapture: boolean
  confidence: number
  moireStrength: number
  dominantFrequencies: number[]
}

/**
 * Flicker detection result
 */
export interface FlickerDetectionResult {
  isScreenCapture: boolean
  confidence: number
  flickerFrequency: number
  flickerStrength: number
}

/**
 * Chromatic aberration detection result
 */
export interface ChromaticAberrationResult {
  isScreenCapture: boolean
  confidence: number
  aberrationAmount: number
}

/**
 * Pixel grid detection result
 */
export interface PixelGridDetectionResult {
  isScreenCapture: boolean
  confidence: number
  gridStrength: number
  gridPeriod: number
}

/**
 * Frame duplication detection result
 */
export interface FrameDuplicationResult {
  isVideoReplay: boolean
  confidence: number
  duplicateCount: number
  averageSimilarity: number
}

/**
 * Main screen capture detection response
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
 * 莫尔纹检测 - 最可靠的屏幕检测方法
 * 
 * 原理：
 * 当摄像机拍摄屏幕时，摄像机的传感器网格和屏幕的像素网格会产生干涉
 * 导致出现莫尔纹（Moire pattern）- 周期性的条纹或波纹
 * 真实人脸：没有这种规则的波纹
 * 屏幕采集：明显的周期性莫尔纹
 */
export class MoirePatternDetector {
  private cv: any = null
  private fftSize: number = 256
  private threshold: number = 0.65 // 莫尔纹特征强度阈值

  constructor(fftSize: number, moiréThreshold: number) {
    this.fftSize = fftSize
    this.threshold = moiréThreshold
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
  }

  /**
   * 检测莫尔纹图案
   * 通过频域分析检测是否存在周期性干涉纹
   * @param gray - 灰度图像
   */
  detectMoirePattern(gray: any): MoirePatternDetectionResult {
    try {
      const cv = this.cv
      if (!cv) throw new Error('OpenCV instance not initialized')
      // 使用 Canny 边缘检测突出周期性结构
      const edges = new cv.Mat()
      cv.Canny(gray, edges, 50, 150)

      // 计算自相关来检测周期性
      const periodicity = this.detectPeriodicity(edges)

      // 分析边缘方向的一致性（莫尔纹有明确的方向）
      const directionConsistency = this.analyzeEdgeDirection(edges)

      // 检测频率特征
      const frequencyFeatures = this.analyzeFrequencyDomain(edges)

      edges.delete()

      // 综合评分
      const moireStrength = (periodicity + directionConsistency + frequencyFeatures.peakStrength) / 3

      const isScreenCapture = moireStrength > this.threshold

      return {
        isScreenCapture,
        confidence: Math.min(Math.abs(moireStrength - this.threshold) / 0.35, 1.0),
        moireStrength,
        dominantFrequencies: frequencyFeatures.dominantFreqs
      }
    } catch (error) {
      return {
        isScreenCapture: false,
        confidence: 0.0,
        moireStrength: 0.0,
        dominantFrequencies: []
      }
    }
  }

  /**
   * 检测周期性结构
   * 莫尔纹是高度周期性的
   */
  private detectPeriodicity(edges: any): number {
    const width = edges.cols
    const height = edges.rows

    // 计算水平和竖直方向的周期性
    let horizontalPeriodicity = 0
    let verticalPeriodicity = 0

    // 水平方向：检测每行是否有规则的纹理变化
    for (let y = 0; y < Math.min(height, 100); y++) {
      const row = edges.row(y)
      horizontalPeriodicity += this.analyzeLinePeriodicity(row)
      row.delete()
    }
    horizontalPeriodicity /= Math.min(height, 100)

    // 竖直方向
    for (let x = 0; x < Math.min(width, 100); x++) {
      const col = edges.col(x)
      verticalPeriodicity += this.analyzeLinePeriodicity(col)
      col.delete()
    }
    verticalPeriodicity /= Math.min(width, 100)

    // 返回周期性强度 (0-1)
    return Math.max(horizontalPeriodicity, verticalPeriodicity)
  }

  /**
   * 分析单行/列的周期性
   * 使用自相关检测重复模式
   */
  private analyzeLinePeriodicity(line: any): number {
    const data = line.data8U
    const length = data.length

    if (length < 10) return 0

    // 计算自相关
    let maxAutocorr = 0
    const minPeriod = 5
    const maxPeriod = Math.min(length / 4, 100)

    for (let period = minPeriod; period < maxPeriod; period += 2) {
      let corr = 0
      let count = 0

      for (let i = 0; i < length - period; i++) {
        corr += Math.abs(data[i] - data[i + period])
        count++
      }

      // 正常化
      corr = 1 - corr / (count * 255)

      if (corr > maxAutocorr) {
        maxAutocorr = corr
      }
    }

    // 周期性强度：高自相关 = 高周期性
    return maxAutocorr
  }

  /**
   * 分析边缘方向一致性
   * 莫尔纹有明确的方向
   */
  private analyzeEdgeDirection(edges: any): number {
    const cv = this.cv
    // 使用 Sobel 获取边缘方向
    const sobelX = new cv.Mat()
    const sobelY = new cv.Mat()

    cv.Sobel(edges, sobelX, cv.CV_32F, 1, 0, 3)
    cv.Sobel(edges, sobelY, cv.CV_32F, 0, 1, 3)

    // 计算方向角
    const directions: number[] = []
    const data = edges.data8U
    const dataX = sobelX.data32F
    const dataY = sobelY.data32F

    for (let i = 0; i < Math.min(data.length, 10000); i += 100) {
      if (data[i] > 50) {
        // 只看边缘点
        const angle = Math.atan2(dataY[i], dataX[i])
        directions.push(angle)
      }
    }

    // 计算方向的标准差（低标准差 = 方向一致 = 可能是莫尔纹）
    if (directions.length < 20) return 0

    const meanDir =
      directions.reduce((a, b) => a + b) / directions.length
    const variance = directions.reduce((sum, x) => sum + (x - meanDir) ** 2, 0) / directions.length
    const stdDev = Math.sqrt(variance)

    // 标准差越小，方向越一致（0-1 之间）
    const directionConsistency = 1 - Math.min(stdDev / Math.PI, 1.0)

    sobelX.delete()
    sobelY.delete()

    return directionConsistency
  }

  /**
   * 频域分析 - 检测屏幕特有的频率成分
   */
  private analyzeFrequencyDomain(edges: any): {
    peakStrength: number
    dominantFreqs: number[]
  } {
    const cv = this.cv
    // 简化处理：在原始图像上进行高频分析
    const sobelX = new cv.Mat()
    const sobelY = new cv.Mat()

    cv.Sobel(edges, sobelX, cv.CV_32F, 1, 0, 1)
    cv.Sobel(edges, sobelY, cv.CV_32F, 0, 1, 1)

    // 计算能量
    let energyX = 0
    let energyY = 0
    const dataX = sobelX.data32F
    const dataY = sobelY.data32F

    for (let i = 0; i < dataX.length; i++) {
      energyX += dataX[i] ** 2
      energyY += dataY[i] ** 2
    }

    const peakStrength = Math.sqrt(energyX + energyY) / (edges.rows * edges.cols)

    sobelX.delete()
    sobelY.delete()

    // 屏幕采集：高频能量明显（高对比度的像素网格）
    // 真实人脸：高频能量低（皮肤光滑）
    const dominantFreqs = peakStrength > 0.1 ? [peakStrength] : []

    return {
      peakStrength: Math.min(peakStrength / 0.2, 1.0), // 归一化
      dominantFreqs
    }
  }
}

/**
 * 频闪检测 - 检测屏幕刷新率引起的闪烁
 * 
 * 原理：
 * 屏幕（50/60Hz）或投影仪（24Hz）有明确的刷新率
 * 当摄像机帧率与屏幕刷新率不同步时，会产生周期性的亮度变化
 * 真实人脸：无规律的自然亮度变化
 * 屏幕采集：明确的周期性闪烁（周期 = 屏幕刷新周期 / 摄像机帧率）
 */
export class FlickerDetector {
  private cv: any = null
  private brightnessHistory: number[] = []
  private maxHistory: number = 300 // ~10 秒 @ 30fps
  private minSamples: number = 60
  private minPeriod: number = 5
  private maxPeriod: number = 50
  private strengthThreshold: number = 0.3

  constructor(flickerMaxHistory: number, flickerMinSamples: number, flickerMinPeriod: number, flickerMaxPeriod: number, flickerStrengthThreshold: number) { 
    this.maxHistory = flickerMaxHistory
    this.minSamples = flickerMinSamples
    this.minPeriod = flickerMinPeriod
    this.maxPeriod = flickerMaxPeriod
    this.strengthThreshold = flickerStrengthThreshold
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
  }

  /**
   * 检测频闪模式
   * @param gray - 灰度图像
   */
  detectFlicker(gray: any): FlickerDetectionResult {
    try {
      // 计算平均亮度
      const brightness = this.calculateAverageBrightness(gray)
      this.brightnessHistory.push(brightness)

      // 保持历史大小
      if (this.brightnessHistory.length > this.maxHistory) {
        this.brightnessHistory.shift()
      }

      if (this.brightnessHistory.length < this.minSamples) {
        return {
          isScreenCapture: false,
          confidence: 0.1,
          flickerFrequency: 0,
          flickerStrength: 0
        }
      }

      // 分析亮度变化的周期性
      const { frequency, strength, periodicity } = this.analyzeFlickerPeriodicity(
        this.brightnessHistory
      )

      // 检查是否是明确的屏幕刷新率（50Hz, 60Hz, 24Hz）
      const isScreenFlicker =
        (frequency > 6 && frequency < 7.5) || // 50Hz @ 30fps → 1.67 Hz
        (frequency > 7.5 && frequency < 8.5) || // 60Hz @ 30fps → 2 Hz
        (frequency > 2.5 && frequency < 3.5) // 24Hz 投影仪

      return {
        isScreenCapture: isScreenFlicker && strength > this.strengthThreshold,
        confidence: isScreenFlicker ? Math.min(strength, 1.0) : 0.0,
        flickerFrequency: frequency,
        flickerStrength: strength
      }
    } catch (error) {
      return {
        isScreenCapture: false,
        confidence: 0.0,
        flickerFrequency: 0,
        flickerStrength: 0
      }
    }
  }

  /**
   * 分析亮度序列的周期性
   */
  private analyzeFlickerPeriodicity(
    brightness: number[]
  ): {
    frequency: number
    strength: number
    periodicity: number
  } {
    const n = brightness.length

    // 计算自相关
    let maxAutocorr = 0
    let maxPeriod = 0

    // 检查周期范围（对应 0.17-1.67Hz @ 30fps）
    for (let period = this.minPeriod; period < this.maxPeriod; period++) {
      let autocorr = 0

      for (let i = 0; i < n - period; i++) {
        autocorr += (brightness[i] - brightness[i + period]) ** 2
      }

      autocorr = 1 - autocorr / (n * 255 * 255) // 归一化

      if (autocorr > maxAutocorr) {
        maxAutocorr = autocorr
        maxPeriod = period
      }
    }

    // 频率 = 1 / 周期 (Hz)
    const frequency = 30 / maxPeriod // 假设 30fps

    // 计算亮度变化的强度
    const mean = brightness.reduce((a, b) => a + b) / brightness.length
    const variance = brightness.reduce((sum, x) => sum + (x - mean) ** 2, 0) / brightness.length
    const strength = Math.sqrt(variance) / 255

    return {
      frequency,
      strength,
      periodicity: maxAutocorr
    }
  }

  /**
   * 计算平均亮度
   * @param gray - 灰度图像
   */
  private calculateAverageBrightness(gray: any): number {
    const cv = this.cv
    const mean = cv.mean(gray)
    return mean[0] // 0-255
  }

  reset(): void {
    this.brightnessHistory = []
  }
}

/**
 * 色彩异常检测 - 检测 RGB 色彩分离
 * 
 * 原理：
 * LCD 屏幕是 RGB 三色滤镜阵列
 * 当摄像机像素不完全对齐屏幕像素时，会产生色彩分离（chromatic aberration）
 * 真实人脸：RGB 通道完全对齐
 * 屏幕采集：可见的 RGB 分离或条纹
 */
export class ChromaticAberrationDetector {
  private cv: any = null
  private shiftThreshold: number = 0.5

  constructor(chromaticShiftThreshold: number) {
    this.shiftThreshold = chromaticShiftThreshold
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
  }

  /**
   * 检测 RGB 色彩分离
   */
  detectChromaticAberration(frame: any): ChromaticAberrationResult {
    try {
      const cv = this.cv
      // 分离 RGB 通道
      const channels: Array<any> = new Array(3)
      cv.split(frame, channels)

      const [bChannel, gChannel, rChannel] = channels

      // 计算通道之间的错位
      const redGreenShift = this.calculateChannelShift(rChannel, gChannel)
      const greenBlueShift = this.calculateChannelShift(gChannel, bChannel)

      const maxShift = Math.max(redGreenShift, greenBlueShift)

      // 屏幕采集：可见的错位
      // 真实图像：没有错位
      const isScreenCapture = maxShift > this.shiftThreshold

      channels.forEach(c => c.delete())

      return {
        isScreenCapture,
        confidence: Math.min(maxShift / 2.0, 1.0),
        aberrationAmount: maxShift
      }
    } catch (error) {
      return {
        isScreenCapture: false,
        confidence: 0.0,
        aberrationAmount: 0
      }
    }
  }

  /**
   * 计算两个通道之间的平均错位
   */
  private calculateChannelShift(channel1: any, channel2: any): number {
    const cv = this.cv
    // 使用相位相关（Phase Correlation）检测错位
    // 简化版本：计算通道差异

    const diff = new cv.Mat()
    const absVal = new cv.Mat()

    cv.absdiff(channel1, channel2, diff)
    cv.convertScaleAbs(diff, absVal, 1, 0)

    const mean = cv.mean(absVal)
    diff.delete()
    absVal.delete()

    // 将差异转换为像素错位量（简化）
    return mean[0] / 255.0 * 2.0 // 最多 2 像素错位
  }
}

/**
 * 像素网格检测 - 直接检测屏幕像素网格
 * 
 * 原理：
 * 屏幕由规则的像素网格组成
 * 使用统计方法可以检测这种规则的网格结构
 * 真实人脸：随机的像素分布
 * 屏幕采集：明确的网格结构
 */
export class PixelGridDetector {
  private cv: any = null
  private highFreqThreshold: number = 0.15
  private gridStrengthThreshold: number = 0.6

  constructor(gridHighFreqThreshold: number, gridStrengthThreshold: number) {
    this.highFreqThreshold = gridHighFreqThreshold
    this.gridStrengthThreshold = gridStrengthThreshold
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
  }

  /**
   * 检测像素网格
   * @param gray - 灰度图像
   */
  detectPixelGrid(gray: any): PixelGridDetectionResult {
    try {
      const cv = this.cv
      // 使用拉普拉斯算子检测高频成分（像素网格）
      const laplacian = new cv.Mat()
      cv.Laplacian(gray, laplacian, cv.CV_32F)

      // 计算高频能量
      const highFreqEnergy = this.calculateHighFreqEnergy(laplacian)

      // 分析网格规律性
      const gridStrength = this.analyzeGridRegularity(laplacian)

      laplacian.delete()

      // 屏幕特有的网格：高频能量高 + 强规律性
      const isScreenCapture = highFreqEnergy > this.highFreqThreshold && gridStrength > this.gridStrengthThreshold

      return {
        isScreenCapture,
        confidence: (highFreqEnergy + gridStrength) / 2.0,
        gridStrength,
        gridPeriod: this.estimateGridPeriod(gray)
      }
    } catch (error) {
      return {
        isScreenCapture: false,
        confidence: 0.0,
        gridStrength: 0,
        gridPeriod: 0
      }
    }
  }

  /**
   * 计算高频能量
   */
  private calculateHighFreqEnergy(laplacian: any): number {
    const data = laplacian.data32F
    let energy = 0

    for (let i = 0; i < data.length; i++) {
      energy += Math.abs(data[i])
    }

    return energy / (laplacian.rows * laplacian.cols * 255)
  }

  /**
   * 分析网格规律性
   */
  private analyzeGridRegularity(laplacian: any): number {
    // 计算拉普拉斯值的直方图
    // 网格应该产生特定的值分布

    // 简化：直接计算方差
    const data = laplacian.data32F as Float32Array
    const dataArray = Array.from(data) as number[]
    const mean = dataArray.reduce((a: number, b: number) => a + b) / dataArray.length
    const variance = dataArray.reduce((sum: number, x: number) => sum + (x - mean) ** 2, 0) / dataArray.length
    const stdDev = Math.sqrt(variance)

    // 高方差表示有明确的网格结构
    return Math.min(stdDev / 50.0, 1.0)
  }

  /**
   * 估计像素网格周期
   */
  private estimateGridPeriod(frame: any): number {
    // 典型屏幕分辨率对应的像素周期
    // 这是一个简化的估计
    const width = frame.cols
    const ppi = 96 // 假设 96 DPI
    const pixelSize = 25.4 / ppi // 毫米

    // 返回估计的周期（像素数）
    // 对于 1080p 屏幕：约 1 像素周期
    return 1.0
  }
}

/**
 * 帧重复检测 - 检测视频中是否有重复的帧
 * 
 * 原理：
 * 屏幕视频回放时，如果摄像机帧率与视频帧率不匹配，会有重复帧
 * 真实人脸：每帧都不同（自然变化）
 * 视频回放：某些帧重复出现
 */
export class FrameDuplicationDetector {
  private cv: any = null
  private frameHistory: Array<{
    data: Uint8ClampedArray
    timestamp: number
  }> = []
  private maxHistory: number = 30
  private threshold: number = 0.98 // 相似度阈值

  constructor(duplicateMaxHistory: number, duplicationSimilarityThreshold: number) {
    this.maxHistory = duplicateMaxHistory
    this.threshold = duplicationSimilarityThreshold
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
  }

  /**
   * 检测帧重复
   * @param gray - 灰度图像
   */
  detectFrameDuplication(gray: any): FrameDuplicationResult {
    try {
      const frameData = this.extractFrameData(gray)

      this.frameHistory.push({
        data: frameData,
        timestamp: Date.now()
      })

      if (this.frameHistory.length > this.maxHistory) {
        this.frameHistory.shift()
      }

      if (this.frameHistory.length < 10) {
        return {
          isVideoReplay: false,
          confidence: 0.1,
          duplicateCount: 0,
          averageSimilarity: 0
        }
      }

      // 检测重复帧
      const { duplicates, similarity } = this.detectDuplicates()

      const isVideoReplay = duplicates > 2 && similarity > this.threshold

      return {
        isVideoReplay,
        confidence: isVideoReplay ? similarity : 0.0,
        duplicateCount: duplicates,
        averageSimilarity: similarity
      }
    } catch (error) {
      return {
        isVideoReplay: false,
        confidence: 0.0,
        duplicateCount: 0,
        averageSimilarity: 0
      }
    }
  }

  /**
   * 提取帧数据用于比较
   * @param gray - 灰度图像
   */
  private extractFrameData(gray: any): Uint8ClampedArray {
    const cv = this.cv
    // 缩小尺寸以加快比较（64x64）
    const resized = new cv.Mat()
    cv.resize(gray, resized, new cv.Size(64, 64))

    const data = resized.data8U as Uint8ClampedArray

    resized.delete()

    return data
  }

  /**
   * 检测重复帧
   */
  private detectDuplicates(): {
    duplicates: number
    similarity: number
  } {
    let duplicateCount = 0
    let totalSimilarity = 0
    let comparisons = 0

    // 检查每一帧与前一帧的相似度
    for (let i = 1; i < this.frameHistory.length; i++) {
      const similarity = this.calculateSimilarity(
        this.frameHistory[i - 1].data,
        this.frameHistory[i].data
      )

      totalSimilarity += similarity
      comparisons++

      if (similarity > this.threshold) {
        duplicateCount++
      }
    }

    const averageSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0

    return {
      duplicates: duplicateCount,
      similarity: averageSimilarity
    }
  }

  /**
   * 计算两帧之间的相似度
   */
  private calculateSimilarity(frame1: Uint8ClampedArray, frame2: Uint8ClampedArray): number {
    if (frame1.length !== frame2.length) return 0

    let diff = 0
    for (let i = 0; i < frame1.length; i++) {
      diff += Math.abs(frame1[i] - frame2[i])
    }

    // 归一化相似度 (0-1，1 表示完全相同)
    return 1 - diff / (frame1.length * 255)
  }

  reset(): void {
    this.frameHistory = []
  }
}

/**
 * 综合屏幕采集检测引擎
 */
export class ScreenCaptureDetector {
  private moireDetector: MoirePatternDetector
  private flickerDetector: FlickerDetector
  private chromaticDetector: ChromaticAberrationDetector
  private gridDetector: PixelGridDetector
  private duplicationDetector: FrameDuplicationDetector

  // OpenCV instance
  private cv: any = null
  // 置信度阈值（默认 0.6）
  private confidenceThreshold: number = 0.6
  // 帧计数（用于检测就绪状态）
  private frameCount: number = 0
  // 最小帧数要求（默认5帧，平衡检测准确性和响应速度）
  private minFramesRequired: number = 5

  constructor(options: ScreenCaptureDetectorOptions) {
    this.confidenceThreshold = options.confidenceThreshold
    this.minFramesRequired = options.minFramesRequired
    this.moireDetector = new MoirePatternDetector(options.fftSize, options.moireThreshold)
    this.flickerDetector = new FlickerDetector(options.flickerMaxHistory, options.flickerMinSamples, options.flickerMinPeriod, options.flickerMaxPeriod, options.flickerStrengthThreshold)
    this.chromaticDetector = new ChromaticAberrationDetector(options.chromaticShiftThreshold)
    this.gridDetector = new PixelGridDetector(options.gridHighFreqThreshold, options.gridStrengthThreshold)
    this.duplicationDetector = new FrameDuplicationDetector(options.duplicationMaxHistory, options.duplicationSimilarityThreshold)
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
    this.moireDetector.setCVInstance(cvInstance)
    this.flickerDetector.setCVInstance(cvInstance)
    this.chromaticDetector.setCVInstance(cvInstance)
    this.gridDetector.setCVInstance(cvInstance)
    this.duplicationDetector.setCVInstance(cvInstance)
  }

  /**
   * 检查检测器是否已准备就绪
   * 只有累积足够的帧数，检测结果才足够可信
   * @returns true 如果已累积足够的帧，false 则仍需要更多帧
   */
  isReady(): boolean {
    return this.frameCount >= this.minFramesRequired
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

    // 累计帧数
    this.frameCount++

    const results: Array<{
      method: string
      isScreenCapture: boolean
      confidence: number
      details: any
    }> = []

      // 1. 莫尔纹检测（最可靠）
      const moireResult = this.moireDetector.detectMoirePattern(gray)
      results.push({
        method: 'Moire Pattern Detection',
        isScreenCapture: moireResult.isScreenCapture,
        confidence: moireResult.confidence,
        details: {
          strength: moireResult.moireStrength.toFixed(3),
          frequencies: moireResult.dominantFrequencies
        }
      })

      // 2. 频闪检测
      const flickerResult = this.flickerDetector.detectFlicker(gray)
      results.push({
        method: 'Flicker Detection',
        isScreenCapture: flickerResult.isScreenCapture,
        confidence: flickerResult.confidence,
        details: {
          frequency: flickerResult.flickerFrequency.toFixed(2),
          strength: flickerResult.flickerStrength.toFixed(3)
        }
      })

      // 3. 色彩异常检测
      const chromaticResult = this.chromaticDetector.detectChromaticAberration(frame)
      results.push({
        method: 'Chromatic Aberration Detection',
        isScreenCapture: chromaticResult.isScreenCapture,
        confidence: chromaticResult.confidence,
        details: {
          aberrationAmount: chromaticResult.aberrationAmount.toFixed(3)
        }
      })

      // 4. 像素网格检测
      const gridResult = this.gridDetector.detectPixelGrid(gray)
      results.push({
        method: 'Pixel Grid Detection',
        isScreenCapture: gridResult.isScreenCapture,
        confidence: gridResult.confidence,
        details: {
          gridStrength: gridResult.gridStrength.toFixed(3),
          period: gridResult.gridPeriod
        }
      })

      // 5. 帧重复检测
      const duplicationResult = this.duplicationDetector.detectFrameDuplication(gray)
      results.push({
        method: 'Frame Duplication Detection',
        isScreenCapture: duplicationResult.isVideoReplay,
        confidence: duplicationResult.confidence,
        details: {
          duplicateCount: duplicationResult.duplicateCount,
          similarity: duplicationResult.averageSimilarity.toFixed(3)
        }
      })
      
    // 综合评分
    const screenCaptureCount = results.filter(r => r.isScreenCapture).length
    const avgConfidence = results.length > 0 
      ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length 
      : 0

    // 使用配置的置信度阈值来判断是否是屏幕采集
    const isScreenCapture = screenCaptureCount >= 2 && avgConfidence > this.confidenceThreshold

    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    if (screenCaptureCount >= 4) riskLevel = 'high'
    else if (screenCaptureCount >= 2) riskLevel = 'medium'

    return new ScreenCaptureDetectionResult(
      isScreenCapture,
      isScreenCapture ? avgConfidence : 1 - avgConfidence,
      results,
      riskLevel
    )
  }

  reset(): void {
    this.frameCount = 0
    this.flickerDetector.reset()
    this.duplicationDetector.reset()
  }
}
