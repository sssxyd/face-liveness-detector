<!-- 人脸检测组件模板 -->
<template>
  <!-- 主容器，根据移动设备状态动态添加样式类 -->
  <div class="face-detector" :class="{ 'is-mobile': isMobileDevice }">
    <!-- 视频容器：包含视频元素和绘制检测结果的画布 -->
    <div class="video-container" :style="{ borderColor: videoBorderColor }">
      <!-- 结果画布：用于显示采集的图片或最后一帧（z-index最低） -->
      <canvas 
        ref="resultCanvasRef" 
        :width="videoWidth" 
        :height="videoHeight"
        class="result-canvas"
      ></canvas>
      <!-- 视频元素：用于捕获摄像头实时视频流 -->
      <video ref="videoRef" autoplay playsinline muted :width="videoWidth" :height="videoHeight"></video>
      <!-- 画布元素：用于绘制人脸检测框（检测过程） -->
      <canvas 
        ref="canvasRef" 
        :width="videoWidth" 
        :height="videoHeight"
        class="detection-canvas"
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
import { ref, computed, onMounted, onUnmounted, Ref, reactive } from 'vue'
// 导入人脸检测库
import Human from '@vladmandic/human'
// 导入类型定义
import type { FaceInfo, FaceCollectedData, LivenessCompletedData, LivenessActionData, ErrorData, FaceDetectorProps } from './face-detector'
import { DetectionMode, LivenessAction, LivenessActionStatus, ACTION_DESCRIPTIONS, FACE_DETECTOR_EVENTS, BORDER_COLOR_STATES, CONFIG } from './face-detector'

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
// 画布元素引用，用于绘制检测框
const canvasRef: Ref<HTMLCanvasElement | null> = ref(null)
// 结果画布元素引用，用于显示采集的图片或最后一帧
const resultCanvasRef: Ref<HTMLCanvasElement | null> = ref(null)
// 是否为移动设备
const isMobileDevice: Ref<boolean> = ref(false)
// 是否为竖屏方向
const isPortrait: Ref<boolean> = ref(true)
// 是否正在进行检测
const isDetecting: Ref<boolean> = ref(false)

// 视频画布上下文
let canvasCtx: CanvasRenderingContext2D | null = null
// 结果画布上下文
let resultCanvasCtx: CanvasRenderingContext2D | null = null

// 缓存的临时 canvas 对象（用于画面捕获）
let captureCanvas: HTMLCanvasElement | null = null
let captureCtx: CanvasRenderingContext2D | null = null

// 视频宽度
let videoWidth: Ref<number> = ref(CONFIG.DETECTION.DEFAULT_VIDEO_WIDTH)
// 视频高度
let videoHeight: Ref<number> = ref(CONFIG.DETECTION.DEFAULT_VIDEO_HEIGHT)
// Human 检测库实例
let human: Human | null = null
// 摄像头流对象
let stream: MediaStream | null = null



// ===== 活体检测相关类型定义 =====
interface DetectionState {
  currentLivenessIndex: number
  livenessCompleted: Set<LivenessAction>
  baselineFaceData: string | null
  livenessStarted: boolean
  nodHeadSequence: string[]
  silentLivenessStarted: boolean
  silentLivenessCapturedImage: string | null
  currentRandomAction: LivenessAction | null
  currentActionCompletedCount: number
  actionTimeoutId: ReturnType<typeof setTimeout> | null
  detectionTimeoutId: ReturnType<typeof setTimeout> | null
}

// ===== 活体检测相关变量 =====
const detectionState = reactive<DetectionState>({
  currentLivenessIndex: 0,
  livenessCompleted: new Set(),
  baselineFaceData: null,
  livenessStarted: false,
  nodHeadSequence: [],
  silentLivenessStarted: false,
  silentLivenessCapturedImage: null,
  currentRandomAction: null,
  currentActionCompletedCount: 0,
  actionTimeoutId: null,
  detectionTimeoutId: null
})

// 摄像头上显示的提示文本
const actionPromptText: Ref<string> = ref('')
// 视频容器的边框颜色状态
const videoBorderColor: Ref<string> = ref(BORDER_COLOR_STATES.IDLE)

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

  // 预先获取上下文
  canvasCtx = canvasRef.value?.getContext('2d') || null
  resultCanvasCtx = resultCanvasRef.value?.getContext('2d') || null
})

