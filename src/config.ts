/**
 * Face Detection Engine - Configuration
 */

import type { FaceDetectionEngineConfig } from './types'
import { LivenessAction, PromptCode } from './enums'

/**
 * Prompt code description mapping
 */
export const PROMPT_CODE_DESCRIPTIONS = Object.freeze({
  [PromptCode.NO_FACE]: 'No face detected',
  [PromptCode.MULTIPLE_FACE]: 'Multiple Faces Detected',
  [PromptCode.FACE_TOO_SMALL]: 'Please move closer',
  [PromptCode.FACE_TOO_LARGE]: 'Please move farther',
  [PromptCode.FACE_NOT_FRONTAL]: 'Please face the camera',
  [PromptCode.BLURRY_IMAGE]: 'Image is blurry',
  [PromptCode.LOW_QUALITY]: 'Low image quality',
  [PromptCode.FRAME_DETECTED]: 'Face detected'
})

/**
 * Action description mapping
 */
export const ACTION_DESCRIPTIONS = Object.freeze({
  [LivenessAction.BLINK]: 'Blink',
  [LivenessAction.MOUTH_OPEN]: 'Open Mouth',
  [LivenessAction.NOD]: 'Nod'
})

/**
 * Border color state mapping
 */
export const BORDER_COLOR_STATES = Object.freeze({
  IDLE: '#ddd',           // Idle state
  MULTIPLE_FACES: '#ffc107', // Multiple faces warning
  PERFECT: '#42b983',     // Perfect state
  PARTIAL: '#ff9800',     // Partially valid
  INVALID: '#f5222d',     // Invalid
  SUCCESS: '#16d355',     // Success
  ERROR: '#f5222d'        // Error
})

/**
 * Default configuration for FaceDetectionEngine
 */
export const DEFAULT_CONFIG: FaceDetectionEngineConfig = Object.freeze({
  // DetectionSettings defaults
  camera_max_size: 640,
  video_load_timeout: 5000,
  detection_frame_delay: 100,
  detection_idle_timeout: 60000,

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
  liveness_action_desc: {
    [LivenessAction.BLINK]: 'Please Blink',
    [LivenessAction.MOUTH_OPEN]: 'Please Open Mouth',
    [LivenessAction.NOD]: 'Please Nod'
  } as Record<LivenessAction, string>,

  // StatusSettings defaults
  show_status_prompt: true,
  status_prompt_duration: 3000,
  prompt_code_desc: {
    [PromptCode.NO_FACE]: 'No face detected',
    [PromptCode.MULTIPLE_FACE]: 'Multiple Faces Detected',
    [PromptCode.FACE_TOO_SMALL]: 'Please move closer',
    [PromptCode.FACE_TOO_LARGE]: 'Please move farther',
    [PromptCode.FACE_NOT_FRONTAL]: 'Please face the camera',
    [PromptCode.BLURRY_IMAGE]: 'Image is blurry',
    [PromptCode.LOW_QUALITY]: 'Low image quality',
    [PromptCode.FRAME_DETECTED]: 'Face detected'
  } as Record<PromptCode, string>,

  // BorderColorsSettings defaults
  show_border_color: true,
  border_color_idle: '#ddd',
  border_color_warning: '#ffc107',
  border_color_ready: '#42b983',
  border_color_success: '#16d355',
  border_color_error: '#f5222d'
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

  if (userConfig.liveness_action_desc) {
    merged.liveness_action_desc = {
      ...DEFAULT_CONFIG.liveness_action_desc,
      ...userConfig.liveness_action_desc
    } as Record<LivenessAction, string>
  }

  if (userConfig.prompt_code_desc) {
    merged.prompt_code_desc = {
      ...DEFAULT_CONFIG.prompt_code_desc,
      ...userConfig.prompt_code_desc
    } as Record<PromptCode, string>
  }

  return merged
}
