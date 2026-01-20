/**
 * 活体检测器 - 微妙运动检测版本 + 照片几何特征检测
 * 
 * 双重检测策略：
 * 1. 正向检测：检测生物特征（微妙眨眼、细微张嘴、面部肌肉微动）
 * 2. 逆向检测：检测照片几何特征（平面约束、透视变换规律、交叉比率）
 * 
 * ⚠️ 关键理解 ⚠️
 * MediaPipe 返回的 Z 坐标（深度）是从2D图像【推断】出来的，不是真实的物理深度！
 * - 对真实人脸：推断出正确的 3D 结构
 * - 对照片人脸：也可能推断出"假"的 3D 结构（因为照片上的人脸看起来也像 3D 的）
 * 
 * 因此，检测策略优先级：
 * 1. 【最可靠】2D 几何约束检测（单应性、交叉比率、透视变换规律）——物理定律，无法欺骗
 * 2. 【次可靠】生物特征时序检测（眨眼时间、对称性）——行为模式
 * 3. 【辅助参考】Z 坐标分析——可能被欺骗，仅作辅助
 */

import { max } from '@techstark/opencv-js'
import type { FaceResult, Point } from '@vladmandic/human'
import type { Box } from '@vladmandic/human'

/**
 * 活体检测结果详情结构
 */
export interface MotionDetectionDetails {
  frameCount: number
  // 正向检测（生物特征）
  eyeAspectRatioStdDev: number
  mouthAspectRatioStdDev: number
  eyeFluctuation: number           // 眼睛开度波动
  mouthFluctuation: number          // 嘴巴开度波动
  muscleVariation: number           // 肌肉变化幅度
  hasEyeMovement: boolean           // 检测到眼睛微动
  hasMouthMovement: boolean         // 检测到嘴巴微动
  hasMuscleMovement: boolean        // 检测到肌肉微动
  // 逆向检测（照片几何特征）
  isPhoto?: boolean                 // 是否被检测为照片
  photoConfidence?: number          // 照片检测置信度 (0-1)
  homographyScore?: number          // 单应性约束得分
  perspectiveScore?: number         // 透视变换模式得分
  crossRatioScore?: number          // 交叉比率不变性得分
  depthVariation?: number           // Z坐标深度变异
  crossFramePattern?: number        // 跨帧深度模式
}

/**
 * 活体检测结果
 */
export class MotionDetectionResult {
  // 是否为活体
  isLively: boolean
  details: MotionDetectionDetails
  debug: Record<string, any>

  constructor(
    isLively: boolean,
    details: MotionDetectionDetails,
    debug: Record<string, any> = {}
  ) {
    this.isLively = isLively
    this.debug = debug
    this.details = details
  }

  getMessage(): string {
    if (this.details.frameCount < 5) {
      return '数据不足，无法进行活体检测'
    }

    if (this.isLively) return ''
    
    // 正向检测信息
    const eyePercent = (this.details.eyeFluctuation * 100).toFixed(0)
    const mouthPercent = (this.details.mouthFluctuation * 100).toFixed(0)
    const musclePercent = (this.details.muscleVariation * 100).toFixed(0)
    const bioFeatures = `未检测到面部微动（眼睛: ${eyePercent}%, 嘴巴: ${mouthPercent}%, 肌肉: ${musclePercent}%）`
    
    // 逆向检测信息
    if (this.details.isPhoto) {
      const confidence = ((this.details.photoConfidence || 0) * 100).toFixed(0)
      const reasons: string[] = []
      
      if ((this.details.homographyScore || 0) > 0.5) reasons.push('单应性约束')
      if ((this.details.perspectiveScore || 0) > 0.5) reasons.push('透视规律')
      if ((this.details.crossRatioScore || 0) > 0.5) reasons.push('交叉比率')
      
      const reasonStr = reasons.length > 0 ? `（${reasons.join('、')}）` : ''
      return `检测到照片特征${reasonStr}，置信度${confidence}%`
    }
    
    return bioFeatures
  }
}

export interface MotionLivenessDetectorOptions {
  frameBufferSize?: number                    // 缓冲帧数
  eyeMinFluctuation?: number                  // 眼睛最小波动（微妙变化阈值）
  mouthMinFluctuation?: number                // 嘴巴最小波动
  muscleMinVariation?: number                 // 肌肉最小变化
  activityThreshold?: number                  // 判定为活体的活动度阈值
}

const DEFAULT_OPTIONS: Required<MotionLivenessDetectorOptions> = {
  frameBufferSize: 15,                        // 15帧 (0.5秒@30fps)
  eyeMinFluctuation: 0.008,                   // 非常低的眨眼阈值（检测微妙变化）
  mouthMinFluctuation: 0.005,                 // 非常低的张嘴阈值
  muscleMinVariation: 0.002,                  // 非常低的肌肉变化阈值
  activityThreshold: 0.2                      // 只需要有 20% 的活动迹象就判定为活体
}

interface FaceKeypoints {
  landmarks?: Point[]
  leftEye?: Point[]
  rightEye?: Point[]
  mouth?: Point[]
}

/**
 * 眼睛波动检测结果
 */
interface EyeFluctuationResult {
  score: number
  stdDev: number
  fluctuation: number
  hasMovement: boolean
  isPerspectiveAttack?: boolean
}

/**
 * 嘴巴波动检测结果
 */
interface MouthFluctuationResult {
  score: number
  stdDev: number
  fluctuation: number
  hasMovement: boolean
}

/**
 * 肌肉运动检测结果
 */
interface MuscleMovementResult {
  score: number
  variation: number
  hasMovement: boolean
  rigidityScore?: number
}

/**
 * 照片几何特征检测结果
 */
interface PhotoGeometryResult {
  isPhoto: boolean
  confidence: number
  details: Record<string, any>
}

/**
 * 交叉比率不变性检测结果
 */
interface CrossRatioResult {
  invarianceScore: number
  cv?: number
}

/**
 * 单应性约束检测结果
 */
interface HomographyResult {
  planarScore: number
  error?: number
}

/**
 * 深度一致性检测结果
 */
interface DepthConsistencyResult {
  depthVariation: number
  isFlat?: boolean
  noseCloser?: boolean
  details?: Record<string, number>
}

/**
 * 跨帧深度模式检测结果
 */
interface CrossFrameDepthResult {
  planarPattern: number
}

/**
 * 透视变换模式检测结果
 */
interface PerspectivePatternResult {
  perspectiveScore: number
}

/**
 * 统计信息对象
 */
interface DetectionStatistics {
  [key: string]: any
}

/**
 * 活体检测器 - 超敏感微动作版本 + 照片几何特征检测
 * 
 * 双重策略：
 * 1. 检测生物微动（正向）
 * 2. 检测照片几何约束（逆向）- 更可靠
 */
export class MotionLivenessDetector {
  private config: Required<MotionLivenessDetectorOptions>
  private eyeAspectRatioHistory: number[] = []
  private mouthAspectRatioHistory: number[] = []
  private faceLandmarksHistory: Point[][] = []  // 原始坐标（用于Z坐标分析）
  private normalizedLandmarksHistory: Point[][] = []  // 【关键】归一化坐标（用于几何约束检测）
  
  // 用于检测透视畸变攻击
  private leftEyeEARHistory: number[] = []
  private rightEyeEARHistory: number[] = []
  private frameTimestamps: number[] = []
  private rigidMotionHistory: number[] = []
  
  // 【新增】用于照片几何特征检测
  private homographyErrors: number[] = []        // 单应性变换误差历史
  private depthConsistencyScores: number[] = []  // 深度一致性得分历史
  private planarityScores: number[] = []         // 平面性得分历史

  constructor() {
    this.config = { ...DEFAULT_OPTIONS }
  }

  getOptions(): Required<MotionLivenessDetectorOptions> {
    return this.config
  }

  collectedMinFrames(): boolean {
    return this.normalizedLandmarksHistory.length >= 5
  }

  collectedFullFrames(): boolean {
    return this.normalizedLandmarksHistory.length >= this.config.frameBufferSize
  }

  reset(): void {
    this.eyeAspectRatioHistory = []
    this.mouthAspectRatioHistory = []
    this.faceLandmarksHistory = []
    this.normalizedLandmarksHistory = []  // 【关键】归一化坐标
    this.leftEyeEARHistory = []
    this.rightEyeEARHistory = []
    this.frameTimestamps = []
    this.rigidMotionHistory = []
    this.homographyErrors = []
    this.depthConsistencyScores = []
    this.planarityScores = []
  }

  analyzeMotion(faceResult: FaceResult, faceBox: Box): MotionDetectionResult {
    try {
      const currentKeypoints = this.extractKeypoints(faceResult)

      // 保存完整网格（原始坐标用于Z坐标分析）
      if (currentKeypoints.landmarks) {
        this.faceLandmarksHistory.push(currentKeypoints.landmarks)
        if (this.faceLandmarksHistory.length > this.config.frameBufferSize) {
          this.faceLandmarksHistory.shift()
        }
        
        // 【关键】保存归一化坐标用于几何约束检测
        // 归一化到人脸局部坐标系，消除人脸移动的影响
        const normalizedLandmarks = this.normalizeLandmarks(currentKeypoints.landmarks, faceBox)
        this.normalizedLandmarksHistory.push(normalizedLandmarks)
        if (this.normalizedLandmarksHistory.length > this.config.frameBufferSize) {
          this.normalizedLandmarksHistory.shift()
        }
      } else {
        const lm = currentKeypoints.landmarks || []
        const debug = {
          'faceResult.mesh存在': !!faceResult.mesh,
          'mesh长度': faceResult.mesh?.length || 0,
          'faceResult.annotations存在': !!faceResult.annotations,
          'annotations键数': Object.keys(faceResult.annotations || {}).length,
          'currentKeypoints.landmarks长度': lm.length
        }
        return this.createEmptyResult({
          reason: '缺少面部关键点，无法进行活体检测',
          landmarks: currentKeypoints.landmarks,
          debug
        })
      }

      // 数据不足时，继续收集
      if (!this.collectedMinFrames()) {
        return this.createEmptyResult({
          reason: '数据收集中，帧数不足',
          collectedFrames: this.normalizedLandmarksHistory.length
        })
      }

      // 【检测1】眼睛微妙波动 - 任何EAR变化都是活体
      const eyeActivity = this.detectEyeFluctuation(currentKeypoints)

      // 【检测2】嘴巴微妙波动 - 任何MAR变化都是活体
      const mouthActivity = this.detectMouthFluctuation(currentKeypoints)

      // 【检测3】面部肌肉微动 - 任何细微位置变化都是活体
      const muscleActivity = this.detectMuscleMovement()

      // 【新增检测4】照片几何特征检测（逆向检测）
      const photoGeometryResult = this.detectPhotoGeometry()

      // 综合判定（结合正向和逆向检测）
      const isLively = this.makeLivenessDecision(eyeActivity, mouthActivity, muscleActivity, photoGeometryResult)

      return new MotionDetectionResult(
        isLively,
        {
          frameCount: Math.max(
            this.eyeAspectRatioHistory.length,
            this.mouthAspectRatioHistory.length,
            this.faceLandmarksHistory.length,
            this.normalizedLandmarksHistory.length
          ),
          // 正向检测结果（生物特征）
          eyeAspectRatioStdDev: eyeActivity.stdDev,
          mouthAspectRatioStdDev: mouthActivity.stdDev,
          eyeFluctuation: eyeActivity.fluctuation,
          mouthFluctuation: mouthActivity.fluctuation,
          muscleVariation: muscleActivity.variation,
          hasEyeMovement: eyeActivity.hasMovement,
          hasMouthMovement: mouthActivity.hasMovement,
          hasMuscleMovement: muscleActivity.hasMovement,
          // 逆向检测结果（照片几何特征）
          isPhoto: photoGeometryResult.isPhoto,
          photoConfidence: photoGeometryResult.confidence,
          homographyScore: photoGeometryResult.details?.homographyScore,
          perspectiveScore: photoGeometryResult.details?.perspectiveScore,
          crossRatioScore: photoGeometryResult.details?.crossRatioScore,
          depthVariation: photoGeometryResult.details?.depthVariation,
          crossFramePattern: photoGeometryResult.details?.crossFramePattern
        }
      )
    } catch (error) {
      console.warn('[MotionLivenessDetector]', error)
      return this.createEmptyResult({
        reason: '活体检测异常',
        error: (error as Error).message
      })
    }
  }

