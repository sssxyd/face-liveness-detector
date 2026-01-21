/**
 * 屏幕攻击检测结果详情
 */
export interface ScreenAttackDetectionDetails {
  frameCount: number
  
  // ============ 摩尔纹检测 ============
  /** 摩尔纹检测分数 */
  moireScore: number
  /** 像素网格强度 */
  pixelGridStrength: number
  /** 摩尔纹检测置信度 (0-1) */
  moireConfidence: number
  
  // ============ 判定结果 ============
  /** 是否检测到屏幕攻击 */
  isScreenAttack: boolean
  /** 屏幕攻击总置信度 (0-1) */
  screenAttackConfidence: number
  /** 特征（"moire"=摩尔纹分析） */
  feature: 'moire'
  
  // ============ 调试信息 ============
  debugInfo: {
    moireAnalysis?: any
  }
}

/**
 * 屏幕攻击检测结果
 */
export class ScreenAttackDetectionResult {
  isScreenAttack: boolean
  details: ScreenAttackDetectionDetails
  available: boolean = false
  trusted: boolean = false

  constructor(
    isScreenAttack: boolean,
    details: ScreenAttackDetectionDetails,
    available: boolean = false,
    trusted: boolean = false
  ) {
    this.isScreenAttack = isScreenAttack
    this.details = details
    this.available = available
    this.trusted = trusted
  }

  getMessage(): string {
    if (this.details.frameCount < 1) {
      return '未获得足够数据，无法进行屏幕攻击检测'
    }

    if (!this.isScreenAttack) return ''
    
    const confidence = (this.details.screenAttackConfidence * 100).toFixed(2)
    const reasons: string[] = []
    
    if (this.details.moireConfidence > 0.6) {
      const moireScore = (this.details.moireScore * 100).toFixed(2)
      reasons.push(`摩尔纹特征明显(${moireScore})`)
    }
    
    const reasonStr = reasons.length > 0 ? `（${reasons.join('、')}）` : ''
    return `检测到屏幕攻击${reasonStr}，置信度 ${confidence}%`
  }
}

export interface ScreenAttackDetectorOptions {
  // ============ 摩尔纹检测参数 ============
  moireThreshold?: number               // 摩尔纹检测阈值
  pixelGridSensitivity?: number         // 像素网格敏感度
  requiredFrameCount?: number           // 需至少有 N 帧都通过检测才判定为非屏幕攻击
  
  // ============ 综合判定参数 ============
  earlyDetectionThreshold?: number      // 早期检测阈值（超过此值立即判定）
}

const DEFAULT_SCREEN_OPTIONS: Required<ScreenAttackDetectorOptions> = {
  moireThreshold: 0.75,
  pixelGridSensitivity: 0.75,
  requiredFrameCount: 12,
  earlyDetectionThreshold: 0.9
}

/**
 * 屏幕攻击检测器
 * 
 * 检测方案：
 * 摩尔纹/像素网格分析（检测屏幕特有的周期性图案）
 */
export class ScreenAttackDetector {
  private config: Required<ScreenAttackDetectorOptions>
  private opencv: any | null = null
  private frameCount: number = 0

  private emitDebug: (
    stage: string,
    message: string,
    details?: Record<string, any>,
    level?: 'info' | 'warn' | 'error'
  ) => void = () => {} // 默认空实现

  constructor(options?: Partial<ScreenAttackDetectorOptions>) {
    this.config = { ...DEFAULT_SCREEN_OPTIONS, ...options }
  }

  /**
   * 设置 OpenCV 实例
   * @param opencv - TechStark opencv.js 实例
   */
  setOpencv(opencv: any): void {
    this.opencv = opencv
  }

  /**
   * 设置 emitDebug 方法（依赖注入）
   * @param emitDebugFn - 来自 FaceDetectionEngine 的 emitDebug 方法
   */
  setEmitDebug(
    emitDebugFn: (
      stage: string,
      message: string,
      details?: Record<string, any>,
      level?: 'info' | 'warn' | 'error'
    ) => void
  ): void {
    this.emitDebug = emitDebugFn
  }

