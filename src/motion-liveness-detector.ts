/**
 * Motion and Liveness Detection - Photo Attack Prevention
 * Detects subtle facial movements and motion patterns to distinguish real faces from high-quality photos
 */

import type { FaceResult, GestureResult } from '@vladmandic/human'
import type { Box } from '@vladmandic/human'

/**
 * Motion detection result
 */
export interface MotionDetectionResult {
  // Overall motion score (0-1)
  motionScore: number
  // Optical flow magnitude in face region
  opticalFlowMagnitude: number
  // Keypoint stability score (0 = stable like photo, 1 = natural movement)
  keypointVariance: number
  // Eye region motion intensity
  eyeMotionScore: number
  // Mouth region motion intensity
  mouthMotionScore: number
  // Detected motion type ('none' | 'rotation' | 'translation' | 'breathing' | 'micro_expression')
  motionType: MotionType
  // Overall liveness verdict based on motion
  isLively: boolean
  // Detailed debug info
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
 * Motion liveness detector options
 */
export interface MotionLivenessDetectorOptions {
  // Minimum motion score threshold for liveness detection (0-1)
  minMotionThreshold?: number
  // Minimum keypoint variance threshold (0-1)
  minKeypointVariance?: number
  // Frame buffer size for motion history analysis
  frameBufferSize?: number
  // Eye aspect ratio threshold for blink detection (0-1)
  eyeAspectRatioThreshold?: number
}

/**
 * Internal face keypoints interface
 */
interface FaceKeypoints {
  // 468 face landmarks from face mesh
  landmarks?: any[][]
  // Left eye keypoints
  leftEye?: any[][]
  // Right eye keypoints
  rightEye?: any[][]
  // Mouth keypoints
  mouth?: any[][]
}

/**
 * Motion liveness detector
 * Uses optical flow, keypoint tracking, and facial feature analysis
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
    currentFrame: HTMLCanvasElement,
    currentFace: FaceResult,
    faceBox: Box
  ): MotionDetectionResult {
    try {
      // Add current frame to buffer
      this.addFrameToBuffer(currentFrame)

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
  private addFrameToBuffer(frame: HTMLCanvasElement): void {
    if (!this.cv) {
      console.warn('OpenCV not available, skipping frame buffer')
      return
    }

    try {
      const mat = this.cv.imread(frame)
      const gray = new this.cv.Mat()
      this.cv.cvtColor(mat, gray, this.cv.COLOR_RGBA2GRAY)
      mat.delete() // 立即释放原始 Mat
      
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
   * Extract face keypoints from Human.js face result
   */
  private extractKeypoints(face: FaceResult): FaceKeypoints {
    const keypoints: FaceKeypoints = {}

    // Extract landmarks (468 points from face mesh)
    if ((face as any).landmarks && Array.isArray((face as any).landmarks)) {
      keypoints.landmarks = (face as any).landmarks
    }

    // Extract eye regions (simplified detection from face mesh landmarks)
    if (keypoints.landmarks && keypoints.landmarks.length >= 468) {
      // Left eye: landmarks around indices 362, 385, 387, 390, 25, 55, 154, 133
      keypoints.leftEye = [
        keypoints.landmarks[362],
        keypoints.landmarks[385],
        keypoints.landmarks[387],
        keypoints.landmarks[390],
        keypoints.landmarks[25],
        keypoints.landmarks[55]
      ]

      // Right eye: landmarks around indices 33, 160, 158, 133, 153, 144
      keypoints.rightEye = [
        keypoints.landmarks[33],
        keypoints.landmarks[160],
        keypoints.landmarks[158],
        keypoints.landmarks[133],
        keypoints.landmarks[153],
        keypoints.landmarks[144]
      ]

      // Mouth: landmarks around indices 61, 185, 40, 39, 37, 0, 267, 269, 270, 409
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
      ]
    }