  /**
   * 检测眼睛的微妙波动（任何变化）
   * 防护：排除透视畸变、噪声，确保是真实的连续或周期性波动
   */
  private detectEyeFluctuation(keypoints: FaceKeypoints): EyeFluctuationResult {
    if (!keypoints.leftEye || !keypoints.rightEye) {
      return { score: 0, stdDev: 0, fluctuation: 0, hasMovement: false }
    }

    // 计算眼睛宽高比
    const leftEAR = this.calculateEyeAspectRatio(keypoints.leftEye)
    const rightEAR = this.calculateEyeAspectRatio(keypoints.rightEye)
    const avgEAR = (leftEAR + rightEAR) / 2

    // 记录时间戳
    this.frameTimestamps.push(Date.now())
    if (this.frameTimestamps.length > this.config.frameBufferSize) {
      this.frameTimestamps.shift()
    }

    // 分别记录左右眼EAR（用于一致性检测）
    this.leftEyeEARHistory.push(leftEAR)
    this.rightEyeEARHistory.push(rightEAR)
    if (this.leftEyeEARHistory.length > this.config.frameBufferSize) {
      this.leftEyeEARHistory.shift()
      this.rightEyeEARHistory.shift()
    }

    this.eyeAspectRatioHistory.push(avgEAR)
    if (this.eyeAspectRatioHistory.length > this.config.frameBufferSize) {
      this.eyeAspectRatioHistory.shift()
    }

    if (this.eyeAspectRatioHistory.length < 2) {
      return { score: 0, stdDev: 0, fluctuation: 0, hasMovement: false }
    }

    // 计算EAR的标准差（波动幅度）
    const stdDev = this.calculateStdDev(this.eyeAspectRatioHistory)
    
    // 计算EAR的最大最小差值（波动范围）
    const maxEAR = Math.max(...this.eyeAspectRatioHistory)
    const minEAR = Math.min(...this.eyeAspectRatioHistory)
    const fluctuation = maxEAR - minEAR

    // 【防护1】检测是否是透视畸变（往复波动）
    const isOscillating = this.detectOscillation(this.eyeAspectRatioHistory)

    // 【防护2】检测是否是连续变化（真实眨眼）还是噪声
    const hasRealBlink = this.detectRealBlink(this.eyeAspectRatioHistory)

    // 【防护3】检测最近帧的变化（实时动作）
    const hasRecentMovement = this.detectRecentMovement(this.eyeAspectRatioHistory)

    // 【新增防护4】检测左右眼一致性（真实眨眼双眼同步）
    const eyeSymmetry = this.detectEyeSymmetry()

    // 【新增防护5】检测眨眼时间模式（真实眨眼非常快，100-400ms）
    const hasValidBlinkTiming = this.detectBlinkTiming()

    // 【新增防护6】检测运动-形变相关性（透视畸变特征）
    const motionDeformCorrelation = this.detectMotionDeformCorrelation()

    // 【关键】组合多个防护条件
    // 必须满足：有波动 + (往复或大幅波动) + (真实眨眼或最近有动作)
    // 并且：左右眼对称 + 时间模式正确 + 非透视畸变
    const basicMovement = 
      (fluctuation > this.config.eyeMinFluctuation || stdDev > 0.005) && 
      (isOscillating || fluctuation > 0.02) &&
      (hasRealBlink || hasRecentMovement)

    // 透视畸变攻击防护：如果运动和形变高度相关，很可能是照片偏转
    const isPerspectiveAttack = motionDeformCorrelation > 0.7 && !hasValidBlinkTiming

    // 最终判定：基础动作检测通过 + 不是透视攻击 + 左右眼对称
    const hasMovement = basicMovement && !isPerspectiveAttack && eyeSymmetry > 0.5

    // 评分：波动越大评分越高，但透视攻击会降分
    const baseScore = hasMovement ? Math.min((fluctuation + stdDev) / 0.05, 1) : 0
    const score = baseScore * (1 - motionDeformCorrelation * 0.5)

    console.debug('[Eye]', {
      EAR: avgEAR.toFixed(4),
      fluctuation: fluctuation.toFixed(5),
      stdDev: stdDev.toFixed(5),
      oscillating: isOscillating,
      realBlink: hasRealBlink,
      recentMovement: hasRecentMovement,
      eyeSymmetry: eyeSymmetry.toFixed(3),
      blinkTiming: hasValidBlinkTiming,
      motionDeformCorr: motionDeformCorrelation.toFixed(3),
      isPerspectiveAttack,
      score: score.toFixed(3)
    })

    return { score, stdDev, fluctuation, hasMovement, isPerspectiveAttack }
  }

  /**
   * 检测嘴巴的微妙波动（任何变化）
   * 防护：排除噪声，确保是真实的张嘴/闭嘴动作
   */
  private detectMouthFluctuation(keypoints: FaceKeypoints): MouthFluctuationResult {
    if (!keypoints.mouth) {
      return { score: 0, stdDev: 0, fluctuation: 0, hasMovement: false }
    }

    // 计算嘴巴宽高比
    const MAR = this.calculateMouthAspectRatio(keypoints.mouth)

    this.mouthAspectRatioHistory.push(MAR)
    if (this.mouthAspectRatioHistory.length > this.config.frameBufferSize) {
      this.mouthAspectRatioHistory.shift()
    }

    if (this.mouthAspectRatioHistory.length < 2) {
      return { score: 0, stdDev: 0, fluctuation: 0, hasMovement: false }
    }

    // 计算MAR的标准差
    const stdDev = this.calculateStdDev(this.mouthAspectRatioHistory)
    
    // 计算波动范围
    const maxMAR = Math.max(...this.mouthAspectRatioHistory)
    const minMAR = Math.min(...this.mouthAspectRatioHistory)
    const fluctuation = maxMAR - minMAR

    // 【防护1】检测真实的张嘴/闭嘴周期
    const hasRealMouthMovement = this.detectRealMouthMovement(this.mouthAspectRatioHistory)

    // 【防护2】检测最近是否有嘴巴活动
    const hasRecentMouthMovement = this.detectRecentMovement(this.mouthAspectRatioHistory)

    // 【关键】需要真实的嘴巴动作或最近有活动
    const hasMovement = 
      (fluctuation > this.config.mouthMinFluctuation || stdDev > 0.003) &&
      (hasRealMouthMovement || hasRecentMouthMovement)

    // 评分
    const score = hasMovement ? Math.min((fluctuation + stdDev) / 0.05, 1) : 0

    console.debug('[Mouth]', {
      MAR: MAR.toFixed(4),
      fluctuation: fluctuation.toFixed(5),
      stdDev: stdDev.toFixed(5),
      realMovement: hasRealMouthMovement,
      recentMovement: hasRecentMouthMovement,
      score: score.toFixed(3)
    })

    return { score, stdDev, fluctuation, hasMovement }
  }

  /**
   * 【关键】检测真实的嘴巴张嘴→闭嘴动作
   * 
   * 原理类似眨眼，需要检测下降和上升的连续段
   */
  private detectRealMouthMovement(values: number[]): boolean {
    if (values.length < 3) {
      return false
    }

    // 统计连续段
    let descendingSegments = 0
    let ascendingSegments = 0
    let inDescending = false
    let inAscending = false

    for (let i = 1; i < values.length; i++) {
      const change = values[i] - values[i - 1]
      const threshold = 0.008

      if (change < -threshold) {
        if (!inDescending) {
          descendingSegments++
          inDescending = true
          inAscending = false
        }
      } else if (change > threshold) {
        if (!inAscending) {
          ascendingSegments++
          inAscending = true
          inDescending = false
        }
      }
    }

    const hasCompletePattern = descendingSegments > 0 && ascendingSegments > 0

    // 或检查最近5帧
    if (values.length >= 5) {
      const recent5 = values.slice(-5)
      const recentRange = Math.max(...recent5) - Math.min(...recent5)
      const hasRecentOpening = recentRange > 0.015
      return hasCompletePattern || hasRecentOpening
    }

    return hasCompletePattern
  }

  /**
   * 检测面部肌肉的微动（关键点位置微妙变化）
   * 关键：允许刚性运动+生物特征（真人摇头），拒绝纯刚性运动（照片旋转）
   * 
   * 【合理使用归一化坐标】这里使用归一化坐标是有意义的，因为：
   * - 目的是检测肌肉的【相对运动幅度】，与人脸尺寸无关
   * - 消除人脸在画面中位置变化的影响
   * - 用相对于人脸的比例运动来判断肌肉活动
   */
  private detectMuscleMovement(): MuscleMovementResult {
    // 使用归一化坐标历史，消除人脸位置和尺寸影响
    if (this.normalizedLandmarksHistory.length < 2) {
      return { score: 0, variation: 0, hasMovement: false }
    }

    // 【改进】检测刚性运动，但不直接拒绝
    // 在综合判定中会结合其他生物特征来判断
    const rigidityScore = this.detectRigidMotion()
    
    // 记录刚性运动历史（用于运动-形变相关性分析）
    this.rigidMotionHistory.push(rigidityScore)
    if (this.rigidMotionHistory.length > this.config.frameBufferSize) {
      this.rigidMotionHistory.shift()
    }

    // 选择敏感的肌肉关键点
    const musclePoints = [
      61, 291,        // 嘴角
      46, 53,         // 左眉
      276, 283,       // 右眉
      127, 356        // 脸颊
    ]

    const distances: number[] = []

    // 使用归一化坐标计算相对位移
    for (let i = 1; i < this.normalizedLandmarksHistory.length; i++) {
      const prevFrame = this.normalizedLandmarksHistory[i - 1]
      const currFrame = this.normalizedLandmarksHistory[i]

      let totalDist = 0
      let validPoints = 0

      for (const ptIdx of musclePoints) {
        const prev = prevFrame[ptIdx]
        const curr = currFrame[ptIdx]
        if (prev && curr && prev.length >= 2 && curr.length >= 2) {
          // 归一化坐标的距离（相对于人脸尺寸的比例）
          const dist = Math.sqrt((curr[0] - prev[0]) ** 2 + (curr[1] - prev[1]) ** 2)
          totalDist += dist
          validPoints++
        }
      }

      if (validPoints > 0) {
        distances.push(totalDist / validPoints)
      }
    }

    if (distances.length === 0) {
      return { score: 0, variation: 0, hasMovement: false }
    }

    // 计算肌肉运动的变异性
    const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length
    const variation = this.calculateStdDev(distances)

    // 【关键】只要有任何细微变化就判定为活动
    // 注意：阈值需要调整，因为归一化坐标的数值范围是 [0, 1]
    const hasMovement = variation > 0.001 || avgDist > 0.005

    // 评分
    const score = Math.min((variation + avgDist) / 0.05, 1)

    console.debug('[Muscle] avgDist:', avgDist.toFixed(4), 'variation:', variation.toFixed(5), 'rigidity:', rigidityScore.toFixed(3), 'score:', score.toFixed(3))

    return { score: Math.max(score, 0), variation, hasMovement, rigidityScore }
  }

