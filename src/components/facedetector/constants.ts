/**
 * 人脸检测 - 常量和配置
 * 包含所有事件名、颜色、描述、配置等
 */

import { LivenessAction, PromptCode, DetectionMode } from './enums'
import type { FaceDetectorProps } from './types'

/**
 * FaceDetector 组件事件名称常量
 * 用于组件与父容器通信的事件名
 */
export const FACE_DETECTOR_EVENTS = Object.freeze({
  READY: 'detector-loaded',           // Human.js&OpenCV.js 加载成功，组件已就绪
  ACTION_PROMPT: 'action-prompt', // 活体动作提示
  STATUS_PROMPT: 'status-prompt', // 状态提示
  LIVENESS_DETECTED: 'liveness-detected', // 一次静默活体检测完成  
  LIVENESS_ACTION: 'liveness-action',    // 活体动作事件
  LIVENESS_COMPLETED: 'liveness-completed', // 动作/静默活体检测完成
  ERROR: 'detector-error', // 错误事件
  DEBUG: 'detector-debug',  // 调试事件 - 用于输出详细的诊断信息
})

/**
 * 边框颜色状态映射表
 */
export const BORDER_COLOR_STATES = Object.freeze({
  IDLE: '#ddd',           // 空闲状态
  MULTIPLE_FACES: '#ffc107', // 多张脸警告
  PERFECT: '#42b983',     // 理想状态
  PARTIAL: '#ff9800',     // 部分可用
  INVALID: '#f5222d',     // 无效
  SUCCESS: '#16d355',     // 成功
  ERROR: '#f5222d'        // 错误
})

/**
 * 提示码描述映射表
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
 * 动作描述映射表
 */
export const ACTION_DESCRIPTIONS = Object.freeze({
  [LivenessAction.BLINK]: 'Blink',
  [LivenessAction.MOUTH_OPEN]: 'Open Mouth',
  [LivenessAction.NOD]: 'Nod'
})

/**
 * FaceDetector 组件默认配置
 */
export const DEFAULT_PROPS: FaceDetectorProps = Object.freeze({
  // DetectionSettings 默认值
  camera_max_size: 640,
  video_load_timeout: 5000,
  detection_frame_delay: 100,
  detection_idle_timeout: 60000,
  
  // CollectionSettings 默认值
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
    roll_threshold: 2,
  }),
  image_quality_features: Object.freeze({
    require_full_face_in_bounds: true,
    min_box_score: 0.8,
    min_face_score: 0.8,
  }),
  
  // LivenessSettings 默认值
  show_action_prompt: true,
  liveness_action_timeout: 60000,
  liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  liveness_action_count: 1,
  liveness_action_random: true,
  min_mouth_open_percent: 0.2,
  liveness_action_desc: Object.freeze({
    [LivenessAction.BLINK]: 'Please Blink',
    [LivenessAction.MOUTH_OPEN]: 'Please Open Mouth',
    [LivenessAction.NOD]: 'Please Nod'
  }),
  
  // StatusSettings 默认值
  show_status_prompt: true,
  status_prompt_duration: 3000,
  prompt_code_desc: Object.freeze({
    [PromptCode.NO_FACE]: 'No face detected',
    [PromptCode.MULTIPLE_FACE]: 'Multiple Faces Detected',
    [PromptCode.FACE_TOO_SMALL]: 'Please move closer',
    [PromptCode.FACE_TOO_LARGE]: 'Please move farther',
    [PromptCode.FACE_NOT_FRONTAL]: 'Please face the camera',
    [PromptCode.BLURRY_IMAGE]: 'Image is blurry',
    [PromptCode.LOW_QUALITY]: 'Low image quality',
    [PromptCode.FRAME_DETECTED]: 'Face detected'
  }),
  
  // BorderColorsSettings 默认值
  show_border_color: true,
  border_color_idle: '#ddd',
  border_color_warning: '#ffc107',
  border_color_ready: '#42b983',
  border_color_success: '#16d355',
  border_color_error: '#f5222d',
})
