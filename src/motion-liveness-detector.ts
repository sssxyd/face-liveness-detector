/**
 * 运动和活体检测 - 防止照片攻击
 * 检测微妙的面部运动和运动模式，以区分真实面孔和高质量照片
 */

import type { FaceResult, GestureResult } from '@vladmandic/human'
import type { Box } from '@vladmandic/human'

/**
 * 运动检测结果
 */
export class MotionDetectionResult {
  // 总体运动评分 (0-1)
  motionScore: number
  // 人脸区域的光流幅度
  opticalFlowMagnitude: number
  // 关键点稳定性评分 (0 = 像照片一样稳定, 1 = 自然运动)
  keypointVariance: number
  // 眼睛区域运动强度
  eyeMotionScore: number
  // 嘴巴区域运动强度
  mouthMotionScore: number
  // 检测到的运动类型 ('none' | 'rotation' | 'translation' | 'breathing' | 'micro_expression')
  motionType: MotionType
  // 基于运动的总体活体性判断
  isLively: boolean
  // 详细调试信息
  details: {
    frameCount: number
    avgKeypointDistance: number
    maxKeypointDistance: number
    faceAreaVariance: number
    eyeAspectRatioVariance: number
    mouthAspectRatioVariance: number
  }

  constructor(
    motionScore: number,
    opticalFlowMagnitude: number,
    keypointVariance: number,
    eyeMotionScore: number,
    mouthMotionScore: number,
    motionType: MotionType,
    isLively: boolean,
    details: {
      frameCount: number
      avgKeypointDistance: number
      maxKeypointDistance: number
      faceAreaVariance: number
      eyeAspectRatioVariance: number
      mouthAspectRatioVariance: number
    }
  ) {
    this.motionScore = motionScore
    this.opticalFlowMagnitude = opticalFlowMagnitude
    this.keypointVariance = keypointVariance
    this.eyeMotionScore = eyeMotionScore
    this.mouthMotionScore = mouthMotionScore
    this.motionType = motionType
    this.isLively = isLively
    this.details = details
  }

  /**
   * 获取活体检测结果信息
   * 如果活跃，返回空字符串，否则返回非活体检测的原因
   */
  getMessage(minMotionScore: number, minKeypointVariance: number): string {
    if (this.isLively) {
      return ''
    }

    const reasons: string[] = []

    // 检查运动评分
    if (this.motionScore < minMotionScore) {
      reasons.push(`检测到的运动不足 (运动评分: ${(this.motionScore * 100).toFixed(1)}%)`)
    }

    // 检查关键点方差
    if (this.keypointVariance < minKeypointVariance) {
      reasons.push(`关键点方差低 (${(this.keypointVariance * 100).toFixed(1)}%)，表示面孔静止或类似照片`)
    }

    // 检查运动类型
    if (this.motionType === 'none') {
      reasons.push('未检测到运动，面孔似乎是静止的或来自照片')
    }

    // 如果没有找到具体原因但仍然不活跃，提供通用信息
    if (reasons.length === 0) {
      reasons.push('Face does not meet liveness requirements')
    }

    return reasons.join('; ')
  }
}

export type MotionType = 'none' | 'rotation' | 'translation' | 'breathing' | 'micro_expression'

/**
 * 运动活体检测选项
 */
export interface MotionLivenessDetectorOptions {
  // 活体检测的最小运动评分阈值 (0-1)
  minMotionThreshold?: number
  // 最小关键点方差阈值 (0-1)
  minKeypointVariance?: number
  // 运动历史分析的帧缓冲区大小
  frameBufferSize?: number
  // 眨眼检测的眼睛宽高比阈值 (0-1)
  eyeAspectRatioThreshold?: number
  // 光流和关键点方差一致性阈值 (0-1) - 防止照片微动
  motionConsistencyThreshold?: number
  // 最小光流幅度阈值 - 照片几乎无光流 (0-1)
  minOpticalFlowThreshold?: number
  // 是否启用严格照片检测模式
  strictPhotoDetection?: boolean
}

/**
 * 内部面部关键点接口
 */
