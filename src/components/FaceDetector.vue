<!-- 人脸检测组件模板 -->
<template>
  <!-- 主容器，根据移动设备状态动态添加样式类 -->
  <div class="face-detector" :class="{ 'is-mobile': isMobileDevice }">
    <!-- 视频容器：包含视频元素和绘制检测结果的画布 -->
    <div class="video-container" :style="{ borderColor: videoBorderColor }">
      <!-- 视频元素：用于捕获摄像头实时视频流 -->
      <video ref="videoRef" autoplay playsinline muted :width="videoWidth" :height="videoHeight"></video>
      <!-- 画布元素：用于绘制人脸检测框（检测过程）或显示最终结果图片 -->
      <canvas 
        ref="canvasRef" 
        :width="videoWidth" 
        :height="videoHeight"
        :class="{ 'result-canvas': isShowingResult }"
      ></canvas>
      <!-- 活体检测提示文本 -->
      <div v-if="actionPromptText && props.showActionPrompt" class="action-prompt">
        {{ actionPromptText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 导入 Vue 3 Composition API 相关方法
import { ref, computed, onMounted, onUnmounted, Ref } from 'vue'
// 导入人脸检测库
import Human from '@vladmandic/human'
// 导入类型定义
import type { FaceInfo, FaceCollectedData, LivenessCompletedData, LivenessActionData, ErrorData, FaceDetectorProps } from './face-detector'
import { DetectionMode, LivenessAction, LivenessActionStatus, ACTION_DESCRIPTIONS, FACE_DETECTOR_EVENTS, BORDER_COLOR_STATES } from './face-detector'

// 定义组件 props
const props = withDefaults(defineProps<FaceDetectorProps>(), {
  mode: DetectionMode.COLLECTION,
  livenessChecks: () => [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  minFaceRatio: 50,
  maxFaceRatio: 90,
  minFrontal: 90,
  silentLivenessThreshold: 90,  // 静默活体检测阈值 (百分比: 0-100)
  livenessActionCount: 1,        // 活体检测动作次数，默认为1
  livenessActionTimeout: 60,      // 活体检测动作时间限制，默认60秒
  showActionPrompt: true          // 是否显示活体检测动作提示文本，默认显示
})

const normalizedLivenessActionCount = computed(() => {
  // 如果 livenessActionCount > livenessChecks 长度，则设置为等于长度
  return Math.min(props.livenessActionCount, props.livenessChecks.length)
})

// 定义组件事件
const emit = defineEmits<{
  'face-detected': [data: { faceInfo: FaceInfo }]
  'face-collected': [data: FaceCollectedData]
  'liveness-action': [data: LivenessActionData]
  'liveness-completed': [data: LivenessCompletedData]
  'error': [data: ErrorData]
}>()

// 视频元素引用
const videoRef: Ref<HTMLVideoElement | null> = ref(null)
// 画布元素引用，用于绘制检测结果或显示最终结果图片
const canvasRef: Ref<HTMLCanvasElement | null> = ref(null)
// 是否正在显示结果图片
const isShowingResult: Ref<boolean> = ref(false)
// 是否为移动设备
const isMobileDevice: Ref<boolean> = ref(false)
// 是否为竖屏方向
const isPortrait: Ref<boolean> = ref(true)
// 是否正在进行检测
const isDetecting: Ref<boolean> = ref(false)

// 视频宽度
let videoWidth: Ref<number> = ref(640)
// 视频高度
let videoHeight: Ref<number> = ref(480)
// Human 检测库实例
let human: Human | null = null
// 摄像头流对象
let stream: MediaStream | null = null
// 检测循环的定时器 ID
let detectionTimeoutId: ReturnType<typeof setTimeout> | null = null

// ===== 活体检测相关变量 =====
// 当前活体检测项的索引
let currentLivenessIndex: number = 0
// 已完成的活体检测项集合
let livenessCompleted: Set<LivenessAction> = new Set()
// 暂存的基准图片（在第一次检测到正脸时捕获）
let baselineFaceData: string | null = null
// 标记是否已进入活体检测流程（防止人脸切换）
let livenessStarted: boolean = false
// 点头检测：记录检测到的 head 方向序列
let nodHeadSequence: string[] = []
// 静默活体检测：是否已进入静默检测阶段
let silentLivenessStarted: boolean = false
// 静默活体检测：采集的完整摄像头照片（用于活体检测）
let silentLivenessCapturedImage: string | null = null
// 当前随机选择的活体检测动作
let currentRandomAction: LivenessAction | null = null
// 当前动作的完成次数
let currentActionCompletedCount: number = 0
// 当前动作的超时定时器
let actionTimeoutId: ReturnType<typeof setTimeout> | null = null
// 摄像头上显示的提示文本
const actionPromptText: Ref<string> = ref('')
// 视频容器的边框颜色状态
const videoBorderColor: Ref<string> = ref(BORDER_COLOR_STATES.IDLE)  // 默认灰色

// 是否正在初始化检测库
const isInitializing: Ref<boolean> = ref(false)

// ===== 生命周期钩子 =====
// 组件挂载时初始化
onMounted(async () => {
  detectDevice()
  // 监听设备方向改变事件
  window.addEventListener('orientationchange', handleOrientationChange)
  
  // 配置 Human 检测库
  isInitializing.value = true
  const config = {
    // 模型文件本地路径
    modelBasePath: '/models',
    // 人脸检测配置
    face: {
      enabled: true,
      detector: { rotation: false, return: true },
      mesh: { enabled: true },      // 面部网格点
      iris: { enabled: true }       // 虹膜检测
    },
    body: { enabled: false },      // 禁用身体检测
    hand: { enabled: false },      // 禁用手部检测
    object: { enabled: false },    // 禁用物体检测
    gesture: { enabled: true }     // 启用手势检测(包含眨眼)
  }
  human = new Human(config as any)
  try {
    await human.load()
    console.log('Human library loaded successfully')
  } catch (e) {
    console.error('Failed to load Human library:', e)
  }
  isInitializing.value = false
})

// 组件卸载时清理资源
onUnmounted(() => {
  stopDetection()
  window.removeEventListener('orientationchange', handleOrientationChange)
})

// ===== 常量定义 =====
const CONSTANTS = Object.freeze({
  VIDEO_LOAD_TIMEOUT: 5000,
  MOBILE_VIDEO_WIDTH_OFFSET: 40,
  MOBILE_VIDEO_HEIGHT_OFFSET: 200,
  MOBILE_MAX_WIDTH: 480,
  MOBILE_MAX_HEIGHT: 640,
  DESKTOP_VIDEO_WIDTH: 640,
  DESKTOP_VIDEO_HEIGHT: 480,
  MOBILE_WIDTH_THRESHOLD: 768
})

// ===== 设备检测与方向处理 =====
/**
 * 检测设备类型和屏幕方向，并调整视频尺寸
 */
function detectDevice(): void {
  // 判断是否为移动设备
  isMobileDevice.value = navigator.userAgent.toLowerCase().match(/android|iphone/) !== null || window.innerWidth < CONSTANTS.MOBILE_WIDTH_THRESHOLD
  // 判断是否为竖屏
  isPortrait.value = window.innerHeight >= window.innerWidth
  
  if (isMobileDevice.value) {
    // 移动设备：尽量适配屏幕尺寸
    videoWidth.value = Math.min(window.innerWidth - CONSTANTS.MOBILE_VIDEO_WIDTH_OFFSET, CONSTANTS.MOBILE_MAX_WIDTH)
    videoHeight.value = Math.min(window.innerHeight - CONSTANTS.MOBILE_VIDEO_HEIGHT_OFFSET, CONSTANTS.MOBILE_MAX_HEIGHT)
  } else {
    // 桌面设备：使用固定尺寸
    videoWidth.value = CONSTANTS.DESKTOP_VIDEO_WIDTH
    videoHeight.value = CONSTANTS.DESKTOP_VIDEO_HEIGHT
  }
}

/**
 * 处理设备方向改变事件
 */
function handleOrientationChange(): void {
  isPortrait.value = window.innerHeight >= window.innerWidth
  
  // 如果正在检测，则重启检测以适配新的方向
  if (isDetecting.value) {
    if (stream) stream.getTracks().forEach(t => t.stop())
    detectDevice()
    // 延迟重启，确保 DOM 更新完成
    setTimeout(() => startDetection(), 500)
  }
}

// ===== 检测控制方法 =====
/**
 * 启动人脸检测
 */
async function startDetection(): Promise<void> {
  try {
    // 检查 Human 库是否已初始化
    if (!human) {
      emit(FACE_DETECTOR_EVENTS.ERROR, { message: '检测库未初始化' })
      return
    }
    
    console.log('[FaceDetector] Starting detection...')
    
    // 获取用户摄像头权限和视频流
    console.log('[FaceDetector] Requesting camera access...')
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: videoWidth.value }, height: { ideal: videoHeight.value } },
      audio: false
    })
    
    console.log('[FaceDetector] Camera stream obtained')
    if (videoRef.value) {
      videoRef.value.style.display = 'block'  // 确保摄像头视频可见
      videoRef.value.srcObject = stream
    }
    
    // 等待视频元素加载元数据和可播放
    console.log('[FaceDetector] Waiting for video to be ready...')
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Video loading timeout'))
      }, CONSTANTS.VIDEO_LOAD_TIMEOUT)
      
      const onCanPlay = () => {
        clearTimeout(timeout)
        if (videoRef.value) {
          videoRef.value.removeEventListener('canplay', onCanPlay)
        }
        resolve()
      }
      
      if (videoRef.value) {
        videoRef.value.addEventListener('canplay', onCanPlay)
        videoRef.value.play().catch(reject)
      }
    })
    
    console.log('[FaceDetector] Video is ready, starting detection loop...')
    
    // 标记为正在检测
    isDetecting.value = true
    // 重置边框颜色为初始状态
    videoBorderColor.value = BORDER_COLOR_STATES.IDLE
    currentLivenessIndex = 0
    livenessCompleted.clear()
    
    // 清空结果画布
    if (canvasRef.value) {
      const ctx = canvasRef.value.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
    }
    
    // 重置显示结果状态
    isShowingResult.value = false
    
    // 重置活体检测相关变量
    nodHeadSequence = []
    baselineFaceData = null
    livenessStarted = false
    silentLivenessStarted = false
    silentLivenessCapturedImage = null
    currentRandomAction = null
    currentActionCompletedCount = 0
    actionPromptText.value = ''
    
    // 立即启动检测循环
    detect()
  } catch (e) {
    // 若获取摄像头失败，触发错误事件
    console.error('[FaceDetector] Error:', e)
    isDetecting.value = false
    emit(FACE_DETECTOR_EVENTS.ERROR, { message: (e as Error).message })
  }
}