// 组件卸载时清理资源
onUnmounted(() => {
  stopDetection()
  window.removeEventListener('orientationchange', handleOrientationChange)
  // 清理缓存的临时 canvas
  captureCanvas = null
  captureCtx = null
})

// ===== 常量定义 =====
// 使用 CONFIG 替代本地常量定义（已从 face-detector.ts 导入）

// ===== 设备检测与方向处理 =====
/**
 * 检测设备类型和屏幕方向，并调整视频尺寸
 */
function detectDevice(): void {
  // 判断是否为移动设备
  isMobileDevice.value = navigator.userAgent.toLowerCase().match(/android|iphone/) !== null || window.innerWidth < CONFIG.MOBILE.WIDTH_THRESHOLD
  // 判断是否为竖屏
  isPortrait.value = window.innerHeight >= window.innerWidth
  
  if (isMobileDevice.value) {
    // 移动设备：尽量适配屏幕尺寸
    videoWidth.value = Math.min(window.innerWidth - CONFIG.MOBILE.VIDEO_WIDTH_OFFSET, CONFIG.MOBILE.MAX_WIDTH)
    videoHeight.value = Math.min(window.innerHeight - CONFIG.MOBILE.VIDEO_HEIGHT_OFFSET, CONFIG.MOBILE.MAX_HEIGHT)
  } else {
    // 桌面设备：使用固定尺寸
    videoWidth.value = CONFIG.DETECTION.DEFAULT_VIDEO_WIDTH
    videoHeight.value = CONFIG.DETECTION.DEFAULT_VIDEO_HEIGHT
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
    // 重新初始化上下文
    canvasCtx = null
    resultCanvasCtx = null
    detectDevice()
    // 延迟重启，确保 DOM 更新完成
    setTimeout(() => {
      canvasCtx = canvasRef.value?.getContext('2d') || null
      resultCanvasCtx = resultCanvasRef.value?.getContext('2d') || null
      startDetection()
    }, 500)
  }
}

// ===== 检测控制方法 =====
/**
 * 重置检测状态和画布
 */
function resetDetectionState(): void {
  // 标记为正在检测
  isDetecting.value = true
  
  // 重置边框颜色为初始状态
  videoBorderColor.value = BORDER_COLOR_STATES.IDLE
  
  // 重置活体检测相关索引和状态
  detectionState.currentLivenessIndex = 0
  detectionState.livenessCompleted.clear()
  detectionState.nodHeadSequence = []
  detectionState.baselineFaceData = null
  detectionState.livenessStarted = false
  detectionState.silentLivenessStarted = false
  detectionState.silentLivenessCapturedImage = null
  detectionState.currentRandomAction = null
  detectionState.currentActionCompletedCount = 0
  actionPromptText.value = ''
  
  // 清空所有定时器
  if (detectionState.detectionTimeoutId) clearTimeout(detectionState.detectionTimeoutId)
  if (detectionState.actionTimeoutId) clearTimeout(detectionState.actionTimeoutId)
  
  // 清空两个 canvas
  // 清空结果画布
  if (resultCanvasCtx) {
    resultCanvasCtx.clearRect(0, 0, resultCanvasRef.value!.width, resultCanvasRef.value!.height)
  }
  
  // 清空检测画布
  if (canvasCtx) {
    canvasCtx.clearRect(0, 0, canvasRef.value!.width, canvasRef.value!.height)
  }
}

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
    
    // 重置检测状态和画布
    resetDetectionState()
    
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
      }, CONFIG.DETECTION.VIDEO_LOAD_TIMEOUT)
      
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
  
  if (detectionState.detectionTimeoutId) clearTimeout(detectionState.detectionTimeoutId)
  if (detectionState.actionTimeoutId) clearTimeout(detectionState.actionTimeoutId)
  if (stream) stream.getTracks().forEach(t => t.stop())

  if (success && detectionState.baselineFaceData) {
    displayResultImage(detectionState.baselineFaceData)
  } else {
    const lastFrameImageBase64 = captureFrame()
    if (lastFrameImageBase64) {
      displayResultImage(lastFrameImageBase64)
    }
  }
  
  // 清空检测画布
  if (canvasCtx) {
    canvasCtx.clearRect(0, 0, canvasRef.value!.width, canvasRef.value!.height)
  }
  
  // 停止视频
  if (videoRef.value) videoRef.value.srcObject = null
}

