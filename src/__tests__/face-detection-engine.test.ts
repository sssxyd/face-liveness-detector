/**
 * FaceDetectionEngine integration tests
 * Note: These are basic integration tests using mocks. For full e2e tests,
 * you'll need actual camera and detection models.
 */

import { FaceDetectionEngine } from '../index'
import { LivenessAction, ErrorCode } from '../enums'

// Mock the library loader
jest.mock('../library-loader', () => ({
  loadOpenCV: jest.fn(() => Promise.resolve({
    cv: {
      Mat: jest.fn(),
      getBuildInformation: jest.fn(() => '1.0.0')
    }
  })),
  loadHuman: jest.fn(() => Promise.resolve({
    version: '3.3.0',
    detect: jest.fn()
  }))
}))

describe('FaceDetectionEngine', () => {
  let engine: FaceDetectionEngine

  beforeEach(() => {
    jest.clearAllMocks()
    engine = new FaceDetectionEngine({
      liveness_action_list: [LivenessAction.BLINK],
      liveness_action_count: 1
    })
  })

  describe('Constructor', () => {
    it('should create engine instance', () => {
      expect(engine).toBeDefined()
      expect(engine).toHaveProperty('initialize')
      expect(engine).toHaveProperty('startDetection')
      expect(engine).toHaveProperty('stopDetection')
    })

    it('should set initial status', () => {
      const status = engine.getStatus()
      expect(status.isReady).toBe(false)
      expect(status.isDetecting).toBe(false)
      expect(status.isInitializing).toBe(false)
    })

    it('should accept configuration', () => {
      const customEngine = new FaceDetectionEngine({
        min_face_ratio: 0.6,
        max_face_ratio: 0.8
      })
      const config = customEngine.getConfig()
      expect(config.min_face_ratio).toBe(0.6)
      expect(config.max_face_ratio).toBe(0.8)
    })
  })

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = engine.getConfig()
      expect(config).toBeDefined()
      expect(config.liveness_action_list).toContain(LivenessAction.BLINK)
    })

    it('should return a copy, not reference', () => {
      const config1 = engine.getConfig()
      const config2 = engine.getConfig()
      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })
  })

  describe('updateConfig', () => {
    it('should update configuration', () => {
      engine.updateConfig({ min_face_ratio: 0.7 })
      const config = engine.getConfig()
      expect(config.min_face_ratio).toBe(0.7)
    })

    it('should preserve other config values', () => {
      const originalMaxRatio = engine.getConfig().max_face_ratio
      engine.updateConfig({ min_face_ratio: 0.7 })
      const config = engine.getConfig()
      expect(config.max_face_ratio).toBe(originalMaxRatio)
    })
  })

  describe('getStatus', () => {
    it('should return status object with required properties', () => {
      const status = engine.getStatus()
      expect(status).toHaveProperty('isReady')
      expect(status).toHaveProperty('isDetecting')
      expect(status).toHaveProperty('isInitializing')
    })

    it('should return boolean values', () => {
      const status = engine.getStatus()
      expect(typeof status.isReady).toBe('boolean')
      expect(typeof status.isDetecting).toBe('boolean')
      expect(typeof status.isInitializing).toBe('boolean')
    })
  })

  describe('initialize', () => {
    it('should emit detector-loaded event on success', async () => {
      const loadedListener = jest.fn()
      engine.on('detector-loaded', loadedListener)

      await engine.initialize()

      expect(loadedListener).toHaveBeenCalled()
      const data = loadedListener.mock.calls[0][0]
      expect(data.success).toBe(true)
    })

    it('should set engine ready status', async () => {
      let statusBefore = engine.getStatus()
      expect(statusBefore.isReady).toBe(false)

      await engine.initialize()

      const statusAfter = engine.getStatus()
      expect(statusAfter.isReady).toBe(true)
    })

    it('should not initialize twice concurrently', async () => {
      const loadedListener = jest.fn()
      engine.on('detector-loaded', loadedListener)

      await Promise.all([engine.initialize(), engine.initialize()])

      // Should only emit once
      expect(loadedListener).toHaveBeenCalledTimes(1)
    })

    it('should handle initialization errors', async () => {
      const { loadHuman } = require('../library-loader')
      loadHuman.mockRejectedValueOnce(new Error('Model loading failed'))

      const errorListener = jest.fn()
      engine.on('detector-error', errorListener)

      await engine.initialize()

      expect(errorListener).toHaveBeenCalled()
      const error = errorListener.mock.calls[0][0]
      expect(error.code).toBe(ErrorCode.DETECTOR_NOT_INITIALIZED)
    })
  })

  describe('Event listeners', () => {
    it('should support detector-debug events', () => {
      const debugListener = jest.fn()
      engine.on('detector-debug', debugListener)
      expect(engine.listenerCount('detector-debug')).toBe(1)
    })

    it('should support multiple event types', () => {
      const listeners = {
        'detector-loaded': jest.fn(),
        'detector-error': jest.fn(),
        'face-detected': jest.fn(),
        'status-prompt': jest.fn(),
        'action-prompt': jest.fn()
      }

      Object.entries(listeners).forEach(([event, listener]) => {
        engine.on(event as any, listener)
      })

      expect(engine.listenerCount('detector-loaded' as any)).toBe(1)
      expect(engine.listenerCount('detector-error' as any)).toBe(1)
      expect(engine.listenerCount('face-detected' as any)).toBe(1)
      expect(engine.listenerCount('status-prompt' as any)).toBe(1)
      expect(engine.listenerCount('action-prompt' as any)).toBe(1)
    })
  })

  describe('stopDetection', () => {
    it('should emit detector-finish event', () => {
      const finishListener = jest.fn()
      engine.on('detector-finish', finishListener)

      engine.stopDetection(true)

      expect(finishListener).toHaveBeenCalled()
      const data = finishListener.mock.calls[0][0]
      expect(data.success).toBe(true)
    })

    it('should include collected statistics', () => {
      const finishListener = jest.fn()
      engine.on('detector-finish', finishListener)

      engine.stopDetection(true)

      const data = finishListener.mock.calls[0][0]
      expect(data).toHaveProperty('silentPassedCount')
      expect(data).toHaveProperty('actionPassedCount')
      expect(data).toHaveProperty('totalTime')
      expect(data).toHaveProperty('bestQualityScore')
    })

    it('should stop detection with success flag', () => {
      const finishListener = jest.fn()
      engine.on('detector-finish', finishListener)

      engine.stopDetection(false)

      const data = finishListener.mock.calls[0][0]
      expect(data.success).toBe(false)
    })
  })

  describe('Configuration validation', () => {
    it('should handle empty action list gracefully', () => {
      const customEngine = new FaceDetectionEngine({
        liveness_action_list: []
      })
      const config = customEngine.getConfig()
      expect(config.liveness_action_list).toEqual([])
    })

    it('should handle extreme threshold values', () => {
      const customEngine = new FaceDetectionEngine({
        min_face_ratio: 0.1,
        max_face_ratio: 0.99,
        min_image_quality: 0.1,
        min_real_score: 0.1
      })
      const config = customEngine.getConfig()
      expect(config.min_face_ratio).toBe(0.1)
      expect(config.max_face_ratio).toBe(0.99)
      expect(config.min_image_quality).toBe(0.1)
      expect(config.min_real_score).toBe(0.1)
    })
  })
})