  /**
   * 【防护机制】检测照片透视畸变（倾角拍摄）
   * 
   * 原理：
   * - 照片是平面：所有关键点Z坐标（深度）应该相同且恒定
   * - 当从倾角看平面照片时，虽然会产生2D投影变形，但深度仍然固定在一个平面
   * - 真实活体：脸部有Z坐标深度，不同区域有深度差异（鼻子、下巴等突出）
   * 
   * 返回值：照片平面性得分（0-1，越接近1越可能是平面照片）
   */
  private detectPhotoPlanarity(): number {
    if (this.faceLandmarksHistory.length < 3) {
      return 0
    }

    // 获取最近帧的关键点
    const latestFrame = this.faceLandmarksHistory[this.faceLandmarksHistory.length - 1]
    
    if (!latestFrame || latestFrame.length < 468) {
      return 0
    }

    // 采样关键点的Z坐标（深度值）
    // MediaPipe返回的Z坐标是相对值，表示距离摄像头的深度
    const samplePoints = [
      10,    // 额头上方
      152,   // 下巴
      33,    // 右眼外角
      263,   // 左眼外角
      61,    // 左嘴角
      291,   // 右嘴角
      1,     // 鼻尖
      234,   // 右脸颊边缘
      454    // 左脸颊边缘
    ]

    const zValues: number[] = []
    for (const ptIdx of samplePoints) {
      const point = latestFrame[ptIdx]
      if (point && point.length >= 3 && typeof point[2] === 'number') {
        zValues.push(point[2])
      }
    }

    if (zValues.length < 5) {
      return 0
    }

    // 计算Z坐标的变异系数
    const zMean = zValues.reduce((a, b) => a + b, 0) / zValues.length
    const zStdDev = this.calculateStdDev(zValues)
    
    // 照片的Z坐标变异非常小（都在一个平面上）
    // 活体的Z坐标有较大变异（鼻子比眼睛凸出，下巴和额头深度不同）
    const zVarianceRatio = zMean > 0 ? zStdDev / zMean : 0

    // 平面性评分：如果Z坐标变异很小，说明是平面（照片）
    // 如果zVarianceRatio < 0.15，认为是平面
    // 如果zVarianceRatio > 0.3，认为是立体（活体）
    const planarity = Math.max(0, (0.15 - zVarianceRatio) / 0.15)

    console.debug('[Planarity]', {
      zMean: zMean.toFixed(4),
      zStdDev: zStdDev.toFixed(4),
      zVarianceRatio: zVarianceRatio.toFixed(4),
      planarity: planarity.toFixed(3)
    })

    return Math.min(planarity, 1)
  }

  /**
   * 【防护机制】检测刚性运动（照片被拿着旋转/平移）
   * 
   * 原理：
   * - 照片所有关键点运动是【刚性的】→ 所有点以相同方向、相似幅度移动
   * - 活体肌肉运动是【非刚性的】→ 不同部位独立运动（眼睛、嘴、脸颊等）
   * 
   * 【合理使用归一化坐标】这里使用归一化坐标是有意义的，因为：
   * - 消除人脸在画面中的平移，只关注人脸内部的相对运动模式
   * - 检测的是运动向量的方向一致性，不依赖绝对坐标
   * 
   * 返回值 0-1：值越接近1说明是刚性运动（照片运动）
   */
  private detectRigidMotion(): number {
    // 使用归一化坐标历史，消除平移影响
    if (this.normalizedLandmarksHistory.length < 2) {
      return 0  // 数据不足，不判定为刚性运动
    }

    // 采样关键点（覆盖全脸，去重）
    const samplePoints = [
      33, 263,        // 左右眼外角
      362, 133,       // 左右眼内角
      234, 454,       // 左右脸颊边缘
      10, 152,        // 额头、下巴
      61, 291         // 嘴角
    ]

    const motionVectors: Array<{ dx: number; dy: number }> = []

    // 使用最近两帧计算运动向量
    const frame1 = this.normalizedLandmarksHistory[this.normalizedLandmarksHistory.length - 2]
    const frame2 = this.normalizedLandmarksHistory[this.normalizedLandmarksHistory.length - 1]

    for (const ptIdx of samplePoints) {
      if (ptIdx < frame1.length && ptIdx < frame2.length) {
        const p1 = frame1[ptIdx]
        const p2 = frame2[ptIdx]
        if (p1 && p2 && p1.length >= 2 && p2.length >= 2) {
          motionVectors.push({
            dx: p2[0] - p1[0],
            dy: p2[1] - p1[1]
          })
        }
      }
    }

    if (motionVectors.length < 3) {
      return 0
    }

    // 计算所有运动向量的【一致性】
    // 如果所有向量都指向相同方向（方向角相似），则为刚性运动
    const angles = motionVectors.map(v => Math.atan2(v.dy, v.dx))
    const magnitudes = motionVectors.map(v => Math.sqrt(v.dx * v.dx + v.dy * v.dy))

    // 方向一致性：计算方向的标准差
    const meanAngle = this.calculateMeanAngle(angles)
    const angleVariance = angles.reduce((sum, angle) => {
      const diff = angle - meanAngle
      // 处理角度环绕问题
      const wrappedDiff = Math.abs(diff) > Math.PI ? 2 * Math.PI - Math.abs(diff) : Math.abs(diff)
      return sum + wrappedDiff * wrappedDiff
    }, 0) / angles.length
    const angleStdDev = Math.sqrt(angleVariance)

    // 幅度一致性：计算幅度的变异系数
    const meanMagnitude = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length
    const magnitudeVariance = magnitudes.reduce((sum, mag) => sum + (mag - meanMagnitude) ** 2, 0) / magnitudes.length
    const magnitudeStdDev = Math.sqrt(magnitudeVariance)
    // 使用更低的阈值避免小运动时误判，当运动幅度很小时使用1避免除零
    const magnitudeCV = meanMagnitude > 0.001 ? magnitudeStdDev / meanMagnitude : 1

    // 综合评分：方向和幅度都一致 → 刚性运动
    // angleStdDev 越小（接近0）说明方向越一致
    // magnitudeCV 越小（接近0）说明幅度越一致
    const rigidityScore = Math.max(0, 1 - angleStdDev / 0.5) * Math.max(0, 1 - magnitudeCV)

    console.debug('[RigidityCheck]', {
      samplePointCount: motionVectors.length,
      angleStdDev: angleStdDev.toFixed(4),
      magnitudeCV: magnitudeCV.toFixed(4),
      rigidityScore: rigidityScore.toFixed(3)
    })

    return Math.min(rigidityScore, 1)
  }

  /**
   * 计算角度的平均值（考虑循环性）
   */
  private calculateMeanAngle(angles: number[]): number {
    const sinSum = angles.reduce((sum, a) => sum + Math.sin(a), 0)
    const cosSum = angles.reduce((sum, a) => sum + Math.cos(a), 0)
    return Math.atan2(sinSum / angles.length, cosSum / angles.length)
  }

  /**
   * 检测序列是否呈现【往复波动】而不是【单向变化】
   * 
   * 原理：
   * - 真实眨眼/表情：值会【往复波动】 如 0.4 → 0.3 → 0.4 → 0.5
   * - 照片透视变形：值会【单向变化】 如 0.4 → 0.3 → 0.25 → 0.2
   * 
   * 返回值：true = 检测到往复波动（活体特征）
   */
  private detectOscillation(values: number[]): boolean {
    if (values.length < 4) {
      return false
    }

    // 计算相邻值的差分
    const diffs: number[] = []
    for (let i = 1; i < values.length; i++) {
      diffs.push(values[i] - values[i - 1])
    }

    // 统计方向改变次数（从正变负或从负变正）
    let directionChanges = 0
    for (let i = 1; i < diffs.length; i++) {
      if (diffs[i] * diffs[i - 1] < 0) {  // 符号相反
        directionChanges++
      }
    }

    // 往复波动通常有多次方向改变
    // 单向变化只有0-1次方向改变
    const isOscillating = directionChanges >= 1

    return isOscillating
  }

  /**
   * 【关键】检测真实眨眼（连续的闭眼→睁眼周期）
   * 
   * 原理：
   * - 真实眨眼：快速下降（EAR↓ 1-2帧）→ 保持低值（EAR低 2-3帧）→ 快速上升（EAR↑ 1-2帧）
   * - 噪声或光线变化：孤立的异常值，前后没有连续的变化模式
   * 
   * 返回值：true = 检测到完整或部分眨眼周期
   */
  private detectRealBlink(values: number[]): boolean {
    if (values.length < 3) {
      return false
    }

    // 统计连续下降和上升的段数
    let descendingSegments = 0
    let ascendingSegments = 0
    let inDescending = false
    let inAscending = false

    for (let i = 1; i < values.length; i++) {
      const change = values[i] - values[i - 1]
      const threshold = 0.01  // 判定为"变化"的阈值

      if (change < -threshold) {
        if (!inDescending) {
          descendingSegments++
          inDescending = true
          inAscending = false
        }
      } else if (change > threshold) {
        if (!inAscending) {
          ascendingSegments++
          inAscending = true
          inDescending = false
        }
      } else {
        // 变化不大，可能在平台期
        if (inDescending || inAscending) {
          // 保持当前状态（平台期）
        }
      }
    }

    // 完整眨眼周期：下降→平台→上升，至少要有下降和上升
    // 或者：最近几帧有明显的下升趋势
    const hasCompletePattern = descendingSegments > 0 && ascendingSegments > 0

    // 或者检查最近5帧是否有明显变化
    if (values.length >= 5) {
      const recent5 = values.slice(-5)
      const recentRange = Math.max(...recent5) - Math.min(...recent5)
      const hasRecentBlink = recentRange > 0.02
      return hasCompletePattern || hasRecentBlink
    }

    return hasCompletePattern
  }

