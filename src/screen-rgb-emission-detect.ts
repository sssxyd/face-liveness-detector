
export interface RgbEmissionDetectionConfig {
  // 频率带分析参数
  /** 低频段开始位置（相对于频谱长度的百分比） */
  low_freq_start_percent?: number
  /** 低频段结束位置（相对于频谱长度的百分比） */
  low_freq_end_percent?: number
  /** 能量比归一化因子 */
  energy_ratio_normalization_factor?: number

  // RGB 通道分析参数
  /** 通道均值差异的归一化因子 */
  channel_difference_normalization_factor?: number

  // 综合决策权重
  /** RGB 周期性能量权重 */
  energy_score_weight?: number
  /** RGB 通道不同步程度权重 */
  asymmetry_score_weight?: number
  /** 通道均值差异权重 */
  difference_factor_weight?: number

  // 判定阈值
  /** 屏幕拍摄的置信度阈值 */
  confidence_threshold?: number
}

export interface RgbEmissionDetectionResult {
  isScreenCapture: boolean
  confidence: number
  details: {
    rChannelEnergy: number
    gChannelEnergy: number
    bChannelEnergy: number
    rgbAsymmetry: number
    maxChannelDifference: number
  }
}

/**
 * RGB 发光模式检测的默认配置
 */
const DEFAULT_RGB_EMISSION_CONFIG: Required<RgbEmissionDetectionConfig> = {
  // 频率带分析参数
  low_freq_start_percent: 0.15,           // 低频段开始于 15% 处
  low_freq_end_percent: 0.35,             // 低频段结束于 35% 处
  energy_ratio_normalization_factor: 10,  // 能量比用 10 作为归一化因子

  // RGB 通道分析参数
  channel_difference_normalization_factor: 50,  // 通道差异用 50 作为归一化因子

  // 综合决策权重（总和应为 1.0）
  energy_score_weight: 0.40,        // RGB 周期性能量：40%
  asymmetry_score_weight: 0.40,     // RGB 通道不同步程度：40%
  difference_factor_weight: 0.20,   // 通道均值差异：20%

  // 判定阈值
  confidence_threshold: 0.60,  // 置信度 > 0.60 判定为屏幕
}

/**
 * 检测屏幕 RGB 子像素发光模式
 * 原理：屏幕由 RGB 三个子像素组成，各自独立发光
 *      这在频域中表现为 RGB 三个通道的"不同步"特征
 *      人脸皮肤没有这种特性
 *
 * @param cv - OpenCV 实例
 * @param bgrMat - BGR 格式的图像 Mat 对象
 * @param config - 检测配置（可选）
 * @returns RGB 发光模式检测结果
 */
export function detectRGBEmissionPattern(
  cv: any,
  bgrMat: any,
  config?: Partial<RgbEmissionDetectionConfig>
): RgbEmissionDetectionResult {
  const finalConfig = { ...DEFAULT_RGB_EMISSION_CONFIG, ...config }

  let rChannel: any, gChannel: any, bChannel: any

  try {
    // 1. 分离 BGR 通道（OpenCV 中是 BGR 顺序，不是 RGB）
    const channels = new cv.MatVector()
    cv.split(bgrMat, channels)

    bChannel = channels.get(0)  // B
    gChannel = channels.get(1)  // G
    rChannel = channels.get(2)  // R

    // 2. 分析每个通道的"周期性能量"（使用 DCT）
    const rEnergy = analyzeChannelPeriodicityEnergy(cv, rChannel, finalConfig)
    const gEnergy = analyzeChannelPeriodicityEnergy(cv, gChannel, finalConfig)
    const bEnergy = analyzeChannelPeriodicityEnergy(cv, bChannel, finalConfig)

    // 3. 计算 RGB 三个通道的"不同步"程度
    // 屏幕：三个通道各有各的发光强度（R、G、B 独立）
    // 人脸：三个通道值趋于一致（光线均匀照亮）
    const rgbAsymmetry = calculateRGBChannelAsymmetry(cv, rChannel, gChannel, bChannel, finalConfig)

    // 4. RGB 通道间的最大差异
    const maxChannelDifference = calculateMaxChannelMeanDifference(
      cv,
      rChannel,
      gChannel,
      bChannel,
      finalConfig
    )

    // 5. 综合决策
    const avgChannelEnergy = (rEnergy + gEnergy + bEnergy) / 3
    const energyScore = Math.min(1, avgChannelEnergy)
    const asymmetryScore = Math.min(1, rgbAsymmetry)
    const differenceFactor = Math.min(1, maxChannelDifference / finalConfig.channel_difference_normalization_factor)

    const screenEmissionScore =
      energyScore * finalConfig.energy_score_weight +
      asymmetryScore * finalConfig.asymmetry_score_weight +
      differenceFactor * finalConfig.difference_factor_weight

    const confidence = Math.min(1, screenEmissionScore)

    return {
      isScreenCapture: confidence > finalConfig.confidence_threshold,
      confidence,
      details: {
        rChannelEnergy: rEnergy,
        gChannelEnergy: gEnergy,
        bChannelEnergy: bEnergy,
        rgbAsymmetry,
        maxChannelDifference,
      }
    }
  } finally {
    // 清理资源
    if (rChannel) rChannel.delete()
    if (gChannel) gChannel.delete()
    if (bChannel) bChannel.delete()
  }
}

/**
 * 分析单个通道的"周期性能量"
 * 屏幕的 RGB 子像素会在频域中产生规则的周期峰值
 *
 * @param cv - OpenCV 实例
 * @param channel - 单个颜色通道 Mat
 * @param config - 检测配置
 * @returns 该通道的周期性能量分数（0-1）
 */