  /**
   * 检测屏幕攻击
   * @param faceBox - 人脸区域框
   * @param grayMat - 灰度图像矩阵
   * @returns 检测结果
   */
  detect(grayMat: any): ScreenAttackDetectionResult {
    this.frameCount += 1

    const details: ScreenAttackDetectionDetails = {
      frameCount: this.frameCount,
      moireScore: 0,
      pixelGridStrength: 0,
      moireConfidence: 0,
      isScreenAttack: false,
      screenAttackConfidence: 0,
      feature: 'moire',
      debugInfo: {}
    }

    // 检查OpenCV是否已设置
    if (!this.opencv) {
      this.emitDebug('screen-attack', 'OpenCV未初始化', {}, 'warn')
      return new ScreenAttackDetectionResult(false, details)
    }

    try {
      // ============ 摩尔纹/像素网格分析 ============
      const moireAnalysis = this.analyzeMoirePattern(grayMat)
      details.moireScore = moireAnalysis.score
      details.pixelGridStrength = moireAnalysis.pixelGridStrength
      details.moireConfidence = moireAnalysis.confidence
      details.debugInfo.moireAnalysis = moireAnalysis.debug

      // 早期检测：如果摩尔纹分数过高，直接判定为屏幕攻击
      if (details.moireScore > this.config.earlyDetectionThreshold) {
        details.isScreenAttack = true
        details.screenAttackConfidence = details.moireScore
        details.feature = 'moire'
        this.emitDebug('screen-attack', '摩尔纹分析早期检测触发', {
          moireScore: details.moireScore,
          earlyThreshold: this.config.earlyDetectionThreshold
        })
        
        return new ScreenAttackDetectionResult(true, details, true, true)
      }

      // 基于摩尔纹置信度的判定
      details.isScreenAttack = details.moireConfidence > this.config.moireThreshold
      details.screenAttackConfidence = details.moireScore

      this.emitDebug('screen-attack', '摩尔纹分析完成', {
        moireScore: details.moireScore,
        isScreenAttack: details.isScreenAttack
      })

      return new ScreenAttackDetectionResult(details.isScreenAttack, details, true, this.frameCount >= this.config.requiredFrameCount)
    } catch (error) {
      this.emitDebug('screen-attack', `检测过程中发生错误: ${error}`, {}, 'error')
      return new ScreenAttackDetectionResult(false, details, false, false)
    }
  }