  /**
   * 【新增防护】检测左右眼对称性
   * 
   * 原理：
   * - 真实眨眼：左右眼几乎同时闭合和睁开，EAR变化高度同步
   * - 照片透视畸变：根据偏转方向，一只眼睛可能比另一只变化更大
   * 
   * 返回值 0-1：越接近1说明左右眼越对称（越像真实眨眼）
   */
  private detectEyeSymmetry(): number {
    if (this.leftEyeEARHistory.length < 3 || this.rightEyeEARHistory.length < 3) {
      return 1  // 数据不足，默认通过
    }

    // 计算左右眼EAR变化的差分
    const leftDiffs: number[] = []
    const rightDiffs: number[] = []
    for (let i = 1; i < this.leftEyeEARHistory.length; i++) {
      leftDiffs.push(this.leftEyeEARHistory[i] - this.leftEyeEARHistory[i - 1])
      rightDiffs.push(this.rightEyeEARHistory[i] - this.rightEyeEARHistory[i - 1])
    }

    // 计算左右眼变化的相关性
    // 真实眨眼：leftDiffs ≈ rightDiffs（同向同幅度）
    // 透视畸变：可能一个大一个小，或方向不一致
    let sumProduct = 0
    let sumLeftSq = 0
    let sumRightSq = 0
    for (let i = 0; i < leftDiffs.length; i++) {
      sumProduct += leftDiffs[i] * rightDiffs[i]
      sumLeftSq += leftDiffs[i] * leftDiffs[i]
      sumRightSq += rightDiffs[i] * rightDiffs[i]
    }

    const denominator = Math.sqrt(sumLeftSq * sumRightSq)
    if (denominator < 0.0001) {
      return 1  // 几乎没有变化，视为对称
    }

    // 皮尔逊相关系数，范围 [-1, 1]
    const correlation = sumProduct / denominator
    
    // 转换为对称性得分 [0, 1]，相关性越高越对称
    const symmetry = (correlation + 1) / 2

    console.debug('[EyeSymmetry]', {
      correlation: correlation.toFixed(3),
      symmetry: symmetry.toFixed(3)
    })

    return symmetry
  }

  /**
   * 【新增防护】检测眨眼时间模式
   * 
   * 原理：
   * - 真实眨眼非常快：完整周期 100-400ms（3-12帧@30fps）
   * - 手动摆动照片：周期通常 500ms-2000ms（15-60帧@30fps）
   * 
   * 返回值：true = 检测到符合真实眨眼的快速时间模式
   */
  private detectBlinkTiming(): boolean {
    if (this.eyeAspectRatioHistory.length < 5 || this.frameTimestamps.length < 5) {
      return true  // 数据不足，默认通过
    }

    // 找到EAR的局部最小值（眨眼闭合点）
    const values = this.eyeAspectRatioHistory
    const timestamps = this.frameTimestamps

    // 检测下降-上升周期的时间
    let inDescent = false
    let descentStartIdx = -1
    let fastBlinkCount = 0
    let slowBlinkCount = 0

    for (let i = 1; i < values.length; i++) {
      const change = values[i] - values[i - 1]
      
      if (change < -0.01 && !inDescent) {
        // 开始下降
        inDescent = true
        descentStartIdx = i - 1
      } else if (change > 0.01 && inDescent) {
        // 开始上升（完成一个眨眼周期）
        inDescent = false
        if (descentStartIdx >= 0 && i < timestamps.length) {
          const duration = timestamps[i] - timestamps[descentStartIdx]
          if (duration > 0 && duration < 500) {
            fastBlinkCount++  // 快速眨眼（< 500ms）
          } else if (duration >= 500) {
            slowBlinkCount++  // 慢速"眨眼"（可能是照片摆动）
          }
        }
      }
    }

    // 如果快速眨眼比慢速眨眼多，认为是真实的
    const hasValidTiming = fastBlinkCount > 0 || slowBlinkCount === 0

    console.debug('[BlinkTiming]', {
      fastBlinks: fastBlinkCount,
      slowBlinks: slowBlinkCount,
      hasValidTiming
    })

    return hasValidTiming
  }

  /**
   * 【新增防护】检测运动-形变相关性
   * 
   * 原理：
   * - 照片偏转攻击：刚性运动越大 → EAR/MAR形变越大（高度相关）
   * - 真实活体：眨眼/张嘴与头部运动无关（低相关或无相关）
   * 
   * 返回值 0-1：越接近1说明运动和形变越相关（越像照片攻击）
   */
  private detectMotionDeformCorrelation(): number {
    if (this.rigidMotionHistory.length < 3 || this.eyeAspectRatioHistory.length < 3) {
      return 0  // 数据不足，默认不是攻击
    }

    // 计算EAR变化幅度
    const earChanges: number[] = []
    for (let i = 1; i < this.eyeAspectRatioHistory.length; i++) {
      earChanges.push(Math.abs(this.eyeAspectRatioHistory[i] - this.eyeAspectRatioHistory[i - 1]))
    }

    // 取最近的刚性运动历史（对齐长度）
    const motionValues = this.rigidMotionHistory.slice(-(earChanges.length))
    if (motionValues.length !== earChanges.length || motionValues.length < 3) {
      return 0
    }

    // 计算皮尔逊相关系数
    const n = motionValues.length
    const meanMotion = motionValues.reduce((a, b) => a + b, 0) / n
    const meanEAR = earChanges.reduce((a, b) => a + b, 0) / n

    let numerator = 0
    let denomMotion = 0
    let denomEAR = 0
    for (let i = 0; i < n; i++) {
      const diffMotion = motionValues[i] - meanMotion
      const diffEAR = earChanges[i] - meanEAR
      numerator += diffMotion * diffEAR
      denomMotion += diffMotion * diffMotion
      denomEAR += diffEAR * diffEAR
    }

    const denominator = Math.sqrt(denomMotion * denomEAR)
    if (denominator < 0.0001) {
      return 0  // 几乎没有变化
    }

    // 相关系数 [-1, 1]，我们关心正相关（运动大→形变大）
    const correlation = numerator / denominator
    
    // 只有正相关才可疑，负相关或无相关都正常
    const suspiciousCorrelation = Math.max(0, correlation)

    console.debug('[MotionDeformCorr]', {
      correlation: correlation.toFixed(3),
      suspicious: suspiciousCorrelation.toFixed(3)
    })

    return suspiciousCorrelation
  }

  /**
   * 【关键】检测最近几帧是否有运动
   * 
   * 防护：某人在检测开始时眨眼，之后就完全静止
   * 这种情况应该判定为照片，因为照片可以有偶然的反光
   * 活体应该有【持续的或周期性的】动作
   * 
   * 返回值：true = 最近3-5帧内有明显变化
   */
  private detectRecentMovement(values: number[]): boolean {
    if (values.length < 4) {
      return false  // 数据不足，保守判定
    }

    // 检查最近帧的变化幅度
    // 如果最近帧都相同，说明动作已经停止
    const recentFrames = values.slice(-5)  // 最近5帧
    const recentRange = Math.max(...recentFrames) - Math.min(...recentFrames)
    const recentStdDev = this.calculateStdDev(recentFrames)

    // 最近帧还有变化，说明活体在动
    const hasRecentChange = recentRange > 0.008 || recentStdDev > 0.003

    // 额外检查：不能只是偶然的反光
    // 如果最后2帧都完全相同或非常接近，说明已经停止
    const lastTwoChanges = Math.abs(values[values.length - 1] - values[values.length - 2])
    const isStabiliziing = lastTwoChanges < 0.002

    return hasRecentChange && !isStabiliziing
  }

  /**
   * 【核心】照片几何特征检测（逆向检测）
   * 
   * 重要说明：
   * - MediaPipe的Z坐标是从2D图像【推断】的，不是真实深度
   * - 对照片也可能推断出"假"的3D结构
   * - 因此【2D几何约束】比【Z坐标分析】更可靠
   * 
   * 可靠的检测（基于2D几何，物理定律）：
   * 1. 单应性变换约束 - 平面必须满足
   * 2. 特征点相对位置变化 - 照片偏转时遵循透视规律
   * 
   * 参考性检测（基于推断的Z坐标，可能被欺骗）：
   * 1. 深度一致性 - 辅助参考
   * 2. 跨帧深度模式 - 辅助参考
   */
  private detectPhotoGeometry(): PhotoGeometryResult {
    if (this.normalizedLandmarksHistory.length < 3) {
      return { isPhoto: false, confidence: 0, details: {} }
    }

    // 【核心检测1】平面单应性约束检测（最可靠，纯2D几何）
    const homographyResult = this.detectHomographyConstraint()
    
    // 【核心检测2】特征点相对位置变化模式（照片遵循透视变换规律）
    const perspectivePattern = this.detectPerspectiveTransformPattern()
    
    // 【核心检测3】交叉比率不变性检测（射影几何的核心不变量）
    const crossRatioResult = this.detectCrossRatioInvariance()

    // 【辅助检测】深度相关（Z坐标是推断的，权重降低）
    const depthResult = this.detectDepthConsistency()
    const crossFrameDepth = this.detectCrossFrameDepthPattern()

    // 综合判定：2D几何约束权重高，Z坐标权重低
    // 【改进】提高perspectiveScore的权重，因为完美的平滑变换是照片的强特征
    const photoScore = 
      homographyResult.planarScore * 0.30 +       // 单应性约束（最可靠）
      perspectivePattern.perspectiveScore * 0.40 + // 透视变换模式（可靠且权重提高）
      crossRatioResult.invarianceScore * 0.15 +   // 交叉比率不变性（可靠）
      (1 - Math.min(depthResult.depthVariation, 1)) * 0.10 +   // 深度（辅助，低权重）
      crossFrameDepth.planarPattern * 0.05        // 跨帧深度（辅助，低权重）

    const isPhoto = photoScore > 0.50  // 【改进】降低阈值到0.50（从0.60）
    const confidence = Math.min(photoScore, 1)

    // 记录历史
    this.planarityScores.push(photoScore)
    if (this.planarityScores.length > this.config.frameBufferSize) {
      this.planarityScores.shift()
    }

    console.debug('[PhotoGeometry]', {
      homography: homographyResult.planarScore.toFixed(3),
      perspective: perspectivePattern.perspectiveScore.toFixed(3),
      crossRatio: crossRatioResult.invarianceScore.toFixed(3),
      depthVariation: depthResult.depthVariation.toFixed(3),
      crossFrame: crossFrameDepth.planarPattern.toFixed(3),
      photoScore: photoScore.toFixed(3),
      isPhoto
    })

    return {
      isPhoto,
      confidence,
      details: {
        homographyScore: homographyResult.planarScore,
        perspectiveScore: perspectivePattern.perspectiveScore,
        crossRatioScore: crossRatioResult.invarianceScore,
        depthVariation: depthResult.depthVariation,
        crossFramePattern: crossFrameDepth.planarPattern
      }
    }
  }

