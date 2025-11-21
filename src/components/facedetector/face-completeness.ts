/**
 * 人脸完整度检测模块
 * 用于检测一张图片中的人脸是否完整（是否包含眼睛、鼻子、嘴巴、耳朵等关键五官）
 * 基于 Human.js 库的人脸检测功能
 */

import { CONFIG } from './config'

/**
 * 人脸完整度检测结果
 */
interface FaceCompletenessResult {
  // 是否完整
  isComplete: boolean
  // 完整度评分 (0-1)
  completenessScore: number
  // 详细信息
  details: {
    // 各个部位的检测状态
    eyes: {
      detected: boolean
      confidence: number
      count: number
    }
    nose: {
      detected: boolean
      confidence: number
    }
    mouth: {
      detected: boolean
      confidence: number
    }
    ears: {
      detected: boolean
      confidence: number
      count: number
    }
    // 人脸是否在图片内
    faceInBounds: boolean
    // 缺失的五官列表
    missingParts: string[]
  }
  // 人性化的完整性描述
  description: string
}

/**
 * 获取人脸关键点，处理多种可能的属性名（兼容不同版本的 Human.js）
 */
function getValidLandmarks(face: any): any[] {
  // 尝试多种可能的属性名和结构
  const landmarks =
    face.landmarks ||
    face.keypoints ||
    face.points ||
    face.mesh ||
    face.faceKeypoints ||
    []

  // 如果是有效的数组
  if (Array.isArray(landmarks) && landmarks.length > 0) {
    // 如果是二维数组（嵌套），则拍平
    if (Array.isArray(landmarks[0]) && landmarks[0].length === 2) {
      return landmarks
        .flat()
        .map((v, i) => {
          if (i % 2 === 0) return { x: v, y: landmarks[i + 1] }
        })
        .filter(Boolean)
    }
    return landmarks
  }

  return []
}

/**
 * 获取关键点的置信度，处理多种可能的属性名
 */
function getKeypointConfidence(lm: any): number {
  // 优先级顺序检查各种可能的属性
  if (
    typeof lm?.confidence === 'number' &&
    lm.confidence >= 0 &&
    lm.confidence <= 1
  ) {
    return lm.confidence
  }
  if (typeof lm?.score === 'number' && lm.score >= 0 && lm.score <= 1) {
    return lm.score
  }
  if (typeof lm?.z === 'number' && lm.z >= 0 && lm.z <= 1) {
    return lm.z
  }

  // 如果只有坐标信息但没有置信度，返回中等置信度
  if (typeof lm?.x === 'number' && typeof lm?.y === 'number') {
    return 0.6 // 中等置信度
  }

  return 0 // 完全无效数据
}

/**
 * 检查人脸完整度
 * 
 * 直接使用 CONFIG.FACE_COMPLETENESS 中的参数，不支持运行时覆盖
 * 
 * @param face - Human.js 返回的人脸检测结果
 * @param imageWidth - 图片宽度
 * @param imageHeight - 图片高度
 * @returns 人脸完整度检测结果
 */
