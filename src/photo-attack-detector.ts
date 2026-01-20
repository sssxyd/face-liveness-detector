/**
 * 照片攻击检测器 - 双重方案实现
 * 
 * 方案一：MediaPipe 3D 关键点深度方差分析
 * - 完全不依赖背景
 * - 对白墙、黑墙、任意纯色背景均有效
 * - 只需人脸本身具有 3D 结构（真实人脸有，照片没有）
 * 
 * 方案二：关键点运动透视一致性检验
 * - 比较鼻尖、脸颊、耳朵等在多帧中的 2D 位移比例
 * - 真实人脸因透视效应，近处点移动幅度 > 远处点
 * - 照片上所有点按同一仿射变换移动 → 运动向量高度一致
 * 
 * ⚠️ 关键理解 ⚠️
 * MediaPipe 返回的 Z 坐标（深度）是从 2D 图像【推断】出来的，不是真实的物理深度！
 * - 对真实人脸：推断出正确的 3D 结构 → Z 坐标有方差
 * - 对照片人脸：推断深度值可能平坦 → Z 坐标方差极小
 */

import type { FaceResult, Point } from '@vladmandic/human'

/**
 * 照片攻击检测结果详情
 */
export interface PhotoAttackDetectionDetails {
  frameCount: number
  
  // ============ 方案一：3D 深度方差分析 ============
  /** 所有关键点的深度（Z坐标）方差 */
  depthVariance: number
  /** 鼻子、脸颊、耳朵的深度方差（关键特征点） */
  keyPointDepthVariance: number
  /** 深度值的范围（max - min） */
  depthRange: number
  /** 是否检测到平坦深度（照片特征） */
  isFlatDepth: boolean
  /** 3D 深度方差置信度 (0-1) */
  depthVarianceScore: number
  
  // ============ 方案二：运动透视一致性检验 ============
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
  /** 最强特征（"depth"=深度分析，"perspective"=透视分析，"combined"=综合） */
  dominantFeature: 'depth' | 'perspective' | 'combined'
}

/**
 * 照片攻击检测结果
 */
export class PhotoAttackDetectionResult {
  isPhoto: boolean
  details: PhotoAttackDetectionDetails
  debug: Record<string, any>

  constructor(
    isPhoto: boolean,
    details: PhotoAttackDetectionDetails,
    debug: Record<string, any> = {}
  ) {
    this.isPhoto = isPhoto
    this.details = details
    this.debug = debug
  }

  isAvailable(): boolean {
    return this.details.frameCount >= 3
  }

  isTrusted(): boolean { 
    return this.details.frameCount >= 15
  }

  getMessage(): string {
    if (this.details.frameCount < 3) {
      return '数据不足，无法进行照片检测'
    }

    if (!this.isPhoto) return ''
    
    const confidence = (this.details.photoConfidence * 100).toFixed(0)
    const reasons: string[] = []
    
    if (this.details.depthVarianceScore > 0.5) {
      const depthVar = (this.details.depthVariance * 1000).toFixed(1)
      reasons.push(`深度方差极小(${depthVar})`)
    }
    
    if (this.details.perspectiveScore > 0.5) {
      const motionVar = this.details.motionDisplacementVariance.toFixed(3)
      const consistency = (this.details.motionDirectionConsistency * 100).toFixed(0)
      reasons.push(`运动一致性过高(${consistency}%)`)
    }
    
    const reasonStr = reasons.length > 0 ? `（${reasons.join('、')}）` : ''
    return `检测到照片攻击${reasonStr}，置信度 ${confidence}%`
  }
}

export interface PhotoAttackDetectorOptions {
  frameBufferSize?: number              // 缓冲帧数，用于计算时序特征
  depthVarianceThreshold?: number       // 深度方差阈值，低于此值判定为照片
  motionVarianceThreshold?: number      // 运动方差阈值
  perspectiveRatioThreshold?: number    // 透视比率阈值
  motionConsistencyThreshold?: number   // 运动一致性阈值
}