interface FaceKeypoints {
  // 来自面部网格的 468 个面部标志点
  landmarks?: any[][]
  // 左眼关键点
  leftEye?: any[][]
  // 右眼关键点
  rightEye?: any[][]
  // 嘴巴关键点
  mouth?: any[][]
}

/**
 * 运动活体检测器
 * 使用光流、关键点跟踪和面部特征分析
 */
export class MotionLivenessDetector {
  // 配置及默认值
  private readonly minMotionThreshold: number
  private readonly minKeypointVariance: number
  private readonly frameBufferSize: number
  private readonly eyeAspectRatioThreshold: number
  private readonly motionConsistencyThreshold: number
  private readonly minOpticalFlowThreshold: number
  private readonly strictPhotoDetection: boolean

  // 状态
  private frameBuffer: any[] = [] // 存储 cv.Mat (gray)
  private keypointHistory: Array<FaceKeypoints> = []
  private faceAreaHistory: number[] = []
  private eyeAspectRatioHistory: number[] = []
  private mouthAspectRatioHistory: number[] = []
  private opticalFlowHistory: number[] = []
  private pupilSizeHistory: number[] = []

  // OpenCV 实例
  private cv: any = null

  constructor(options: Partial<MotionLivenessDetectorOptions> = {}) {
    // 用提供的选项或默认值设置配置
    this.minMotionThreshold = options.minMotionThreshold ?? 0.15
    this.minKeypointVariance = options.minKeypointVariance ?? 0.02
    this.frameBufferSize = options.frameBufferSize ?? 5
    this.eyeAspectRatioThreshold = options.eyeAspectRatioThreshold ?? 0.15
    // 照片防护参数
    this.motionConsistencyThreshold = options.motionConsistencyThreshold ?? 0.5
    this.minOpticalFlowThreshold = options.minOpticalFlowThreshold ?? 0.08
    this.strictPhotoDetection = options.strictPhotoDetection ?? false
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
  }

  isReady(): boolean {
    return this.frameBuffer.length >= this.frameBufferSize
  }

  /**
   * 重置运动检测状态
   */
  reset(): void {
    // 清理所有缓存的 Mat 对象
    this.frameBuffer.forEach(mat => {
      if (mat && mat.delete) mat.delete()
    })
    this.frameBuffer = []
    this.keypointHistory = []
    this.faceAreaHistory = []
    this.eyeAspectRatioHistory = []
    this.mouthAspectRatioHistory = []
    this.opticalFlowHistory = []
    this.pupilSizeHistory = []
  }