/**
 * 停止人脸检测
 */
function stopDetection(success: boolean = false): void {
  isDetecting.value = false
  
  if (detectionTimeoutId) clearTimeout(detectionTimeoutId)
  if (actionTimeoutId) clearTimeout(actionTimeoutId)
  if (stream) stream.getTracks().forEach(t => t.stop())

  let resultImageBase64 = (success && baselineFaceData) ? baselineFaceData : captureFaceFrame([0, 0, videoWidth.value, videoHeight.value])
  
  if (resultImageBase64) {
    // 绘制检测结果或最后一帧图片
    displayResultImage(resultImageBase64)
  }
  
  // 停止视频
  if (videoRef.value) videoRef.value.srcObject = null
}

// ===== 人脸检测与活体验证核心逻辑 =====
/**
 * 检测循环：不断获取视频帧进行人脸检测
 */
async function detect(): Promise<void> {
  if (!isDetecting.value) return
  
  try {
    // 快速检查必需的对象
    if (!videoRef.value || !canvasRef.value || !human) {
      console.warn('[FaceDetector] Missing required objects, retrying...')
      setTimeout(detect, 100)
      return
    }
    
    // 对当前视频帧进行人脸检测
    console.log('[FaceDetector] Running detection...')
    const result = await human.detect(videoRef.value)
    console.log('[FaceDetector] Detection result:', result.face?.length || 0, 'faces')
    
    // 获取画布上下文并清空
    const ctx = canvasRef.value.getContext('2d')
    if (!ctx) {
      console.error('[FaceDetector] Failed to get canvas context')
      setTimeout(detect, 100)
      return
    }
    ctx.clearRect(0, 0, videoWidth.value, videoHeight.value)
    
    // 获取检测到的所有人脸
    const faces = result.face || []
    
    if (faces.length === 1) {
      const face = faces[0] as any
      const faceBox = face.box || face.boxRaw
      
      if (!faceBox) {
        // 继续检测
        setTimeout(detect, 100)
        return
      }
      
      // 计算人脸占视频画面的比例 (%)
      const faceRatio = (faceBox[2] * faceBox[3]) / (videoWidth.value * videoHeight.value) * 100
      
      // 检查人脸是否正对摄像头 (0-100 分数)，使用 gestures 判定
      const frontal = checkFaceFrontal(face, result.gesture)
      
      // 人脸信息
      const faceInfo: FaceInfo = { 
        count: 1,
        size: faceRatio, 
        frontal: frontal
      }
      
      // 触发 face-detected 事件
      emit(FACE_DETECTOR_EVENTS.FACE_DETECTED, { faceInfo })
      // 更新边框颜色
      updateBorderColor(faceInfo)
      
      // 判断人脸是否符合条件：大小在范围内，且正对度符合要求
      if (faceRatio > props.minFaceRatio && faceRatio < props.maxFaceRatio && frontal >= props.minFrontal) {
        console.log('[FaceDetector] Valid face detected, drawing green')
        drawFaces(ctx, faces, 'green')
        
        if (props.mode === 'collection') {
          // 采集模式：检测到合格人脸后裁切、停止并返回图片
          baselineFaceData = captureFaceFrame(faceBox)
          emit(FACE_DETECTOR_EVENTS.FACE_COLLECTED, { faceImageData: baselineFaceData })
          stopDetection()
        } else if (props.mode === 'silent_liveness') {
          // 静默活体检测模式：采集完整摄像头照片，然后进行活体检测
          if (!silentLivenessStarted) {
            console.log('[FaceDetector] Valid face detected, entering silent liveness detection')
            silentLivenessCapturedImage = captureFrame()  // 捕获完整摄像头照片
            baselineFaceData = captureFaceFrame(faceBox)  // 也保存裁切后的人脸
            silentLivenessStarted = true
            
            // 异步执行活体检测
            performSilentLivenessDetection()
          }
        } else {
          // 活体检测模式：进行活体验证，暂存图片和faceBox，在所有检测完成后统一emit
          verifyLiveness(result.gesture, faceBox)
        }
      } else {
        // 人脸不符合条件，继续检测
        console.log('[FaceDetector] Face not valid, ratio:', faceRatio, 'frontal:', frontal)
        drawFaces(ctx, faces, 'orange')
        setTimeout(detect, 100)
      }
    } else {
      // 未检测到人脸或检测到多个人脸
      console.log('[FaceDetector] Face count:', faces.length)
      const faceInfo: FaceInfo = { 
        count: faces.length,
        size: 0,
        frontal: 0
      }
      emit(FACE_DETECTOR_EVENTS.FACE_DETECTED, { faceInfo })
      // 更新边框颜色
      updateBorderColor(faceInfo)
      
      // 在 LIVENESS 或 SILENT_LIVENESS 模式下，如果已开始活体检测，不能检测不到人脸或多个人脸
      if (props.mode === 'liveness' && livenessStarted && faces.length !== 1) {
        console.error('[FaceDetector] Face count changed during liveness detection, expected 1 but got', faces.length)
        emit(FACE_DETECTOR_EVENTS.ERROR, { message: `检测到人脸数量变化，期望1张，实际${faces.length}张。请保持正脸对着摄像头，重新开始检测。` })
        stopDetection()
        return
      }
      
      if (props.mode === 'silent_liveness' && silentLivenessStarted && faces.length !== 1) {
        console.error('[FaceDetector] Face count changed during silent liveness detection, expected 1 but got', faces.length)
        emit(FACE_DETECTOR_EVENTS.ERROR, { message: `检测到人脸数量变化，期望1张，实际${faces.length}张。请保持正脸对着摄像头，重新开始检测。` })
        resetSilentLiveness()
        return
      }

      setTimeout(detect, 100)
    }
  } catch (error) {
    console.error('[FaceDetector] Detection error:', error)
    // 发生错误时继续检测
    setTimeout(detect, 200)
  }
}