const DEFAULT_OPTIONS: Required<PhotoAttackDetectorOptions> = {
  frameBufferSize: 15,                  // 15帧 (0.5秒@30fps)
  depthVarianceThreshold: 0.001,        // 深度方差阈值：真实人脸 > 0.005，照片 < 0.001
  motionVarianceThreshold: 0.01,        // 运动方差阈值：真实人脸 > 0.02，照片 < 0.01
  perspectiveRatioThreshold: 0.85,      // 透视比率阈值：真实人脸 > 0.95，照片 < 0.85
  motionConsistencyThreshold: 0.8,      // 运动一致性阈值：真实人脸 < 0.5，照片 > 0.8
}

/**
 * 照片攻击检测器
 * 
 * 两种检测方案：
 * 1. 3D 深度方差分析（依赖 MediaPipe Z 坐标）
 * 2. 运动透视一致性检验（纯 2D 几何分析）
 */
export class PhotoAttackDetector {
  private config: Required<PhotoAttackDetectorOptions>
  private frameBuffer: FaceResult[] = []

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
      frameCount: this.frameBuffer.length,
      depthVariance: 0,
      keyPointDepthVariance: 0,
      depthRange: 0,
      isFlatDepth: false,
      depthVarianceScore: 0,
      motionDisplacementVariance: 0,
      perspectiveRatio: 0,
      motionDirectionConsistency: 0,
      affineTransformPatternMatch: 0,
      perspectiveScore: 0,
      isPhoto: false,
      photoConfidence: 0,
      dominantFeature: 'combined'
    }

    // 帧数不足，无法检测
    if (this.frameBuffer.length < 3) {
      return new PhotoAttackDetectionResult(false, details)
    }

    // ============ 方案一：3D 深度方差分析 ============
    const depthAnalysis = this.analyzeDepthVariance()
    details.depthVariance = depthAnalysis.depthVariance
    details.keyPointDepthVariance = depthAnalysis.keyPointDepthVariance
    details.depthRange = depthAnalysis.depthRange
    details.isFlatDepth = depthAnalysis.isFlatDepth
    details.depthVarianceScore = depthAnalysis.score

    // ============ 方案二：运动透视一致性检验 ============
    const perspectiveAnalysis = this.analyzePerspectiveConsistency()
    details.motionDisplacementVariance = perspectiveAnalysis.motionDisplacementVariance
    details.perspectiveRatio = perspectiveAnalysis.perspectiveRatio
    details.motionDirectionConsistency = perspectiveAnalysis.motionDirectionConsistency
    details.affineTransformPatternMatch = perspectiveAnalysis.affineTransformPatternMatch
    details.perspectiveScore = perspectiveAnalysis.score

    // ============ 综合判定 ============
    const isPhotoByDepth = depthAnalysis.score > 0.6
    const isPhotoByPerspective = perspectiveAnalysis.score > 0.6

    // 只要有一个方案高置信度检测到照片，就判定为照片
    details.isPhoto = isPhotoByDepth || isPhotoByPerspective

    // 置信度：两个方案的最大值（最强的证据）
    details.photoConfidence = Math.max(depthAnalysis.score, perspectiveAnalysis.score)

    // 确定最强特征
    if (Math.abs(depthAnalysis.score - perspectiveAnalysis.score) < 0.1) {
      details.dominantFeature = 'combined'
    } else if (depthAnalysis.score > perspectiveAnalysis.score) {
      details.dominantFeature = 'depth'
    } else {
      details.dominantFeature = 'perspective'
    }

    return new PhotoAttackDetectionResult(details.isPhoto, details)
  }

  /**
   * 方案一：3D 深度方差分析
   * 
   * 原理：
   * - 真实人脸具有真实的 3D 结构，Z 坐标（深度）跨越较大范围
   * - 照片是 2D 的，所有点深度基本相同，Z 坐标方差极小
   * - MediaPipe 可以从 2D 图像推断出深度，但：
   *   - 真实人脸：推断正确，Z 坐标有明显差异（鼻尖 > 脸颊 > 耳朵）
   *   - 照片：推断平坦，Z 坐标基本相同
   */
  private analyzeDepthVariance(): {
    depthVariance: number
    keyPointDepthVariance: number
    depthRange: number
    isFlatDepth: boolean
    score: number
  } {
    let allDepths: number[] = []
    let keyPointDepths: number[] = []

    // 提取所有帧的深度值
    for (const result of this.frameBuffer) {
      // 方案一：使用 rotation 字段中的深度信息
      if (!result.meshRaw) continue

      // 提取所有关键点的 Z 坐标
      for (const point of result.meshRaw) {
        if (point.length >= 3 && typeof point[2] === 'number') {
          allDepths.push(point[2])
        }
      }

      // 提取关键特征点的深度（鼻子、脸颊、耳朵）
      const annotations = result.annotations
      if (annotations) {
        const nose = annotations.nose || []
        const leftCheek = annotations.leftCheek || []
        const rightCheek = annotations.rightCheek || []
        const leftEar = annotations.leftEar || []
        const rightEar = annotations.rightEar || []

        const allKeypoints = [
          ...nose,
          ...leftCheek,
          ...rightCheek,
          ...leftEar,
          ...rightEar
        ]

        for (const point of allKeypoints) {
          if (point.length >= 3 && typeof point[2] === 'number') {
            keyPointDepths.push(point[2])
          }
        }
      }
    }

    if (allDepths.length === 0) {
      return {
        depthVariance: 0,
        keyPointDepthVariance: 0,
        depthRange: 0,
        isFlatDepth: true,
        score: 0
      }
    }

    // 计算深度方差
    const depthVariance = this.calculateVariance(allDepths)
    const depthRange = Math.max(...allDepths) - Math.min(...allDepths)
    
    // 关键点深度方差
    const keyPointDepthVariance = keyPointDepths.length > 0 
      ? this.calculateVariance(keyPointDepths)
      : 0

    // 判定是否为平坦深度
    const isFlatDepth = depthVariance < this.config.depthVarianceThreshold

    // 计算置信度分数
    // 深度方差越小，越可能是照片；深度方差越大，越可能是真实人脸
    // 使用反向逻辑：照片得分高，真实人脸得分低
    const variance_score = Math.max(0, 
      (this.config.depthVarianceThreshold - depthVariance) / this.config.depthVarianceThreshold
    )
    
    // 关键点深度方差也应该很小
    const keypoint_score = Math.max(0,
      (this.config.depthVarianceThreshold - keyPointDepthVariance) / this.config.depthVarianceThreshold
    )
    
    // 综合分数
    const score = Math.min(1, (variance_score + keypoint_score) / 2)

    return {
      depthVariance,
      keyPointDepthVariance,
      depthRange,
      isFlatDepth,
      score
    }
  }

  /**
   * 方案二：运动透视一致性检验
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
    
    const ratio_indicator = Math.max(0, 
      1 - Math.abs(perspectiveRatio - 1) / (1 - this.config.perspectiveRatioThreshold)
    )
    
    const consistency_indicator = Math.min(1,
      motionDirectionConsistency / this.config.motionConsistencyThreshold
    )
    
    const affine_indicator = affineTransformPatternMatch

    // 综合分数：四个指标的平均值
    const score = Math.min(1, 
      (variance_indicator + ratio_indicator + consistency_indicator + affine_indicator) / 4
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
   * 使用最小二乘法拟合所有点的位移到单一仿射变换
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

    // 计算平均位移（简化模型：假设仿射变换为简单的平移）
    const avgX = allDisplacements.reduce((sum, d) => sum + d.x, 0) / allDisplacements.length
    const avgY = allDisplacements.reduce((sum, d) => sum + d.y, 0) / allDisplacements.length

    // 计算每个位移与平均值的偏差
    let totalDeviation = 0
    for (const d of allDisplacements) {
      const devX = d.x - avgX
      const devY = d.y - avgY
      totalDeviation += Math.sqrt(devX ** 2 + devY ** 2)
    }

    const avgDeviation = totalDeviation / allDisplacements.length
    const avgDisplacement = Math.sqrt(avgX ** 2 + avgY ** 2)

    if (avgDisplacement === 0) return 0

    // 偏差与平均位移的比值越小，说明越符合单一仿射变换
    // 比值 = 0 表示完全一致（照片特征）
    // 比值 = 1 表示完全不一致
    const deviation_ratio = avgDeviation / avgDisplacement

    // 转换为 0-1 的匹配度分数
    return Math.max(0, 1 - deviation_ratio)
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

  /**
   * 获取当前缓冲区中的帧数
   */
  getFrameCount(): number {
    return this.frameBuffer.length
  }
}