  /**
   * 从当前帧和历史记录分析运动和活体性
   */
  analyzeMotion(
    grayMat: any,
    faceResult: FaceResult,
    faceBox: Box
  ): MotionDetectionResult {
    try {
      // 将当前帧添加到缓冲区
      this.addFrameToBuffer(grayMat)

      // 从当前面孔提取关键点
      const currentKeypoints = this.extractKeypoints(faceResult)
      this.keypointHistory.push(currentKeypoints)
      if (this.keypointHistory.length > this.frameBufferSize) {
        this.keypointHistory.shift()
      }

      // 计算人脸区域
      const faceArea = faceBox[2] * faceBox[3]
      this.faceAreaHistory.push(faceArea)
      if (this.faceAreaHistory.length > this.frameBufferSize) {
        this.faceAreaHistory.shift()
      }

      // 计算眼睛和嘴巴的宽高比
      if (currentKeypoints.leftEye && currentKeypoints.rightEye) {
        const leftEAR = this.calculateEyeAspectRatio(currentKeypoints.leftEye)
        const rightEAR = this.calculateEyeAspectRatio(currentKeypoints.rightEye)
        const avgEAR = (leftEAR + rightEAR) / 2
        this.eyeAspectRatioHistory.push(avgEAR)
        if (this.eyeAspectRatioHistory.length > this.frameBufferSize) {
          this.eyeAspectRatioHistory.shift()
        }
      }

      if (currentKeypoints.mouth) {
        const MAR = this.calculateMouthAspectRatio(currentKeypoints.mouth)
        this.mouthAspectRatioHistory.push(MAR)
        if (this.mouthAspectRatioHistory.length > this.frameBufferSize) {
          this.mouthAspectRatioHistory.shift()
        }
      }

      // 需要至少 2 帧进行运动分析
      if (this.frameBuffer.length < 2) {
        return this.createEmptyResult()
      }

      // 分析光流
      const opticalFlowResult = this.analyzeOpticalFlow()
      this.opticalFlowHistory.push(opticalFlowResult)
      if (this.opticalFlowHistory.length > this.frameBufferSize) {
        this.opticalFlowHistory.shift()
      }

      // 检测瞳孔反应（简单实现）
      const pupilResponse = this.detectPupilResponse(currentKeypoints)
      if (pupilResponse > 0) {
        this.pupilSizeHistory.push(pupilResponse)
        if (this.pupilSizeHistory.length > this.frameBufferSize) {
          this.pupilSizeHistory.shift()
        }
      }

      // 分析关键点稳定性
      const keypointVariance = this.calculateKeypointVariance()

      // 分析眼睛和嘴巴运动
      const eyeMotionScore = this.calculateEyeMotionScore()
      const mouthMotionScore = this.calculateMouthMotionScore()
      const faceAreaVariance = this.calculateFaceAreaVariance()

      // 验证运动一致性（防止照片微动攻击）
      const motionConsistency = this.validateMotionConsistency(opticalFlowResult, keypointVariance)

      // 检测运动类型
      const motionType = this.detectMotionType(opticalFlowResult, keypointVariance)

      // 计算总体运动评分（调整权重以应对照片攻击）
      const motionScore = this.calculateOverallMotionScore(
        opticalFlowResult,
        keypointVariance,
        eyeMotionScore,
        mouthMotionScore,
        motionConsistency
      )

      // 确定活体性（加入额外检查）
      const isLively = this.determineLiveness(
        motionScore,
        keypointVariance,
        motionType,
        opticalFlowResult,
        motionConsistency
      )

      return new MotionDetectionResult(
        motionScore,
        opticalFlowResult,
        keypointVariance,
        eyeMotionScore,
        mouthMotionScore,
        motionType,
        isLively,
        {
          frameCount: this.frameBuffer.length,
          avgKeypointDistance: this.calculateAvgKeypointDistance(),
          maxKeypointDistance: this.calculateMaxKeypointDistance(),
          faceAreaVariance,
          eyeAspectRatioVariance: this.calculateVariance(this.eyeAspectRatioHistory),
          mouthAspectRatioVariance: this.calculateVariance(this.mouthAspectRatioHistory)
        }
      )
    } catch (error) {
      console.warn('[MotionLivenessDetector] Error analyzing motion:', error)
      return this.createEmptyResult()
    }
  }

  /**
   * 将帧添加到循环缓冲区
   */
  private addFrameToBuffer(grayMat: any): void {

    try {
      const gray = grayMat.clone()
      
      this.frameBuffer.push(gray)
      
      // 清理旧的 Mat 对象
      if (this.frameBuffer.length > this.frameBufferSize) {
        const oldMat = this.frameBuffer.shift()
        if (oldMat) oldMat.delete()
      }
    } catch (error) {
      console.warn('[MotionLivenessDetector] Failed to add frame:', error)
    }
  }

  /**
   * 验证运动一致性 - 防止照片微动攻击
   * 真实面部运动：光流和关键点方差应该一致且相关
   * 照片微动：只有光流或只有噪声，二者不匹配
   */
  private validateMotionConsistency(opticalFlow: number, keypointVariance: number): number {
    // 如果光流和关键点变化都很低，返回0（静止或照片）
    if (opticalFlow < 0.01 && keypointVariance < 0.01) {
      return 0
    }

    // 计算二者的相关性
    // 真实运动：二者应该相关联（同时增加）
    // 照片微动：可能只有一个很大（比如光流大但关键点稳定）
    const ratio = Math.min(opticalFlow, keypointVariance) / Math.max(opticalFlow, keypointVariance, 0.01)
    
    // 一致性分数：接近1表示匹配良好，接近0表示不匹配（可疑）
    return ratio
  }

