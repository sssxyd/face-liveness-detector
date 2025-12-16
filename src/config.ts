/**
 * Face Detection Engine - Configuration
 */

import type { ResolvedEngineOptions, FaceDetectionEngineOptions } from './types'
import { LivenessAction } from './enums'

/**
 * Default configuration for FaceDetectionEngine
 */
const DEFAULT_OPTIONS: FaceDetectionEngineOptions = {
  // Resource paths
  human_model_path: undefined,
  tensorflow_wasm_path: undefined,
  tensorflow_backend: 'auto',

  // Detection Settings
  video_width: 640,
  video_height: 640,
  video_mirror: true,
  video_load_timeout: 5000,
  detection_frame_delay: 100,
  error_retry_delay: 200,

  // Collection Settings
  silent_detect_count: 3,
  min_face_ratio: 0.5,
  max_face_ratio: 0.9,
  min_face_frontal: 0.9,
  min_image_quality: 0.5,
  min_real_score: 0.85,
  min_live_score: 0.5,
  suspected_frauds_count: 3,
  face_frontal_features: {
    yaw_threshold: 3,
    pitch_threshold: 4,
    roll_threshold: 2
  },
  image_quality_features: {
    require_full_face_in_bounds: false,
    use_opencv_enhancement: true,
    min_laplacian_variance: 50,
    min_gradient_sharpness: 0.15,
    min_blur_score: 0.6
  },

  // Liveness Settings
  liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  liveness_action_count: 1,
  liveness_action_randomize: true,
  liveness_verify_timeout: 60000,
  min_mouth_open_percent: 0.2,

  // Motion Liveness Settings
  enable_motion_liveness: true,
  min_motion_score: 0.15,
  min_keypoint_variance: 0.02,
  motion_frame_buffer_size: 5,
}

/**
 * Merge user configuration with defaults
 * Nested objects (face_frontal_features, image_quality_features) are deeply merged
 * @param userConfig - User provided configuration (partial, optional)
 * @returns Complete resolved configuration with all required fields
 */
export function mergeOptions(
  userConfig?: Partial<FaceDetectionEngineOptions>
): ResolvedEngineOptions {
  // Start with deep clone of defaults
  const merged = structuredClone(DEFAULT_OPTIONS)

  if (!userConfig) {
    return merged as ResolvedEngineOptions
  }

  // Merge all top-level properties
  Object.entries(userConfig).forEach(([key, value]) => {
    if (value === undefined) return // Skip undefined values

    // Special handling for nested objects: deep merge instead of replace
    if (key === 'face_frontal_features' || key === 'image_quality_features') {
      ;(merged as any)[key] = {
        ...(merged as any)[key],
        ...(value as any),
      }
    } else {
      ;(merged as any)[key] = value
    }
  })

  return merged as ResolvedEngineOptions
}