/**
 * 检查人脸是否正对摄像头
 * @param {Object} face - 人脸检测结果
 * @param {Array} gestures - 检测到的手势/表情
 * @returns {number} 正对度评分 (0-100)
 */
function checkFaceFrontal(face: any, gestures: any): number {
  // 优先使用 gestures 中的 facing center 判定
  if (gestures && gestures.length > 0) {
    const isFacingCenter = gestures.some((g: any) => g.gesture?.includes('facing center'))
    
    // 如果识别到 "facing center"，则判定为正脸，返回 100 分
    if (isFacingCenter) {
      console.log('[FaceDetector] Face is frontal (from gesture: facing center)')
      return 100
    }
    
    // 如果识别到 facing left 或 facing right，返回较低分数
    const isFacingLeft = gestures.some((g: any) => g.gesture?.includes('facing left'))
    const isFacingRight = gestures.some((g: any) => g.gesture?.includes('facing right'))
    
    if (isFacingLeft || isFacingRight) {
      console.log('[FaceDetector] Face is not fully frontal (from gesture: facing', isFacingLeft ? 'left' : 'right', ')')
      return 50 // 返回 50 分，表示偏转
    }
  }
  
  // 备用方案：使用角度算法计算正对度评分（更严格的精确判定）
  // 获取人脸的 yaw (左右摇晃)、pitch (上下俯仰)、roll (旋转) 角度
  const ang = face.rotation?.angle || { yaw: 0, pitch: 0, roll: 0 }
  
  // 更严格的角度阈值判定
  // 要求：yaw < 5°、pitch < 5°、roll < 3°，才能达到较高的正脸评分
  
  // 基础评分，从 100 开始
  let score = 100
  
  // Yaw 角度惩罚（左右摇晃）- 权重最高 (60%)
  // 目标：yaw 应该在 ±3° 以内
  const yawThreshold = 3
  const yawPenalty = Math.abs(ang.yaw) > yawThreshold 
    ? Math.abs(ang.yaw) - yawThreshold  // 超出部分作为惩罚
    : 0
  // yaw 每超过 1° 扣 15 分
  score -= yawPenalty * 15
  
  // Pitch 角度惩罚（上下俯仰）- 权重中等 (25%)
  // 目标：pitch 应该在 ±4° 以内
  const pitchThreshold = 4
  const pitchPenalty = Math.abs(ang.pitch) > pitchThreshold 
    ? Math.abs(ang.pitch) - pitchThreshold
    : 0
  // pitch 每超过 1° 扣 10 分
  score -= pitchPenalty * 10
  
  // Roll 角度惩罚（旋转）- 权重最低 (15%)
  // 目标：roll 应该在 ±2° 以内
  const rollThreshold = 2
  const rollPenalty = Math.abs(ang.roll) > rollThreshold 
    ? Math.abs(ang.roll) - rollThreshold
    : 0
  // roll 每超过 1° 扣 12 分
  score -= rollPenalty * 12
  
  // 确保评分在 0-100 之间
  return Math.max(0, Math.min(100, score))
}

