/**
 * Face Detection Engine - Configuration
 */

import type { ResolvedEngineConfig, FaceDetectionEngineConfig } from './types'
import { LivenessAction } from './enums'

/**
 * Default configuration for FaceDetectionEngine
 */
export const DEFAULT_CONFIG: FaceDetectionEngineConfig = Object.freeze({
  // resource paths
  human_model_path: undefined,
  tensorflow_wasm_path: undefined,
  tensorflow_backend: 'auto', // 'auto' | 'webgl' | 'wasm'

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
  min_image_quality: 0.5,
  min_real_score: 0.85,
  min_live_score: 0.5,
  suspected_frauds_count: 3,
  face_frontal_features: Object.freeze({
    yaw_threshold: 3,
    pitch_threshold: 4,
    roll_threshold: 2
  }),
  image_quality_features: Object.freeze({
    require_full_face_in_bounds: false, // 改为 false，允许人脸部分超出边界（更符合实际场景）
    use_opencv_enhancement: true,
    min_laplacian_variance: 50, // 降低拉普拉斯方差阈值（从 100 → 50）
    min_gradient_sharpness: 0.15, // 降低梯度清晰度阈值（从 0.3 → 0.15）
    min_blur_score: 0.6
  }),

  // LivenessSettings defaults
  liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  liveness_action_count: 1,
  liveness_action_randomize: true,
  liveness_verify_timeout: 60000,
  min_mouth_open_percent: 0.2,

})

/**
 * Merge user configuration with defaults
 * @param userConfig - User provided configuration (partial, optional)
 * @returns Complete resolved configuration with all required fields
 */
export function mergeConfig(
  userConfig?: Partial<FaceDetectionEngineConfig>
): ResolvedEngineConfig {
  if (!userConfig) {
    return structuredClone(DEFAULT_CONFIG) as ResolvedEngineConfig
  }

  const merged = structuredClone(DEFAULT_CONFIG)

  // Merge simple scalar properties
  if (userConfig.human_model_path !== undefined) {
    merged.human_model_path = userConfig.human_model_path
  }
  if (userConfig.tensorflow_wasm_path !== undefined) {
    merged.tensorflow_wasm_path = userConfig.tensorflow_wasm_path
  }
  if (userConfig.tensorflow_backend !== undefined) {
    merged.tensorflow_backend = userConfig.tensorflow_backend
  }
  if (userConfig.video_width !== undefined) {
    merged.video_width = userConfig.video_width
  }
  if (userConfig.video_height !== undefined) {
    merged.video_height = userConfig.video_height
  }
  if (userConfig.video_mirror !== undefined) {
    merged.video_mirror = userConfig.video_mirror
  }
  if (userConfig.video_load_timeout !== undefined) {
    merged.video_load_timeout = userConfig.video_load_timeout
  }
  if (userConfig.detection_frame_delay !== undefined) {
    merged.detection_frame_delay = userConfig.detection_frame_delay
  }
  if (userConfig.error_retry_delay !== undefined) {
    merged.error_retry_delay = userConfig.error_retry_delay
  }
  if (userConfig.silent_detect_count !== undefined) {
    merged.silent_detect_count = userConfig.silent_detect_count
  }
  if (userConfig.min_face_ratio !== undefined) {
    merged.min_face_ratio = userConfig.min_face_ratio
  }
  if (userConfig.max_face_ratio !== undefined) {
    merged.max_face_ratio = userConfig.max_face_ratio
  }
  if (userConfig.min_face_frontal !== undefined) {
    merged.min_face_frontal = userConfig.min_face_frontal
  }
  if (userConfig.min_image_quality !== undefined) {
    merged.min_image_quality = userConfig.min_image_quality
  }
  if (userConfig.min_live_score !== undefined) {
    merged.min_live_score = userConfig.min_live_score
  }
  if (userConfig.min_real_score !== undefined) {
    merged.min_real_score = userConfig.min_real_score
  }
  if (userConfig.suspected_frauds_count !== undefined) {
    merged.suspected_frauds_count = userConfig.suspected_frauds_count
  }
  if (userConfig.liveness_action_count !== undefined) {
    merged.liveness_action_count = userConfig.liveness_action_count
  }
  if (userConfig.liveness_action_randomize !== undefined) {
    merged.liveness_action_randomize = userConfig.liveness_action_randomize
  }
  if (userConfig.liveness_verify_timeout !== undefined) {
    merged.liveness_verify_timeout = userConfig.liveness_verify_timeout
  }
  if (userConfig.min_mouth_open_percent !== undefined) {
    merged.min_mouth_open_percent = userConfig.min_mouth_open_percent
  }

  // Deep merge nested objects
  if (userConfig.liveness_action_list !== undefined) {
    merged.liveness_action_list = userConfig.liveness_action_list
  }
  if (userConfig.face_frontal_features !== undefined) {
    merged.face_frontal_features = {
      ...DEFAULT_CONFIG.face_frontal_features,
      ...userConfig.face_frontal_features
    }
  }
  if (userConfig.image_quality_features !== undefined) {
    merged.image_quality_features = {
      ...DEFAULT_CONFIG.image_quality_features,
      ...userConfig.image_quality_features
    }
  }

  return merged as ResolvedEngineConfig
}
