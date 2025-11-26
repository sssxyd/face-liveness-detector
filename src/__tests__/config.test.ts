/**
 * Configuration tests
 */

import { mergeConfig, DEFAULT_CONFIG } from '../config'
import { LivenessAction } from '../enums'

describe('Configuration', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CONFIG.silent_detect_count).toBe(3)
      expect(DEFAULT_CONFIG.min_face_ratio).toBe(0.5)
      expect(DEFAULT_CONFIG.max_face_ratio).toBe(0.9)
      expect(DEFAULT_CONFIG.min_face_frontal).toBe(0.9)
      expect(DEFAULT_CONFIG.min_image_quality).toBe(0.8)
      expect(DEFAULT_CONFIG.min_real_score).toBe(0.85)
      expect(DEFAULT_CONFIG.min_live_score).toBe(0.5)
    })

    it('should have default liveness actions', () => {
      expect(DEFAULT_CONFIG.liveness_action_list).toContain(LivenessAction.BLINK)
      expect(DEFAULT_CONFIG.liveness_action_list).toContain(LivenessAction.MOUTH_OPEN)
      expect(DEFAULT_CONFIG.liveness_action_list).toContain(LivenessAction.NOD)
    })

    it('should be frozen', () => {
      expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true)
    })
  })

  describe('mergeConfig', () => {
    it('should return default config when no config provided', () => {
      const config = mergeConfig()
      expect(config.min_face_ratio).toBe(0.5)
      expect(config.max_face_ratio).toBe(0.9)
    })

    it('should merge partial config with defaults', () => {
      const userConfig = {
        min_face_ratio: 0.6,
        max_face_ratio: 0.8
      }
      const config = mergeConfig(userConfig)
      expect(config.min_face_ratio).toBe(0.6)
      expect(config.max_face_ratio).toBe(0.8)
      expect(config.min_image_quality).toBe(0.8) // default
    })

    it('should override liveness action list', () => {
      const userConfig = {
        liveness_action_list: [LivenessAction.BLINK]
      }
      const config = mergeConfig(userConfig)
      expect(config.liveness_action_list).toEqual([LivenessAction.BLINK])
      expect(config.liveness_action_list.length).toBe(1)
    })

    it('should merge nested feature objects', () => {
      const userConfig = {
        face_frontal_features: {
          yaw_threshold: 5,
          pitch_threshold: 4,
          roll_threshold: 2
        }
      }
      const config = mergeConfig(userConfig)
      expect(config.face_frontal_features.yaw_threshold).toBe(5)
      expect(config.face_frontal_features.pitch_threshold).toBe(4)
      expect(config.face_frontal_features.roll_threshold).toBe(2)
    })

    it('should not mutate default config', () => {
      const original = { ...DEFAULT_CONFIG }
      mergeConfig({ min_face_ratio: 0.7 })
      expect(DEFAULT_CONFIG).toEqual(original)
    })

    it('should handle zero and false values', () => {
      const userConfig = {
        detection_frame_delay: 0,
        video_mirror: false,
        liveness_action_count: 0
      }
      const config = mergeConfig(userConfig)
      expect(config.detection_frame_delay).toBe(0)
      expect(config.video_mirror).toBe(false)
      expect(config.liveness_action_count).toBe(0)
    })
  })
})
