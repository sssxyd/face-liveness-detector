/**
 * Face Detection Engine - Image Quality Checker
 * Checks image quality and face completeness
 */

import type { FaceResult } from '@vladmandic/human'
import { getCvSync } from './library-loader'

export interface ImageQualityResult {
  passed: boolean
  score: number
  completenessReasons: string[]
  blurReasons: string[]
}

/**
 * Check image quality
 * Evaluates both face completeness and image sharpness
 *
 * @param canvas - Image canvas
 * @param face - Face detection result
 * @param imageWidth - Image width
 * @param imageHeight - Image height
 * @returns Quality check result
 */
export function checkImageQuality(
  canvas: HTMLCanvasElement,
  face: FaceResult,
  imageWidth: number,
  imageHeight: number
): ImageQualityResult {
  const completenessReasons: string[] = []
  const blurReasons: string[] = []

  // Check face completeness
  const completenessScore = checkCompletenessInternal(face, imageWidth, imageHeight)
  if (completenessScore < 0.8) {
    completenessReasons.push('Face not completely in bounds or low detection confidence')
  }

  // Check sharpness
  const sharpnessScore = checkSharpness(canvas, face)
  if (sharpnessScore < 0.6) {
    blurReasons.push('Image is blurry or low contrast')
  }

  // Combined score
  const combinedScore = completenessScore * 0.5 + sharpnessScore * 0.5

  return {
    passed: combinedScore >= 0.8,
    score: combinedScore,
    completenessReasons,
    blurReasons
  }
}

/**
 * Check face completeness
 */
function checkCompletenessInternal(face: FaceResult, imageWidth: number, imageHeight: number): number {
  const faceBox = (face as any).box || (face as any).boxRaw

  if (!faceBox || faceBox.length < 4) {
    return 0
  }

  const [x, y, width, height] = faceBox

  // Calculate overlap
  const overlapX = Math.min(Math.max(x + width, 0), imageWidth) - Math.max(x, 0)
  const overlapY = Math.min(Math.max(y + height, 0), imageHeight) - Math.max(y, 0)
  const faceArea = width * height
  const overlapArea = Math.max(0, overlapX) * Math.max(0, overlapY)

  return faceArea > 0 ? overlapArea / faceArea : 0
}

/**
 * Check image sharpness using Laplacian variance
 */
function checkSharpness(canvas: HTMLCanvasElement, face: FaceResult): number {
  try {
    const cv = getCvSync()
    if (!cv) {
      return 1.0 // Assume good quality if OpenCV not available
    }

    const img = cv.imread(canvas)

    try {
      let roi = img
      if ((face as any)?.box && (face as any).box.length >= 4) {
        const [x, y, w, h] = (face as any).box
        const padding = Math.min(w, h) * 0.1

        const x1 = Math.max(0, Math.floor(x - padding))
        const y1 = Math.max(0, Math.floor(y - padding))
        const x2 = Math.min(img.cols, Math.floor(x + w + padding))
        const y2 = Math.min(img.rows, Math.floor(y + h + padding))

        roi = img.roi(new cv.Rect(x1, y1, x2 - x1, y2 - y1))
      }

      try {
        let gray = roi
        if (roi.channels() !== 1) {
          gray = new cv.Mat()
          cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY)
        }

        try {
          const laplacian = new cv.Mat()
          cv.Laplacian(gray, laplacian, cv.CV_64F)

          const mean = new cv.Mat()
          const stddev = new cv.Mat()
          cv.meanStdDev(laplacian, mean, stddev)

          const variance = stddev.doubleAt(0, 0) ** 2

          laplacian.delete()
          mean.delete()
          stddev.delete()

          // Normalize variance to 0-1 score
          const sharpnessScore = Math.min(1, variance / 200)
          return sharpnessScore
        } finally {
          if (gray !== roi) {
            gray.delete()
          }
        }
      } finally {
        if (roi !== img) {
          roi.delete()
        }
      }
    } finally {
      img.delete()
    }
  } catch (error) {
    console.warn('[ImageQuality] Sharpness check failed:', error)
    return 1.0 // Assume good quality on error
  }
}