/**
 * 活体检测验证：检测用户是否执行指定的活体动作
 * @param {Array} gestures - 检测到的手势/表情
 * @param {Array} faceBox - 人脸边界框
 */
function verifyLiveness(gestures: any, faceBox: number[]): void {
  // 如果是第一次检测到符合条件的人脸，先捕获并暂存（不立即emit）
    if (currentLivenessIndex === 0 && livenessCompleted.size === 0 && !baselineFaceData) {
    console.log('[FaceDetector] First valid face detected in liveness mode, capturing baseline')
    baselineFaceData = captureFaceFrame(faceBox)
    // 标记活体检测已开始，后续 detect 方法需要检查人脸数量
    livenessStarted = true
    
    // 选择第一个随机动作
    selectNextRandomAction()
  }
  
  // 检查是否达到动作次数限制
  if (currentLivenessIndex >= normalizedLivenessActionCount.value) {
    console.log('[FaceDetector] All liveness checks completed')
    // 抛出 liveness-completed 事件
    emit(FACE_DETECTOR_EVENTS.LIVENESS_COMPLETED, { faceImageData: baselineFaceData, liveness: 1.0 })
    stopDetection(true)
    return
  }  // 获取当前需要检测的随机动作
  if (!currentRandomAction) {
    console.warn('[FaceDetector] No current action selected')
    setTimeout(detect, 100)
    return
  }
  
  // 检测当前帧是否有指定的动作
  const detected = detectAction(currentRandomAction, gestures)
  
  // 如果检测到动作
  if (detected) {
    currentActionCompletedCount++
    console.log('[FaceDetector] Action detected:', currentRandomAction, 'count:', currentActionCompletedCount)
    
    // 检查是否达到了所需的次数
    if (currentActionCompletedCount >= normalizedLivenessActionCount.value) {
      console.log('[FaceDetector] Liveness action completed:', currentRandomAction)
      emit(FACE_DETECTOR_EVENTS.LIVENESS_ACTION, { action: currentRandomAction, description: getActionDescription(currentRandomAction), status: LivenessActionStatus.COMPLETED })
      livenessCompleted.add(currentRandomAction)
      currentLivenessIndex++
      
      // 清空当前动作信息，准备选择下一个
      currentRandomAction = null
      currentActionCompletedCount = 0
      
      // 清除超时定时器
      if (actionTimeoutId) clearTimeout(actionTimeoutId)
      actionTimeoutId = null
      actionPromptText.value = ''
      
      // 继续检测下一帧
      setTimeout(detect, 100)
    }
  }
  
  // 继续检测下一帧
  setTimeout(detect, 100)
}