  /**
   * 【新增核心检测】交叉比率不变性检测
   * 
   * 原理（射影几何的基本定理）：
   * - 平面上共线4点的【交叉比率】在透视变换下保持不变
   * - 真实3D人脸旋转时，面部各点不共面，交叉比率会变化
   * - 照片无论怎么偏转，共线点的交叉比率保持不变
   * 
   * 这是纯2D几何检测，非常可靠！
   */
  /**
   * 【交叉比率不变性检测】
   * 
   * 原理（射影几何的基本定理）：
   * - 平面上共线4点的【交叉比率】在透视变换下保持不变
   * - 真实3D人脸旋转时，面部各点不共面，交叉比率会变化
   * - 照片无论怎么偏转，共线点的交叉比率保持不变
   * 
   * 虽然交叉比率是射影不变量（用任何坐标系都可以），
   * 但使用原始坐标以保持一致性和物理意义的清晰性
   */
  private detectCrossRatioInvariance(): CrossRatioResult {
    // 【使用原始坐标历史】虽然交叉比率是射影不变量，
    // 但原始坐标保持物理清晰性
    if (this.faceLandmarksHistory.length < 3) {
      return { invarianceScore: 0 }
    }

    // 选择面部中线上近似共线的点（额头-鼻梁-鼻尖-嘴-下巴）
    const midlinePoints = [10, 168, 1, 0, 152]  // 从上到下

    const crossRatios: number[] = []

    for (const frame of this.faceLandmarksHistory) {
      if (frame.length < 468) continue

      // 提取中线点的Y坐标（它们大致在一条垂直线上）
      const yCoords: number[] = []
      for (const idx of midlinePoints) {
        if (frame[idx]) {
          yCoords.push(frame[idx][1])
        }
      }

      if (yCoords.length >= 4) {
        // 计算交叉比率 CR(A,B,C,D) = (AC * BD) / (BC * AD)
        const a = yCoords[0], b = yCoords[1], c = yCoords[2], d = yCoords[3]
        const ac = Math.abs(c - a)
        const bd = Math.abs(d - b)
        const bc = Math.abs(c - b)
        const ad = Math.abs(d - a)
        
        if (bc > 0.001 && ad > 0.001) {
          const cr = (ac * bd) / (bc * ad)
          crossRatios.push(cr)
        }
      }
    }

    if (crossRatios.length < 2) {
      return { invarianceScore: 0 }
    }

    // 计算交叉比率的变异系数
    // 照片：交叉比率应该几乎不变（变异系数小）
    // 真人：交叉比率会变化（变异系数大）
    const mean = crossRatios.reduce((a, b) => a + b, 0) / crossRatios.length
    const stdDev = this.calculateStdDev(crossRatios)
    const cv = mean > 0.001 ? stdDev / mean : 0

    // 变异系数越小，越可能是平面（照片）
    // cv < 0.05 → 非常稳定（照片）
    // cv > 0.15 → 变化明显（真人）
    const invarianceScore = Math.max(0, 1 - cv / 0.1)

    console.debug('[CrossRatio]', {
      mean: mean.toFixed(4),
      stdDev: stdDev.toFixed(4),
      cv: cv.toFixed(4),
      invarianceScore: invarianceScore.toFixed(3)
    })

    return { invarianceScore: Math.min(invarianceScore, 1), cv }
  }

  /**
   * 【关键】检测单应性变换约束
   * 
   * 原理：
   * - 平面物体（照片）在不同视角下的投影满足 H * p1 = p2（H是3x3单应性矩阵）
   * - 3D物体不满足这个约束，会有残差误差
   * 
   * 方法：用4对点计算H，然后检验其他点是否符合H变换
   */
  /**
   * 【单应性约束检测】判断多帧特征点是否满足平面约束
   * 
   * 【关键改进】：
   * 1. 使用DLT算法计算完整的3x3单应性矩阵（8参数）
   * 2. 使用相邻帧而不是首尾帧（减少变化幅度）
   * 3. 检查单应性矩阵的性质（秩、行列式等）
   * 4. 计算多帧的平均误差（更稳定）
   * 5. 对所有帧对的H矩阵一致性进行验证
   * 
   * 这是纯 2D 几何检测，最可靠！
   */
  private detectHomographyConstraint(): HomographyResult {
    // 【关键】使用原始坐标历史，而不是归一化坐标
    // 原因：单应性矩阵在原始图像坐标中定义
    // 归一化坐标虽然消除平移影响，但破坏了H矩阵的定义
    if (this.faceLandmarksHistory.length < 2) {
      return { planarScore: 0 }
    }

    // 【改进】使用所有面部关键点（468个点）而不是采样点
    // 更多的点对会给出更准确的单应性矩阵估计
    const errors: number[] = []
    const homographyMatrices: Array<number[][]> = []
    let lastSrcPoints: number[][] = []  // 保存最后一组点对，用于计算特征尺度

    // 【策略改进】优先使用最近的帧对（尽早检测）
    // 照片的几何约束是瞬间的，2帧就足够；多帧用来验证一致性
    const recentFrameCount = Math.min(5, this.faceLandmarksHistory.length)
    
    // 计算最近帧对的变换误差（重点在最近的帧）
    for (let i = Math.max(1, this.faceLandmarksHistory.length - recentFrameCount); 
         i < this.faceLandmarksHistory.length; i++) {
      const frame1 = this.faceLandmarksHistory[i - 1]
      const frame2 = this.faceLandmarksHistory[i]

      if (frame1.length < 100 || frame2.length < 100) continue  // 至少100个有效点

      // 【改进】收集所有有效的点对（而不是只采样10个点）
      // 这给出更好的H矩阵估计
      const srcPoints: number[][] = []
      const dstPoints: number[][] = []
      
      for (let ptIdx = 0; ptIdx < Math.min(frame1.length, frame2.length); ptIdx++) {
        if (frame1[ptIdx] && frame2[ptIdx] && 
            frame1[ptIdx].length >= 2 && frame2[ptIdx].length >= 2) {
          const x1 = frame1[ptIdx][0]
          const y1 = frame1[ptIdx][1]
          const x2 = frame2[ptIdx][0]
          const y2 = frame2[ptIdx][1]
          
          // 【修复】只排除明显的异常值（移动过大），保留所有其他点
          // 包括静止的点和微妙移动的点，DLT需要全局点分布
          const displacement = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
          if (displacement < 200) {  // 仅排除极端异常
            srcPoints.push([x1, y1])
            dstPoints.push([x2, y2])
          }
        }
      }

      if (srcPoints.length < 10) continue  // 至少10个匹配点对（DLT最少需要4个）

      // 保存这一组点对（用于后面计算特征尺度）
      lastSrcPoints = srcPoints

      // 【新增】使用DLT算法计算完整的3x3单应性矩阵
      const H = this.estimateHomographyDLT(srcPoints, dstPoints)
      if (!H) continue

      homographyMatrices.push(H)

      // 【改进】使用单应性矩阵计算误差（而不是仿射变换）
      let frameError = 0
      let validCount = 0
      for (let j = 0; j < srcPoints.length; j++) {
        const transformed = this.applyHomography(H, srcPoints[j][0], srcPoints[j][1])
        const actual = dstPoints[j]
        const error = Math.sqrt((transformed[0] - actual[0]) ** 2 + (transformed[1] - actual[1]) ** 2)
        frameError += error
        validCount++
      }

      if (validCount > 0) {
        errors.push(frameError / validCount)
      }
    }

    if (errors.length === 0) {
      return { planarScore: 0, error: 0 }
    }

    // 计算所有帧的平均误差
    const avgError = errors.reduce((a, b) => a + b, 0) / errors.length

    // 【新增】检查H矩阵的一致性
    // 照片的H矩阵在不同帧对中应该保持相对稳定
    let matrixConsistency = 1.0
    if (homographyMatrices.length > 1) {
      matrixConsistency = this.checkHomographyConsistency(homographyMatrices)
    }

    // 【改进】使用相对误差而不是绝对误差
    // 相对误差 = avgError / 点集特征尺度
    // 这样对不同分辨率和点集大小更鲁棒
    const characteristicScale = lastSrcPoints.length > 0 ? this.computeCharacteristicScale(lastSrcPoints) : 1
    const relativeError = characteristicScale > 0.1 ? avgError / characteristicScale : avgError
    
    // 平面性判决：
    // relativeError < 0.05 → 很可能是平面（照片）
    // relativeError > 0.1  → 很可能是立体（活体）
    const errorScore = Math.max(0, 1 - relativeError / 0.1)
    const planarScore = errorScore * matrixConsistency

    console.debug('[HomographyConstraint]', {
      recentFrameCount,
      frameCount: errors.length,
      avgError: avgError.toFixed(4),
      errorScore: errorScore.toFixed(3),
      matrixConsistency: matrixConsistency.toFixed(3),
      planarScore: planarScore.toFixed(3),
      homographyMatrixCount: homographyMatrices.length
    })

    return { planarScore: Math.min(planarScore, 1), error: avgError }
  }

  /**
   * 使用DLT算法估计单应性矩阵（Homography Estimation using DLT）
   * 
   * DLT (Direct Linear Transform) 是估计射影变换的标准算法
   * 
   * 输入：
   * - src: 源点坐标数组 (至少4对)
   * - dst: 目标点坐标数组
   * 
   * 输出：
   * - 3x3单应性矩阵H，使得 p' = H * p (齐次坐标表示)
   * 
   * 关键特性：
   * - 与仿射变换的区别：
   *   * 仿射：6参数，处理旋转+缩放+平移+剪切
   *   * 单应性：8参数，处理完整的射影变换（包括透视失真）
   * - 适用场景：照片倾斜拍摄、相机透视变换
   * - 数值稳定性：使用点集归一化提高数值精度
   * 
   * 算法步骤：
   * 1. 归一化源点和目标点（改进数值稳定性）
   * 2. 构建 2n×9 的 A 矩阵（n为点对数）
   * 3. 使用最小二乘法求解 Ah = 0
   * 4. 反演应化矩阵到原始坐标系
   */
  private estimateHomographyDLT(src: number[][], dst: number[][]): number[][] | null {
    if (src.length < 4 || dst.length < 4 || src.length !== dst.length) return null

    const n = src.length
    
    // 【关键】对点进行归一化，提高数值稳定性
    const srcNorm = this.normalizePoints(src)
    const dstNorm = this.normalizePoints(dst)

    if (!srcNorm || !dstNorm) return null

    // 构建DLT方程矩阵 A (2n × 9)
    // 
    // 标准DLT形式推导：
    // 已知齐次坐标关系：p' = H * p
    // 即：[x', y', 1]^T = H * [x, y, 1]^T / w
    // 其中：w = h7*x + h8*y + h9 (齐次化分母)
    // 
    // 展开得到：
    // x' = (h1*x + h2*y + h3) / (h7*x + h8*y + h9)
    // y' = (h4*x + h5*y + h6) / (h7*x + h8*y + h9)
    // 
    // 交叉相乘消去分母：
    // x'*(h7*x + h8*y + h9) = h1*x + h2*y + h3
    // y'*(h7*x + h8*y + h9) = h4*x + h5*y + h6
    // 
    // 整理为齐次线性方程 Ah = 0：
    // h1*x + h2*y + h3 - xp*h7*x - xp*h8*y - xp*h9 = 0
    // h4*x + h5*y + h6 - yp*h7*x - yp*h8*y - yp*h9 = 0
    // 
    // 矩阵形式（每对点产生2行方程）：
    // [x,  y,  1,  0,  0,  0, -xp*x, -xp*y, -xp]   [h1]
    // [0,  0,  0,  x,  y,  1, -yp*x, -yp*y, -yp] * [h2] = 0
    //                                               [...]
    //                                               [h9]
    const A: number[][] = []
    
    for (let i = 0; i < n; i++) {
      const x = srcNorm.points[i][0]
      const y = srcNorm.points[i][1]
      const xp = dstNorm.points[i][0]
      const yp = dstNorm.points[i][1]

      // 第一行：h1*x + h2*y + h3 - xp*h7*x - xp*h8*y - xp*h9 = 0
      A.push([x, y, 1, 0, 0, 0, -xp * x, -xp * y, -xp])
      
      // 第二行：h4*x + h5*y + h6 - yp*h7*x - yp*h8*y - yp*h9 = 0
      A.push([0, 0, 0, x, y, 1, -yp * x, -yp * y, -yp])
    }

    // 使用最小二乘法求解 Ah = 0
    // h 是 A^T*A 最小特征值对应的特征向量
    const h = this.solveHomographyLSQ(A)
    if (!h) return null

    // 反演应化：从归一化坐标回到原始图像坐标
    // H_orig = T_dst^(-1) * H_norm * T_src
    const H = this.denormalizeHomography(h, srcNorm, dstNorm)
    
    return H
  }