function analyzeChannelPeriodicityEnergy(
  cv: any,
  channel: any,
  config: Required<RgbEmissionDetectionConfig>
): number {
  try {
    // 转换到浮点格式用于 DCT
    const channelFloat = new cv.Mat()
    channel.convertTo(channelFloat, cv.CV_32F)

    // 1. 执行 DCT（离散余弦变换）
    const dct = new cv.Mat()
    cv.dct(channelFloat, dct)

    // 2. 计算 DCT 的幅度谱
    const spectrum = getDCTSpectrum(cv, dct)

    // 3. 定位"屏幕 RGB 子像素"周期对应的频率带
    // RGB 子像素周期通常在：2-5 cycles/mm 范围
    // 在 256x256 图像中对应：频率 bin 约 50-100
    // （取决于图像分辨率和屏幕距离）
    
    const lowFreqStart = Math.floor(spectrum.length * config.low_freq_start_percent)
    const lowFreqEnd = Math.floor(spectrum.length * config.low_freq_end_percent)
    
    let peakEnergy = 0
    for (let i = lowFreqStart; i < lowFreqEnd; i++) {
      peakEnergy = Math.max(peakEnergy, spectrum[i])
    }

    // 4. 计算背景能量（用于归一化）
    const avgEnergy = spectrum.reduce((a, b) => a + b) / spectrum.length
    
    // 5. 返回"信号与背景"的比值
    const energyRatio = peakEnergy / (avgEnergy + 1e-6)
    
    dct.delete()
    channelFloat.delete()

    return Math.min(1, energyRatio / config.energy_ratio_normalization_factor)
  } catch (e) {
    console.error('Error in analyzeChannelPeriodicityEnergy:', e)
    return 0
  }
}

/**
 * 获取 DCT 谱的幅度
 */
function getDCTSpectrum(cv: any, dctMat: any): Float32Array { 
  try {
    // DCT 输出就是频域表示，直接计算每行的平均值
    const spectrum = new Float32Array(dctMat.rows)
    
    for (let i = 0; i < dctMat.rows; i++) {
      let rowSum = 0
      const row = dctMat.row(i)
      
      for (let j = 0; j < dctMat.cols; j++) {
        const val = dctMat.at(i, j)
        rowSum += Math.abs(val)  // 使用绝对值作为幅度
      }
      
      spectrum[i] = rowSum / dctMat.cols
      row.delete()
    }
    
    return spectrum
  } catch (e) {
    console.error('Error in getDCTSpectrum:', e)
    return new Float32Array(dctMat.rows)
  }
}

/**
 * 计算 RGB 三个通道的"不同步"程度
 * 人脸：R、G、B 三个通道值很接近（灯光照射均匀）
 * 屏幕：R、G、B 各有各的发光强度（LCD 子像素独立）
 * 
 * @param cv OpenCV 实例
 * @param rChannel 红色通道 Mat
 * @param gChannel 绿色通道 Mat
 * @param bChannel 蓝色通道 Mat
 * @param config 检测配置（可选，使用默认值）
 * @returns 不同步程度得分 [0, 1]，值越大表示通道越不同步（屏幕特征）
 */
function calculateRGBChannelAsymmetry(
  cv: any,
  rChannel: any,
  gChannel: any,
  bChannel: any,
  config?: Partial<RgbEmissionDetectionConfig>
): number {
  
  try {
    // 应用配置（保留以备未来扩展）
    const finalConfig = { ...DEFAULT_RGB_EMISSION_CONFIG, ...config }

    // 1. 计算每个通道的平均值
    const rMean = cv.mean(rChannel)[0]
    const gMean = cv.mean(gChannel)[0]
    const bMean = cv.mean(bChannel)[0]

    // 2. 计算平均值的方差
    const means = [rMean, gMean, bMean]
    const overallMean = (rMean + gMean + bMean) / 3
    
    let variance = 0
    for (const m of means) {
      variance += (m - overallMean) ** 2
    }
    variance /= 3

    // 3. 计算标准差与平均值的比值（归一化）
    const stdDev = Math.sqrt(variance)
    const asymmetryScore = stdDev / (overallMean + 1)  // +1 防止除以 0

    // 人脸通常：asymmetryScore < 0.1
    // 屏幕通常：asymmetryScore > 0.2

    return Math.min(1, asymmetryScore)
  } catch (e) {
    console.error('Error in calculateRGBChannelAsymmetry:', e)
    return 0
  }
}

/**
 * 计算 RGB 通道均值的最大差异
 * 
 * @param cv OpenCV 实例
 * @param rChannel 红色通道 Mat
 * @param gChannel 绿色通道 Mat
 * @param bChannel 蓝色通道 Mat
 * @param config 检测配置（可选，使用默认值）
 * @returns RGB 通道均值的最大差异值 [0, 255]
 */
function calculateMaxChannelMeanDifference(
  cv: any,
  rChannel: any,
  gChannel: any,
  bChannel: any,
  config?: Partial<RgbEmissionDetectionConfig>
): number {
  
  try {
    // 应用配置（保留以备未来扩展）
    const finalConfig = { ...DEFAULT_RGB_EMISSION_CONFIG, ...config }

    const rMean = cv.mean(rChannel)[0]
    const gMean = cv.mean(gChannel)[0]
    const bMean = cv.mean(bChannel)[0]

    const maxDiff = Math.max(
      Math.abs(rMean - gMean),
      Math.abs(gMean - bMean),
      Math.abs(rMean - bMean)
    )

    return maxDiff
  } catch (e) {
    console.error('Error in calculateMaxChannelMeanDifference:', e)
    return 0
  }
}