// ===== 人脸检测与活体验证核心逻辑 =====

/**
 * 处理检测到单张人脸的情况
 * @param {Object} face - 人脸数据
 * @param {Array} faceBox - 人脸边界框 [x, y, width, height]
 * @param {number} faceRatio - 人脸占画面比例 (%)
 * @param {number} frontal - 人脸正对度评分 (0-100)
 * @param {Array} gestures - 检测到的手势/表情
 */
function handleSingleFace(face: any, faceBox: number[], faceRatio: number, frontal: number, gestures: any): void {
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
    if (!canvasCtx) return
    canvasCtx.clearRect(0, 0, videoWidth.value, videoHeight.value)
    drawFaces(canvasCtx, [face], 'green')
    
    // 根据检测模式处理
    if (props.mode === DetectionMode.COLLECTION) {
      handleCollectionMode(faceBox)
    } else if (props.mode === DetectionMode.SILENT_LIVENESS) {
      handleSilentLivenessMode(faceBox)
    } else if (props.mode === DetectionMode.LIVENESS) {
      handleLivenessMode(gestures, faceBox)
    }
  } else {
    // 人脸不符合条件，继续检测
    console.log('[FaceDetector] Face not valid, ratio:', faceRatio, 'frontal:', frontal)
    if (canvasCtx) {
      canvasCtx.clearRect(0, 0, videoWidth.value, videoHeight.value)
      drawFaces(canvasCtx, [face], 'orange')
    }
    setTimeout(detect, CONFIG.DETECTION.DETECTION_FRAME_DELAY)
  }
}

/**
 * 处理检测到多个或零个人脸的情况
 * @param {number} faceCount - 人脸数量
 */
function handleMultipleFaces(faceCount: number): void {
  const faceInfo: FaceInfo = { 
    count: faceCount,
    size: 0,
    frontal: 0
  }
  emit(FACE_DETECTOR_EVENTS.FACE_DETECTED, { faceInfo })
  // 更新边框颜色
  updateBorderColor(faceInfo)
  
  // 在 LIVENESS 或 SILENT_LIVENESS 模式下，如果已开始活体检测，不能检测不到人脸或多个人脸
  if (props.mode === DetectionMode.LIVENESS && detectionState.livenessStarted && faceCount !== 1) {
    console.error('[FaceDetector] Face count changed during liveness detection, expected 1 but got', faceCount)
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { message: `检测到人脸数量变化，期望1张，实际${faceCount}张。请保持正脸对着摄像头，重新开始检测。` })
    stopDetection()
    return
  }
  
  if (props.mode === DetectionMode.SILENT_LIVENESS && detectionState.silentLivenessStarted && faceCount !== 1) {
    console.error('[FaceDetector] Face count changed during silent liveness detection, expected 1 but got', faceCount)
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { message: `检测到人脸数量变化，期望1张，实际${faceCount}张。请保持正脸对着摄像头，重新开始检测。` })
    stopDetection()
    return
  }

  setTimeout(detect, CONFIG.DETECTION.DETECTION_FRAME_DELAY)
}

/**
 * 处理采集模式：检测到合格人脸后裁切并返回图片
 * @param {Array} faceBox - 人脸边界框 [x, y, width, height]
 */
function handleCollectionMode(faceBox: number[]): void {
  detectionState.baselineFaceData = captureFaceFrame(faceBox)
  emit(FACE_DETECTOR_EVENTS.FACE_COLLECTED, { faceImageData: detectionState.baselineFaceData })
  videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
  stopDetection(true)
}

/**
 * 处理静默活体检测模式：采集图片后自动进行活体检测
 * @param {Array} faceBox - 人脸边界框 [x, y, width, height]
 */