  /**
   * 检测瞳孔反应 - 活体的关键特征
   * 照片的瞳孔无法反应光线变化
   */
  private detectPupilResponse(keypoints: FaceKeypoints): number {
    if (!keypoints.leftEye || !keypoints.rightEye) {
      return 0
    }

    try {
      // 计算左眼瞳孔大小（使用眼睛关键点的范围）
      const leftEyeSize = this.calculateEyeSize(keypoints.leftEye)
      const rightEyeSize = this.calculateEyeSize(keypoints.rightEye)
      const avgEyeSize = (leftEyeSize + rightEyeSize) / 2
      
      return avgEyeSize
    } catch (error) {
      return 0
    }
  }

  /**
   * 计算眼睛大小（用于瞳孔反应检测）
   */
  private calculateEyeSize(eyeKeypoints: any[][]): number {
    if (!eyeKeypoints || eyeKeypoints.length < 4) {
      return 0
    }

    try {
      // 计算眼睛边界框
      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity

      for (const point of eyeKeypoints) {
        if (point && point.length >= 2) {
          minX = Math.min(minX, point[0])
          maxX = Math.max(maxX, point[0])
          minY = Math.min(minY, point[1])
          maxY = Math.max(maxY, point[1])
        }
      }

      if (minX === Infinity || minY === Infinity) return 0

      const width = maxX - minX
      const height = maxY - minY
      return width * height // 面积
    } catch (error) {
      return 0
    }
  }

  /**
   * 从 Human.js 面部检测结果中提取面部关键点
   * 使用网格标志点（来自 MediaPipe Face Mesh 模型的 468 个点）
   */
  private extractKeypoints(face: FaceResult): FaceKeypoints {
    const keypoints: FaceKeypoints = {}

    // 提取网格标志点（来自面部网格的 468 个点）
    if (face.mesh && Array.isArray(face.mesh)) {
      keypoints.landmarks = face.mesh
    }

    // 从网格标志点中提取眼睛和嘴巴区域
    // MediaPipe Face Mesh 标志点索引：
    // 左眼：362, 385, 387, 390, 25, 55, 154, 133
    // 右眼：33, 160, 158, 133, 153, 144
    // 嘴巴：61, 185, 40, 39, 37, 0, 267, 269, 270, 409
    if (keypoints.landmarks && keypoints.landmarks.length >= 468) {
      // 左眼关键点
      keypoints.leftEye = [
        keypoints.landmarks[362],
        keypoints.landmarks[385],
        keypoints.landmarks[387],
        keypoints.landmarks[390],
        keypoints.landmarks[25],
        keypoints.landmarks[55]
      ].filter(point => point !== undefined)

      // 右眼关键点
      keypoints.rightEye = [
        keypoints.landmarks[33],
        keypoints.landmarks[160],
        keypoints.landmarks[158],
        keypoints.landmarks[133],
        keypoints.landmarks[153],
        keypoints.landmarks[144]
      ].filter(point => point !== undefined)

      // 嘴巴关键点
      keypoints.mouth = [
        keypoints.landmarks[61],
        keypoints.landmarks[185],
        keypoints.landmarks[40],
        keypoints.landmarks[39],
        keypoints.landmarks[37],
        keypoints.landmarks[0],
        keypoints.landmarks[267],
        keypoints.landmarks[269],
        keypoints.landmarks[270],
        keypoints.landmarks[409]
      ].filter(point => point !== undefined)
    }

    return keypoints
  }

  /**
   * 计算光流幅度（需要 OpenCV）
   * 检测帧之间的像素运动
   */
  private analyzeOpticalFlow(): number {
    if (!this.cv || this.frameBuffer.length < 2) {
      return 0
    }

    try {
      const prevFrame = this.frameBuffer[this.frameBuffer.length - 2]
      const currFrame = this.frameBuffer[this.frameBuffer.length - 1]

      // 直接使用已经是灰度图的 Mat，无需转换
      const flow = new this.cv.Mat()
      this.cv.calcOpticalFlowFarneback(
        prevFrame,
        currFrame,
        flow,
        0.5, 3, 15, 3, 5, 1.2, 0
      )

      const magnitude = this.calculateFlowMagnitude(flow)
      flow.delete()

      return magnitude
    } catch (error) {
      console.warn('[MotionLivenessDetector] Optical flow calculation failed:', error)
      return 0
    }
  }

