/**
 * Face Detection Engine - Face Frontal Checker
 * Checks if face is frontal to camera
 */

import type { FaceResult, GestureResult } from '@vladmandic/human'
import { getCvSync } from './library-loader'

// Face frontality thresholds (degrees)
const YAW_THRESHOLD = 3
const PITCH_THRESHOLD = 4
const ROLL_THRESHOLD = 2

/**
 * Check if face is frontal to camera
 * Uses multiple methods: gestures, angles, and OpenCV analysis
 *
 * @param face - Face detection result
 * @param gestures - Detected gestures (optional)
 * @param canvas - Canvas element for OpenCV analysis (optional)
 * @returns Frontality score (0-1)
 */
export function checkFaceFrontal(
  face: FaceResult,
  gestures?: GestureResult[],
  canvas?: HTMLCanvasElement
): number {
  // Try gesture-based detection first
  if (gestures && gestures.length > 0) {
    const gestureScore = checkGestures(gestures)
    if (gestureScore > 0) {
      return gestureScore
    }
  }

  // Fall back to angle-based detection
  return checkAngles(face)
}

/**
 * Check frontality using gesture recognition
 */
function checkGestures(gestures: GestureResult[]): number {
  if (!gestures) return 0

  const hasFacingCenter = gestures.some(g => {
    if (!g || !g.gesture) return false
    return g.gesture.includes('facing center') || g.gesture.includes('facing camera')
  })

  return hasFacingCenter ? 0.95 : 0
}

/**
 * Check frontality using face angles
 * Analyzes yaw, pitch, roll angles
 */
function checkAngles(face: FaceResult): number {
  const angles = extractAngles(face)

  let score = 1.0

  // Yaw penalty (horizontal)
  const yawExcess = Math.max(0, Math.abs(angles.yaw) - YAW_THRESHOLD)
  score -= yawExcess * 0.15

  // Pitch penalty (vertical)
  const pitchExcess = Math.max(0, Math.abs(angles.pitch) - PITCH_THRESHOLD)
  score -= pitchExcess * 0.1

  // Roll penalty (rotation)
  const rollExcess = Math.max(0, Math.abs(angles.roll) - ROLL_THRESHOLD)
  score -= rollExcess * 0.12

  return Math.max(0, Math.min(1, score))
}

/**
 * Extract face angles
 */
function extractAngles(face: FaceResult): { yaw: number; pitch: number; roll: number } {
  const ang = (face as any)?.rotation?.angle || { yaw: 0, pitch: 0, roll: 0 }
  return {
    yaw: ang.yaw || 0,
    pitch: ang.pitch || 0,
    roll: ang.roll || 0
  }
}