export function checkFaceCompleteness(
  face: any,
  imageWidth: number,
  imageHeight: number
): FaceCompletenessResult {
  const minEyeConfidence = CONFIG.FACE_COMPLETENESS.MIN_EYE_CONFIDENCE
  const minNoseConfidence = CONFIG.FACE_COMPLETENESS.MIN_NOSE_CONFIDENCE
  const minMouthConfidence = CONFIG.FACE_COMPLETENESS.MIN_MOUTH_CONFIDENCE
  const minEarConfidence = CONFIG.FACE_COMPLETENESS.MIN_EAR_CONFIDENCE
  const requireFullFaceInBounds = CONFIG.FACE_COMPLETENESS.REQUIRE_FULL_FACE_IN_BOUNDS
  const strictMode = CONFIG.FACE_COMPLETENESS.STRICT_MODE

  const missingParts: string[] = []
  let completenessScore = 1.0

  // 1. 检查人脸框是否在图片范围内
  const faceBox = face.box || face.boxRaw
  let faceInBounds = true

  if (faceBox && faceBox.length >= 4) {
    const [x, y, width, height] = faceBox
    if (x < 0 || y < 0 || x + width > imageWidth || y + height > imageHeight) {
      faceInBounds = false
      if (requireFullFaceInBounds) {
        missingParts.push('人脸超出边界')
        completenessScore -= CONFIG.FACE_COMPLETENESS.PENALTY_OUT_OF_BOUNDS
      }
    }
  }

  // 获取所有关键点
  const landmarks = getValidLandmarks(face)

  // 2. 检查眼睛（左眼 33-41, 右眼 263-271）
  let eyesData = {
    detected: false,
    confidence: 0,
    count: 0
  }
  
  let noseData = {
    detected: false,
    confidence: 0
  }
  
  let mouthData = {
    detected: false,
    confidence: 0
  }
  
  let earsData = {
    detected: false,
    confidence: 0,
    count: 0
  }

  if (landmarks && landmarks.length > 0) {
    // 左眼关键点索引 (468-facemesh 模型)
    const leftEyeIndices = [33, 34, 35, 36, 37, 38, 39, 40, 41, 130, 131, 132, 133, 173, 174, 175, 176]
    // 右眼关键点索引 (468-facemesh 模型)
    const rightEyeIndices = [263, 264, 265, 266, 267, 268, 269, 270, 271, 359, 360, 361, 362, 398, 399, 400, 401]

    // 检查左眼
    const leftEyeLandmarks = landmarks.filter((_: any, idx: number) =>
      leftEyeIndices.includes(idx)
    )
    const leftEyeConfidences = leftEyeLandmarks
      .map((lm: any) => getKeypointConfidence(lm))
      .filter((conf: number) => conf > 0)

    // 检查右眼
    const rightEyeLandmarks = landmarks.filter((_: any, idx: number) =>
      rightEyeIndices.includes(idx)
    )
    const rightEyeConfidences = rightEyeLandmarks
      .map((lm: any) => getKeypointConfidence(lm))
      .filter((conf: number) => conf > 0)

    if (leftEyeConfidences.length > 0 || rightEyeConfidences.length > 0) {
      const avgLeftEyeConf =
        leftEyeConfidences.length > 0
          ? leftEyeConfidences.reduce((a: number, b: number) => a + b, 0) / leftEyeConfidences.length
          : 0
      const avgRightEyeConf =
        rightEyeConfidences.length > 0
          ? rightEyeConfidences.reduce((a: number, b: number) => a + b, 0) / rightEyeConfidences.length
          : 0

      const avgEyeConf = (avgLeftEyeConf + avgRightEyeConf) / 2
      eyesData = {
        detected: avgEyeConf > minEyeConfidence,
        confidence: avgEyeConf,
        count: (avgLeftEyeConf > 0 ? 1 : 0) + (avgRightEyeConf > 0 ? 1 : 0)
      }

      if (!eyesData.detected) {
        missingParts.push('眼睛')
        completenessScore -= CONFIG.FACE_COMPLETENESS.PENALTY_MISSING_EYES
      }
    } else {
      missingParts.push('眼睛')
      completenessScore -= CONFIG.FACE_COMPLETENESS.PENALTY_MISSING_EYES
    }

    // 3. 检查鼻子（鼻尖: 4, 鼻孔: 75-79）
    const noseIndices = [4, 75, 76, 77, 78, 79]
    const noseLandmarks = landmarks.filter((_: any, idx: number) =>
      noseIndices.includes(idx)
    )
    const noseConfidences = noseLandmarks
      .map((lm: any) => getKeypointConfidence(lm))
      .filter((conf: number) => conf > 0)

    if (noseConfidences.length > 0) {
      const avgNoseConf =
        noseConfidences.reduce((a: number, b: number) => a + b, 0) / noseConfidences.length
      noseData = {
        detected: avgNoseConf > minNoseConfidence,
        confidence: avgNoseConf
      }

      if (!noseData.detected) {
        missingParts.push('鼻子')
        completenessScore -= CONFIG.FACE_COMPLETENESS.PENALTY_MISSING_NOSE
      }
    } else {
      missingParts.push('鼻子')
      completenessScore -= CONFIG.FACE_COMPLETENESS.PENALTY_MISSING_NOSE
    }

    // 4. 检查嘴巴（嘴唇: 61-80, 内部: 81-95）
    const mouthIndices = Array.from({ length: 35 }, (_, i) => 61 + i) // 61-95
    const mouthLandmarks = landmarks.filter((_: any, idx: number) =>
      mouthIndices.includes(idx)
    )
    const mouthConfidences = mouthLandmarks
      .map((lm: any) => getKeypointConfidence(lm))
      .filter((conf: number) => conf > 0)

    if (mouthConfidences.length > 0) {
      const avgMouthConf =
        mouthConfidences.reduce((a: number, b: number) => a + b, 0) / mouthConfidences.length
      mouthData = {
        detected: avgMouthConf > minMouthConfidence,
        confidence: avgMouthConf
      }

      if (!mouthData.detected) {
        missingParts.push('嘴巴')
        completenessScore -= CONFIG.FACE_COMPLETENESS.PENALTY_MISSING_MOUTH
      }
    } else {
      missingParts.push('嘴巴')
      completenessScore -= CONFIG.FACE_COMPLETENESS.PENALTY_MISSING_MOUTH
    }

    // 5. 检查耳朵（左耳: 234-243, 右耳: 454-463）
    const leftEarIndices = [234, 235, 236, 237, 238, 239, 240, 241, 242, 243]
    const rightEarIndices = [454, 455, 456, 457, 458, 459, 460, 461, 462, 463]

    const leftEarLandmarks = landmarks.filter((_: any, idx: number) =>
      leftEarIndices.includes(idx)
    )
    const leftEarConfidences = leftEarLandmarks
      .map((lm: any) => getKeypointConfidence(lm))
      .filter((conf: number) => conf > 0)

    const rightEarLandmarks = landmarks.filter((_: any, idx: number) =>
      rightEarIndices.includes(idx)
    )
    const rightEarConfidences = rightEarLandmarks
      .map((lm: any) => getKeypointConfidence(lm))
      .filter((conf: number) => conf > 0)

    if (leftEarConfidences.length > 0 || rightEarConfidences.length > 0) {
      const avgLeftEarConf =
        leftEarConfidences.length > 0
          ? leftEarConfidences.reduce((a: number, b: number) => a + b, 0) / leftEarConfidences.length
          : 0
      const avgRightEarConf =
        rightEarConfidences.length > 0
          ? rightEarConfidences.reduce((a: number, b: number) => a + b, 0) / rightEarConfidences.length
          : 0

      const avgEarConf = (avgLeftEarConf + avgRightEarConf) / 2
      earsData = {
        detected: avgEarConf > minEarConfidence,
        confidence: avgEarConf,
        count: (avgLeftEarConf > 0 ? 1 : 0) + (avgRightEarConf > 0 ? 1 : 0)
      }

      if (!earsData.detected) {
        missingParts.push('耳朵')
        completenessScore -= CONFIG.FACE_COMPLETENESS.PENALTY_MISSING_EARS
      }
    } else {
      missingParts.push('耳朵')
      completenessScore -= CONFIG.FACE_COMPLETENESS.PENALTY_MISSING_EARS
    }
  } else {
    // 无关键点数据
    missingParts.push('无法获取人脸关键点')
    completenessScore -= CONFIG.FACE_COMPLETENESS.PENALTY_NO_LANDMARKS
  }

  // 确保评分在 0-1 之间
  completenessScore = Math.max(0, Math.min(1, completenessScore))

  // 判断是否完整
  const isComplete = strictMode
    ? missingParts.length === 0 && faceInBounds
    : completenessScore >= CONFIG.FACE_COMPLETENESS.COMPLETENESS_THRESHOLD

  // 生成人性化描述
  let description = ''
  if (isComplete) {
    if (completenessScore >= 0.9) {
      description = '人脸完整度非常好'
    } else if (completenessScore >= 0.7) {
      description = '人脸完整度良好'
    } else {
      description = '人脸完整度一般'
    }
  } else {
    if (missingParts.length === 0) {
      description = '人脸不完整'
    } else {
      description = `缺失: ${missingParts.join('、')}`
    }
  }

  return {
    isComplete,
    completenessScore,
    details: {
      eyes: eyesData,
      nose: {
        detected: completenessScore > 0.4,
        confidence: 0
      },
      mouth: {
        detected: completenessScore > 0.3,
        confidence: 0
      },
      ears: earsData,
      faceInBounds,
      missingParts
    },
    description
  }
}

/**
 * 获取完整度等级
 * @param completenessScore - 完整度评分
 * @returns 等级 ('优秀' | '良好' | '一般' | '较差' | '不可用')
 */
export function getCompletenessLevel(
  completenessScore: number
): '优秀' | '良好' | '一般' | '较差' | '不可用' {
  if (completenessScore >= 0.9) return '优秀'
  if (completenessScore >= 0.7) return '良好'
  if (completenessScore >= 0.5) return '一般'
  if (completenessScore >= 0.3) return '较差'
  return '不可用'
}
