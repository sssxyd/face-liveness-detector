/**
 * Face Detection Engine - Type Definitions
 * Framework-agnostic type definitions for face liveness detection
 */

import type { LivenessAction, LivenessActionStatus, DetectionCode, ErrorCode } from './enums'

// ==================== Configuration Interfaces ====================

export interface FaceFrontalFeatures {
  // Yaw angle threshold (degrees) - horizontal shake limit
  yaw_threshold: number
  // Pitch angle threshold (degrees) - vertical tilt limit
  pitch_threshold: number
  // Roll angle threshold (degrees) - rotation limit
  roll_threshold: number
}

export interface ImageQualityFeatures {
  // Require face completely within bounds (default true)
  require_full_face_in_bounds: boolean
  // Use OpenCV enhancement for quality detection (default true)
  use_opencv_enhancement: boolean
  // Minimum Laplacian variance for blur detection (default 100)
  min_laplacian_variance: number
  // Minimum gradient sharpness for blur detection (default 0.3)
  min_gradient_sharpness: number
  // Minimum blur score for blur detection (default 0.6)
  min_blur_score: number
}

/**
 * Main configuration interface for FaceDetectionEngine
 * All settings are flattened as individual properties
 */
export interface FaceDetectionEngineOptions {
  // resource paths
  human_model_path?: string
  tensorflow_wasm_path?: string
  tensorflow_backend?: 'auto' | 'webgl' | 'wasm'  // TensorFlow backend selection

  // ========== Detection Settings ==========
  video_width?: number  // Width of the video stream
  video_height?: number // Height of the video stream
  video_mirror?: boolean // Mirror video horizontally (like a mirror)
  video_load_timeout?: number // Timeout for loading video stream (ms)
  detection_frame_delay?: number // Delay between detection frames (ms)
  error_retry_delay?: number // Delay before retrying after an error (ms)

  // ========== Collection Settings ==========
  silent_detect_count?: number // Number of silent detections to collect
  min_face_ratio?: number // Minimum face size ratio
  max_face_ratio?: number // Maximum face size ratio
  min_face_frontal?: number // Minimum face frontality
  min_image_quality?: number // Minimum image quality
  min_live_score?: number // Minimum live score
  min_real_score?: number // Minimum real score
  suspected_frauds_count?: number // Number of suspected frauds to detect
  face_frontal_features?: FaceFrontalFeatures // Face frontal features
  image_quality_features?: ImageQualityFeatures // Image quality features

  // ========== Liveness Settings ==========
  liveness_action_list?: LivenessAction[] // List of liveness actions
  liveness_action_count?: number // Number of liveness actions to perform
  liveness_action_randomize?: boolean // Whether to randomize liveness actions
  liveness_verify_timeout?: number // Timeout for liveness verification (ms)
  min_mouth_open_percent?: number // Minimum mouth open percentage for detection

  // ========== Motion Liveness Settings (Photo Attack Prevention) ==========
  min_motion_score?: number // Minimum motion score to pass liveness check (0-1)
  min_keypoint_variance?: number // Minimum keypoint variance for natural movement (0-1)
  motion_frame_buffer_size?: number // Number of frames to buffer for motion analysis
  eye_aspect_ratio_threshold?: number // Eye aspect ratio threshold for blink detection
}

/**
 * Resolved configuration after merging with defaults
 * All properties are guaranteed to be non-undefined
 * Used internally as the return type of mergeOptions()
 */
export type ResolvedEngineOptions = Required<FaceDetectionEngineOptions>

// ==================== Event Data Interfaces ====================

export interface DetectorLoadedEventData {
  success: boolean  // Whether the detector loaded successfully
  error?: string    // Error message if any
  opencv_version?: string  // OpenCV.js version
  human_version?: string  // Human.js version
}


export interface DetectorActionEventData {
  action: LivenessAction
  status: LivenessActionStatus
}

/**
 * Face detect info event data
 */
export interface DetectorInfoEventData {
  passed: boolean  // Whether silent liveness detection passed
  code: DetectionCode // Prompt code
  faceCount: number   // Number of faces detected
  faceRatio: number     // Face size percentage (0-1)
  faceFrontal: number  // Face frontality percentage (0-1)
  imageQuality: number  // Image quality score (0-1)
  motionScore: number // Motion score (0-1)
  keypointVariance: number  // Keypoint variance score (0-1)
  motionType: string  // Type of motion detected
}

/**
 * Action/silent liveness detection completion data
 */
export interface DetectorFinishEventData {
  success: boolean        // Whether liveness detection succeeded
  silentPassedCount: number   // Silent liveness detection pass count
  actionPassedCount: number  // Completed action count
  totalTime: number       // Total time taken (ms)
  bestQualityScore: number  // Image quality score (0-1)
  bestFrameImage: string | null  // Base64 encoded frame image
  bestFaceImage: string | null   // Base64 encoded face image
}

/**
 * Error data
 */
export interface DetectorErrorEventData {
  code: ErrorCode
  message: string
}

/**
 * Debug information data
 */
export interface DetectorDebugEventData {
  level: 'info' | 'warn' | 'error'  // Debug level
  stage: string                      // Current stage
  message: string                    // Main message
  details?: Record<string, any>      // Additional details
  timestamp: number                  // Timestamp
}

// ==================== Event Listener Types ====================

export type EventListener<T> = (data: T) => void

export interface EventEmitter {
  on<K extends keyof EventMap>(event: K, listener: EventListener<EventMap[K]>): void
  off<K extends keyof EventMap>(event: K, listener: EventListener<EventMap[K]>): void
  once<K extends keyof EventMap>(event: K, listener: EventListener<EventMap[K]>): void
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void
}

export interface EventMap {
  'detector-loaded': DetectorLoadedEventData
  'detector-info': DetectorInfoEventData
  'detector-action': DetectorActionEventData
  'detector-finish': DetectorFinishEventData
  'detector-error': DetectorErrorEventData
  'detector-debug': DetectorDebugEventData
}