/**
 * 选择下一个随机的活体检测动作
 */
function selectNextRandomAction(): void {
  // 从未完成的动作中随机选择
  const availableActions = props.livenessChecks.filter(action => !livenessCompleted.has(action))
  
  if (availableActions.length === 0) {
    console.log('[FaceDetector] All actions have been completed')
    return
  }
  
  // 随机选择一个动作
  currentRandomAction = availableActions[Math.floor(Math.random() * availableActions.length)]
  currentActionCompletedCount = 0
  
  // 更新提示文本
  updateActionPrompt(currentRandomAction)
  emit(FACE_DETECTOR_EVENTS.LIVENESS_ACTION, { action: currentRandomAction, description: getActionDescription(currentRandomAction), status: LivenessActionStatus.STARTED })
  
  console.log('[FaceDetector] Selected action:', currentRandomAction)
  
  // 设置超时定时器
  if (actionTimeoutId) clearTimeout(actionTimeoutId)
  actionTimeoutId = setTimeout(() => {
    if (currentRandomAction) {
      emit(FACE_DETECTOR_EVENTS.LIVENESS_ACTION, { action: currentRandomAction, description: getActionDescription(currentRandomAction), status: LivenessActionStatus.TIMEOUT })
      console.error('[FaceDetector] Action timeout:', currentRandomAction)
      emit(FACE_DETECTOR_EVENTS.ERROR, { message: `动作检测超时（${props.livenessActionTimeout}秒）：未在规定时间内检测到${getActionDescription(currentRandomAction)}，请重试` })
      stopDetection()
    }
  }, props.livenessActionTimeout * 1000)
}

/**
 * 更新视频容器边框颜色
 */
function updateBorderColor(faceInfo: FaceInfo): void {
  // 判断面部信息状态
  if (faceInfo.count === 0) {
    // 未检测到人脸：灰色
    videoBorderColor.value = BORDER_COLOR_STATES.IDLE
  } else if (faceInfo.count > 1) {
    // 检测到多个人脸：红色
    videoBorderColor.value = BORDER_COLOR_STATES.MULTIPLE_FACES
  } else {
    // 检测到单个人脸，检查是否符合条件
    const isSizeValid = faceInfo.size > props.minFaceRatio && faceInfo.size < props.maxFaceRatio
    const isFrontalValid = faceInfo.frontal >= props.minFrontal
    
    if (isSizeValid && isFrontalValid) {
      // 条件都满足：绿色
      videoBorderColor.value = BORDER_COLOR_STATES.PERFECT
    } else if (isSizeValid || isFrontalValid) {
      // 条件部分满足：黄色
      videoBorderColor.value = BORDER_COLOR_STATES.PARTIAL
    } else {
      // 条件都不满足：橙色
      videoBorderColor.value = BORDER_COLOR_STATES.INVALID
    }
  }
}

