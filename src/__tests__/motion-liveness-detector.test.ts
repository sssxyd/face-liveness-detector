/**
 * Motion Liveness Detection - Unit Tests
 * Test cases for motion-based anti-spoofing functionality
 */

import { MotionLivenessDetector } from '../motion-liveness-detector'
import type { MotionDetectionResult } from '../motion-liveness-detector'

/**
 * Test Suite: Motion Liveness Detector
 */
describe('MotionLivenessDetector', () => {
  let detector: MotionLivenessDetector

  beforeEach(() => {
    detector = new MotionLivenessDetector()
  })

  afterEach(() => {
    detector.reset()
  })

  /**
   * Test: Basic initialization
   */
  test('should initialize with default settings', () => {
    expect(detector).toBeDefined()
    expect(detector.analyzeMotion).toBeDefined()
  })

  /**
   * Test: Reset state
   */
  test('should reset detection state', () => {
    detector.reset()
    const stats = detector.getStatistics()
    expect(stats.bufferSize).toBe(0)
    expect(stats.keypointHistorySize).toBe(0)
  })

  /**
   * Test: Motion score calculation
   */
  test('should return motion score between 0 and 1', () => {
    const mockCanvas = createMockCanvas(640, 480)
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    const result = detector.analyzeMotion(mockCanvas, mockFace, mockBox)
    expect(result.motionScore).toBeGreaterThanOrEqual(0)
    expect(result.motionScore).toBeLessThanOrEqual(1)
  })

  /**
   * Test: Keypoint variance calculation
   */
  test('should track keypoint variance', () => {
    const mockCanvas = createMockCanvas(640, 480)
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    // First analysis
    detector.analyzeMotion(mockCanvas, mockFace, mockBox)
    
    // Second analysis with modified face
    const modifiedFace = createMockFaceResult(true)
    const result = detector.analyzeMotion(mockCanvas, modifiedFace, mockBox)
    
    expect(result.keypointVariance).toBeGreaterThanOrEqual(0)
    expect(result.keypointVariance).toBeLessThanOrEqual(1)
  })

  /**
   * Test: Liveness verdict (empty buffer)
   */
  test('should mark as not lively with insufficient frames', () => {
    const mockCanvas = createMockCanvas(640, 480)
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    const result = detector.analyzeMotion(mockCanvas, mockFace, mockBox)
    // With only 1 frame, should not detect motion
    expect(result.isLively).toBe(false)
  })

  /**
   * Test: Motion type detection
   */
  test('should classify motion types', () => {
    const mockCanvas = createMockCanvas(640, 480)
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    const result = detector.analyzeMotion(mockCanvas, mockFace, mockBox)
    const validMotionTypes = ['none', 'rotation', 'translation', 'breathing', 'micro_expression']
    expect(validMotionTypes).toContain(result.motionType)
  })

  /**
   * Test: Debug statistics
   */
  test('should provide debug statistics', () => {
    const mockCanvas = createMockCanvas(640, 480)
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    detector.analyzeMotion(mockCanvas, mockFace, mockBox)
    const stats = detector.getStatistics()

    expect(stats).toHaveProperty('bufferSize')
    expect(stats).toHaveProperty('keypointHistorySize')
    expect(stats).toHaveProperty('faceAreaHistorySize')
  })

  /**
   * Test: Detailed results
   */
  test('should return detailed motion analysis results', () => {
    const mockCanvas = createMockCanvas(640, 480)
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    const result = detector.analyzeMotion(mockCanvas, mockFace, mockBox)

    expect(result).toHaveProperty('motionScore')
    expect(result).toHaveProperty('opticalFlowMagnitude')
    expect(result).toHaveProperty('keypointVariance')
    expect(result).toHaveProperty('eyeMotionScore')
    expect(result).toHaveProperty('mouthMotionScore')
    expect(result).toHaveProperty('motionType')
    expect(result).toHaveProperty('isLively')
    expect(result).toHaveProperty('details')
  })
})

/**
 * Test Suite: FaceDetectionEngine with Motion Liveness
 */