  /**
   * 摩尔纹/像素网格分析
   * 
   * 原理：
   * - 真实人脸：纹理在频域中分布较为随机
   * - 屏幕显示：像素阵列在频域中产生特有的摩尔纹和周期性图案
   * - 摄像头采样与屏幕像素网格的频率混叠效应
   */
  private analyzeMoirePattern(grayMat: any): {
    score: number
    pixelGridStrength: number
    confidence: number
    debug: any
  } {
    const cv = this.opencv
    let debugInfo: any = {}

    try {
      // 分析整个图像，而不是特定区域
      const analysisMat = grayMat

      // 确保图像是浮点类型用于FFT
      const floatMat = new cv.Mat()
      analysisMat.convertTo(floatMat, cv.CV_32F)

      // 创建复数矩阵用于FFT
      const planes = new cv.MatVector()
      const zeros = cv.Mat.zeros(floatMat.rows, floatMat.cols, cv.CV_32F)
      planes.push_back(floatMat)
      planes.push_back(zeros)

      // 执行2D FFT
      const complexI = new cv.Mat()
      cv.merge(planes, complexI)
      cv.dft(complexI, complexI, cv.DFT_COMPLEX_OUTPUT)

      // 计算幅度谱
      const mag = new cv.Mat()
      const planesVec = new cv.MatVector()
      cv.split(complexI, planesVec)
      
      const real = planesVec.get(0)
      const imag = planesVec.get(1)
      
      // 计算幅度: sqrt(real^2 + imag^2)
      cv.magnitude(real, imag, mag)

      // 转换为对数尺度以便可视化
      const matShift = new cv.Mat()
      mag.convertTo(matShift, cv.CV_32F)
      
      // 对数变换
      cv.add(cv.Mat.ones(mag.rows, mag.cols, cv.CV_32F), matShift, matShift)
      cv.log(matShift, matShift)

      // 重新排列四象限，使零频率分量位于中心
      const cx = Math.floor(matShift.cols / 2)
      const cy = Math.floor(matShift.rows / 2)
      
      const q0 = matShift.roi(new cv.Rect(0, 0, cx, cy))
      const q1 = matShift.roi(new cv.Rect(cx, 0, cx, cy))
      const q2 = matShift.roi(new cv.Rect(0, cy, cx, cy))
      const q3 = matShift.roi(new cv.Rect(cx, cy, cx, cy))

      const tmp = new cv.Mat()
      q0.copyTo(tmp)
      q3.copyTo(q0)
      tmp.copyTo(q3)
      
      q1.copyTo(tmp)
      q2.copyTo(q1)
      tmp.copyTo(q2)

      // 专门检测摩尔纹特征
      // 屏幕像素网格在频域中产生同心圆状的规律性模式
      const moireScore = this.analyzeMoireCharacteristics(matShift)
      const pixelGridStrength = this.calculatePixelGridStrength(matShift)

      // 综合分析摩尔纹特征
      let finalScore = 0
      let patternStrength = 0
      
      // 基于同心圆模式的分析
      if (moireScore > 0.3) {
        finalScore += moireScore * 0.6
      }
      
      // 基于像素网格强度的分析
      if (pixelGridStrength > 0.4) {
        finalScore += pixelGridStrength * 0.4
      }
      
      // 检查是否有清晰的周期性峰值
      const peaks = this.findMoirePeaks(matShift)
      const peakCount = peaks.length
      
      // 调整峰值计数的影响，避免过度敏感
      if (peakCount > 15) {
        // 使用对数缩放来减少大量峰值的影响
        const logPeakScore = Math.log(peakCount + 1) / 10.0
        finalScore += Math.min(0.2, logPeakScore) // 限制峰值贡献为0.2而不是0.3
      }      
      
      patternStrength = Math.max(moireScore, pixelGridStrength)

      // 限制分数范围
      finalScore = Math.min(1, Math.max(0, finalScore))

      // 计算置信度
      const confidence = finalScore * this.config.pixelGridSensitivity

      debugInfo = {
        moireScore,
        pixelGridStrength,
        peakCount,
        patternStrength,
        rawScore: finalScore
      }

      // 释放内存
      floatMat.delete()
      complexI.delete()
      mag.delete()
      matShift.delete()
      planes.delete()
      zeros.delete()
      planesVec.delete()
      real.delete()
      imag.delete()
      tmp.delete()

      return {
        score: finalScore,
        pixelGridStrength,
        confidence,
        debug: debugInfo
      }
    } catch (error) {
      this.emitDebug('screen-attack-moire', `摩尔纹分析出错: ${error}`, {}, 'error')
      return { score: 0, pixelGridStrength: 0, confidence: 0, debug: {} }
    }
  }

  /**
   * 分析频域中的摩尔纹特征
   */
  private analyzeMoireCharacteristics(spectrum: any): number {
    const centerX = Math.floor(spectrum.cols / 2)
    const centerY = Math.floor(spectrum.rows / 2)
    
    // 计算径向剖面图以检测同心圆模式
    const radialProfile = this.computeRadialProfile(spectrum, centerX, centerY)
    
    // 检查径向剖面的规律性（同心圆特征）
    let regularityScore = 0
    const stepSize = Math.max(1, Math.floor(radialProfile.length / 10))
    
    // 计算径向剖面的自相关性来检测规律性
    const autoCorrelation = this.calculateAutoCorrelation(radialProfile)
    
    // 使用stepSize来采样自相关函数以计算规律性得分
    let maxPeak = 0
    for (let i = 1; i < autoCorrelation.length / 4; i += stepSize) { // 使用stepSize作为步长
      if (autoCorrelation[i] > maxPeak) {
        maxPeak = autoCorrelation[i]
      }
    }
    
    // 根据最大峰值确定摩尔纹特征强度
    regularityScore = Math.min(1, maxPeak / 10.0) // 归一化
    
    return regularityScore
  }