/**
 * 获取动作的描述文本
 */
function getActionDescription(action: string): string {
  return ACTION_DESCRIPTIONS[action] || action
}

/**
 * 更新摄像头上的提示文本
 */
function updateActionPrompt(action: LivenessAction): void {
  const prompt = `请${getActionDescription(action)}`
  actionPromptText.value = prompt
  console.log('[FaceDetector] Prompt updated:', prompt)
}

/**
 * 检测指定的动作是否被执行
 */
function detectAction(action: string, gestures: any): boolean {
  if (action === LivenessAction.BLINK && gestures) {
    // 眨眼检测：检查 gesture 中是否包含 'blink'
    return gestures.some((g: any) => g.gesture?.includes('blink'))
    
  } else if (action === LivenessAction.MOUTH_OPEN && gestures) {
    // 张嘴检测：检查嘴巴是否打开（任何打开百分比 > 0%）
    return gestures.some((g: any) => {
      const mouthGesture = g.gesture
      if (!mouthGesture?.includes('mouth')) return false
      
      // 提取嘴巴打开的百分比
      const percentMatch = mouthGesture.match(/mouth (\d+)% open/)?.[1]
      const percent = percentMatch ? parseInt(percentMatch) : 0
      
      // 判断嘴巴打开（> 20% 认为是打开状态）
      return percent > 20
    })
    
  } else if (action === LivenessAction.NOD && gestures) {
    // 点头检测：使用 head 动作序列判定
    // 规则：检测到 "head up" -> "head down" -> "head up" 这样的序列
    
    // 获取当前帧的 head 动作
    const currentHead = gestures.find((g: any) => g.gesture?.includes('head'))?.gesture
    
    if (currentHead) {
      // 提取 head 方向（up/down）
      const headDirection = currentHead.match(/(up|down)/)?.[0]
      
      if (headDirection && headDirection !== nodHeadSequence[nodHeadSequence.length - 1]) {
        // 方向改变时，添加到序列中
        nodHeadSequence.push(headDirection)
        
        // 检查是否完成了点头动作
        // 检测模式：up -> down -> up（模拟点头的上-下-上运动）
        if (nodHeadSequence.length >= 3) {
          const seq = nodHeadSequence
          const isNodGesture = seq[seq.length - 3] === 'up' && seq[seq.length - 2] === 'down' && seq[seq.length - 1] === 'up'
          
          if (isNodGesture) {
            nodHeadSequence = [] // 重置序列
            return true
          }
        }
      }
    }
  }
  
  return false
}

// ===== 工具方法 =====
/**
 * 显示捕获的人脸图片到结果画布上
 */
function displayResultImage(resultImageBase64: string): void {
  if (!resultImageBase64 || !canvasRef.value) return
  
  try {
    // 创建图片对象
    const img = new Image()
    img.onload = () => {
      // 获取结果画布的宽高
      const canvasWidth = canvasRef.value!.width
      const canvasHeight = canvasRef.value!.height
      
      // 在结果画布上绘制图片
      const ctx = canvasRef.value!.getContext('2d')
      if (!ctx) return
      
      // 清空画布
      ctx.clearRect(0, 0, canvasWidth, canvasHeight)
      
      // 计算圆形内切区域的中心和半径
      const centerX = canvasWidth / 2
      const centerY = canvasHeight / 2
      const radius = Math.min(canvasWidth, canvasHeight) / 2
      
      // 保存当前状态
      ctx.save()
      
      // 创建圆形裁剪区域
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.clip()
      
      // 获取图片的中心最大正方形的内切圆
      // 图片宽高
      const imgWidth = img.width
      const imgHeight = img.height
      
      // 计算图片中心最大正方形的边长（取较小的维度）
      const squareSize = Math.min(imgWidth, imgHeight)
      
      // 最大正方形的内切圆半径
      const squareRadius = squareSize / 2
      
      // 将图片缩放到画布大小并显示中心最大正方形的内切圆
      // 计算缩放比例（使正方形的内切圆填充画布的圆形）
      const scale = radius / squareRadius
      
      // 计算绘制位置
      const drawX = (canvasWidth - imgWidth * scale) / 2
      const drawY = (canvasHeight - imgHeight * scale) / 2
      
      // 绘制图片到结果画布
      ctx.drawImage(img, drawX, drawY, imgWidth * scale, imgHeight * scale)
      
      // 恢复状态
      ctx.restore()
      
      // 标记为显示结果状态
      isShowingResult.value = true
      
      console.log('[FaceDetector] Captured face image displayed on result canvas (circular, center max square inscribed circle)')
    }
    
    img.onerror = () => {
      console.error('[FaceDetector] Failed to load captured face image')
    }
    
    img.src = resultImageBase64
  } catch (e) {
    console.error('[FaceDetector] Failed to display captured face image:', e)
  }
}