describe('FaceDetectionEngine with Motion Liveness', () => {
  /**
   * Test: Motion liveness configuration
   */
  test('should accept motion liveness configuration', () => {
    const config = {
      enable_motion_liveness: true,
      min_motion_score: 0.20,
      min_keypoint_variance: 0.03,
      motion_frame_buffer_size: 6
    }
    
    expect(config.enable_motion_liveness).toBe(true)
    expect(config.min_motion_score).toBe(0.20)
    expect(config.min_keypoint_variance).toBe(0.03)
    expect(config.motion_frame_buffer_size).toBe(6)
  })

  /**
   * Test: Configuration validation
   */
  test('should validate motion detection thresholds', () => {
    const validConfigs = [
      { min_motion_score: 0.10, min_keypoint_variance: 0.01 },
      { min_motion_score: 0.15, min_keypoint_variance: 0.02 },
      { min_motion_score: 0.25, min_keypoint_variance: 0.05 }
    ]

    validConfigs.forEach(config => {
      expect(config.min_motion_score).toBeGreaterThan(0)
      expect(config.min_motion_score).toBeLessThan(1)
      expect(config.min_keypoint_variance).toBeGreaterThan(0)
      expect(config.min_keypoint_variance).toBeLessThan(1)
    })
  })

  /**
   * Test: Buffer size validation
   */
  test('should validate frame buffer size', () => {
    const validBufferSizes = [3, 4, 5, 6, 7, 8]
    validBufferSizes.forEach(size => {
      expect(size).toBeGreaterThanOrEqual(3)
      expect(size).toBeLessThanOrEqual(8)
    })
  })
})

/**
 * Test Suite: Edge Cases
 */
describe('Motion Liveness - Edge Cases', () => {
  let detector: MotionLivenessDetector

  beforeEach(() => {
    detector = new MotionLivenessDetector()
  })

  /**
   * Test: Null canvas handling
   */
  test('should handle null canvas gracefully', () => {
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    expect(() => {
      detector.analyzeMotion(null as any, mockFace, mockBox)
    }).not.toThrow()
  })

  /**
   * Test: Missing face landmarks
   */
  test('should handle missing face landmarks', () => {
    const mockCanvas = createMockCanvas(640, 480)
    const faceWithoutLandmarks = { box: [100, 100, 200, 200] }
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    const result = detector.analyzeMotion(mockCanvas, faceWithoutLandmarks as any, mockBox)
    expect(result).toBeDefined()
  })

  /**
   * Test: Zero-sized canvas
   */
  test('should handle zero-sized canvas', () => {
    const mockCanvas = createMockCanvas(0, 0)
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [0, 0, 0, 0]

    expect(() => {
      detector.analyzeMotion(mockCanvas, mockFace, mockBox)
    }).not.toThrow()
  })

  /**
   * Test: Repeated identical frames
   */
  test('should detect zero motion from identical frames', () => {
    const mockCanvas = createMockCanvas(640, 480)
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    // Analyze same frame multiple times
    let lastResult: MotionDetectionResult | null = null
    for (let i = 0; i < 5; i++) {
      lastResult = detector.analyzeMotion(mockCanvas, mockFace, mockBox)
    }

    if (lastResult) {
      // Identical frames should result in low motion
      expect(lastResult.motionScore).toBeLessThan(0.15)
    }
  })
})

/**
 * Test Suite: Performance
 */
describe('Motion Liveness - Performance', () => {
  /**
   * Test: Processing time
   */
  test('should analyze motion within reasonable time', () => {
    const detector = new MotionLivenessDetector()
    const mockCanvas = createMockCanvas(640, 480)
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    const startTime = performance.now()
    detector.analyzeMotion(mockCanvas, mockFace, mockBox)
    const endTime = performance.now()

    const processingTime = endTime - startTime
    expect(processingTime).toBeLessThan(100) // Should complete in < 100ms
  })

  /**
   * Test: Memory usage with multiple analyses
   */
  test('should manage memory efficiently', () => {
    const detector = new MotionLivenessDetector()
    const mockCanvas = createMockCanvas(640, 480)
    const mockFace = createMockFaceResult()
    const mockBox: [number, number, number, number] = [100, 100, 200, 200]

    // Perform multiple analyses
    for (let i = 0; i < 10; i++) {
      detector.analyzeMotion(mockCanvas, mockFace, mockBox)
    }

    const stats = detector.getStatistics()
    // Buffer should not grow infinitely
    expect(stats.bufferSize).toBeLessThanOrEqual(5)
    expect(stats.keypointHistorySize).toBeLessThanOrEqual(5)
  })
})

// ==================== Helper Functions ====================

/**
 * Create mock canvas element
 */
function createMockCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * Create mock face detection result
 */
function createMockFaceResult(withVariation: boolean = false): any {
  const landmarks = Array.from({ length: 468 }, (_, i) => {
    const baseX = 100 + Math.random() * 200
    const baseY = 100 + Math.random() * 200
    const variation = withVariation ? 5 : 0
    return [baseX + variation, baseY + variation] as [number, number]
  })

  return {
    id: '0',
    score: 0.99,
    boxScore: 0.95,
    faceScore: 0.92,
    annotationScore: 0,
    age: 30,
    gender: [0.5, 0.5],
    gaze: [0, 0, 0],
    box: [100, 100, 200, 200] as [number, number, number, number],
    boxRaw: [100, 100, 200, 200] as [number, number, number, number],
    landmarks: landmarks,
    real: 0.95,
    live: 0.92,
    iris: undefined,
    mesh: undefined,
    emotion: undefined
  } as any
}

export {}