  /**
   * 计算像素网格强度
   */
  private calculatePixelGridStrength(spectrum: any): number {
    const cv = this.opencv
    
    // 创建用于存储均值和标准差的标量
    const mean = new cv.Mat()
    const stddev = new cv.Mat()
    
    // 计算频谱的均值和标准差
    cv.meanStdDev(spectrum, mean, stddev)
    
    // 获取标准差的值
    let spectrumStdDev = 0
    if (stddev.data64F && stddev.data64F.length > 0) {
      spectrumStdDev = stddev.data64F[0]
    } else if (stddev.data32F && stddev.data32F.length > 0) {
      spectrumStdDev = stddev.data32F[0]
    } else {
      // 如果无法获取数据，则手动计算
      let sum = 0
      let sumSq = 0
      const data = spectrum.data32F || spectrum.data64F
      if (data) {
        for (let i = 0; i < data.length; i++) {
          sum += data[i]
          sumSq += data[i] * data[i]
        }
        const meanVal = sum / data.length
        const variance = (sumSq / data.length) - (meanVal * meanVal)
        spectrumStdDev = Math.sqrt(variance)
      }
    }

    // 释放内存
    mean.delete()
    stddev.delete()
    
    // 归一化标准差到0-1范围
    const normalizedStdDev = Math.min(1, spectrumStdDev / 5.0)
    
    return normalizedStdDev
  }

  /**
   * 查找频域中的摩尔纹峰值
   */
  private findMoirePeaks(spectrum: any): Array<{x: number, y: number, value: number}> {
    const cv = this.opencv
    const peaks: Array<{x: number, y: number, value: number}> = []
    
    // 使用更严格的峰值检测方法
    const kernel = cv.Mat.ones(5, 5, cv.CV_8UC1) // 使用更大的核来减少噪声
    
    // 膨胀操作以找到局部最大值
    const dilated = new cv.Mat()
    cv.dilate(spectrum, dilated, kernel)
    
    // 比较原图和膨胀后的图，相等的位置即为局部最大值
    const localMaxMask = new cv.Mat()
    cv.compare(spectrum, dilated, localMaxMask, cv.CMP_EQ)
    
    // 查找非零点（即峰值位置）
    for (let y = 2; y < spectrum.rows - 2; y++) { // 增加边界范围
      for (let x = 2; x < spectrum.cols - 2; x++) {
        const maskIndex = y * localMaxMask.cols + x
        // 使用正确的数组访问方式
        if (localMaxMask.data[maskIndex] !== 0) {
          const spectrumIndex = y * spectrum.cols + x
          const val = spectrum.data32F ? spectrum.data32F[spectrumIndex] : 0
          // 提高峰值阈值以减少噪声影响
          if (val > 5.0) { // 从3.0提高到5.0，只保留更显著的峰值
            peaks.push({ x, y, value: val })
          }
        }
      }
    }
    
    // 限制峰值数量以防止过度计数
    // 只返回最强的前100个峰值
    peaks.sort((a, b) => b.value - a.value)
    const limitedPeaks = peaks.slice(0, 100)
    
    // 释放内存
    kernel.delete()
    dilated.delete()
    localMaxMask.delete()
    
    return limitedPeaks
  }

  /**
   * 计算径向剖面图
   */
  private computeRadialProfile(spectrum: any, centerX: number, centerY: number): number[] {
    const profile: number[] = []
    
    const maxRadius = Math.min(centerX, centerY)
    
    for (let r = 0; r < maxRadius; r++) {
      let sum = 0
      let count = 0
      
      for (let angle = 0; angle < 360; angle += 5) { // 每5度采样一次
        const rad = angle * Math.PI / 180
        const x = Math.round(centerX + r * Math.cos(rad))
        const y = Math.round(centerY + r * Math.sin(rad))
        
        if (x >= 0 && x < spectrum.cols && y >= 0 && y < spectrum.rows) {
          const index = y * spectrum.cols + x
          if (spectrum.data32F && index < spectrum.data32F.length) {
            const value = spectrum.data32F[index]
            sum += value
            count++
          }
        }
      }
      
      profile.push(count > 0 ? sum / count : 0)
    }
    
    return profile
  }

  /**
   * 计算数组的自相关
   */
  private calculateAutoCorrelation(data: number[]): number[] {
    const n = data.length
    const result: number[] = new Array(n).fill(0)
    
    for (let lag = 0; lag < n; lag++) {
      let sum = 0
      for (let i = 0; i < n - lag; i++) {
        sum += data[i] * data[i + lag]
      }
      result[lag] = sum / (n - lag)
    }
    
    return result
  }

  /**
   * 重置检测器
   */
  reset(): void {
    this.frameCount = 0
  }
}