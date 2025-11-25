/**
 * Face Detection Engine - Type Definitions
 * Framework-agnostic type definitions for face liveness detection
 */

import type { FaceResult, GestureResult } from '@vladmandic/human'
import type { LivenessAction, LivenessActionStatus, PromptCode, ErrorCode } from './enums'

// ==================== Configuration Interfaces ====================

export interface FaceFrontalFeatures {
  // Yaw angle threshold (degrees) - horizontal shake limit
  yaw_threshold?: number
  // Pitch angle threshold (degrees) - vertical tilt limit
  pitch_threshold?: number
  // Roll angle threshold (degrees) - rotation limit
  roll_threshold?: number
}

export interface ImageQualityFeatures {
  // Require face completely within bounds (default true)
  require_full_face_in_bounds?: boolean
  // Minimum face detection box score (0-1, default 0.8)
  min_box_score?: number
  // Minimum face mesh score (0-1, default 0.8)
  min_face_score?: number
}

/**
 * Main configuration interface for FaceDetectionEngine
 * All settings are flattened as individual properties
 */
export interface FaceDetectionEngineConfig {
  // ========== Detection Settings ==========
  camera_max_size?: number
  video_load_timeout?: number
  detection_frame_delay?: number
  detection_idle_timeout?: number

  // ========== Collection Settings ==========
  silent_detect_count?: number
  min_face_ratio?: number
  max_face_ratio?: number
  min_face_frontal?: number
  min_image_quality?: number
  min_live_score?: number
  min_real_score?: number
  face_frontal_features?: FaceFrontalFeatures
  image_quality_features?: ImageQualityFeatures

  // ========== Liveness Settings ==========
  show_action_prompt?: boolean
  liveness_action_timeout?: number
  liveness_action_list?: LivenessAction[]
  liveness_action_desc?: Record<LivenessAction, string>
  liveness_action_count?: number
  liveness_action_random?: boolean
  min_mouth_open_percent?: number

  // ========== Status Settings ==========
  show_status_prompt?: boolean
  status_prompt_duration?: number
  prompt_code_desc?: Record<PromptCode, string>

  // ========== Border Colors Settings ==========
  show_border_color?: boolean
  border_color_idle?: string
  border_color_warning?: string
  border_color_ready?: string
  border_color_success?: string
  border_color_error?: string
}

// ==================== Event Data Interfaces ====================

export interface StatusPromptData {
  code: PromptCode    // Prompt code
  message: string     // Prompt message
  count?: number      // Face count
  size?: number       // Face size percentage
  frontal?: number    // Face frontality percentage
  real?: number       // Anti-spoofing score
  live?: number       // Liveness score
  quality?: number    // Image quality score
}

export interface ActionPromptData {
  action: LivenessAction
  status: LivenessActionStatus
}

/**
 * Silent liveness detection data
 */
export interface LivenessDetectedData {
  passed: boolean  // Whether silent liveness detection passed
  size: number     // Face size percentage (0-1)
  frontal: number  // Face frontality percentage (0-1)
  quality: number  // Image quality score (0-1)
  real: number     // Anti-spoofing score (0-1)
  live: number     // Liveness score (0-1)
}

/**
 * Action/silent liveness detection completion data
 */
export interface LivenessCompletedData {
  qualityScore: number  // Image quality score (0-1)
  imageData: string | null  // Base64 encoded image
  liveness: number      // Liveness score (0-1)
}

/**
 * Error data
 */
export interface ErrorData {
  code: ErrorCode
  message: string
}

/**
 * Debug information data
 */
export interface DebugData {
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
  'detector-loaded': void
  'status-prompt': StatusPromptData
  'liveness-detected': LivenessDetectedData
  'action-prompt': ActionPromptData
  'liveness-action': any
  'liveness-completed': LivenessCompletedData
  'detector-error': ErrorData
  'detector-debug': DebugData
}

// ==================== Utility Classes ====================

/**
 * Generic scored list for image collection
 * Maintains top N items sorted by score
 */
export class ScoredList<T> {
  private maxSize: number
  private items: Array<{ item: T; score: number }>
  private totalCount: number = 0

  constructor(maxSize = 5) {
    this.maxSize = maxSize
    this.items = []
  }

  add(item: T, score: number): void {
    this.totalCount++
    this.items.push({ item, score })
    // Sort by score descending
    this.items.sort((a, b) => b.score - a.score)
    // Remove lowest score if exceeds capacity
    if (this.items.length > this.maxSize) {
      this.items.pop()
    }
  }

  getBestItem(): T | null {
    return this.items[0]?.item ?? null
  }

  getBestScore(): number {
    return this.items[0]?.score ?? 0
  }

  getAll(): T[] {
    return this.items.map(x => x.item)
  }

  getAllWithScores(): Array<{ item: T; score: number }> {
    return [...this.items]
  }

  clear(): void {
    this.items = []
    this.totalCount = 0
  }

  size(): number {
    return this.items.length
  }

  total(): number {
    return this.totalCount
  }
}