  /**
   * 点集归一化（Hartley标准化）- 提高DLT数值稳定性
   * 
   * 目的：
   * - DLT算法对坐标尺度敏感，归一化可显著改善数值稳定性
   * - 避免矩阵条件数过大，减少数值误差
   * 
   * 方法：
   * 1. 计算点集的重心 (cx, cy)
   * 2. 计算点到重心的平均距离
   * 3. 缩放使得平均距离为 √2
   * 
   * 变换：T = [s, 0, -s*cx; 0, s, -s*cy; 0, 0, 1]
   * 其中 s = √2 / avgDistance
   * 
   * 好处：
   * - 点集的重心在原点
   * - 点到原点的平均距离为 √2（标准化）
   * - A^T*A 矩阵条件数接近最优
   * 
   * 逆操作：在得到矩阵后需要反归一化回原始坐标
   */
  private normalizePoints(points: number[][]): { points: number[][], T: number[][] } | null {
    if (points.length === 0) return null

    // 计算重心
    let cx = 0, cy = 0
    for (const p of points) {
      cx += p[0]
      cy += p[1]
    }
    cx /= points.length
    cy /= points.length

    // 计算平均距离
    let avgDist = 0
    for (const p of points) {
      const dx = p[0] - cx
      const dy = p[1] - cy
      avgDist += Math.sqrt(dx * dx + dy * dy)
    }
    avgDist /= points.length

    // 缩放因子
    const scale = avgDist > 0.001 ? Math.sqrt(2) / avgDist : 1

    // 应用归一化变换
    const normalized: number[][] = []
    for (const p of points) {
      normalized.push([
        (p[0] - cx) * scale,
        (p[1] - cy) * scale
      ])
    }

    // 归一化矩阵 T
    const T: number[][] = [
      [scale, 0, -cx * scale],
      [0, scale, -cy * scale],
      [0, 0, 1]
    ]

    return { points: normalized, T }
  }