function handleSilentLivenessMode(faceBox: number[]): void {
  if (!detectionState.silentLivenessStarted) {
    console.log('[FaceDetector] Valid face detected, entering silent liveness detection')
    detectionState.silentLivenessCapturedImage = captureFrame()  // 捕获完整摄像头照片
    detectionState.baselineFaceData = captureFaceFrame(faceBox)  // 也保存裁切后的人脸
    detectionState.silentLivenessStarted = true
    
    // 异步执行活体检测
    performSilentLivenessDetection()
  }
}

/**
 * 处理活体检测模式：需要用户执行指定动作
 * @param {Array} gestures - 检测到的手势/表情
 * @param {Array} faceBox - 人脸边界框 [x, y, width, height]
 */
function handleLivenessMode(gestures: any, faceBox: number[]): void {
  verifyLiveness(gestures, faceBox)
}

/**
 * 检测循环：不断获取视频帧进行人脸检测
 */
async function detect(): Promise<void> {
  if (!isDetecting.value) return
  
  try {
    // 快速检查必需的对象
    if (!videoRef.value || !canvasRef.value || !human) {
      console.warn('[FaceDetector] Missing required objects, retrying...')
      setTimeout(detect, CONFIG.DETECTION.DETECTION_FRAME_DELAY)
      return
    }
    
    // 对当前视频帧进行人脸检测
    console.log('[FaceDetector] Running detection...')
    const result = await human.detect(videoRef.value)
    console.log('[FaceDetector] Detection result:', result.face?.length || 0, 'faces')
    
    // 使用缓存的 canvas 上下文
    if (!canvasCtx) {
      console.error('[FaceDetector] Canvas context is not available')
      setTimeout(detect, CONFIG.DETECTION.DETECTION_FRAME_DELAY)
      return
    }
    canvasCtx.clearRect(0, 0, videoWidth.value, videoHeight.value)
    
    // 获取检测到的所有人脸
    const faces = result.face || []
    
    if (faces.length === 1) {
      // 处理单人脸的情况
      const face = faces[0] as any
      const faceBox = face.box || face.boxRaw
      
      if (!faceBox) {
        setTimeout(detect, CONFIG.DETECTION.DETECTION_FRAME_DELAY)
        return
      }
      
      // 计算人脸占视频画面的比例 (%)
      const faceRatio = (faceBox[2] * faceBox[3]) / (videoWidth.value * videoHeight.value) * 100
      
      // 检查人脸是否正对摄像头 (0-100 分数)
      const frontal = checkFaceFrontal(face, result.gesture)
      
      handleSingleFace(face, faceBox, faceRatio, frontal, result.gesture)
    } else {
      // 处理多人脸或无人脸的情况
      handleMultipleFaces(faces.length)
    }
  } catch (error) {
    console.error('[FaceDetector] Detection error:', error)
    // 发生错误时继续检测
    setTimeout(detect, CONFIG.DETECTION.ERROR_RETRY_DELAY)
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
  const yawThreshold = CONFIG.LIVENESS.FRONTAL_YAW_THRESHOLD
  const yawPenalty = Math.abs(ang.yaw) > yawThreshold 
    ? Math.abs(ang.yaw) - yawThreshold  // 超出部分作为惩罚
    : 0
  // yaw 每超过 1° 扣 15 分
  score -= yawPenalty * 15
  
  // Pitch 角度惩罚（上下俯仰）- 权重中等 (25%)
  // 目标：pitch 应该在 ±4° 以内
  const pitchThreshold = CONFIG.LIVENESS.FRONTAL_PITCH_THRESHOLD
  const pitchPenalty = Math.abs(ang.pitch) > pitchThreshold 
    ? Math.abs(ang.pitch) - pitchThreshold
    : 0
  // pitch 每超过 1° 扣 10 分
  score -= pitchPenalty * 10
  
  // Roll 角度惩罚（旋转）- 权重最低 (15%)
  // 目标：roll 应该在 ±2° 以内
  const rollThreshold = CONFIG.LIVENESS.FRONTAL_ROLL_THRESHOLD
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
    if (detectionState.currentLivenessIndex === 0 && detectionState.livenessCompleted.size === 0 && !detectionState.baselineFaceData) {
    console.log('[FaceDetector] First valid face detected in liveness mode, capturing baseline')
    detectionState.baselineFaceData = captureFaceFrame(faceBox)
    // 标记活体检测已开始，后续 detect 方法需要检查人脸数量
    detectionState.livenessStarted = true
    
    // 选择第一个随机动作
    selectNextRandomAction()
  }
  
  // 检查是否达到动作次数限制
  if (detectionState.currentLivenessIndex >= normalizedLivenessActionCount.value) {
    console.log('[FaceDetector] All liveness checks completed')
    // 设置成功颜色
    videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
    // 抛出 liveness-completed 事件
    emit(FACE_DETECTOR_EVENTS.LIVENESS_COMPLETED, { faceImageData: detectionState.baselineFaceData, liveness: 1.0 })
    stopDetection(true)
    return
  }  // 获取当前需要检测的随机动作
  if (!detectionState.currentRandomAction) {
    console.warn('[FaceDetector] No current action selected')
    setTimeout(detect, CONFIG.DETECTION.DETECTION_FRAME_DELAY)
    return
  }
  
  // 检测当前帧是否有指定的动作
  const detected = detectAction(detectionState.currentRandomAction, gestures)
  
  // 如果检测到动作
  if (detected) {
    detectionState.currentActionCompletedCount++
    console.log('[FaceDetector] Action detected:', detectionState.currentRandomAction, 'count:', detectionState.currentActionCompletedCount)
    
    // 检查是否达到了所需的次数
    if (detectionState.currentActionCompletedCount >= normalizedLivenessActionCount.value) {
      console.log('[FaceDetector] Liveness action completed:', detectionState.currentRandomAction)
      emit(FACE_DETECTOR_EVENTS.LIVENESS_ACTION, { action: detectionState.currentRandomAction, description: getActionDescription(detectionState.currentRandomAction), status: LivenessActionStatus.COMPLETED })
      detectionState.livenessCompleted.add(detectionState.currentRandomAction)
      detectionState.currentLivenessIndex++
      
      // 清空当前动作信息，准备选择下一个
      detectionState.currentRandomAction = null
      detectionState.currentActionCompletedCount = 0
      
      // 清除超时定时器
      if (detectionState.actionTimeoutId) clearTimeout(detectionState.actionTimeoutId)
      detectionState.actionTimeoutId = null
      actionPromptText.value = ''
      
      // 继续检测下一帧
      setTimeout(detect, CONFIG.DETECTION.DETECTION_FRAME_DELAY)
    }
  }
  
  // 继续检测下一帧
  setTimeout(detect, CONFIG.DETECTION.DETECTION_FRAME_DELAY)
}

/**
 * 选择下一个随机的活体检测动作
 */
function selectNextRandomAction(): void {
  // 从未完成的动作中随机选择
  const availableActions = props.livenessChecks.filter(action => !detectionState.livenessCompleted.has(action))
  
  if (availableActions.length === 0) {
    console.log('[FaceDetector] All actions have been completed')
    return
  }
  
  // 随机选择一个动作
  detectionState.currentRandomAction = availableActions[Math.floor(Math.random() * availableActions.length)]
  detectionState.currentActionCompletedCount = 0
  
  // 更新提示文本
  updateActionPrompt(detectionState.currentRandomAction)
  emit(FACE_DETECTOR_EVENTS.LIVENESS_ACTION, { action: detectionState.currentRandomAction, description: getActionDescription(detectionState.currentRandomAction), status: LivenessActionStatus.STARTED })
  
  console.log('[FaceDetector] Selected action:', detectionState.currentRandomAction)
  
  // 设置超时定时器
  if (detectionState.actionTimeoutId) clearTimeout(detectionState.actionTimeoutId)
  detectionState.actionTimeoutId = setTimeout(() => {
    if (detectionState.currentRandomAction) {
      emit(FACE_DETECTOR_EVENTS.LIVENESS_ACTION, { action: detectionState.currentRandomAction, description: getActionDescription(detectionState.currentRandomAction), status: LivenessActionStatus.TIMEOUT })
      console.error('[FaceDetector] Action timeout:', detectionState.currentRandomAction)
      // 设置错误颜色
      videoBorderColor.value = BORDER_COLOR_STATES.ERROR
      emit(FACE_DETECTOR_EVENTS.ERROR, { message: `动作检测超时（${props.livenessActionTimeout}秒）：未在规定时间内检测到${getActionDescription(detectionState.currentRandomAction)}，请重试` })
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
      return percent > CONFIG.LIVENESS.MIN_MOUTH_OPEN_PERCENT
    })
    
  } else if (action === LivenessAction.NOD && gestures) {
    // 点头检测：使用 head 动作序列判定
    // 规则：检测到 "head up" -> "head down" -> "head up" 这样的序列
    
    // 获取当前帧的 head 动作
    const currentHead = gestures.find((g: any) => g.gesture?.includes('head'))?.gesture
    
    if (currentHead) {
      // 提取 head 方向（up/down）
      const headDirection = currentHead.match(/(up|down)/)?.[0]
      
      if (headDirection && headDirection !== detectionState.nodHeadSequence[detectionState.nodHeadSequence.length - 1]) {
        // 方向改变时，添加到序列中
        detectionState.nodHeadSequence.push(headDirection)
        
        // 检查是否完成了点头动作
        // 检测模式：up -> down -> up（模拟点头的上-下-上运动）
        if (detectionState.nodHeadSequence.length >= CONFIG.LIVENESS.NOD_SEQUENCE_LENGTH) {
          const seq = detectionState.nodHeadSequence
          const isNodGesture = seq[seq.length - 3] === 'up' && seq[seq.length - 2] === 'down' && seq[seq.length - 1] === 'up'
          
          if (isNodGesture) {
            detectionState.nodHeadSequence = [] // 重置序列
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
  if (!resultImageBase64 || !resultCanvasRef.value) return
  
  try {
    // 创建图片对象
    const img = new Image()
    img.onload = () => {
      // 获取结果画布的宽高
      const canvasWidth = resultCanvasRef.value!.width
      const canvasHeight = resultCanvasRef.value!.height
      
      // 在结果画布上绘制图片
      if (!resultCanvasCtx) {
        console.error('[FaceDetector] Result canvas context is not available')
        return
      }
      
      // 清空画布
      resultCanvasCtx.clearRect(0, 0, canvasWidth, canvasHeight)
      
      // 图片宽高
      const imgWidth = img.width
      const imgHeight = img.height
      
      // 计算缩放比例，保持图片宽高比填充画布
      const scale = Math.max(canvasWidth / imgWidth, canvasHeight / imgHeight)
      
      // 缩放后的尺寸
      const scaledWidth = imgWidth * scale
      const scaledHeight = imgHeight * scale
      
      // 在画布中央绘制（居中）
      const drawX = (canvasWidth - scaledWidth) / 2
      const drawY = (canvasHeight - scaledHeight) / 2
      
      // 直接绘制整个图片，保持宽高比，CSS会通过圆形裁切处理
      resultCanvasCtx.drawImage(img, drawX, drawY, scaledWidth, scaledHeight)
      
      console.log('[FaceDetector] Image displayed on result canvas (CSS circle clipping)', {
        imgWidth,
        imgHeight,
        scale,
        scaledWidth,
        scaledHeight,
        canvasWidth,
        canvasHeight,
        aspectRatio: `${imgWidth}:${imgHeight}`
      })
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
    if (!videoRef.value) return null
    
    const videoWidth_actual = videoRef.value.videoWidth || videoWidth.value
    const videoHeight_actual = videoRef.value.videoHeight || videoHeight.value
    
    // 如果缓存的 canvas 尺寸不匹配，重新创建
    if (!captureCanvas || captureCanvas.width !== videoWidth_actual || captureCanvas.height !== videoHeight_actual) {
      captureCanvas = document.createElement('canvas')
      captureCanvas.width = videoWidth_actual
      captureCanvas.height = videoHeight_actual
      captureCtx = captureCanvas.getContext('2d')
    }
    
    if (!captureCtx) return null
    
    captureCtx.drawImage(videoRef.value, 0, 0, videoWidth_actual, videoHeight_actual)
    
    const imageData = captureCanvas.toDataURL('image/jpeg', 0.9)
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
    
    // 如果缓存的 canvas 尺寸不匹配，重新创建
    if (!captureCanvas || captureCanvas.width !== width || captureCanvas.height !== height) {
      captureCanvas = document.createElement('canvas')
      captureCanvas.width = width
      captureCanvas.height = height
      captureCtx = captureCanvas.getContext('2d')
    }
    
    if (!captureCtx) return null
    
    // 从视频中裁切人脸区域
    captureCtx.drawImage(
      videoRef.value,
      x, y, width, height,      // 源区域（视频中的人脸位置）
      0, 0, width, height        // 目标区域（canvas）
    )
    
    const croppedImageData = captureCanvas.toDataURL('image/jpeg', 0.9)
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
  if (!detectionState.silentLivenessCapturedImage) {
    console.error('[FaceDetector] No captured image for silent liveness detection')
    // 设置错误颜色
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { message: '未能捕获图片，请重试' })
    stopDetection()
    return
  }

  if (!human) {
    console.error('[FaceDetector] Human.js not initialized')
    // 设置错误颜色
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { message: 'AI 检测引擎未初始化，请稍后重试' })
    stopDetection()
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
          // 设置错误颜色
          videoBorderColor.value = BORDER_COLOR_STATES.ERROR
          emit(FACE_DETECTOR_EVENTS.ERROR, { message: '活体检测失败，无法分析图片，请重试' })
          stopDetection()
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
          // 设置错误颜色
          videoBorderColor.value = BORDER_COLOR_STATES.ERROR
          emit(FACE_DETECTOR_EVENTS.ERROR, { message: '未在图片中检测到人脸，请确保采集了清晰的人脸照片' })
          stopDetection()
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
          // 设置错误颜色
          videoBorderColor.value = BORDER_COLOR_STATES.ERROR
          emit(FACE_DETECTOR_EVENTS.ERROR, { message: '无法获取活体检测结果，请重试' })
          stopDetection()
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
          
          // 设置成功颜色
          videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
          
          // 发送成功事件
          emit(FACE_DETECTOR_EVENTS.LIVENESS_COMPLETED, {
            faceImageData: detectionState.silentLivenessCapturedImage,
            liveness: realScore
          })
          
          stopDetection(true)
        } else {
          console.warn('[FaceDetector] Liveness detection FAILED, score:', realScore)
          // 设置错误颜色
          videoBorderColor.value = BORDER_COLOR_STATES.ERROR
          emit(FACE_DETECTOR_EVENTS.ERROR, { 
            message: `活体检测失败（得分 ${(realScore * 100).toFixed(1)}%），请确保是真实人脸，重新开始检测` 
          })
          stopDetection()
        }
      } catch (e) {
        console.error('[FaceDetector] Error during liveness analysis:', e)
        // 设置错误颜色
        videoBorderColor.value = BORDER_COLOR_STATES.ERROR
        emit(FACE_DETECTOR_EVENTS.ERROR, { message: `活体检测出错: ${e instanceof Error ? e.message : '未知错误'}` })
        stopDetection()
      }
    }

    tempImg.onerror = () => {
      console.error('[FaceDetector] Failed to load captured image for liveness detection')
      // 设置错误颜色
      videoBorderColor.value = BORDER_COLOR_STATES.ERROR
      emit(FACE_DETECTOR_EVENTS.ERROR, { message: '无法加载采集的图片进行活体检测' })
      stopDetection()
    }

    // 加载采集的图片
    tempImg.src = detectionState.silentLivenessCapturedImage
  } catch (e) {
    console.error('[FaceDetector] Error in performSilentLivenessDetection:', e)
    // 设置错误颜色
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { message: `活体检测异常: ${e instanceof Error ? e.message : '未知错误'}` })
    stopDetection()
  }
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

/* 视频元素样式 */
video {
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  background: #000;       /* 黑色背景 */
  object-fit: cover;      /* 填充覆盖模式 */
  display: block;
  position: absolute;
  box-sizing: border-box;
  border-radius: 50%;  /* 圆形 */
  z-index: 2;
}

/* 结果画布样式（z-index最低，在视频和检测框下方） */
.result-canvas {
  position: absolute;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  background: transparent;
  box-sizing: border-box;
  border-radius: 50%;  /* 圆形裁剪 */
  overflow: hidden;    /* 超出部分隐藏 */
  z-index: 1;
}

/* 检测框画布样式（z-index最高，在所有元素上方） */
.detection-canvas {
  position: absolute;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  background: transparent;
  box-sizing: border-box;
  border-radius: 50%;  /* 圆形 */
  z-index: 3;
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
