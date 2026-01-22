/**
 * 照片攻击检测器
 * 
 * 关键点运动透视一致性检验
 * - 比较鼻尖、脸颊、耳朵等在多帧中的 2D 位移比例
 * - 真实人脸因透视效应，近处点移动幅度 > 远处点
 * - 照片上所有点按同一仿射变换移动 → 运动向量高度一致
 */

import type { FaceResult } from '@vladmandic/human'

/**
 * 照片攻击检测结果详情
 */
export interface PhotoAttackDetectionDetails {
  frameCount: number
  
  // ============ 运动透视一致性检验 ============
  /** 各关键点运动位移的标准差（高=真实人脸，低=照片） */
  motionDisplacementVariance: number
  /** 近处点与远处点运动幅度的比值 */
  perspectiveRatio: number
  /** 运动向量的方向一致性（高=照片，低=真实人脸） */
  motionDirectionConsistency: number
  /** 仿射变换模式匹配度（高=照片特征） */
  affineTransformPatternMatch: number
  /** 运动透视一致性置信度 (0-1) */
  perspectiveScore: number
  
  // ============ 综合判定 ============
  /** 是否检测到照片 */
  isPhoto: boolean
  /** 照片检测总置信度 (0-1) */
  photoConfidence: number
}

/**
 * 照片攻击检测结果
 */
export class PhotoAttackDetectionResult {
  isPhoto: boolean
  details: PhotoAttackDetectionDetails
  available: boolean = false
  trusted: boolean = false

  constructor(
    isPhoto: boolean,
    details: PhotoAttackDetectionDetails,
    available: boolean = false,
    trusted: boolean = false
  ) {
    this.isPhoto = isPhoto
    this.details = details
    this.available = available
    this.trusted = trusted
  }

  getMessage(): string {
    if (this.details.frameCount < 3) {
      return '数据不足，无法进行照片检测'
    }

    if (!this.isPhoto) return ''
    
    const confidence = (this.details.photoConfidence * 100).toFixed(0)
    const reasons: string[] = []
    
    if (this.details.perspectiveScore > 0.5) {
      const motionVar = this.details.motionDisplacementVariance.toFixed(3)
      const consistency = (this.details.motionDirectionConsistency * 100).toFixed(0)
      reasons.push(`运动一致性过高(${consistency}%)，位移方差(${motionVar})`)
    }
    
    const reasonStr = reasons.length > 0 ? `（${reasons.join('、')}）` : ''
    return `检测到照片攻击${reasonStr}，置信度 ${confidence}%`
  }
}

export interface PhotoAttackDetectorOptions {
  frameBufferSize?: number              // 缓冲帧数，用于计算时序特征
  requiredFrameCount?: number           // 可信赖所需的最小帧数
  motionVarianceThreshold?: number      // 运动方差阈值
  perspectiveRatioThreshold?: number    // 透视比率阈值
  motionConsistencyThreshold?: number   // 运动一致性阈值
}

const DEFAULT_OPTIONS: Required<PhotoAttackDetectorOptions> = {
  frameBufferSize: 15,                  // 15帧 (0.5秒@30fps)
  requiredFrameCount: 15,               // 可信赖所需的最小帧数
  motionVarianceThreshold: 0.005,       // 运动方差阈值：真实人脸 > 0.02，照片 < 0.01
  perspectiveRatioThreshold: 1.05,      // 透视比率阈值：真实人脸 > 1, 照片 0.9 ~ 1.0
  motionConsistencyThreshold: 0.8,      // 运动一致性阈值：真实人脸 < 0.5，照片 > 0.8
}
/**
 * 照片攻击检测器
 * 
 * 运动透视一致性检验（纯 2D 几何分析）
 */
export class PhotoAttackDetector {
  private config: Required<PhotoAttackDetectorOptions>
  private frameBuffer: FaceResult[] = []
  private frameCount: number = 0

  private emitDebug: (
    stage: string,
    message: string,
    details?: Record<string, any>,
    level?: 'info' | 'warn' | 'error'
  ) => void = () => {} // 默认空实现（不emit）  