  /**
   * 将 canvas 转换为 OpenCV Mat，支持可选的灰度转换
   */
  private canvasToMat(canvas: HTMLCanvasElement, type?: 'gray'): any {
    if (!this.cv) return null

    try {
      const mat = this.cv.imread(canvas)
      if (type === 'gray') {
        const gray = new this.cv.Mat()
        this.cv.cvtColor(mat, gray, this.cv.COLOR_RGBA2GRAY)
        mat.delete()
        return gray
      }
      return mat
    } catch (error) {
      console.warn('[MotionLivenessDetector] Canvas to Mat conversion failed:', error)
      return null
    }
  }

  /**
   * 计算光流的平均幅度
   */
  private calculateFlowMagnitude(flowMat: any): number {
    if (!flowMat || flowMat.empty()) {
      return 0
    }

    try {
      const flowData = new Float32Array(flowMat.data32F)
      let sumMagnitude = 0
      let count = 0

      // 处理光流向量（每个像素 2 个值：x 和 y 分量）
      for (let i = 0; i < flowData.length; i += 2) {
        const fx = flowData[i]
        const fy = flowData[i + 1]
        const mag = Math.sqrt(fx * fx + fy * fy)
        sumMagnitude += mag
        count++
      }

      // 归一化到 0-1 范围（最大预期光流约为 20 像素/帧）
      const avgMagnitude = count > 0 ? sumMagnitude / count : 0
      return Math.min(avgMagnitude / 20, 1)
    } catch (error) {
      console.warn('[MotionLivenessDetector] Flow magnitude calculation failed:', error)
      return 0
    }
  }

  /**
   * 计算关键点位置在帧间的方差
   * 高方差 = 自然运动（活跃）
   * 低方差 = 静止如照片
   */
  private calculateKeypointVariance(): number {
    if (this.keypointHistory.length < 2) {
      return 0
    }

    try {
      const distances: number[] = []

      // 比较连续的帧
      for (let i = 1; i < this.keypointHistory.length; i++) {
        const prevKeypoints = this.keypointHistory[i - 1]
        const currKeypoints = this.keypointHistory[i]

        if (prevKeypoints.landmarks && currKeypoints.landmarks) {
          const avgDistance = this.calculateLandmarkDistance(
            prevKeypoints.landmarks,
            currKeypoints.landmarks
          )
          distances.push(avgDistance)
        }
      }

      if (distances.length === 0) {
        return 0
      }

      // 计算距离的方差
      const mean = distances.reduce((a, b) => a + b, 0) / distances.length
      const variance = distances.reduce((a, d) => a + (d - mean) ** 2, 0) / distances.length
      const stdDev = Math.sqrt(variance)

      // 归一化到 0-1 范围（按预期的自然变化 ~5 像素归一化）
      return Math.min(stdDev / 5, 1)
    } catch (error) {
      console.warn('[MotionLivenessDetector] Keypoint variance calculation failed:', error)
      return 0
    }
  }

  /**
   * 计算两帧中对应标志点之间的平均距离
   */
  private calculateLandmarkDistance(landmarks1: any[][], landmarks2: any[][]): number {
    if (!landmarks1 || !landmarks2 || landmarks1.length !== landmarks2.length) {
      return 0
    }

    let totalDistance = 0
    let count = 0

    for (let i = 0; i < Math.min(landmarks1.length, landmarks2.length); i++) {
      const p1 = landmarks1[i]
      const p2 = landmarks2[i]

      if (p1 && p2 && p1.length >= 2 && p2.length >= 2) {
        const dx = p1[0] - p2[0]
        const dy = p1[1] - p2[1]
        const distance = Math.sqrt(dx * dx + dy * dy)
        totalDistance += distance
        count++
      }
    }

    return count > 0 ? totalDistance / count : 0
  }

