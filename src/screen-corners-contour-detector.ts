/**
 * 屏幕边角、轮廓检测器
 * 用于快速判定当前图片是否从屏幕拍摄
 * 通过检测图片中的屏幕边界轮廓（矩形框）
 */

/**
 * 屏幕边角、轮廓检测器配置选项
 */
export interface ScreenCornersContourDetectorOptions {
  // Canny 边缘检测参数
  /** Canny 边缘检测下阈值（默认 50） */
  edgeThreshold1?: number
  /** Canny 边缘检测上阈值（默认 150） */
  edgeThreshold2?: number

  // 霍夫直线检测参数
  /** 霍夫直线检测投票阈值（默认 50） */
  lineDetectionThreshold?: number
  /** 直线最小长度（默认 30） */
  minLineLength?: number
  /** 直线最大间隙（默认 10） */
  maxLineGap?: number

  // 轮廓检测参数
  /** 最小轮廓面积（默认 100） */
  minContourArea?: number

  // 角检测参数
  /** Harris 角检测的阈值比例（默认 0.01） */
  cornerThresholdRatio?: number
  /** 预期的角数量基准（默认 100） */
  expectedCornerCount?: number

  // 综合判断参数
  /** 屏幕采集置信度阈值（默认 0.6） */
  cornerConfidenceThreshold?: number
  /** 屏幕边界占比阈值（默认 0.3） */
  screenBoundaryRatioThreshold?: number
  /** 边缘像素数量基准值（默认 5000） */
  edgePixelsNormalizationBase?: number
  /** 直线数量基准值（默认 10） */
  lineCountNormalizationBase?: number
  /** 轮廓数量基准值（默认 3） */
  contourCountNormalizationBase?: number

  // 权重配置
  /** 边缘检测权重（默认 0.2） */
  edgeWeight?: number
  /** 直线检测权重（默认 0.25） */
  lineWeight?: number
  /** 轮廓检测权重（默认 0.25） */
  contourWeight?: number
  /** 角检测权重（默认 0.2） */
  cornerWeight?: number
  /** 边界占比权重（默认 0.1） */
  boundaryRatioWeight?: number
}

/**
 * 默认的屏幕边角、轮廓检测器配置
 * 优化用于摄像头拍摄手机屏幕的场景
 */
export const DEFAULT_SCREEN_CORNERS_CONTOUR_DETECTOR_OPTIONS: Required<ScreenCornersContourDetectorOptions> = {
  // Canny 边缘检测参数 (降低阈值以适应手机屏幕的反光和噪声)
  edgeThreshold1: 35,
  edgeThreshold2: 110,

  // 霍夫直线检测参数 (调整以检测手机屏幕的清晰边界)
  lineDetectionThreshold: 35,
  minLineLength: 20,
  maxLineGap: 15,

  // 轮廓检测参数 (提高面积阈值以排除屏幕内部的杂小轮廓)
  minContourArea: 800,

  // 角检测参数 (调整以适应手机屏幕的四个角特征)
  cornerThresholdRatio: 0.015,
  expectedCornerCount: 80,

  // 综合判断参数
  cornerConfidenceThreshold: 0.55,
  screenBoundaryRatioThreshold: 0.2,
  edgePixelsNormalizationBase: 3000,
  lineCountNormalizationBase: 8,
  contourCountNormalizationBase: 2,

  // 权重配置 (增强角检测和边界占比的权重，降低边缘权重)
  edgeWeight: 0.15,
  lineWeight: 0.2,
  contourWeight: 0.2,
  cornerWeight: 0.25,
  boundaryRatioWeight: 0.2
}

export interface ScreenCornersContourDetectionResult {
  /** 是否检测到屏幕边界 */
  isScreenCapture: boolean
  /** 置信度（0-1） */
  confidence: number
  /** 检测到的线条数量 */
  lineCount: number
  /** 检测到的轮廓矩形数量 */
  contourCount: number
  /** 屏幕边界占图片面积的比例 */
  screenBoundaryRatio: number
  /** 处理耗时（毫秒） */
  processingTimeMs: number
  /** 详细信息 */
  details?: {
    edgePixels: number
    maxContourArea: number
    screenLikeContours: number
    cornerConfidence: number
  }
}

/**
 * 屏幕边角、轮廓检测器
 * 用快速边缘和轮廓检测来识别屏幕采集
 */
export class ScreenCornersContourDetector {
  private cv: any = null
  private config: Required<ScreenCornersContourDetectorOptions>

  /**
   * 构造函数
   * @param options - 检测器配置选项
   */
  constructor(options?: Partial<ScreenCornersContourDetectorOptions>) {
    this.config = {
      ...DEFAULT_SCREEN_CORNERS_CONTOUR_DETECTOR_OPTIONS,
      ...(options || {})
    }
  }

  /**
   * 设置 OpenCV 实例
   */
  setCVInstance(cv: any): void {
    this.cv = cv
  }