  constructor(options?: Partial<PhotoAttackDetectorOptions>) {
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
   */
  addFrame(faceResult: FaceResult): void {
    if (!faceResult.meshRaw || faceResult.meshRaw.length === 0) return

    this.frameCount++
    this.frameBuffer.push(faceResult)

    // 保持缓冲区大小
    if (this.frameBuffer.length > this.config.frameBufferSize) {
      this.frameBuffer.shift()
    }
  }

  /**
   * 执行照片攻击检测
   * @returns 检测结果
   */
  detect(): PhotoAttackDetectionResult {
    const details: PhotoAttackDetectionDetails = {
      frameCount: this.frameCount,
      motionDisplacementVariance: 0,
      perspectiveRatio: 0,
      motionDirectionConsistency: 0,
      affineTransformPatternMatch: 0,
      perspectiveScore: 0,
      isPhoto: false,
      photoConfidence: 0,
    }

    // 帧数不足，无法检测
    if (this.frameBuffer.length < 3) {
      return new PhotoAttackDetectionResult(false, details)
    }

    // ============ 运动透视一致性检验 ============
    const perspectiveAnalysis = this.analyzePerspectiveConsistency()
    details.motionDisplacementVariance = perspectiveAnalysis.motionDisplacementVariance
    details.perspectiveRatio = perspectiveAnalysis.perspectiveRatio
    details.motionDirectionConsistency = perspectiveAnalysis.motionDirectionConsistency
    details.affineTransformPatternMatch = perspectiveAnalysis.affineTransformPatternMatch
    details.perspectiveScore = perspectiveAnalysis.score

    details.isPhoto = perspectiveAnalysis.score > 0.5
    details.photoConfidence = perspectiveAnalysis.score

    return new PhotoAttackDetectionResult(details.isPhoto, details, true, this.frameCount >= this.config.requiredFrameCount)
  }

  /**
   * 运动透视一致性检验
   * 
   * 原理：
   * - 真实人脸运动：由于透视效应，近处点移动幅度大，远处点移动幅度小
   * - 照片攻击：所有点按照同一仿射变换移动，各点位移比例完全相同
   * - 通过分析多帧中各关键点的位移向量，可以判断是否存在这种一致性模式
   */
  private analyzePerspectiveConsistency(): {
    motionDisplacementVariance: number
    perspectiveRatio: number
    motionDirectionConsistency: number
    affineTransformPatternMatch: number
    score: number
  } {
    // 需要至少 3 帧来计算运动
    if (this.frameBuffer.length < 3) {
      return {
        motionDisplacementVariance: 0,
        perspectiveRatio: 0,
        motionDirectionConsistency: 0,
        affineTransformPatternMatch: 0,
        score: 0
      }
    }

    // 选择关键特征点进行分析
    // 鼻子：近处点
    // 脸颊：中距离点
    // 耳朵：远处点
    const keyPointIndices = this.selectKeyPointIndices()

    // 计算各关键点在多帧中的位移向量
    const displacements = this.computeDisplacements(keyPointIndices)

    // 1. 计算各关键点位移的标准差
    // 真实人脸：各点位移差异大 -> 高方差
    // 照片：各点位移一致 -> 低方差
    const motionDisplacementVariance = this.calculateMotionVariance(displacements)

    // 2. 计算透视比率（近处点位移 / 远处点位移）
    // 真实人脸：比率 > 1（近处点移动幅度大）
    // 照片：比率 ≈ 1（所有点移动幅度相同）
    const perspectiveRatio = this.calculatePerspectiveRatio(displacements, keyPointIndices)

    // 3. 计算运动向量的方向一致性
    // 照片：所有点的运动向量方向高度一致
    // 真实人脸：各点运动方向差异大
    const motionDirectionConsistency = this.calculateDirectionConsistency(displacements)

    // 4. 计算仿射变换模式匹配度
    // 尝试用单一仿射变换拟合所有点的位移
    // 照片特征：拟合度高（高度一致的仿射变换）
    // 真实人脸：拟合度低（各点运动不符合单一变换）
    const affineTransformPatternMatch = this.calculateAffineTransformMatch(displacements)

    // 综合计算置信度
    // 各个指标合并：
    // - 位移方差越小（接近0）-> 照片特征越明显 -> score高
    // - 透视比率越接近1 -> 照片特征 -> score高
    // - 方向一致性越高 -> 照片特征 -> score高
    // - 仿射变换匹配度越高 -> 照片特征 -> score高

    const variance_indicator = Math.max(0, 
      1 - (motionDisplacementVariance / this.config.motionVarianceThreshold)
    )
    
    // 修改透视比率计算逻辑以支持阈值大于等于1的情况
    let ratio_indicator = 0;
    // 增强perspectiveRatio的灵敏度，当小于1时给予更高权重
    if (perspectiveRatio < 1) {
      // perspectiveRatio < 1: 近处点移动 < 远处点，明显照片特征 → 非常高分
      // 使用更强的非线性放大，让小于1的值得到显著更高的分数
      ratio_indicator = 0.95; // 表示非常像照片
      // const deviation = 1 - perspectiveRatio
      // ratio_indicator = Math.min(1, deviation * 100) // 从10提高到100，增强灵敏度
    } else if (this.config.perspectiveRatioThreshold === 1) {
      // 阈值等于1且perspectiveRatio >= 1的情况
      // 近处点移动 >= 远处点，符合透视效应 → 低分
      ratio_indicator = 0
    } else if (this.config.perspectiveRatioThreshold < 1) {
      // 阈值小于1时的逻辑
      const denominator = 1 - this.config.perspectiveRatioThreshold
      ratio_indicator = Math.max(0, 
        1 - Math.abs(perspectiveRatio - 1) / denominator
      );
    } else {
      // 阈值大于1时，真实人脸应有更高比率
      // 如果透视比率大于阈值，则更可能是真实人脸，返回低分（非照片）
      // 如果透视比率小于等于阈值，则可能是照片，返回高分
      if (perspectiveRatio < this.config.perspectiveRatioThreshold) {
        // 透视比率小于阈值，更像照片
        ratio_indicator = Math.max(0, 
          1 - (this.config.perspectiveRatioThreshold - perspectiveRatio) / this.config.perspectiveRatioThreshold
        );
      } else {
        // 透视比率大于阈值，更像真实人脸
        ratio_indicator = 0; // 真实人脸，返回低分
      }
    }
    
    const consistency_indicator = Math.min(1,
      motionDirectionConsistency / this.config.motionConsistencyThreshold
    )
    
    const affine_indicator = affineTransformPatternMatch

    // 改进的计分算法：
    // - 透视比率非常接近1（或小于1），表明是照片
    if (ratio_indicator > 0.9) {
      return {
        motionDisplacementVariance,
        perspectiveRatio,
        motionDirectionConsistency,
        affineTransformPatternMatch,
        score: ratio_indicator
      };
    }
    
    // 没有指标明显表明是照片，使用加权平均
    // 给予ratio_indicator更高的权重（2倍），其他指标保持原有权重
    const score = Math.min(1, 
      (variance_indicator + ratio_indicator * 2 + consistency_indicator + affine_indicator) / 5
    )

    return {
      motionDisplacementVariance,
      perspectiveRatio,
      motionDirectionConsistency,
      affineTransformPatternMatch,
      score
    }
  }

  /**
   * 选择用于分析的关键点索引
   * 选择鼻子（近处）、脸颊（中距离）、耳朵（远处）作为代表
   */
  private selectKeyPointIndices(): { near: number[]; mid: number[]; far: number[] } {
    // MediaPipe 468个关键点的已知索引
    // 这些是常用的特征点索引
    return {
      near: [1, 4, 6, 195],              // 鼻尖及周围（近处）
      mid: [127, 356],                   // 脸颊（中距离）
      far: [162, 389]                    // 耳朵（远处）
    }
  }

  /**
   * 计算各关键点在多帧中的位移向量
   */
  private computeDisplacements(keyPointIndices: { near: number[]; mid: number[]; far: number[] }): {
    near: Array<{ x: number; y: number; magnitude: number }>
    mid: Array<{ x: number; y: number; magnitude: number }>
    far: Array<{ x: number; y: number; magnitude: number }>
  } {
    const result: {
      near: Array<{ x: number; y: number; magnitude: number }>
      mid: Array<{ x: number; y: number; magnitude: number }>
      far: Array<{ x: number; y: number; magnitude: number }>
    } = { near: [], mid: [], far: [] }

    // 遍历帧对，计算位移
    for (let i = 1; i < this.frameBuffer.length; i++) {
      const prevMesh = this.frameBuffer[i - 1].meshRaw
      const currMesh = this.frameBuffer[i].meshRaw

      if (!prevMesh || !currMesh) continue

      // 计算近处点的位移
      for (const idx of keyPointIndices.near) {
        if (idx < prevMesh.length && idx < currMesh.length) {
          const displacement = {
            x: currMesh[idx][0] - prevMesh[idx][0],
            y: currMesh[idx][1] - prevMesh[idx][1],
            magnitude: 0
          }
          displacement.magnitude = Math.sqrt(displacement.x ** 2 + displacement.y ** 2)
          result.near.push(displacement)
        }
      }

      // 计算中距离点的位移
      for (const idx of keyPointIndices.mid) {
        if (idx < prevMesh.length && idx < currMesh.length) {
          const displacement = {
            x: currMesh[idx][0] - prevMesh[idx][0],
            y: currMesh[idx][1] - prevMesh[idx][1],
            magnitude: 0
          }
          displacement.magnitude = Math.sqrt(displacement.x ** 2 + displacement.y ** 2)
          result.mid.push(displacement)
        }
      }

      // 计算远处点的位移
      for (const idx of keyPointIndices.far) {
        if (idx < prevMesh.length && idx < currMesh.length) {
          const displacement = {
            x: currMesh[idx][0] - prevMesh[idx][0],
            y: currMesh[idx][1] - prevMesh[idx][1],
            magnitude: 0
          }
          displacement.magnitude = Math.sqrt(displacement.x ** 2 + displacement.y ** 2)
          result.far.push(displacement)
        }
      }
    }

    return result
  }

  /**
   * 计算运动位移的方差
   * 低方差 = 照片（所有点一致运动）
   * 高方差 = 真实人脸（各点运动差异大）
   */
  private calculateMotionVariance(displacements: {
    near: Array<{ magnitude: number }>
    mid: Array<{ magnitude: number }>
    far: Array<{ magnitude: number }>
  }): number {
    const allMagnitudes: number[] = []
    
    allMagnitudes.push(...displacements.near.map(d => d.magnitude))
    allMagnitudes.push(...displacements.mid.map(d => d.magnitude))
    allMagnitudes.push(...displacements.far.map(d => d.magnitude))

    if (allMagnitudes.length === 0) return 0

    return this.calculateVariance(allMagnitudes)
  }

  /**
   * 计算透视比率（近处点位移 / 远处点位移）
   * 真实人脸：比率 > 1
   * 照片：比率 ≈ 1
   */
  private calculatePerspectiveRatio(
    displacements: {
      near: Array<{ magnitude: number }>
      mid: Array<{ magnitude: number }>
      far: Array<{ magnitude: number }>
    },
    keyPointIndices: { near: number[]; mid: number[]; far: number[] }
  ): number {
    const nearMagnitudes = displacements.near.map(d => d.magnitude)
    const farMagnitudes = displacements.far.map(d => d.magnitude)

    if (nearMagnitudes.length === 0 || farMagnitudes.length === 0) return 1

    const nearAvg = nearMagnitudes.reduce((a, b) => a + b) / nearMagnitudes.length
    const farAvg = farMagnitudes.reduce((a, b) => a + b) / farMagnitudes.length

    if (farAvg === 0) return 1

    return nearAvg / farAvg
  }

  /**
   * 计算运动向量的方向一致性
   * 照片：所有点的运动方向高度一致 -> 高分
   * 真实人脸：各点运动方向差异大 -> 低分
   */
  private calculateDirectionConsistency(displacements: {
    near: Array<{ x: number; y: number }>
    mid: Array<{ x: number; y: number }>
    far: Array<{ x: number; y: number }>
  }): number {
    const allDisplacements: Array<{ x: number; y: number }> = []
    
    allDisplacements.push(...displacements.near)
    allDisplacements.push(...displacements.mid)
    allDisplacements.push(...displacements.far)

    if (allDisplacements.length < 2) return 0

    // 计算平均方向
    const avgX = allDisplacements.reduce((sum, d) => sum + d.x, 0) / allDisplacements.length
    const avgY = allDisplacements.reduce((sum, d) => sum + d.y, 0) / allDisplacements.length
    const avgMagnitude = Math.sqrt(avgX ** 2 + avgY ** 2)

    if (avgMagnitude === 0) return 0

    // 规范化平均方向
    const avgDirX = avgX / avgMagnitude
    const avgDirY = avgY / avgMagnitude

    // 计算每个位移向量与平均方向的夹角余弦值
    let totalConsistency = 0
    for (const d of allDisplacements) {
      const magnitude = Math.sqrt(d.x ** 2 + d.y ** 2)
      if (magnitude === 0) continue

      const dirX = d.x / magnitude
      const dirY = d.y / magnitude

      // 夹角的余弦值（-1到1，1表示完全一致）
      const cosAngle = dirX * avgDirX + dirY * avgDirY
      
      // 转换为 0-1 范围（0表示垂直，1表示平行）
      totalConsistency += (cosAngle + 1) / 2
    }

    return totalConsistency / allDisplacements.length
  }

  /**
   * 计算仿射变换模式匹配度
   * 使用更精确的仿射变换模型拟合所有点的位移
   * 拟合度高 = 照片特征
   */
  private calculateAffineTransformMatch(displacements: {
    near: Array<{ x: number; y: number }>
    mid: Array<{ x: number; y: number }>
    far: Array<{ x: number; y: number }>
  }): number {
    const allDisplacements: Array<{ x: number; y: number }> = []
    allDisplacements.push(...displacements.near)
    allDisplacements.push(...displacements.mid)
    allDisplacements.push(...displacements.far)

    if (allDisplacements.length < 3) return 0

    // 计算各点位移与整体平均位移的相似度
    // 照片攻击中，各点位移应高度相似（同一仿射变换）
    const avgX = allDisplacements.reduce((sum, d) => sum + d.x, 0) / allDisplacements.length
    const avgY = allDisplacements.reduce((sum, d) => sum + d.y, 0) / allDisplacements.length
    const avgMagnitude = Math.sqrt(avgX ** 2 + avgY ** 2)

    if (avgMagnitude === 0) return 0

    // 计算每个位移向量与平均位移向量的相似度
    let totalSimilarity = 0
    for (const d of allDisplacements) {
      const displacementMagnitude = Math.sqrt(d.x ** 2 + d.y ** 2)
      if (displacementMagnitude === 0) {
        // 没有位移的点视为与平均位移一致
        totalSimilarity += 1
        continue
      }

      // 计算方向相似度（点积）
      const directionSimilarity = (d.x * avgX + d.y * avgY) / (displacementMagnitude * avgMagnitude)
      
      // 计算幅度相似度
      const magnitudeSimilarity = Math.min(displacementMagnitude, avgMagnitude) / Math.max(displacementMagnitude, avgMagnitude)
      
      // 综合方向和幅度相似度
      const similarity = (directionSimilarity + 1) / 2 * magnitudeSimilarity
      totalSimilarity += similarity
    }

    // 返回平均相似度
    return totalSimilarity / allDisplacements.length
  }

  /**
   * 计算方差（用于数组）
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0

    const mean = values.reduce((a, b) => a + b) / values.length
    const squaredDiffs = values.map(v => (v - mean) ** 2)
    return squaredDiffs.reduce((a, b) => a + b) / values.length
  }

  /**
   * 重置检测器
   */
  reset(): void {
    this.frameBuffer = []
  }
}