  /**
   * 计算所有帧中的平均关键点距离
   */
  private calculateAvgKeypointDistance(): number {
    if (this.keypointHistory.length < 2) {
      return 0
    }

    let totalDistance = 0
    let comparisons = 0

    for (let i = 1; i < this.keypointHistory.length; i++) {
      const prevKeypoints = this.keypointHistory[i - 1]
      const currKeypoints = this.keypointHistory[i]

      if (prevKeypoints.landmarks && currKeypoints.landmarks) {
        const avgDistance = this.calculateLandmarkDistance(
          prevKeypoints.landmarks,
          currKeypoints.landmarks
        )
        totalDistance += avgDistance
        comparisons++
      }
    }

    return comparisons > 0 ? totalDistance / comparisons : 0
  }

  /**
   * 计算帧间的最大关键点距离
   */
  private calculateMaxKeypointDistance(): number {
    if (this.keypointHistory.length < 2) {
      return 0
    }

    let maxDistance = 0

    for (let i = 1; i < this.keypointHistory.length; i++) {
      const prevKeypoints = this.keypointHistory[i - 1]
      const currKeypoints = this.keypointHistory[i]

      if (prevKeypoints.landmarks && currKeypoints.landmarks) {
        const avgDistance = this.calculateLandmarkDistance(
          prevKeypoints.landmarks,
          currKeypoints.landmarks
        )
        maxDistance = Math.max(maxDistance, avgDistance)
      }
    }

    return maxDistance
  }

  /**
   * 计算眼睛宽高比 (EAR)
   * 用于检测眨眼和眼睛开度变化
   */
  private calculateEyeAspectRatio(eyeKeypoints: any[][]): number {
    if (!eyeKeypoints || eyeKeypoints.length < 6) {
      return 0
    }

    try {
      // 眼睛关键点：[左角, 上-1, 上-2, 右角, 下-2, 下-1]
      // 垂直点之间的距离除以水平距离
      const leftCorner = eyeKeypoints[0]
      const rightCorner = eyeKeypoints[3]
      const upperLeft = eyeKeypoints[1]
      const upperRight = eyeKeypoints[2]
      const lowerLeft = eyeKeypoints[5]
      const lowerRight = eyeKeypoints[4]

      // 欧氏距离
      const verticalLeft = this.pointDistance(upperLeft, lowerLeft)
      const verticalRight = this.pointDistance(upperRight, lowerRight)
      const horizontal = this.pointDistance(leftCorner, rightCorner)

      if (horizontal === 0) return 0

      // EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
      return (verticalLeft + verticalRight) / (2 * horizontal)
    } catch (error) {
      console.warn('[MotionLivenessDetector] Eye aspect ratio calculation failed:', error)
      return 0
    }
  }

  /**
   * 计算嘴巴宽高比 (MAR)
   * 用于检测嘴巴张开的变化
   */
  private calculateMouthAspectRatio(mouthKeypoints: any[][]): number {
    if (!mouthKeypoints || mouthKeypoints.length < 6) {
      return 0
    }

    try {
      // 简单的嘴巴张开检测
      // 使用上唇和下唇之间的垂直距离
      const upperLipY = mouthKeypoints.slice(0, 5).reduce((sum, p) => sum + (p?.[1] || 0), 0) / 5
      const lowerLipY = mouthKeypoints.slice(5).reduce((sum, p) => sum + (p?.[1] || 0), 0) / 5
      const mouthWidth = this.pointDistance(mouthKeypoints[0], mouthKeypoints[5])

      if (mouthWidth === 0) return 0

      const verticalDistance = Math.abs(upperLipY - lowerLipY)
      return verticalDistance / mouthWidth
    } catch (error) {
      console.warn('[MotionLivenessDetector] Mouth aspect ratio calculation failed:', error)
      return 0
    }
  }

