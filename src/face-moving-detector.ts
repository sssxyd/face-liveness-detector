/**
 * 人脸运动检测器 - 基于 MediaPipe Face Mesh 的轻量级运动检测机制
 * 
 * 核心原理：
 * 通过分析连续帧间人脸关键点的几何变化，检测由头部姿态调整、表情变化或外部移动引起的形变信号。
 * 
 * 具体流程：
 * 1. 关键点获取：提取归一化的人脸关键点坐标（x, y ∈ [0,1]），共468个点
 * 2. 平移不变性处理：以鼻尖关键点（索引为1）为原点进行中心化
 * 3. 帧间位移计算：计算当前帧与前一帧的欧氏距离平均值
 * 4. 运动判定：若位移超过阈值，判定为运动状态
 */

import type { FaceResult } from '@vladmandic/human'

/**
 * 人脸运动检测结果详情
 */
export interface FaceMovingDetectionDetails {
  frameCount: number
  
  // ============ 运动强度指标 ============
  /** 当前帧的运动强度 (0-1) */
  currentMovement: number
  /** 历史帧的平均运动强度 */
  averageMovement: number
  /** 运动强度的标准差 */
  movementStdDev: number
  /** 历史帧中的最大运动强度 */
  maxMovement: number
  /** 历史帧中的最小运动强度 */
  minMovement: number
  
  // ============ 运动状态指标 ============
  /** 是否检测到有效运动 */
  isMoving: boolean
  /** 运动检测置信度 (0-1) */
  movementConfidence: number
  /** 连续运动帧数 */
  continuousMovingFrames: number
  /** 运动持续时长（秒） */
  movementDuration: number
  
  // ============ 中心化坐标偏移 ============
  /** 最后一帧的中心化关键点偏移（相对于鼻尖） */
  lastCentroidShift: number
  /** 中心化坐标的变化速率 */
  centroidShiftRate: number
}

/**
 * 人脸运动检测结果
 */
export class FaceMovingDetectionResult {
  isMoving: boolean
  details: FaceMovingDetectionDetails
  debug: Record<string, any>

  constructor(
    isMoving: boolean,
    details: FaceMovingDetectionDetails,
    debug: Record<string, any> = {}
  ) {
    this.isMoving = isMoving
    this.details = details
    this.debug = debug
  }

  getMessage(): string {
    if (this.details.frameCount < 2) {
      return '数据不足，无法进行运动检测'
    }

    if (!this.isMoving) {
      return ''
    }

    const confidence = (this.details.movementConfidence * 100).toFixed(0)
    const movement = (this.details.currentMovement * 1000).toFixed(1)
    const frames = this.details.continuousMovingFrames

    return `检测到人脸运动（强度: ${movement}, 置信度: ${confidence}%, 连续帧数: ${frames}）`
  }
}

export interface FaceMovingDetectorOptions {
  frameBufferSize?: number            // 缓冲帧数，用于计算时序特征
  movementThreshold?: number          // 运动阈值，超过此值判定为运动
  minContinuousFrames?: number        // 最小连续运动帧数，用于降噪
  nosePointIndex?: number             // 鼻尖关键点索引（用于中心化）
}

const DEFAULT_OPTIONS: Required<FaceMovingDetectorOptions> = {
  frameBufferSize: 30,                // 30帧
  movementThreshold: 0.015,           // 运动阈值：超过此值判定为运动
  minContinuousFrames: 1,             // 至少连续1帧运动才认为是有效运动
  nosePointIndex: 1,                  // MediaPipe Face Mesh 中鼻尖的索引
}

/**
 * 人脸运动检测器
 * 
 * 基于 MediaPipe Face Mesh 的468个关键点，通过分析帧间几何变化检测运动
 */
export class FaceMovingDetector {
  private config: Required<FaceMovingDetectorOptions>
  private frameBuffer: Array<{
    result: FaceResult
    timestamp: number // 高精度时间戳（毫秒）
  }> = []
  private movementHistory: number[] = []
  private continuousMovingCount: number = 0

  private emitDebug: (
    stage: string,
    message: string,
    details?: Record<string, any>,
    level?: 'info' | 'warn' | 'error'
  ) => void = () => {} // 默认空实现（不emit）  