  /**
   * 最小二乘法求解齐次线性方程 Ah = 0
   * 
   * 问题：找到使 ||Ah|| 最小的单位向量 h
   * 
   * 标准解法：
   * - 完整SVD：对 A 进行 SVD 分解，h 是最小奇异值的右奇异向量
   * - 特征向量法（此处使用）：
   *   1. 计算 A^T * A（9×9对称矩阵）
   *   2. 求 A^T*A 的最小特征值对应的特征向量
   *   3. 该特征向量即为所求的 h
   * 
   * 说明：
   * - h 是 3×3 单应性矩阵 H 的向量化形式
   * - 返回的特征向量已归一化
   */
  private solveHomographyLSQ(A: number[][]): number[] | null {
    if (A.length < 8) return null

    // 构造 A^T * A 矩阵 (9×9)
    // 这是一个对称半正定矩阵
    const ATA: number[][] = Array(9).fill(0).map(() => Array(9).fill(0))
    
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        for (let k = 0; k < A.length; k++) {
          ATA[i][j] += A[k][i] * A[k][j]
        }
      }
    }

    // 求 A^T*A 的最小特征向量
    // 最小特征向量对应最小特征值，使 ||Ah|| 最小
    const eigenVec = this.getSmallestEigenvector(ATA)
    return eigenVec
  }

  /**
   * 求9x9对称矩阵(A^T*A)的最小特征向量
   * 使用改进的迭代方法
   * 
   * 原理：
   * - A^T*A 是对称半正定矩阵
   * - 最小特征值对应的特征向量是最小二乘解
   * - 使用迭代幂法（Power Iteration）的变种求最小特征向量
   */
  private getSmallestEigenvector(mat: number[][]): number[] | null {
    if (mat.length !== 9) return null

    // 初始随机向量
    let v = [1, 0, 0, 0, 1, 0, 0, 0, 1]  // 初始值更稳定
    let prevEigenvalue = Infinity
    
    // 迭代求解最小特征值对应的特征向量
    for (let iter = 0; iter < 50; iter++) {
      // 计算 A*v
      const Av = [0, 0, 0, 0, 0, 0, 0, 0, 0]
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
          Av[i] += mat[i][j] * v[j]
        }
      }
      
      // 计算 Rayleigh 商（特征值估计）
      let vTAv = 0
      let vTv = 0
      for (let i = 0; i < 9; i++) {
        vTAv += v[i] * Av[i]
        vTv += v[i] * v[i]
      }
      
      const eigenvalue = vTv > 1e-10 ? vTAv / vTv : 0
      
      // 标准化 Av
      const AvNorm = Math.sqrt(Av.reduce((a, b) => a + b * b, 0))
      if (AvNorm < 1e-10) {
        break
      }
      
      // 更新 v
      for (let i = 0; i < 9; i++) {
        v[i] = Av[i] / AvNorm
      }
      
      // 收敛判断：特征值变化很小
      if (Math.abs(eigenvalue - prevEigenvalue) < 1e-8) {
        break
      }
      prevEigenvalue = eigenvalue
    }

    // 最后做一次归一化
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0))
    if (norm > 1e-10) {
      for (let i = 0; i < 9; i++) {
        v[i] = v[i] / norm
      }
    }

    return v
  }

  /**
   * 反演应化矩阵 - 从归一化坐标回到原始图像坐标
   * 
   * 原理：
   * - 在归一化坐标系中估算的H矩阵需要转换回原始坐标
   * 
   * 公式：H_orig = T_dst^(-1) * H_norm * T_src
   * 
   * 说明：
   * - T_src：源点的归一化变换矩阵
   * - T_dst：目标点的归一化变换矩阵
   * - H_norm：在归一化坐标中计算得到的3×3矩阵
   * - H_orig：最终的单应性矩阵（用于原始图像坐标）
   * 
   * 验证：p'_orig = H_orig * p_src_orig
   */
  private denormalizeHomography(h: number[], srcNorm: any, dstNorm: any): number[][] {
    // 将向量h转换为3x3矩阵
    const H_norm: number[][] = [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], h[8]]
    ]

    // H = T_dst^-1 * H_norm * T_src
    const T_src = srcNorm.T
    const T_dst = dstNorm.T
    const T_dst_inv = this.invertMatrix3x3(T_dst)

    if (!T_dst_inv) return H_norm

    // 矩阵乘法：(3x3) * (3x3) * (3x3)
    const temp = this.multiplyMatrix3x3(T_dst_inv, H_norm)
    const H = this.multiplyMatrix3x3(temp, T_src)

    return H
  }

  /**
   * 检查点集的分布范围（防止点集集中在小区域）
   * 返回值：0-1，值越大说明分布越分散
   */
  private checkPointSpread(points: number[][]): number {
    if (points.length < 2) return 0

    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity

    for (const p of points) {
      minX = Math.min(minX, p[0])
      maxX = Math.max(maxX, p[0])
      minY = Math.min(minY, p[1])
      maxY = Math.max(maxY, p[1])
    }

    const rangeX = maxX - minX
    const rangeY = maxY - minY
    const area = rangeX * rangeY

    // 点集的相对面积（相对于整个图像，假设1920x1080）
    // 面积越大，点的分布越分散
    const imageArea = 1920 * 1080
    const relativeArea = Math.min(area / imageArea, 1)

    return relativeArea
  }

  /**
   * 3x3矩阵求逆
   */
  private invertMatrix3x3(m: number[][]): number[][] | null {
    const [m00, m01, m02] = m[0]
    const [m10, m11, m12] = m[1]
    const [m20, m21, m22] = m[2]

    const det = 
      m00 * (m11 * m22 - m12 * m21) -
      m01 * (m10 * m22 - m12 * m20) +
      m02 * (m10 * m21 - m11 * m20)

    if (Math.abs(det) < 0.0001) return null

    const inv: number[][] = [
      [
        (m11 * m22 - m12 * m21) / det,
        (m02 * m21 - m01 * m22) / det,
        (m01 * m12 - m02 * m11) / det
      ],
      [
        (m12 * m20 - m10 * m22) / det,
        (m00 * m22 - m02 * m20) / det,
        (m02 * m10 - m00 * m12) / det
      ],
      [
        (m10 * m21 - m11 * m20) / det,
        (m01 * m20 - m00 * m21) / det,
        (m00 * m11 - m01 * m10) / det
      ]
    ]

    return inv
  }

  /**
   * 3x3矩阵乘法
   */
  private multiplyMatrix3x3(A: number[][], B: number[][]): number[][] {
    const result: number[][] = Array(3).fill(0).map(() => Array(3).fill(0))
    
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          result[i][j] += A[i][k] * B[k][j]
        }
      }
    }

    return result
  }

  /**
   * 应用单应性变换 - 齐次坐标变换与反齐次化
   * 
   * 操作步骤：
   * 1. 输入：(x, y) → 齐次坐标 [x, y, 1]
   * 2. 矩阵乘法：H * p 得到齐次结果 [x'w, y'w, w]
   * 3. 反齐次化：[x'w/w, y'w/w] = [x', y']
   * 
   * 公式：
   * [x']     [h11 h12 h13] [x]
   * [y'  ] = [h21 h22 h23] [y]
   * [w']     [h31 h32 h33] [1]
   * 
   * 最后：x' = x'w / w, y' = y'w / w
   * 
   * 注意：如果 w' ≈ 0，点被投影到无穷远（退化情况）
   */
  private applyHomography(H: number[][], x: number, y: number): number[] {
    // 齐次坐标表示
    const p = [x, y, 1]
    
    // 矩阵乘法：H * p
    const Hp = [
      H[0][0] * p[0] + H[0][1] * p[1] + H[0][2] * p[2],
      H[1][0] * p[0] + H[1][1] * p[1] + H[1][2] * p[2],
      H[2][0] * p[0] + H[2][1] * p[1] + H[2][2] * p[2]
    ]

    // 反齐次化：除以齐次坐标的 Z 分量
    // 如果 w ≈ 0，则点在无穷远，返回齐次结果
    if (Math.abs(Hp[2]) < 0.0001) {
      return [Hp[0], Hp[1]]  // 异常情况：接近无穷
    }

    return [Hp[0] / Hp[2], Hp[1] / Hp[2]]  // 正常情况：反齐次化
  }

  /**
   * 【新增】计算点集的特征尺度（点间的平均距离）
   * 
   * 用于相对误差计算，使算法对不同分辨率和点集大小更鲁棒
   */
  private computeCharacteristicScale(points: number[][]): number {
    if (points.length < 2) return 1

    let totalDist = 0
    let count = 0
    
    // 采样计算点间距离，避免 O(n²) 复杂度
    const sampleSize = Math.min(points.length, 30)
    for (let i = 0; i < sampleSize; i++) {
      for (let j = i + 1; j < sampleSize; j++) {
        const dx = points[i][0] - points[j][0]
        const dy = points[i][1] - points[j][1]
        totalDist += Math.sqrt(dx * dx + dy * dy)
        count++
      }
    }
    
    return count > 0 ? totalDist / count : 1
  }

  /**
   * 【新增】检查单应性矩阵的一致性
   * 
   * 原理：
   * - 照片旋转时，每对相邻帧的H矩阵应该相近（因为是持续旋转）
   * - 真实人脸做随机动作时，H矩阵会变化很大
   */
  private checkHomographyConsistency(matrices: number[][][]): number {
    if (matrices.length < 2) return 1

    // 计算矩阵间的相似度
    let totalSimilarity = 0
    let pairCount = 0

    for (let i = 1; i < matrices.length; i++) {
      const M1 = matrices[i - 1]
      const M2 = matrices[i]

      // Frobenius范数相似度
      let sumDiff = 0
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const diff = M1[r][c] - M2[r][c]
          sumDiff += diff * diff
        }
      }

      const frobeniusDist = Math.sqrt(sumDiff)
      
      // 标准化距离（除以矩阵范数）
      let normM1 = 0, normM2 = 0
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          normM1 += M1[r][c] * M1[r][c]
          normM2 += M2[r][c] * M2[r][c]
        }
      }
      normM1 = Math.sqrt(normM1)
      normM2 = Math.sqrt(normM2)
      
      const avgNorm = (normM1 + normM2) / 2
      const normalizedDist = avgNorm > 0.1 ? Math.min(frobeniusDist / avgNorm, 2) : 2

      // 将距离转换为相似度 (0-1)
      // 距离越小，相似度越高
      const similarity = Math.max(0, 1 - normalizedDist / 2)
      totalSimilarity += similarity
      pairCount++
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 1
  }

  /**
   * 【关键】检测深度一致性
   * 
   * 原理：
   * - 真实人脸：鼻子Z坐标明显大于眼睛和脸颊（凸出）
   * - 照片：所有点Z坐标接近相同（平面）
   */
  private detectDepthConsistency(): DepthConsistencyResult {
    const latestFrame = this.faceLandmarksHistory[this.faceLandmarksHistory.length - 1]
    
    if (!latestFrame || latestFrame.length < 468) {
      return { depthVariation: 0.5 }
    }

    // 采样不同深度区域的点
    const nosePoints = [1, 4, 5, 6]      // 鼻子（应该凸出）
    const eyePoints = [33, 133, 263, 362] // 眼睛（应该凹陷）
    const cheekPoints = [234, 454, 50, 280] // 脸颊（中间深度）
    const foreheadPoints = [10, 67, 297]  // 额头

    const getAvgZ = (points: number[]) => {
      let sum = 0, count = 0
      for (const idx of points) {
        const point = latestFrame[idx]
        if (point && point.length >= 3 && typeof point[2] === 'number') {
          sum += point[2]
          count++
        }
      }
      return count > 0 ? sum / count : 0
    }

    const noseZ = getAvgZ(nosePoints)
    const eyeZ = getAvgZ(eyePoints)
    const cheekZ = getAvgZ(cheekPoints)
    const foreheadZ = getAvgZ(foreheadPoints)

    // 计算深度差异
    const allZ = [noseZ, eyeZ, cheekZ, foreheadZ].filter(z => z !== 0)
    if (allZ.length < 3) {
      return { depthVariation: 0.5, isFlat: false }
    }

    const zMean = allZ.reduce((a, b) => a + b, 0) / allZ.length
    const zStdDev = Math.sqrt(allZ.reduce((sum, z) => sum + (z - zMean) ** 2, 0) / allZ.length)
    
    // 深度变异系数
    const depthVariation = zMean !== 0 ? Math.abs(zStdDev / zMean) : 0

    // 检查深度关系是否符合真实人脸
    // 真实人脸：鼻子应该比眼睛更接近摄像头（Z更小，因为Z表示深度/距离）
    // 注意：MediaPipe的Z坐标是负值，越接近0表示越近
    const noseCloser = noseZ > eyeZ  // 鼻子更近

    // 记录历史
    this.depthConsistencyScores.push(depthVariation)
    if (this.depthConsistencyScores.length > this.config.frameBufferSize) {
      this.depthConsistencyScores.shift()
    }

    return {
      depthVariation,
      isFlat: depthVariation < 0.1,  // 深度变异很小 → 平面（照片）
      noseCloser,
      details: { noseZ, eyeZ, cheekZ, foreheadZ }
    }
  }

  /**
   * 【关键】检测跨帧深度模式
   * 
   * 原理：
   * - 照片旋转时：所有点的深度变化遵循平面投影规律（线性关系）
   * - 真实人脸旋转时：不同部位的深度变化不成线性关系
   */
  private detectCrossFrameDepthPattern(): CrossFrameDepthResult {
    if (this.faceLandmarksHistory.length < 3) {
      return { planarPattern: 0 }
    }

    // 比较多帧的深度变化模式
    const samplePoints = [1, 33, 263, 61, 291]  // 鼻尖、眼角、嘴角
    
    const depthChanges: number[][] = []
    for (let i = 1; i < this.faceLandmarksHistory.length; i++) {
      const prev = this.faceLandmarksHistory[i - 1]
      const curr = this.faceLandmarksHistory[i]
      
      const changes: number[] = []
      for (const idx of samplePoints) {
        const prevPoint = prev[idx]
        const currPoint = curr[idx]
        if (prevPoint && currPoint && prevPoint.length >= 3 && currPoint.length >= 3 && typeof prevPoint[2] === 'number' && typeof currPoint[2] === 'number') {
          changes.push(currPoint[2] - prevPoint[2])
        }
      }
      if (changes.length >= 3) {
        depthChanges.push(changes)
      }
    }

    if (depthChanges.length < 2) {
      return { planarPattern: 0 }
    }

    // 检测深度变化的一致性（平面特征：所有点同方向变化）
    let consistentFrames = 0
    for (const changes of depthChanges) {
      const signs = changes.map(c => Math.sign(c))
      const allSame = signs.every(s => s === signs[0]) || signs.every(s => Math.abs(changes[signs.indexOf(s)]) < 0.001)
      if (allSame) consistentFrames++
    }

    const planarPattern = consistentFrames / depthChanges.length

    return { planarPattern }
  }

  /**
   * 【透视变换模式检测】
   * 
   * 【改进】使用原始坐标而不是归一化坐标
   * 
   * 原理：照片左右偏转时，左右脸宽度比例会平滑变化
   * 这种比例变化遵循严格的透视投影规律
   */
  private detectPerspectiveTransformPattern(): PerspectivePatternResult {
    // 【关键】使用原始坐标历史，而不是归一化坐标
    // 透视变换的宽度比例变化在原始图像坐标中更准确
    if (this.faceLandmarksHistory.length < 3) {
      return { perspectiveScore: 0 }
    }

    // 比较左右脸的宽度比例变化
    // 照片左偏时：右脸变窄，左脸变宽（透视效果）
    // 这种变化应该是平滑且可预测的
    
    const widthRatios: number[] = []
    for (const frame of this.faceLandmarksHistory) {
      if (frame.length >= 468) {
        // 使用原始坐标计算距离比例
        // 234: 左脸颊边缘，1: 鼻尖，454: 右脸颊边缘
        const leftWidth = this.pointDist(frame[234], frame[1])   // 左脸到鼻子
        const rightWidth = this.pointDist(frame[1], frame[454])  // 鼻子到右脸
        if (leftWidth > 0 && rightWidth > 0) {
          widthRatios.push(leftWidth / rightWidth)
        }
      }
    }

    if (widthRatios.length < 3) {
      return { perspectiveScore: 0 }
    }

    // 照片偏转时，宽度比例变化应该是单调的或周期性的
    // 计算变化的平滑度
    let smoothChanges = 0
    for (let i = 2; i < widthRatios.length; i++) {
      const change1 = widthRatios[i - 1] - widthRatios[i - 2]
      const change2 = widthRatios[i] - widthRatios[i - 1]
      // 如果变化方向一致或变化很小，则认为是平滑的
      if (change1 * change2 >= 0 || Math.abs(change1) < 0.02 || Math.abs(change2) < 0.02) {
        smoothChanges++
      }
    }

    const smoothness = smoothChanges / (widthRatios.length - 2)
    
    // 平滑的透视变化模式更可能是照片
    const perspectiveScore = smoothness

    return { perspectiveScore }
  }

  /**
   * 综合判定 - 结合正向检测（生物特征）和逆向检测（照片几何）
   * 
   * 双重策略：
   * 1. 正向：检测生物微动特征（有 → 活体）
   * 2. 逆向：检测照片几何约束（满足 → 照片）
   * 
   * 逆向检测优先级更高，因为照片几何约束是物理定律，无法伪造
   */
  private makeLivenessDecision(eyeActivity: EyeFluctuationResult, mouthActivity: MouthFluctuationResult, muscleActivity: MuscleMovementResult, photoGeometry: PhotoGeometryResult): boolean {
    if (!this.collectedMinFrames()) {
      return true  // 数据不足，默认通过
    }

    // ============ 逆向检测（照片几何特征）============
    // 这是最可靠的检测方式，优先级最高
    const isPhotoByGeometry = photoGeometry.isPhoto
    const photoConfidence = photoGeometry.confidence || 0
    const frameCount = Math.max(
      this.eyeAspectRatioHistory.length,
      this.mouthAspectRatioHistory.length,
      this.faceLandmarksHistory.length,
      this.normalizedLandmarksHistory.length
    )

    // 【改进】根据帧数调整照片检测的敏感度
    // 少帧情况下，照片特征更容易误判，但如果几何约束强，仍应拒绝
    let photoConfidenceThreshold = 0.55
    if (frameCount < 8) {
      // 少于8帧时，提高拒绝阈值，但只对超强照片特征有效
      // perspectiveScore=1.0 是超强信号，不应该放过
      if ((photoGeometry.details?.perspectiveScore || 0) > 0.95) {
        photoConfidenceThreshold = 0.45  // 降低阈值
      } else {
        photoConfidenceThreshold = 0.65  // 提高阈值
      }
    }

    // 如果照片几何检测高置信度判定为照片，直接拒绝
    // 【改进】根据帧数和具体特征调整阈值
    if (isPhotoByGeometry && photoConfidence > photoConfidenceThreshold) {
      console.debug('[Decision] REJECTED by photo geometry detection', {
        photoConfidence: photoConfidence.toFixed(3),
        photoConfidenceThreshold: photoConfidenceThreshold.toFixed(3),
        perspectiveScore: (photoGeometry.details?.perspectiveScore || 0).toFixed(3),
        frameCount,
        details: photoGeometry.details
      })
      return false
    }

    // ============ 正向检测（生物特征）============
    const hasEyeMovement = eyeActivity.hasMovement
    const hasMouthMovement = mouthActivity.hasMovement
    const hasMuscleMovement = muscleActivity.hasMovement
    const hasBioFeatures = hasEyeMovement || hasMouthMovement || hasMuscleMovement

    // 获取其他检测结果
    const rigidityScore = muscleActivity.rigidityScore || 0
    const isPerspectiveAttack = eyeActivity.isPerspectiveAttack || false
    const faceShapeStability = this.checkFaceShapeStability()

    // ============ 综合判定 ============
    // 
    // 【决策矩阵】
    // 
    // | 照片几何检测 | 生物特征 | 透视攻击 | 判定 |
    // |-------------|---------|---------|------|
    // | 是照片(>0.75) | - | - | ❌ 拒绝 |
    // | 可疑(0.5-0.75) | 有 | 否 | ✅ 通过（生物特征覆盖） |
    // | 可疑(0.5-0.75) | 无 | - | ❌ 拒绝 |
    // | 不像照片(<0.5) | 有 | 否 | ✅ 通过 |
    // | 不像照片(<0.5) | 无 | 是 | ❌ 拒绝 |
    // | 不像照片(<0.5) | 无 | 否 | ⚠️ 待定（看刚性运动） |

    let isLively: boolean

    if (photoConfidence > 0.5) {
      // 照片可疑度中等以上：需要有明确的生物特征才能通过
      isLively = hasBioFeatures && !isPerspectiveAttack
    } else {
      // 照片可疑度较低：正常的生物特征检测逻辑
      const hasRigidMotion = rigidityScore > 0.7
      const isPhotoLikely = faceShapeStability > 0.9
      
      isLively = 
        (hasBioFeatures && !isPerspectiveAttack) || 
        (hasRigidMotion && !isPhotoLikely && !isPerspectiveAttack)
    }

    console.debug('[Decision]', {
      // 逆向检测结果
      photoGeometry: isPhotoByGeometry,
      photoConfidence: photoConfidence.toFixed(3),
      // 正向检测结果
      eye: eyeActivity.score.toFixed(3),
      mouth: mouthActivity.score.toFixed(3),
      muscle: muscleActivity.score.toFixed(3),
      hasBioFeatures,
      // 其他指标
      rigidity: rigidityScore.toFixed(3),
      faceShapeStability: faceShapeStability.toFixed(3),
      isPerspectiveAttack,
      // 最终结果
      isLively
    })

    return isLively
  }

  /**
   * 【防护机制】检查脸部形状稳定性
   * 
   * 原理：
   * - 真实脸部：眨眼、张嘴等会改变脸部几何形状（EAR/MAR 变化）
   * - 照片：脸部形状完全固定，不会有任何变化
   * - 倾角照片：虽然会产生透视变形，但仍然是平面的，Z坐标无深度
   * 
   * 返回值 0-1：值越接近1说明脸部形状越稳定（越可能是照片）
   */
  /**
   * 检查脸部形状稳定性
   * 
   * 【合理使用归一化坐标】这里使用归一化坐标是有意义的，因为：
   * - 目的是检测【脸部形状的变化】（眼睛距离、嘴巴高度等）
   * - 与人脸在画面中的位置和尺寸无关
   * - 消除平移和缩放影响，专注于形状的变化
   */
  private checkFaceShapeStability(): number {
    // 使用归一化坐标历史，消除平移和缩放影响
    if (this.normalizedLandmarksHistory.length < 5) {
      return 0.5  // 数据不足
    }

    // 【第一层防护】检测照片平面性（Z坐标深度）
    // 注意：这个方法使用原始坐标的Z值，因为Z是相对深度
    const planarity = this.detectPhotoPlanarity()
    if (planarity > 0.7) {
      // 检测到照片平面特征（Z坐标变异很小）
      console.debug('[FaceShapeStability] Detected planar face (photo), planarity:', planarity.toFixed(3))
      return 0.95  // 非常可能是照片
    }

    // 【第二层防护】检测脸部形状稳定性
    // 使用归一化坐标计算相对距离，检测形状变化
    const faceDistances: number[][] = []

    // 计算以下距离：
    // 1. 左眼-右眼（眼距）
    // 2. 上嘴唇-下嘴唇（嘴高）
    // 3. 左脸颊-右脸颊（脸宽）
    for (const frame of this.normalizedLandmarksHistory) {
      if (frame.length >= 468) {
        const eyeDist = this.pointDist(frame[33], frame[263])          // 左右眼外角距离
        const mouthHeight = Math.abs(frame[13][1] - frame[14][1])      // 上下嘴唇距离
        const faceWidth = this.pointDist(frame[234], frame[454])       // 左右脸颊边缘距离
        faceDistances.push([eyeDist, mouthHeight, faceWidth])
      }
    }

    if (faceDistances.length < 3) {
      return 0.5
    }

    // 计算每个距离的变异系数（越小说明越固定）
    let totalCV = 0
    for (let i = 0; i < 3; i++) {
      const values = faceDistances.map(d => d[i])
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const stdDev = this.calculateStdDev(values)
      // 归一化坐标下，调整阈值
      const cv = mean > 0.01 ? stdDev / mean : 0
      totalCV += cv
    }

    const avgCV = totalCV / 3
    
    // CV越小，形状越稳定
    // 如果avgCV < 0.02，说明形状完全不变（可能是照片）
    // 如果avgCV > 0.1，说明形状在变化（活体）
    const shapeStability = Math.min(Math.max(0.02 - avgCV, 0) / 0.02, 1)

    // 综合得分：结合平面性和形状稳定性
    const combinedStability = Math.max(shapeStability, planarity * 0.5)

    console.debug('[FaceShapeStability]', {
      avgCV: avgCV.toFixed(4),
      planarity: planarity.toFixed(3),
      shapeStability: shapeStability.toFixed(3),
      combinedStability: combinedStability.toFixed(3)
    })

    return Math.min(combinedStability, 1)
  }

  private extractKeypoints(face: FaceResult): FaceKeypoints {
    const keypoints: FaceKeypoints = {}

    if (face.mesh && Array.isArray(face.mesh)) {
      keypoints.landmarks = face.mesh
    }

    // 类型守卫：确保landmarks存在且长度足够
    const landmarks = keypoints.landmarks
    if (landmarks && Array.isArray(landmarks) && landmarks.length >= 468) {
      // 左眼关键点 (MediaPipe Face Mesh 标准索引)
      // 按顺序：外眼角、上眼睑上、上眼睑、内眼角、下眼睑、下眼睑下
      keypoints.leftEye = [
        landmarks[362],  // 外眼角
        landmarks[385],  // 上眼睑上
        landmarks[387],  // 上眼睑
        landmarks[263],  // 内眼角
        landmarks[373],  // 下眼睑
        landmarks[380]   // 下眼睑下
      ].filter(p => p !== undefined)

      // 右眼关键点 (MediaPipe Face Mesh 标准索引)
      keypoints.rightEye = [
        landmarks[33],   // 外眼角
        landmarks[160],  // 上眼睑上
        landmarks[158],  // 上眼睑
        landmarks[133],  // 内眼角
        landmarks[153],  // 下眼睑
        landmarks[144]   // 下眼睑下
      ].filter(p => p !== undefined)

      // 嘴巴关键点
      keypoints.mouth = [
        landmarks[61],   // 左嘴角
        landmarks[185],  // 上嘴唇左
        landmarks[40],   // 上嘴唇中左
        landmarks[39],   // 上嘴唇中
        landmarks[37],   // 上嘴唇中右
        landmarks[0],    // 上嘴唇右
        landmarks[267],  // 下嘴唇右
        landmarks[269],  // 下嘴唇中右
        landmarks[270],  // 下嘴唇中
        landmarks[409]   // 下嘴唇左
      ].filter(p => p !== undefined)
    }

    return keypoints
  }

  private calculateEyeAspectRatio(eye: Point[]): number {
    if (!eye || eye.length < 6) return 0
    try {
      const v1 = this.pointDist(eye[1], eye[5])
      const v2 = this.pointDist(eye[2], eye[4])
      const h = this.pointDist(eye[0], eye[3])
      return h === 0 ? 0 : (v1 + v2) / (2 * h)
    } catch {
      return 0
    }
  }

  private calculateMouthAspectRatio(mouth: Point[]): number {
    if (!mouth || mouth.length < 6) return 0
    try {
      const upperY = mouth.slice(0, 5).reduce((s, p) => s + (p?.[1] || 0), 0) / 5
      const lowerY = mouth.slice(5).reduce((s, p) => s + (p?.[1] || 0), 0) / 5
      const w = this.pointDist(mouth[0], mouth[5])
      return w === 0 ? 0 : Math.abs(upperY - lowerY) / w
    } catch {
      return 0
    }
  }

  private pointDist(p1: Point, p2: Point): number {
    if (!p1 || !p2 || p1.length < 2 || p2.length < 2) return 0
    const dx = p1[0] - p2[0]
    const dy = p1[1] - p2[1]
    return Math.sqrt(dx * dx + dy * dy)
  }

  private calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
    return Math.sqrt(variance)
  }

  /**
   * 【关键方法】将关键点坐标归一化到人脸局部坐标系
   * 
   * 问题：
   * - MediaPipe 返回的 x,y 坐标是相对于【图像左上角】的像素坐标
   * - 如果人脸在画面中移动，同一个关键点的绝对坐标会完全不同
   * - 多帧之间直接比较绝对坐标是错误的！
   * 
   * 解决：
   * - 将坐标转换为相对于人脸边界框的归一化坐标
   * - 归一化坐标 = (点坐标 - 人脸左上角) / 人脸尺寸
   * - 这样无论人脸在画面中的位置，归一化坐标都一致
   * 
   * @param landmarks 原始关键点数组
   * @param faceBox 人脸边界框 [x, y, width, height]
   * @returns 归一化后的关键点数组
   */
  private normalizeLandmarks(landmarks: Point[], faceBox: Box): Point[] {
    // faceBox: [x, y, width, height] 或 {x, y, width, height}
    let boxX: number, boxY: number, boxW: number, boxH: number
    
    if (Array.isArray(faceBox)) {
      [boxX, boxY, boxW, boxH] = faceBox
    } else {
      // 兼容对象格式
      boxX = (faceBox as any).x || 0
      boxY = (faceBox as any).y || 0
      boxW = (faceBox as any).width || 1
      boxH = (faceBox as any).height || 1
    }

    // 防止除零
    if (boxW <= 0) boxW = 1
    if (boxH <= 0) boxH = 1

    const normalized: Point[] = []
    for (const pt of landmarks) {
      if (pt && pt.length >= 2) {
        // 归一化 x, y 到 [0, 1] 相对于人脸框
        const nx = (pt[0] - boxX) / boxW
        const ny = (pt[1] - boxY) / boxH
        // Z 坐标保持不变（MediaPipe 的 Z 是相对于人脸中心的）
        const nz = pt.length >= 3 ? pt[2] : 0
        normalized.push([nx, ny, nz])
      } else {
        normalized.push([0, 0, 0])
      }
    }
    return normalized
  }

  private createEmptyResult(debug: Record<string, any> = {}): MotionDetectionResult {
    return new MotionDetectionResult(true, {
      frameCount: 0,
      eyeAspectRatioStdDev: 0,
      mouthAspectRatioStdDev: 0,
      eyeFluctuation: 0,
      mouthFluctuation: 0,
      muscleVariation: 0,
      hasEyeMovement: false,
      hasMouthMovement: false,
      hasMuscleMovement: false
    }, debug)
  }

  getStatistics(): DetectionStatistics {
    return {
      eyeHistorySize: this.eyeAspectRatioHistory.length,
      mouthHistorySize: this.mouthAspectRatioHistory.length,
      eyeValues: this.eyeAspectRatioHistory.map(v => v.toFixed(4)),
      mouthValues: this.mouthAspectRatioHistory.map(v => v.toFixed(4))
    }
  }
}