/**
 * 捕获当前视频帧并转换为 JPEG 图片
 * @returns {string} Base64 格式的 JPEG 图片数据
 */
function captureFrame(): string | null {
  try {
    const c = document.createElement('canvas')
    if (!videoRef.value) return null
    
    c.width = videoRef.value.videoWidth || videoWidth.value
    c.height = videoRef.value.videoHeight || videoHeight.value
    
    const ctx = c.getContext('2d')
    if (!ctx) return null
    
    ctx.drawImage(videoRef.value, 0, 0, c.width, c.height)
    
    const imageData = c.toDataURL('image/jpeg', 0.9)
    console.log('[FaceDetector] Frame captured, size:', imageData.length)
    return imageData
  } catch (e) {
    console.error('[FaceDetector] Failed to capture frame:', e)
    return null
  }
}

/**
 * 根据人脸区域裁切当前视频帧并转换为 JPEG 图片
 * @param {Array} faceBox - 人脸边界框 [x, y, width, height]
 * @returns {string} Base64 格式的 JPEG 图片数据（只包含人脸区域）
 */
function captureFaceFrame(faceBox: number[]): string | null {
  try {
    if (!faceBox || !videoRef.value) {
      console.warn('[FaceDetector] Invalid faceBox, using full frame')
      return captureFrame()
    }

    const [x, y, width, height] = faceBox
    
    // 创建裁切后的 canvas
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    
    const ctx = c.getContext('2d')
    if (!ctx) return null
    
    // 从视频中裁切人脸区域
    ctx.drawImage(
      videoRef.value,
      x, y, width, height,      // 源区域（视频中的人脸位置）
      0, 0, width, height        // 目标区域（canvas）
    )
    
    const croppedImageData = c.toDataURL('image/jpeg', 0.9)
    console.log('[FaceDetector] Face frame captured and cropped, size:', croppedImageData.length, 'box:', faceBox)
    return croppedImageData
  } catch (e) {
    console.error('[FaceDetector] Failed to capture face frame:', e)
    // 降级：返回完整帧
    return captureFrame()
  }
}

/**
 * 进行静默活体检测（自动检测采集的图片是否为真实人脸）
 * 使用 Human.js 的 liveness 检测能力
 */
async function performSilentLivenessDetection(): Promise<void> {
  if (!silentLivenessCapturedImage) {
    console.error('[FaceDetector] No captured image for silent liveness detection')
    emit(FACE_DETECTOR_EVENTS.ERROR, { message: '未能捕获图片，请重试' })
    return
  }

  if (!human) {
    console.error('[FaceDetector] Human.js not initialized')
    emit(FACE_DETECTOR_EVENTS.ERROR, { message: 'AI 检测引擎未初始化，请稍后重试' })
    return
  }

  try {
    console.log('[FaceDetector] Starting silent liveness detection on captured image')
    
    // 创建临时图片对象用于 Human.js 检测
    const tempImg = new Image()
    
    tempImg.onload = async () => {
      try {
        // 使用 Human.js 的检测功能分析采集的图片
        const result = await human!.detect(tempImg)
        
        if (!result) {
          console.warn('[FaceDetector] Human.js detection returned no result')
          emit(FACE_DETECTOR_EVENTS.ERROR, { message: '活体检测失败，无法分析图片，请重试' })
          resetSilentLiveness()
          return
        }

        console.log('[FaceDetector] Liveness detection result:', {
          faces: result.face?.length || 0,
          faceData: result.face?.[0]
        })

        // 提取 liveness 检测结果
        const faces = result.face || []
        if (faces.length === 0) {
          console.warn('[FaceDetector] No face detected in captured image for liveness check')
          emit(FACE_DETECTOR_EVENTS.ERROR, { message: '未在图片中检测到人脸，请确保采集了清晰的人脸照片' })
          resetSilentLiveness()
          return
        }

        // 获取第一张脸的数据
        const faceData = faces[0] as any
        
        // Human.js liveness 返回两个值：real 和 spoof
        // real: 真实人脸的置信度 [0-1]
        // spoof: 欺骗/合成的置信度 [0-1]
        const livenessData = faceData.liveness || []
        
        console.log('[FaceDetector] Liveness data structure:', livenessData)

        if (!Array.isArray(livenessData) || livenessData.length === 0) {
          console.warn('[FaceDetector] No liveness data in detection result')
          emit(FACE_DETECTOR_EVENTS.ERROR, { message: '无法获取活体检测结果，请重试' })
          resetSilentLiveness()
          return
        }

        // 通常格式为 [{label: 'real', value: x}, {label: 'spoof', value: y}]
        // 或者直接是 [{real: x, spoof: y}] 这样的格式
        let realScore = 0
        
        if (typeof livenessData[0] === 'object') {
          if ('label' in livenessData[0] && 'value' in livenessData[0]) {
            // 格式 1: 带 label 的对象数组
            const realObj = livenessData.find((item: any) => item.label === 'real')
            realScore = realObj ? realObj.value : 0
          } else if ('real' in livenessData[0]) {
            // 格式 2: 直接包含 real/spoof 的对象
            realScore = livenessData[0].real || 0
          }
        }

        console.log('[FaceDetector] Liveness score (real):', realScore, 'threshold:', props.silentLivenessThreshold)

        // 判断是否通过活体检测
        // 将百分比阈值转换为小数进行比较
        const thresholdDecimal = props.silentLivenessThreshold / 100
        if (realScore >= thresholdDecimal) {
          console.log('[FaceDetector] Liveness detection PASSED')
          
          // 显示采集的图片到画布
          displayCapturedImageOnCanvas()
          
          // 发送成功事件
          emit(FACE_DETECTOR_EVENTS.LIVENESS_COMPLETED, {
            faceImageData: silentLivenessCapturedImage,
            liveness: realScore
          })
          
          stopDetection()
        } else {
          console.warn('[FaceDetector] Liveness detection FAILED, score:', realScore)
          emit(FACE_DETECTOR_EVENTS.ERROR, { 
            message: `活体检测失败（得分 ${(realScore * 100).toFixed(1)}%），请确保是真实人脸，重新开始检测` 
          })
          resetSilentLiveness()
        }
      } catch (e) {
        console.error('[FaceDetector] Error during liveness analysis:', e)
        emit(FACE_DETECTOR_EVENTS.ERROR, { message: `活体检测出错: ${e instanceof Error ? e.message : '未知错误'}` })
        resetSilentLiveness()
      }
    }

    tempImg.onerror = () => {
      console.error('[FaceDetector] Failed to load captured image for liveness detection')
      emit(FACE_DETECTOR_EVENTS.ERROR, { message: '无法加载采集的图片进行活体检测' })
      resetSilentLiveness()
    }

    // 加载采集的图片
    tempImg.src = silentLivenessCapturedImage
  } catch (e) {
    console.error('[FaceDetector] Error in performSilentLivenessDetection:', e)
    emit(FACE_DETECTOR_EVENTS.ERROR, { message: `活体检测异常: ${e instanceof Error ? e.message : '未知错误'}` })
    resetSilentLiveness()
  }
}