  constructor(options?: Partial<FaceMovingDetectorOptions>) {
    this.config = { ...DEFAULT_OPTIONS, ...options }
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
   * 添加一帧的人脸检测结果
   * @param faceResult - 单帧的人脸检测结果
   * @param timestamp - 高精度时间戳（建议使用 performance.now()，单位毫秒）
   */
  addFrame(faceResult: FaceResult, timestamp: number = Date.now()): void {
    if (!faceResult.meshRaw || faceResult.meshRaw.length === 0) return

    this.frameBuffer.push({ result: faceResult, timestamp })

    // 保持缓冲区大小
    if (this.frameBuffer.length > this.config.frameBufferSize) {
      this.frameBuffer.shift()
      if (this.movementHistory.length > this.config.frameBufferSize) {
        this.movementHistory.shift()
      }
    }
  }

  /**
   * 执行人脸运动检测
   * @returns 检测结果
   */
  detect(): FaceMovingDetectionResult {
    const details: FaceMovingDetectionDetails = {
      frameCount: this.frameBuffer.length,
      currentMovement: 0,
      averageMovement: 0,
      movementStdDev: 0,
      maxMovement: 0,
      minMovement: 0,
      isMoving: false,
      movementConfidence: 0,
      continuousMovingFrames: 0,
      movementDuration: 0,
      lastCentroidShift: 0,
      centroidShiftRate: 0
    }

    // 帧数不足，无法检测
    if (this.frameBuffer.length < 2) {
      return new FaceMovingDetectionResult(false, details)
    }

    // ============ 计算当前帧的运动强度 ============
    const currentMovement = this.frameBuffer.length >= 2
      ? this.calculateMovement(
          this.frameBuffer[this.frameBuffer.length - 2].result,
          this.frameBuffer[this.frameBuffer.length - 1].result
        )
      : 0
    details.currentMovement = currentMovement
    this.movementHistory.push(currentMovement)

    // ============ 计算运动历史统计 ============
    if (this.movementHistory.length > 0) {
      details.averageMovement = this.calculateMean(this.movementHistory)
      details.movementStdDev = this.calculateStdDev(this.movementHistory)
      details.maxMovement = Math.max(...this.movementHistory)
      details.minMovement = Math.min(...this.movementHistory)
    }

    // ============ 运动状态判定 ============
    const isCurrentlyMoving = currentMovement > this.config.movementThreshold

    if (isCurrentlyMoving) {
      this.continuousMovingCount++
    } else {
      this.continuousMovingCount = 0
    }

    // 需要连续运动至少 minContinuousFrames 帧才认为是有效运动
    const hasValidMotion = this.continuousMovingCount >= this.config.minContinuousFrames

    details.isMoving = hasValidMotion
    details.continuousMovingFrames = this.continuousMovingCount
    details.movementDuration = this.calculateMovementDuration()

    // ============ 运动置信度计算 ============
    // 基于当前运动强度与阈值的比例
    details.movementConfidence = Math.min(
      1,
      currentMovement / this.config.movementThreshold
    )

    // ============ 中心化坐标偏移 ============
    const lastFrame = this.frameBuffer[this.frameBuffer.length - 1]
    details.lastCentroidShift = this.calculateCentroidShift(lastFrame.result)

    // 计算中心化坐标的变化速率（基于实际时间）
    details.centroidShiftRate = this.calculateCentroidShiftRate()

    return new FaceMovingDetectionResult(details.isMoving, details)
  }

  /**
   * 计算两帧之间的运动强度
   * 
   * 算法步骤：
   * 1. 对两帧的关键点进行中心化（以鼻尖为原点）
   * 2. 计算对应关键点之间的欧氏距离
   * 3. 取所有距离的平均值作为运动强度
   * 
   * @param prevFrame - 前一帧的人脸检测结果
   * @param currFrame - 当前帧的人脸检测结果
   * @returns 运动强度 (0-1)
   */
  private calculateMovement(prevFrame: FaceResult, currFrame: FaceResult): number {
    const prevMesh = prevFrame.meshRaw
    const currMesh = currFrame.meshRaw

    if (!prevMesh || !currMesh || prevMesh.length === 0 || currMesh.length === 0) {
      return 0
    }

    // ============ 第一步：中心化处理 ============
    const prevCentralized = this.centralizeMesh(prevMesh)
    const currCentralized = this.centralizeMesh(currMesh)

    if (prevCentralized.length === 0 || currCentralized.length === 0) {
      return 0
    }

    // ============ 第二步：计算帧间位移 ============
    let totalDisplacement = 0
    let validPointCount = 0

    for (let i = 0; i < Math.min(prevCentralized.length, currCentralized.length); i++) {
      const prev = prevCentralized[i]
      const curr = currCentralized[i]

      if (!prev || !curr) continue

      // 计算欧氏距离
      const dx = curr[0] - prev[0]
      const dy = curr[1] - prev[1]
      const distance = Math.sqrt(dx * dx + dy * dy)

      totalDisplacement += distance
      validPointCount++
    }

    // ============ 第三步：归一化运动强度 ============
    if (validPointCount === 0) {
      return 0
    }

    const averageDisplacement = totalDisplacement / validPointCount

    // 将位移归一化到 [0, 1] 范围
    // 假设最大合理位移为 0.1（相对于图像尺寸）
    // 超过此值仍记为 1.0
    const normalizedMovement = Math.min(1, averageDisplacement / 0.1)

    return normalizedMovement
  }

  /**
   * 对关键点网格进行中心化处理
   * 
   * 为消除人脸整体平移的干扰，以鼻尖（索引为 nosePointIndex）为原点
   * 将所有关键点的坐标转换为相对坐标：
   * p' = p - p_nose
   * 
   * @param mesh - 原始关键点坐标数组
   * @returns 中心化后的关键点坐标数组
   */
  private centralizeMesh(mesh: Array<[number, number, number?]>): Array<[number, number]> {
    if (mesh.length <= this.config.nosePointIndex) {
      return []
    }

    // 获取鼻尖坐标
    const nosePt = mesh[this.config.nosePointIndex]
    if (!nosePt) {
      return []
    }

    const noseX = nosePt[0]
    const noseY = nosePt[1]

    // 对每个点进行中心化
    const centralized: Array<[number, number]> = []
    for (const point of mesh) {
      if (!point) {
        centralized.push([0, 0])
        continue
      }

      const x = point[0] - noseX
      const y = point[1] - noseY

      centralized.push([x, y])
    }

    return centralized
  }

  /**
   * 计算中心化坐标相对于鼻尖的偏移量
   * 用于衡量关键点分布的整体位置变化
   * 
   * @param frame - 人脸检测结果
   * @returns 中心化坐标的偏移量
   */
  private calculateCentroidShift(frame: FaceResult): number {
    const mesh = frame.meshRaw
    if (!mesh || mesh.length === 0) {
      return 0
    }

    const centralized = this.centralizeMesh(mesh)
    if (centralized.length === 0) {
      return 0
    }

    // 计算所有中心化坐标到原点的距离平均值
    let totalDistance = 0
    let validCount = 0

    for (const point of centralized) {
      if (!point) continue
      const distance = Math.sqrt(point[0] * point[0] + point[1] * point[1])
      totalDistance += distance
      validCount++
    }

    if (validCount === 0) {
      return 0
    }

    return totalDistance / validCount
  }

  /**
   * 计算基于真实时间的运动持续时长（秒）
   */
  private calculateMovementDuration(): number {
    if (this.frameBuffer.length < 2) return 0
    const firstTimestamp = this.frameBuffer[0].timestamp
    const lastTimestamp = this.frameBuffer[this.frameBuffer.length - 1].timestamp
    return (lastTimestamp - firstTimestamp) / 1000 // 转为秒
  }

  /**
   * 计算中心化坐标的变化速率（单位：每秒）
   */
  private calculateCentroidShiftRate(): number {
    if (this.frameBuffer.length < 2) return 0

    const firstShift = this.calculateCentroidShift(this.frameBuffer[0].result)
    const lastShift = this.calculateCentroidShift(this.frameBuffer[this.frameBuffer.length - 1].result)
    const shiftDistance = Math.abs(lastShift - firstShift)

    const timeSec = (this.frameBuffer[this.frameBuffer.length - 1].timestamp - this.frameBuffer[0].timestamp) / 1000
    return timeSec > 0 ? shiftDistance / timeSec : 0
  }

  /**
   * 计算数组的平均值
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((a, b) => a + b) / values.length
  }

  /**
   * 计算数组的标准差
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0

    const mean = this.calculateMean(values)
    const squaredDiffs = values.map(v => (v - mean) ** 2)
    const variance = squaredDiffs.reduce((a, b) => a + b) / values.length

    return Math.sqrt(variance)
  }
  /**
   * 检查当前实例是否可用
   * 
   * @description 通过检查帧缓冲区长度来判断实例是否处于可用状态
   *              当帧缓冲区长度大于等于2时，认为实例可用
   * 
   * @returns {boolean} 如果实例可用返回true，否则返回false
   */
  isAvailable(): boolean {
    return this.frameBuffer.length >= 2
  }

  /**
   * 重置检测器
   */
  reset(): void {
    this.frameBuffer = []
    this.movementHistory = []
    this.continuousMovingCount = 0
  }

  /**
   * 获取当前缓冲区中的帧数
   */
  getFrameCount(): number {
    return this.frameBuffer.length
  }

  /**
   * 获取运动历史数据
   */
  getMovementHistory(): number[] {
    return [...this.movementHistory]
  }

  /**
   * 获取连续运动帧数
   */
  getContinuousMovingFrames(): number {
    return this.continuousMovingCount
  }
}
