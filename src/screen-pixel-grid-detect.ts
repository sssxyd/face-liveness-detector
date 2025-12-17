// ==================== 类型定义 ====================

/**
 * 像素网格检测结果
 */
export interface PixelGridDetectionResult {
  isScreenCapture: boolean
  confidence: number
  gridStrength: number
  gridPeriod: number
}

/**
 * 像素网格检测配置
 */
export interface PixelGridDetectionConfig {
  // 高频能量阈值（0-1，默认 0.15）
  high_freq_threshold?: number
  // 网格强度阈值（0-1，默认 0.6）
  grid_strength_threshold?: number
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: Required<PixelGridDetectionConfig> = {
  high_freq_threshold: 0.15,
  grid_strength_threshold: 0.6,
}

// ==================== 主入口函数 ====================

/**
 * 检测像素网格 - 直接检测屏幕像素网格
 * 
 * 原理：
 * 屏幕由规则的像素网格组成
 * 使用统计方法可以检测这种规则的网格结构
 * 真实人脸：随机的像素分布
 * 屏幕采集：明确的网格结构
 * 
 * 检测流程：
 * 
 * 1. 拉普拉斯变换：
 *    ├─ 应用拉普拉斯算子检测高频成分
 *    ├─ 拉普拉斯 = 二阶导数，用于检测边缘和高频信息
 *    └─ 屏幕像素网格产生强高频响应
 * 
 * 2. 高频能量计算：
 *    ├─ 计算拉普拉斯响应的绝对值和
 *    ├─ 归一化到 [0, 1] 范围
 *    └─ 屏幕网格：高能量（>0.15）
 * 
 * 3. 网格规律性分析：
 *    ├─ 计算拉普拉斯值的标准差
 *    ├─ 高标准差表示明确的网格结构
 *    └─ 屏幕网格：高规律性（>0.6）
 * 
 * 4. 网格周期估计：
 *    ├─ 根据图像尺寸估计像素网格周期
 *    └─ 用于调试和验证
 * 
 * 优势：
 * ✓ 计算成本低（仅需拉普拉斯变换）
 * ✓ 对各种屏幕类型有效
 * ✓ 快速实时处理
 * 
 * 限制：
 * ✗ 某些纹理图像可能产生误检
 * ✗ 低分辨率或模糊图像效果欠佳
 * 
 * @param cv - OpenCV 对象
 * @param gray - 灰度图像（8-bit 单通道）
 * @param config - 检测配置
 * @returns 像素网格检测结果
 * 
 * @example
 * const result = detectPixelGrid(
 *   cv,
 *   grayImage,
 *   { high_freq_threshold: 0.15, grid_strength_threshold: 0.6 }
 * )
 * if (result.isScreenCapture) {
 *   console.log('检测到屏幕像素网格，强度:', result.gridStrength)
 * }
 */
export function detectPixelGrid(
  cv: any,
  gray: any,
  config?: Partial<PixelGridDetectionConfig>
): PixelGridDetectionResult {
  try {
    const finalConfig = { ...DEFAULT_CONFIG, ...config }

    // 使用拉普拉斯算子检测高频成分（像素网格）
    const laplacian = new cv.Mat()
    cv.Laplacian(gray, laplacian, cv.CV_32F)

    // 计算高频能量
    const highFreqEnergy = calculateHighFreqEnergy(laplacian)

    // 分析网格规律性
    const gridStrength = analyzeGridRegularity(laplacian)

    laplacian.delete()

    // 屏幕特有的网格：高频能量高 + 强规律性
    const isScreenCapture =
      highFreqEnergy > finalConfig.high_freq_threshold &&
      gridStrength > finalConfig.grid_strength_threshold

    return {
      isScreenCapture,
      confidence: (highFreqEnergy + gridStrength) / 2.0,
      gridStrength,
      gridPeriod: estimateGridPeriod(gray),
    }
  } catch (error) {
    console.warn('[PixelGrid] Detection failed:', error)
    return {
      isScreenCapture: false,
      confidence: 0.0,
      gridStrength: 0,
      gridPeriod: 0,
    }
  }
}

// ==================== 辅助函数 ====================

/**
 * 计算高频能量
 * 
 * 原理：
 * 拉普拉斯算子捕捉图像的二阶导数，强调高频变化
 * 屏幕像素网格产生规则的高频响应
 * 
 * 计算方法：
 * 1. 遍历拉普拉斯响应矩阵的所有元素
 * 2. 计算绝对值的累计和
 * 3. 归一化到 [0, 1] 范围
 * 
 * 结果解读：
 * - energy > 0.15：屏幕采集（有明显像素网格）
 * - 0.05 < energy ≤ 0.15：可能是屏幕或高频纹理
 * - energy ≤ 0.05：自然图像（低频内容为主）
 * 
 * @param laplacian - 拉普拉斯变换后的矩阵（32-bit 浮点）
 * @returns 高频能量值（0-1）
 */
function calculateHighFreqEnergy(laplacian: any): number {
  const data = laplacian.data32F
  let energy = 0

  for (let i = 0; i < data.length; i++) {
    energy += Math.abs(data[i])
  }

  return energy / (laplacian.rows * laplacian.cols * 255)
}

/**
 * 分析网格规律性
 * 
 * 原理：
 * 屏幕像素网格产生的拉普拉斯值呈现特定的分布模式
 * 通过分析值的方差可以判断是否存在规则的网格结构
 * 
 * 数学基础：
 * 屏幕网格的规律性特征表现为拉普拉斯值的较高方差
 * 这是因为网格的周期性导致梯度的规律变化
 * 
 * 算法步骤：
 * 1. 提取拉普拉斯矩阵的所有数据
 * 2. 计算数据的平均值（mean）
 * 3. 计算数据的方差（variance）
 * 4. 计算标准差（stdDev）
 * 5. 归一化到 [0, 1] 范围
 * 
 * 阈值判定：
 * - 高规律性（>0.6）：明确的网格结构（屏幕）
 * - 中等规律性（0.3-0.6）：可能有重复纹理
 * - 低规律性（<0.3）：随机分布（自然图像）
 * 
 * @param laplacian - 拉普拉斯变换后的矩阵
 * @returns 网格规律性评分（0-1）
 */
function analyzeGridRegularity(laplacian: any): number {
  // 计算拉普拉斯值的直方图
  // 网格应该产生特定的值分布

  // 简化：直接计算标准差
  const data = laplacian.data32F as Float32Array
  const dataArray = Array.from(data) as number[]
  const mean = dataArray.reduce((a: number, b: number) => a + b) / dataArray.length
  const variance = dataArray.reduce((sum: number, x: number) => sum + (x - mean) ** 2, 0) / dataArray.length
  const stdDev = Math.sqrt(variance)

  // 高标准差表示有明确的网格结构
  return Math.min(stdDev / 50.0, 1.0)
}

/**
 * 估计像素网格周期
 * 
 * 原理：
 * 根据图像分辨率推断屏幕的像素密度和网格周期
 * 这是一个基于假设的简化估计
 * 
 * 方法：
 * 1. 获取图像宽度（对应屏幕宽度）
 * 2. 假设标准 DPI（96 DPI，对应 1080p 显示器）
 * 3. 计算物理像素大小
 * 4. 推断网格周期
 * 
 * 注意：
 * 实际周期取决于具体的屏幕类型：
 * - LCD 屏：RGB 子像素排列产生固定周期
 * - OLED 屏：类似的周期模式
 * - 投影仪：更大的周期
 * 
 * 当前实现返回固定值 1.0（以像素为单位）
 * 这表示最小化的周期估计
 * 
 * @param frame - 灰度图像矩阵
 * @returns 估计的网格周期（像素数）
 */
function estimateGridPeriod(frame: any): number {
  // 典型屏幕分辨率对应的像素周期
  // 这是一个简化的估计
  const width = frame.cols
  const ppi = 96 // 假设 96 DPI
  const pixelSize = 25.4 / ppi // 毫米

  // 返回估计的周期（像素数）
  // 对于 1080p 屏幕：约 1 像素周期
  return 1.0
}