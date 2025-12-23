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
  detect_video_ideal_width: 1920,
  detect_video_ideal_height: 1080,
  detect_video_mirror: true,
  detect_video_load_timeout: 5000,
  detect_frame_delay: 100,
  detect_error_retry_delay: 200,

  // Collection Settings
  collect_min_collect_count: 3,
  collect_min_face_ratio: 0.5,
  collect_max_face_ratio: 0.9,
  collect_min_face_frontal: 0.9,
  collect_min_image_quality: 0.5,
  collect_face_frontal_features: {
    yaw_threshold: 3,
    pitch_threshold: 4,
    roll_threshold: 2
  },
  collect_image_quality_features: {
    require_full_face_in_bounds: false,
    min_laplacian_variance: 40,  // 从 50 降低到 40，适应现实环境的光线和对焦变化
    min_gradient_sharpness: 0.15,
    min_blur_score: 0.6
  },

  // action Liveness Settings
  action_liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  action_liveness_action_count: 1,
  action_liveness_action_randomize: true,
  action_liveness_verify_timeout: 60000,
  action_liveness_min_mouth_open_percent: 0.2,

  // Motion Liveness Settings
  motion_liveness_min_motion_score: 0.15,
  motion_liveness_min_keypoint_variance: 0.02,
  motion_liveness_frame_buffer_size: 5,
  motion_liveness_eye_aspect_ratio_threshold: 0.15,
  motion_liveness_min_optical_flow_threshold: 0.02,
  motion_liveness_motion_consistency_threshold: 0.3,
  motion_liveness_strict_photo_detection: false,

  // Screen Capture Detection Settings
  screen_capture_confidence_threshold: 0.7,
  screen_capture_detection_strategy: 'adaptive',

  screen_moire_pattern_threshold: 0.65,
  screen_moire_pattern_enable_dct: true,
  screen_moire_pattern_enable_edge_detection: true,

  screen_color_saturation_threshold: 40,
  screen_color_rgb_correlation_threshold: 0.75,
  screen_color_pixel_entropy_threshold: 6.5,
  screen_color_gradient_smoothness_threshold: 0.7,
  screen_color_confidence_threshold: 0.65,

  screen_rgb_low_freq_start_percent: 0.15,
  screen_rgb_low_freq_end_percent: 0.35,
  screen_rgb_energy_ratio_normalization_factor: 10,
  screen_rgb_channel_difference_normalization_factor: 50,
  screen_rgb_energy_score_weight: 0.40,
  screen_rgb_asymmetry_score_weight: 0.40,
  screen_rgb_difference_factor_weight: 0.20,
  screen_rgb_confidence_threshold: 0.65,
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