    return keypoints
  }

  /**
   * Calculate optical flow magnitude (requires OpenCV)
   * Detects pixel movement between frames
   */
  private analyzeOpticalFlow(): number {
    if (!this.cv || this.frameBuffer.length < 2) {
      return 0
    }

    try {
      const prevFrame = this.frameBuffer[this.frameBuffer.length - 2]
      const currFrame = this.frameBuffer[this.frameBuffer.length - 1]

      // 直接使用已经是灰度的 Mat，无需转换
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
   * Convert canvas to OpenCV Mat with optional grayscale conversion
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
   * Calculate average magnitude of optical flow
   */
  private calculateFlowMagnitude(flowMat: any): number {
    if (!flowMat || flowMat.empty()) {
      return 0
    }

    try {
      const flowData = new Float32Array(flowMat.data32F)
      let sumMagnitude = 0
      let count = 0

      // Process flow vectors (2 values per pixel: x and y components)
      for (let i = 0; i < flowData.length; i += 2) {
        const fx = flowData[i]
        const fy = flowData[i + 1]
        const mag = Math.sqrt(fx * fx + fy * fy)
        sumMagnitude += mag
        count++
      }

      // Normalize to 0-1 range (max expected flow is around 20 pixels/frame)
      const avgMagnitude = count > 0 ? sumMagnitude / count : 0
      return Math.min(avgMagnitude / 20, 1)
    } catch (error) {
      console.warn('[MotionLivenessDetector] Flow magnitude calculation failed:', error)
      return 0
    }
  }

  /**
   * Calculate variance in keypoint positions across frames
   * High variance = natural movement (lively)
   * Low variance = static like a photo
   */
  private calculateKeypointVariance(): number {
    if (this.keypointHistory.length < 2) {
      return 0
    }

    try {
      const distances: number[] = []

      // Compare consecutive frames
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

      // Calculate variance of distances
      const mean = distances.reduce((a, b) => a + b, 0) / distances.length
      const variance = distances.reduce((a, d) => a + (d - mean) ** 2, 0) / distances.length
      const stdDev = Math.sqrt(variance)

      // Normalize to 0-1 range (normalize by expected natural variation ~5 pixels)
      return Math.min(stdDev / 5, 1)
    } catch (error) {
      console.warn('[MotionLivenessDetector] Keypoint variance calculation failed:', error)
      return 0
    }
  }

  /**
   * Calculate average distance between corresponding landmarks in two frames
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
   * Calculate average keypoint distance across all frames
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
   * Calculate maximum keypoint distance across frames
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
   * Calculate eye aspect ratio (EAR)
   * Used to detect blinking and eye opening variations
   */
  private calculateEyeAspectRatio(eyeKeypoints: any[][]): number {
    if (!eyeKeypoints || eyeKeypoints.length < 6) {
      return 0
    }

    try {
      // Eye keypoints: [left-corner, upper-1, upper-2, right-corner, lower-2, lower-1]
      // Distance between vertical points divided by horizontal distance
      const leftCorner = eyeKeypoints[0]
      const rightCorner = eyeKeypoints[3]
      const upperLeft = eyeKeypoints[1]
      const upperRight = eyeKeypoints[2]
      const lowerLeft = eyeKeypoints[5]
      const lowerRight = eyeKeypoints[4]

      // Euclidean distances
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
   * Calculate mouth aspect ratio (MAR)
   * Used to detect mouth opening variations
   */
  private calculateMouthAspectRatio(mouthKeypoints: any[][]): number {
    if (!mouthKeypoints || mouthKeypoints.length < 6) {
      return 0
    }

    try {
      // Simple mouth opening detection
      // Use vertical distance between upper and lower lips
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
   * Calculate distance between two points
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
   * Calculate eye motion score based on eye aspect ratio changes
   */
  private calculateEyeMotionScore(): number {
    if (this.eyeAspectRatioHistory.length < 2) {
      return 0
    }

    const variance = this.calculateVariance(this.eyeAspectRatioHistory)
    // Check if variance exceeds eye aspect ratio threshold for blink detection
    if (variance < this.eyeAspectRatioThreshold) {
      return 0
    }

    // Normalize: expected variance for blinking is around 0.05
    return Math.min(variance / 0.05, 1)
  }

  /**
   * Calculate mouth motion score based on mouth aspect ratio changes
   */
  private calculateMouthMotionScore(): number {
    if (this.mouthAspectRatioHistory.length < 2) {
      return 0
    }

    const variance = this.calculateVariance(this.mouthAspectRatioHistory)
    // Normalize: expected variance for mouth movement is around 0.02
    return Math.min(variance / 0.02, 1)
  }

  /**
   * Calculate face area variance
   */
  private calculateFaceAreaVariance(): number {
    return this.calculateVariance(this.faceAreaHistory)
  }

  /**
   * Calculate variance of an array of numbers
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
   * Detect type of motion based on analysis
   */
  private detectMotionType(opticalFlow: number, keypointVariance: number): MotionType {
    if (keypointVariance < 0.01 && opticalFlow < 0.1) {
      return 'none'
    }

    if (keypointVariance > opticalFlow * 2) {
      // More keypoint movement than optical flow suggests rotation or expression
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

    // Breathing-like motion: consistent small variations
    if (
      this.faceAreaHistory.length >= 2 &&
      this.calculateVariance(this.faceAreaHistory) > 0.001
    ) {
      return 'breathing'
    }

    return 'micro_expression'
  }

  /**
   * Calculate overall motion score from multiple sources
   */
  private calculateOverallMotionScore(
    opticalFlow: number,
    keypointVariance: number,
    eyeMotion: number,
    mouthMotion: number
  ): number {
    // Weighted combination of different motion indicators
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
   * Determine if face is lively based on motion analysis
   */
  private determineLiveness(
    motionScore: number,
    keypointVariance: number,
    motionType: MotionType
  ): boolean {
    // Photo characteristics:
    // - Almost zero motion score (< 0.15)
    // - Very low keypoint variance (< 0.02)
    // - Motion type = 'none'

    // Must have meaningful motion
    if (motionScore < this.minMotionThreshold) {
      return false
    }

    // Must have keypoint variation (natural movement)
    if (keypointVariance < this.minKeypointVariance) {
      return false
    }

    // Motion type 'none' indicates a static photo
    if (motionType === 'none') {
      return false
    }

    return true
  }

  /**
   * Create empty result when analysis fails
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
   * Get motion detection results (for debugging)
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