  /**
   * 检测图片是否为屏幕采集
   * @param grayFrame - 灰度图像 Mat
   * @returns 检测结果
   */
  detect(grayFrame: any): ScreenCornersContourDetectionResult {
    const startTime = performance.now()

    if (!this.cv || !grayFrame) {
      return {
        isScreenCapture: false,
        confidence: 0,
        lineCount: 0,
        contourCount: 0,
        screenBoundaryRatio: 0,
        processingTimeMs: performance.now() - startTime
      }
    }

    let edgeMap: any = null
    let contours: any = null
    let hierarchy: any = null

    try {
      // 1. 边缘检测（Canny）
      edgeMap = this.detectEdges(grayFrame)
      const edgePixels = this.countNonZeroPixels(edgeMap)

      // 2. 直线检测（用于检测屏幕的直线边界）
      const lineCount = this.detectLines(edgeMap)

      // 3. 轮廓检测（用于检测屏幕矩形边界）
      const contourResult = this.detectContours(grayFrame)
      const screenLikeContours = contourResult.count
      const maxContourArea = contourResult.maxArea
      const screenBoundaryRatio = contourResult.boundaryRatio

      // 4. 角检测（用于检测屏幕的四个角）
      const cornerConfidence = this.detectCorners(grayFrame)

      // 5. 综合判断
      const confidence = this.calculateScreenCaptureConfidence(
        edgePixels,
        lineCount,
        screenLikeContours,
        cornerConfidence,
        screenBoundaryRatio
      )

      const isScreenCapture = confidence >= this.config.cornerConfidenceThreshold

      return {
        isScreenCapture,
        confidence,
        lineCount,
        contourCount: screenLikeContours,
        screenBoundaryRatio,
        processingTimeMs: performance.now() - startTime,
        details: {
          edgePixels,
          maxContourArea,
          screenLikeContours,
          cornerConfidence
        }
      }
    } finally {
      if (edgeMap) edgeMap.delete()
      if (contours) contours.delete()
      if (hierarchy) hierarchy.delete()
    }
  }

  /**
   * Canny 边缘检测
   */
  private detectEdges(grayFrame: any): any {
    const edges = new this.cv.Mat()
    // 先进行高斯模糊以降低噪声
    const blurred = new this.cv.Mat()
    this.cv.GaussianBlur(grayFrame, blurred, new this.cv.Size(5, 5), 1.0)
    // 应用 Canny 边缘检测
    this.cv.Canny(blurred, edges, this.config.edgeThreshold1, this.config.edgeThreshold2)
    blurred.delete()
    return edges
  }

  /**
   * 计算非零像素数量
   */
  private countNonZeroPixels(mat: any): number {
    return this.cv.countNonZero(mat)
  }

  /**
   * 霍夫直线检测 - 检测屏幕的直线边界
   */
  private detectLines(edgeMap: any): number {
    const lines = new this.cv.Mat()
    try {
      // 使用概率霍夫直线检测
      this.cv.HoughLinesP(
        edgeMap,
        lines,
        1,                          // rho
        Math.PI / 180,              // theta
        this.config.lineDetectionThreshold, // threshold
        this.config.minLineLength,   // minLineLength
        this.config.maxLineGap       // maxLineGap
      )

      // 过滤出近似水平和竖直的线（屏幕边界）
      const lineCount = lines.rows
      let straightLineCount = 0

      for (let i = 0; i < Math.min(lineCount, 100); i++) {
        const x1 = lines.data32S[i * 4 + 0]
        const y1 = lines.data32S[i * 4 + 1]
        const x2 = lines.data32S[i * 4 + 2]
        const y2 = lines.data32S[i * 4 + 3]

        const dx = x2 - x1
        const dy = y2 - y1
        const angle = Math.atan2(dy, dx) * (180 / Math.PI)

        // 检查是否是水平或竖直线（角度接近 0, 90, 180 度）
        const normalizedAngle = Math.abs(angle) % 90
        if (normalizedAngle < 15 || normalizedAngle > 75) {
          straightLineCount++
        }
      }

      return straightLineCount
    } finally {
      lines.delete()
    }
  }