/**
 * 将采集的完整摄像头图片显示到画布上
 */
function displayCapturedImageOnCanvas(): void {
  if (!silentLivenessCapturedImage || !canvasRef.value) return
  
  try {
    const img = new Image()
    img.onload = () => {
      const ctx = canvasRef.value!.getContext('2d')
      if (!ctx) return
      
      ctx.drawImage(img, 0, 0, canvasRef.value!.width, canvasRef.value!.height)
      console.log('[FaceDetector] Captured image displayed on canvas after liveness verification')
    }
    
    img.src = silentLivenessCapturedImage
  } catch (e) {
    console.error('[FaceDetector] Failed to display captured image:', e)
  }
}

/**
 * 重置静默活体检测状态，准备重新检测
 */
function resetSilentLiveness(): void {
  console.log('[FaceDetector] Resetting silent liveness state for retry')
  silentLivenessStarted = false
  silentLivenessCapturedImage = null
  
  // 继续检测
  setTimeout(detect, 500)
}

/**
 * 在画布上绘制人脸检测框（正方形）
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {Array} faces - 人脸数组
 * @param {string} color - 检测框颜色
 */
function drawFaces(ctx: CanvasRenderingContext2D, faces: any[], color: string): void {
  faces.forEach(f => {
    const box = f.box || f.boxRaw
    if (box) {
      // box 格式：[x, y, width, height]
      const x = box[0]
      const y = box[1]
      const width = box[2]
      const height = box[3]
      
      // 绘制矩形框
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, width, height)
    }
  })
}

// 暴露方法供父组件调用
defineExpose({ startDetection, stopDetection })
</script>

<style scoped>
/* 人脸检测主容器样式 */
.face-detector {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 15px;
}

/* 设备信息展示样式 */
.device-info {
  font-size: 12px;
  color: #999;
  margin-bottom: 10px;
}

/* 视频容器样式 */
.video-container {
  position: relative;
  width: 100%;
  max-width: 640px;
  aspect-ratio: 1; /* 保持 1:1 的正方形比例 */
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 6px solid #ddd;  /* 增大边框 */
  transition: border-color 0.3s ease;  /* 平滑过渡 */
  box-sizing: border-box;
}

/* 视频和画布共同样式 */
video, canvas {
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  box-sizing: border-box;
  border-radius: 50%;  /* 圆形 */
}

/* 视频元素样式 */
video {
  background: #000;       /* 黑色背景 */
  object-fit: cover;      /* 填充覆盖模式 */
  display: block;
}

/* 画布元素样式 */
canvas {
  position: absolute;     /* 绝对定位，覆盖在视频上方 */
  top: 0;
  left: 0;
  background: transparent;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  box-sizing: border-box;
  border-radius: 50%;  /* 圆形 */
  z-index: 5;
}

/* 活体检测提示文本样式 */
.action-prompt {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  z-index: 10;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
