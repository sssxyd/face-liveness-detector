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
  detect_video_width: 640,
  detect_video_height: 640,
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
    min_laplacian_variance: 50,
    min_gradient_sharpness: 0.15,
    min_blur_score: 0.6
  },

  // Liveness Settings
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

  // Screen Capture Detection Settings
  screen_capture_confidence_threshold: 0.6,
  screen_capture_min_frames_required: 5,
  screen_capture_moire_threshold: 0.65,
  screen_capture_fft_size: 256,
  screen_capture_flicker_max_history: 300,
  screen_capture_flicker_min_samples: 60,
  screen_capture_flicker_min_period: 5,
  screen_capture_flicker_max_period: 50,
  screen_capture_flicker_strength_threshold: 0.3,
  screen_capture_grid_high_freq_threshold: 0.15,
  screen_capture_grid_strength_threshold: 0.6,
  screen_capture_chromatic_shift_threshold: 0.5,
  screen_capture_duplication_max_history: 30,
  screen_capture_duplication_similarity_threshold: 0.98,
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