  /**
   * 轮廓检测 - 检测屏幕矩形边界
   */
  private detectContours(grayFrame: any): {
    count: number
    maxArea: number
    boundaryRatio: number
  } {
    const edges = new this.cv.Mat()
    const contours = new this.cv.MatVector()
    const hierarchy = new this.cv.Mat()

    try {
      // 边缘检测
      this.cv.Canny(grayFrame, edges, this.config.edgeThreshold1, this.config.edgeThreshold2)

      // 检测轮廓
      this.cv.findContours(edges, contours, hierarchy, this.cv.RETR_TREE, this.cv.CHAIN_APPROX_SIMPLE)

      let screenLikeContours = 0
      let maxArea = 0
      let totalScreenBoundaryArea = 0
      const imageArea = grayFrame.rows * grayFrame.cols

      // 遍历轮廓，找出矩形轮廓（屏幕边界）
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = this.cv.contourArea(contour)

        // 忽略过小的轮廓
        if (area < this.config.minContourArea) {
          contour.delete()
          continue
        }

        // 使用多边形近似
        const approx = new this.cv.Mat()
        const arcLength = this.cv.arcLength(contour, true)
        this.cv.approxPolyDP(contour, approx, 0.02 * arcLength, true)

        // 检查是否是四边形（屏幕边界特征）
        if (approx.rows === 4) {
          // 检查四边形是否接近矩形（通过检查角度）
          if (this.isRectangleShape(approx)) {
            screenLikeContours++
            totalScreenBoundaryArea += area
            maxArea = Math.max(maxArea, area)
          }
        }

        approx.delete()
        contour.delete()
      }

      const boundaryRatio = imageArea > 0 ? totalScreenBoundaryArea / imageArea : 0

      return {
        count: screenLikeContours,
        maxArea,
        boundaryRatio
      }
    } finally {
      edges.delete()
      contours.delete()
      hierarchy.delete()
    }
  }

  /**
   * 检查四边形是否接近矩形
   */
  private isRectangleShape(contour: any): boolean {
    try {
      const points: { x: number; y: number }[] = []
      for (let i = 0; i < contour.rows; i++) {
        points.push({
          x: contour.data32F[i * 2],
          y: contour.data32F[i * 2 + 1]
        })
      }

      if (points.length !== 4) return false

      // 计算所有边的长度
      const distances: number[] = []
      for (let i = 0; i < 4; i++) {
        const p1 = points[i]
        const p2 = points[(i + 1) % 4]
        const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
        distances.push(dist)
      }

      // 对边长度应该接近（矩形特性）
      const isRectangle =
        Math.abs(distances[0] - distances[2]) < Math.max(distances[0], distances[2]) * 0.2 &&
        Math.abs(distances[1] - distances[3]) < Math.max(distances[1], distances[3]) * 0.2

      return isRectangle
    } catch {
      return false
    }
  }

  /**
   * 角检测（Harris Corner Detection）
   */
  private detectCorners(grayFrame: any): number {
    const corners = new this.cv.Mat()
    const cornerMask = new this.cv.Mat()

    try {
      // Harris 角检测
      this.cv.cornerHarris(grayFrame, corners, 2, 3, 0.04)

      // 归一化
      const minMaxResult = this.cv.minMaxLoc(corners)
      const minVal = minMaxResult.minVal
      const maxVal = minMaxResult.maxVal

      // 标记强角
      const cornerThreshold = this.config.cornerThresholdRatio * maxVal
      this.cv.threshold(corners, cornerMask, cornerThreshold, 255, this.cv.THRESH_BINARY)

      // 计算角的数量
      const cornerCount = this.cv.countNonZero(cornerMask)

      // 屏幕采集图片应该有明显的四个角
      // 归一化角数量以得到置信度（0-1）
      const cornerConfidence = Math.min(cornerCount / this.config.expectedCornerCount, 1.0)

      return cornerConfidence
    } finally {
      corners.delete()
      cornerMask.delete()
    }
  }

  /**
   * 综合计算屏幕采集置信度
   */
  private calculateScreenCaptureConfidence(
    edgePixels: number,
    lineCount: number,
    screenLikeContours: number,
    cornerConfidence: number,
    screenBoundaryRatio: number
  ): number {
    // 各个指标的置信度（0-1）
    let edgeConfidence = Math.min(edgePixels / this.config.edgePixelsNormalizationBase, 1.0) // 屏幕采集有较多边缘
    let lineConfidence = Math.min(lineCount / this.config.lineCountNormalizationBase, 1.0)     // 检测到多条直线
    let contourConfidence = screenLikeContours > 0 ? Math.min(screenLikeContours / this.config.contourCountNormalizationBase, 1.0) : 0  // 检测到矩形轮廓
    let boundaryRatioConfidence = Math.min(screenBoundaryRatio / this.config.screenBoundaryRatioThreshold, 1.0)

    // 综合置信度
    const totalConfidence =
      this.config.edgeWeight * edgeConfidence +
      this.config.lineWeight * lineConfidence +
      this.config.contourWeight * contourConfidence +
      this.config.cornerWeight * cornerConfidence +
      this.config.boundaryRatioWeight * boundaryRatioConfidence

    return Math.min(totalConfidence, 1.0)
  }

  /**
   * 获取检测器状态消息
   */
  getMessage(confidence: number): string {
    if (confidence < 0.3) {
      return 'No screen boundary detected'
    } else if (confidence < 0.6) {
      return 'Possible screen boundary detected'
    } else {
      return 'Screen boundary detected with high confidence'
    }
  }
}
