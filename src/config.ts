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
  debug_mode: false,

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
  // Lowered threshold to improve detection of mobile photos (0.7 → 0.5)
  screen_capture_confidence_threshold: 0.5,

  // Moiré Pattern Detection - Increased sensitivity for mobile photos
  screen_moire_pattern_threshold: 0.50,  // Reduced from 0.65 to 0.50
  screen_moire_pattern_enable_dct: true,
  screen_moire_pattern_enable_edge_detection: true,

  // Screen Color Profile Detection - Optimized parameters
  screen_color_saturation_threshold: 35,  // Reduced from 40 to 35
  screen_color_rgb_correlation_threshold: 0.80,  // Increased from 0.75 to 0.80
  screen_color_pixel_entropy_threshold: 6.0,  // Reduced from 6.5 to 6.0
  screen_color_gradient_smoothness_threshold: 0.65,  // Reduced from 0.7 to 0.65
  screen_color_confidence_threshold: 0.50,  // Reduced from 0.65 to 0.50

  // RGB Emission Pattern Detection - Optimized for mobile photos
  screen_rgb_low_freq_start_percent: 0.12,  // Reduced from 0.15 to 0.12
  screen_rgb_low_freq_end_percent: 0.40,  // Increased from 0.35 to 0.40
  screen_rgb_energy_ratio_normalization_factor: 8,  // Reduced from 10 to 8
  screen_rgb_channel_difference_normalization_factor: 40,  // Reduced from 50 to 40
  screen_rgb_energy_score_weight: 0.45,  // Increased from 0.40 to 0.45
  screen_rgb_asymmetry_score_weight: 0.35,  // Reduced from 0.40 to 0.35
  screen_rgb_difference_factor_weight: 0.20,
  screen_rgb_confidence_threshold: 0.40,  // Significantly reduced from 0.65 to 0.40
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
