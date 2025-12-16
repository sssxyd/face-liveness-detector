/**
 * 运动和活体检测 - 防止照片攻击
 * 检测微妙的面部运动和运动模式，以区分真实面孔和高质量照片
 */

import type { FaceResult, GestureResult } from '@vladmandic/human'
import type { Box } from '@vladmandic/human'

/**
 * 运动检测结果
 */
export interface MotionDetectionResult {
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
  // Configuration with default values
  private readonly minMotionThreshold: number
  private readonly minKeypointVariance: number
  private readonly frameBufferSize: number
  private readonly eyeAspectRatioThreshold: number

  // State
  private frameBuffer: any[] = [] // 存储 cv.Mat (gray)
  private keypointHistory: Array<FaceKeypoints> = []
  private faceAreaHistory: number[] = []
  private eyeAspectRatioHistory: number[] = []
  private mouthAspectRatioHistory: number[] = []

  // OpenCV instance
  private cv: any = null

  constructor(options?: MotionLivenessDetectorOptions) {
    // Set configuration with provided options or defaults
    this.minMotionThreshold = options?.minMotionThreshold ?? 0.15
    this.minKeypointVariance = options?.minKeypointVariance ?? 0.02
    this.frameBufferSize = options?.frameBufferSize ?? 5
    this.eyeAspectRatioThreshold = options?.eyeAspectRatioThreshold ?? 0.15
  }

  setCVInstance(cvInstance: any): void {
    this.cv = cvInstance
  }

  isReady(): boolean {
    return this.frameBuffer.length >= this.frameBufferSize
  }

  /**
   * Reset motion detection state
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
  }

  /**
   * Analyze motion and liveness from current frame and history
   */
  analyzeMotion(
    currentFrameMat: any,
    currentFace: FaceResult,
    faceBox: Box
  ): MotionDetectionResult {
    try {
      // Add current frame to buffer
      this.addFrameToBuffer(currentFrameMat)

      // Extract keypoints from current face
      const currentKeypoints = this.extractKeypoints(currentFace)
      this.keypointHistory.push(currentKeypoints)
      if (this.keypointHistory.length > this.frameBufferSize) {
        this.keypointHistory.shift()
      }

      // Calculate face area
      const faceArea = faceBox[2] * faceBox[3]
      this.faceAreaHistory.push(faceArea)
      if (this.faceAreaHistory.length > this.frameBufferSize) {
        this.faceAreaHistory.shift()
      }

      // Calculate eye and mouth aspect ratios
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

      // Need at least 2 frames for motion analysis
      if (this.frameBuffer.length < 2) {
        return this.createEmptyResult()
      }

      // Analyze optical flow
      const opticalFlowResult = this.analyzeOpticalFlow()

      // Analyze keypoint stability
      const keypointVariance = this.calculateKeypointVariance()

      // Analyze eye and mouth motion
      const eyeMotionScore = this.calculateEyeMotionScore()
      const mouthMotionScore = this.calculateMouthMotionScore()
      const faceAreaVariance = this.calculateFaceAreaVariance()

      // Detect motion type
      const motionType = this.detectMotionType(opticalFlowResult, keypointVariance)

      // Calculate overall motion score
      const motionScore = this.calculateOverallMotionScore(
        opticalFlowResult,
        keypointVariance,
        eyeMotionScore,
        mouthMotionScore
      )

      // Determine liveness
      const isLively = this.determineLiveness(motionScore, keypointVariance, motionType)

      return {
        motionScore,
        opticalFlowMagnitude: opticalFlowResult,
        keypointVariance,
        eyeMotionScore,
        mouthMotionScore,
        motionType,
        isLively,
        details: {
          frameCount: this.frameBuffer.length,
          avgKeypointDistance: this.calculateAvgKeypointDistance(),
          maxKeypointDistance: this.calculateMaxKeypointDistance(),
          faceAreaVariance,
          eyeAspectRatioVariance: this.calculateVariance(this.eyeAspectRatioHistory),
          mouthAspectRatioVariance: this.calculateVariance(this.mouthAspectRatioHistory)
        }
      }
    } catch (error) {
      console.warn('[MotionLivenessDetector] Error analyzing motion:', error)
      return this.createEmptyResult()
    }
  }

  /**
   * Add frame to circular buffer
   */
  private addFrameToBuffer(frameMat: any): void {

    try {
      const gray = frameMat.clone()
      
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
   */
  private calculateOverallMotionScore(
    opticalFlow: number,
    keypointVariance: number,
    eyeMotion: number,
    mouthMotion: number
  ): number {
    // 不同运动指标的加权组合
    const weights = {
      opticalFlow: 0.3,
      keypointVariance: 0.4,
      eyeMotion: 0.15,
      mouthMotion: 0.15
    }

    return (
      opticalFlow * weights.opticalFlow +
      keypointVariance * weights.keypointVariance +
      eyeMotion * weights.eyeMotion +
      mouthMotion * weights.mouthMotion
    )
  }

  /**
   * 根据运动分析确定面部是否活跃
   */
  private determineLiveness(
    motionScore: number,
    keypointVariance: number,
    motionType: MotionType
  ): boolean {
    // 照片特征：
    // - 运动评分几乎为零 (< 0.15)
    // - 关键点方差很低 (< 0.02)
    // - 运动类型 = 'none'

    // 必须有有意义的运动
    if (motionScore < this.minMotionThreshold) {
      return false
    }

    // 必须有关键点变化（自然运动）
    if (keypointVariance < this.minKeypointVariance) {
      return false
    }

    // 运动类型 'none' 表示静态照片
    if (motionType === 'none') {
      return false
    }

    return true
  }

  /**
   * 分析失败时创建空结果
   */
  private createEmptyResult(): MotionDetectionResult {
    return {
      motionScore: 0,
      opticalFlowMagnitude: 0,
      keypointVariance: 0,
      eyeMotionScore: 0,
      mouthMotionScore: 0,
      motionType: 'none',
      isLively: false,
      details: {
        frameCount: this.frameBuffer.length,
        avgKeypointDistance: 0,
        maxKeypointDistance: 0,
        faceAreaVariance: 0,
        eyeAspectRatioVariance: 0,
        mouthAspectRatioVariance: 0
      }
    }
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
      mouthAspectRatioHistorySize: this.mouthAspectRatioHistory.length
    }
  }
}