  /**
   * 计算两个点之间的距离
   */
  private pointDistance(p1: any[], p2: any[]): number {
    if (!p1 || !p2 || p1.length < 2 || p2.length < 2) {
      return 0
    }
    const dx = p1[0] - p2[0]
    const dy = p1[1] - p2[1]
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * 基于眼睛宽高比变化计算眼睛运动评分
   */
  private calculateEyeMotionScore(): number {
    if (this.eyeAspectRatioHistory.length < 2) {
      return 0
    }

    const variance = this.calculateVariance(this.eyeAspectRatioHistory)
    // 检查方差是否超过眨眼检测的眼睛宽高比阈值
    if (variance < this.eyeAspectRatioThreshold) {
      return 0
    }

    // 归一化：眨眼的预期方差约为 0.05
    return Math.min(variance / 0.05, 1)
  }

  /**
   * 基于嘴巴宽高比变化计算嘴巴运动评分
   */
  private calculateMouthMotionScore(): number {
    if (this.mouthAspectRatioHistory.length < 2) {
      return 0
    }

    const variance = this.calculateVariance(this.mouthAspectRatioHistory)
    // 归一化：嘴巴运动的预期方差约为 0.02
    return Math.min(variance / 0.02, 1)
  }

  /**
   * 计算人脸区域方差
   */
  private calculateFaceAreaVariance(): number {
    return this.calculateVariance(this.faceAreaHistory)
  }

  /**
   * 计算数字数组的方差
   */
  private calculateVariance(values: number[]): number {
    if (values.length < 2) {
      return 0
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
    return Math.sqrt(variance)
  }

  /**
   * 基于分析检测运动类型
   */
  private detectMotionType(opticalFlow: number, keypointVariance: number): MotionType {
    if (keypointVariance < 0.01 && opticalFlow < 0.1) {
      return 'none'
    }

    if (keypointVariance > opticalFlow * 2) {
      // 关键点运动多于光流表明旋转或表情变化
      if (
        this.eyeAspectRatioHistory.length >= 2 &&
        this.calculateVariance(this.eyeAspectRatioHistory) > this.eyeAspectRatioThreshold
      ) {
        return 'micro_expression'
      }
      return 'rotation'
    }

    if (opticalFlow > keypointVariance * 2) {
      return 'translation'
    }

    // 呼吸运动：一致的小变化
    if (
      this.faceAreaHistory.length >= 2 &&
      this.calculateVariance(this.faceAreaHistory) > 0.001
    ) {
      return 'breathing'
    }

    return 'micro_expression'
  }

  /**
   * 从多个来源计算总体运动评分
   * 针对照片攻击进行优化：提高光流和关键点方差的权重
   */
  private calculateOverallMotionScore(
    opticalFlow: number,
    keypointVariance: number,
    eyeMotion: number,
    mouthMotion: number,
    motionConsistency: number
  ): number {
    // 针对照片防护的优化权重：
    // - 光流权重提高至 0.45（照片特征是零光流）
    // - 关键点方差权重保持较高 0.35（照片完全静止）
    // - 运动一致性权重 0.1（防止微动假正）
    // - 眼睛和嘴巴运动权重降低 0.05 + 0.05
    const weights = {
      opticalFlow: 0.45,
      keypointVariance: 0.35,
      motionConsistency: 0.1,
      eyeMotion: 0.05,
      mouthMotion: 0.05
    }

    // 严格模式：进一步提高光流权重
    if (this.strictPhotoDetection) {
      weights.opticalFlow = 0.55
      weights.keypointVariance = 0.3
      weights.motionConsistency = 0.15
      weights.eyeMotion = 0
      weights.mouthMotion = 0
    }

    return (
      opticalFlow * weights.opticalFlow +
      keypointVariance * weights.keypointVariance +
      motionConsistency * weights.motionConsistency +
      eyeMotion * weights.eyeMotion +
      mouthMotion * weights.mouthMotion
    )
  }

  /**
   * 根据运动分析确定面部是否活跃
   * 增强照片防护：加入光流最小阈值和运动一致性检查
   */
  private determineLiveness(
    motionScore: number,
    keypointVariance: number,
    motionType: MotionType,
    opticalFlow: number,
    motionConsistency: number
  ): boolean {
    // 照片特征：
    // - 运动评分几乎为零 (< 0.15)
    // - 关键点方差很低 (< 0.02)
    // - 光流几乎为零 (< 0.08) ← 最明显的照片特征
    // - 运动类型 = 'none'
    // - 运动不一致（光流和关键点不匹配）← 照片微动

    // 检查1：必须有有意义的光流（照片的最弱点）
    // 照片无法产生光流，这是最可靠的指标
    if (opticalFlow < this.minOpticalFlowThreshold) {
      return false
    }

    // 检查2：必须有有意义的运动评分
    if (motionScore < this.minMotionThreshold) {
      return false
    }

    // 检查3：必须有关键点变化（自然运动）
    if (keypointVariance < this.minKeypointVariance) {
      return false
    }

    // 检查4：运动类型 'none' 表示静态照片
    if (motionType === 'none') {
      return false
    }

    // 检查5：运动一致性检查（防止照片微动）
    // 真实面部运动：光流和关键点应该一致
    // 照片微动：二者会严重不匹配
    if (motionConsistency < this.motionConsistencyThreshold) {
      return false
    }

    // 检查6：验证物理约束（防止突跳式微动）
    // 真实运动加速度平滑，照片微动会有突跳
    if (!this.validatePhysicalConstraints()) {
      return false
    }

    // 严格模式：需要更高的光流阈值
    if (this.strictPhotoDetection && opticalFlow < this.minOpticalFlowThreshold * 1.5) {
      return false
    }

    return true
  }

  /**
   * 分析失败时创建空结果
   */
  private createEmptyResult(): MotionDetectionResult {
    return new MotionDetectionResult(
      0,
      0,
      0,
      0,
      0,
      'none',
      false,
      {
        frameCount: this.frameBuffer.length,
        avgKeypointDistance: 0,
        maxKeypointDistance: 0,
        faceAreaVariance: 0,
        eyeAspectRatioVariance: 0,
        mouthAspectRatioVariance: 0
      }
    )
  }

  /**
   * 验证运动的物理约束
   * 照片微动的运动往往会违反物理约束（如速度跳跃）
   * 真实面部运动应该表现出光滑的加速度和速度变化
   */
  private validatePhysicalConstraints(): boolean {
    if (this.opticalFlowHistory.length < 3) {
      return true // 数据不足，不检查
    }

    // 检查光流的加速度变化（应该平滑）
    const flowAccelerations: number[] = []
    for (let i = 2; i < this.opticalFlowHistory.length; i++) {
      const prev = this.opticalFlowHistory[i - 2]
      const curr = this.opticalFlowHistory[i - 1]
      const next = this.opticalFlowHistory[i]
      
      // 计算加速度（二阶差分）
      const accel = Math.abs((next - curr) - (curr - prev))
      flowAccelerations.push(accel)
    }

    if (flowAccelerations.length === 0) return true

    // 计算加速度的平均值和方差
    const avgAccel = flowAccelerations.reduce((a, b) => a + b, 0) / flowAccelerations.length
    const accelVariance = this.calculateVariance(flowAccelerations)

    // 照片微动的特征：加速度变化很大（突跳）
    // 真实运动的加速度变化应该相对稳定
    const accelRatio = accelVariance / (avgAccel + 0.01)

    // 阈值：如果加速度变化过大，说明可能是微动（突跳运动）
    // 合理的值约为 0.5-2.0，超过 3.0 表示不自然
    const maxAccelRatio = this.strictPhotoDetection ? 2.0 : 3.0
    
    return accelRatio < maxAccelRatio
  }

  /**
   * 获取运动检测结果（用于调试）
   */
  getStatistics(): any {
    return {
      bufferSize: this.frameBuffer.length,
      keypointHistorySize: this.keypointHistory.length,
      faceAreaHistorySize: this.faceAreaHistory.length,
      eyeAspectRatioHistorySize: this.eyeAspectRatioHistory.length,
      mouthAspectRatioHistorySize: this.mouthAspectRatioHistory.length,
      opticalFlowHistorySize: this.opticalFlowHistory.length,
      pupilSizeHistorySize: this.pupilSizeHistory.length
    }
  }
}
