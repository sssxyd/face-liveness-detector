/**
 * Face Detection Engine - Configuration
 */

import type { FaceDetectionEngineConfig } from './types'
import { LivenessAction } from './enums'

/**
 * Default configuration for FaceDetectionEngine
 */
export const DEFAULT_CONFIG: FaceDetectionEngineConfig = Object.freeze({
  // resource paths
  human_model_path: undefined,
  tensorflow_wasm_path: undefined,

  // DetectionSettings defaults
  video_width: 640,
  video_height: 640,
  video_mirror: true,
  video_load_timeout: 5000,
  detection_frame_delay: 100,
  error_retry_delay: 200,

  // CollectionSettings defaults
  silent_detect_count: 3,
  min_face_ratio: 0.5,
  max_face_ratio: 0.9,
  min_face_frontal: 0.9,
  min_image_quality: 0.8,
  min_real_score: 0.85,
  min_live_score: 0.5,
  face_frontal_features: Object.freeze({
    yaw_threshold: 3,
    pitch_threshold: 4,
    roll_threshold: 2
  }),
  image_quality_features: Object.freeze({
    require_full_face_in_bounds: true,
    min_box_score: 0.8,
    min_face_score: 0.8
  }),

  // LivenessSettings defaults
  show_action_prompt: true,
  liveness_action_timeout: 60000,
  liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  liveness_action_count: 1,
  liveness_action_random: true,
  min_mouth_open_percent: 0.2,

})

/**
 * Merge user configuration with defaults
 * @param userConfig - User provided configuration
 * @returns Merged configuration
 */
export function mergeConfig(
  userConfig?: Partial<FaceDetectionEngineConfig>
): FaceDetectionEngineConfig {
  if (!userConfig) {
    return structuredClone(DEFAULT_CONFIG)
  }

  const merged: FaceDetectionEngineConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig
  }

  // Deep merge nested objects
  if (userConfig.face_frontal_features) {
    merged.face_frontal_features = {
      ...DEFAULT_CONFIG.face_frontal_features,
      ...userConfig.face_frontal_features
    }
  }

  if (userConfig.image_quality_features) {
    merged.image_quality_features = {
      ...DEFAULT_CONFIG.image_quality_features,
      ...userConfig.image_quality_features
    }
  }

  return merged
}
