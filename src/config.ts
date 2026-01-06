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
  debug_log_level: 'info',
  debug_log_stages: undefined, // undefined 表示所有阶段
  debug_log_throttle: 100, // 默认 100ms 节流，防止过于频繁

  // Detection Settings
  detect_video_ideal_width: 1280,
  detect_video_ideal_height: 720,
  detect_video_mirror: true,
  detect_video_load_timeout: 5000,
  detect_frame_delay: 120,

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
  motion_liveness_strict_photo_detection: false,

 
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
