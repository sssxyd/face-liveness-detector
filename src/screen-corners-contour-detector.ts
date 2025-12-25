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
  /** Canny 边缘检测下阈值（默认 35） */
  edgeThreshold1?: number
  /** Canny 边缘检测上阈值（默认 110） */
  edgeThreshold2?: number

  // 轮廓检测参数
  /** 最小轮廓面积（默认 800） */
  minContourArea?: number

  // 综合判断参数
  /** 屏幕检测置信度阈值（默认 0.5） */
  screenConfidenceThreshold?: number
  /** 屏幕边界占比阈值（默认 0.15） */
  screenBoundaryRatioThreshold?: number
}

/**
 * 默认的屏幕边角、轮廓检测器配置
 * 优化用于快速检测摄像头拍摄的手机/平板屏幕
 * 严格模式：仅当非常确定时才判定为屏幕
 */
export const DEFAULT_SCREEN_CORNERS_CONTOUR_DETECTOR_OPTIONS: Required<ScreenCornersContourDetectorOptions> = {
  // Canny 边缘检测参数
  edgeThreshold1: 35,
  edgeThreshold2: 110,

  // 轮廓检测参数（提高面积阈值以排除小轮廓误检）
  minContourArea: 1200,

  // 综合判断参数（严格阈值）
  // screenConfidenceThreshold: 0.75 表示需要 75% 的置信度
  // screenBoundaryRatioThreshold: 0.25 表示屏幕占比需要 >= 25%
  screenConfidenceThreshold: 0.75,
  screenBoundaryRatioThreshold: 0.25
}

export interface ScreenCornersContourDetectionResult {
  /** 是否检测到屏幕 */
  isScreenCapture: boolean
  /** 置信度（0-1） */
  confidence: number
  /** 检测到的屏幕矩形轮廓数量 */
  contourCount: number
  /** 屏幕边界占图片面积的比例 */
  screenBoundaryRatio: number
  /** 处理耗时（毫秒） */
  processingTimeMs: number
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
        contourCount: 0,
        screenBoundaryRatio: 0,
        processingTimeMs: performance.now() - startTime
      }
    }

    try {
      // 轮廓检测（检测屏幕矩形边界）
      const contourResult = this.detectContours(grayFrame)
      const screenLikeContours = contourResult.count
      const screenBoundaryRatio = contourResult.boundaryRatio

      // 简化的置信度计算：基于轮廓数量和边界占比
      const confidence = this.calculateScreenConfidence(screenLikeContours, screenBoundaryRatio)
      const isScreenCapture = confidence >= this.config.screenConfidenceThreshold

      return {
        isScreenCapture,
        confidence,
        contourCount: screenLikeContours,
        screenBoundaryRatio,
        processingTimeMs: performance.now() - startTime
      }
    } finally {
      // 清理资源
    }
  }

  /**
   * Canny 边缘检测
   */
  private detectEdges(grayFrame: any): any {
    const edges = new this.cv.Mat()
    const blurred = new this.cv.Mat()
    this.cv.GaussianBlur(grayFrame, blurred, new this.cv.Size(5, 5), 1.0)
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
   * 轮廓检测 - 检测屏幕矩形边界
   */
  private detectContours(grayFrame: any): {
    count: number
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
          // 检查四边形是否接近矩形
          if (this.isRectangleShape(approx)) {
            screenLikeContours++
            totalScreenBoundaryArea += area
          }
        }

        approx.delete()
        contour.delete()
      }

      const boundaryRatio = imageArea > 0 ? totalScreenBoundaryArea / imageArea : 0

      return {
        count: screenLikeContours,
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
      return (
        Math.abs(distances[0] - distances[2]) < Math.max(distances[0], distances[2]) * 0.2 &&
        Math.abs(distances[1] - distances[3]) < Math.max(distances[1], distances[3]) * 0.2
      )
    } catch {
      return false
    }
  }

  /**
   * 简化的屏幕检测置信度计算
   */
  private calculateScreenConfidence(contourCount: number, boundaryRatio: number): number {
    // 检测到矩形轮廓是主要指标
    const contourConfidence = Math.min(contourCount, 1.0) // 0-1个轮廓

    // 屏幕边界占比是辅助指标
    const boundaryConfidence = Math.min(
      boundaryRatio / this.config.screenBoundaryRatioThreshold,
      1.0
    )

    // 综合置信度：主要基于轮廓数量，辅以边界占比
    return Math.min(
      contourConfidence * 0.7 + boundaryConfidence * 0.3,
      1.0
    )
  }

  /**
   * 获取检测器状态消息
   */
  getMessage(confidence: number): string {
    if (confidence < 0.3) {
      return 'No screen detected'
    } else if (confidence < 0.6) {
      return 'Possible screen detected'
    } else {
      return 'Screen detected'
    }
  }
}
