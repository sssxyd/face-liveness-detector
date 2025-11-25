<!-- 人脸检测组件模板 -->
<template>
  <!-- 主容器，根据移动设备状态动态添加样式类 -->
  <div class="face-detector" :class="{ 'is-mobile': isMobileDevice }">
    <!-- 视频容器：包含视频元素和绘制检测结果的画布 -->
    <div class="video-container" :style="{ borderColor: videoBorderColor }">
      <!-- 视频元素：用于捕获摄像头实时视频流 -->
      <video ref="videoRef" autoplay playsinline muted :width="videoWidth" :height="videoHeight"></video>
      <!-- 结果图片：用于显示结果图片 -->
      <img  ref="resultImageRef" :src="resultImageSrc" class="result-image"/>      
      <!-- 动作提示文本 -->
      <div v-if="actionPromptText && show_action_prompt" class="action-prompt">{{ actionPromptText }}</div>
      <!-- 状态提示文本 -->
      <div v-if="statusPromptText && show_status_prompt" class="status-prompt">{{ statusPromptText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 导入 Vue 3 Composition API 相关方法
import { ref, computed, onMounted, onUnmounted, Ref, reactive } from 'vue'
// 导入人脸检测库
import Human, { FaceResult, GestureResult } from '@vladmandic/human'
// 导入类型定义
import type { ActionPromptData, LivenessCompletedData, ErrorData, FaceDetectorProps, LivenessDetectedData, DebugData, StatusPromptData } from './types'
import { CONFIG } from './config'
import { LivenessAction, ErrorCode, PromptCode, LivenessActionStatus } from './enums'
import { FACE_DETECTOR_EVENTS, DEFAULT_PROPS, BORDER_COLOR_STATES, PROMPT_CODE_DESCRIPTIONS } from './constants'
import { ScoredList } from './types'
// 导入人脸正对度检测模块
import { checkFaceFrontal } from './face-frontal-checker'
// 导入图像质量检测模块（合并了完整度和清晰度）
import { checkImageQuality } from './image-quality-checker'
// 导入人脸检测库加载器
import { loadOpenCV, loadHuman } from './library-loader'

// 定义组件 props
const props = withDefaults(defineProps<FaceDetectorProps>(), {})

// 使用 computed 来处理有默认值的属性
const min_face_ratio = computed(() => props.min_face_ratio ?? DEFAULT_PROPS.min_face_ratio)
const max_face_ratio = computed(() => props.max_face_ratio ?? DEFAULT_PROPS.max_face_ratio)
const min_face_frontal = computed(() => props.min_face_frontal ?? DEFAULT_PROPS.min_face_frontal)
const liveness_action_count = computed(() => props.liveness_action_count ?? DEFAULT_PROPS.liveness_action_count)
const liveness_action_timeout = computed(() => props.liveness_action_timeout ?? DEFAULT_PROPS.liveness_action_timeout)
const liveness_action_list = computed(() => props.liveness_action_list ?? DEFAULT_PROPS.liveness_action_list)
const show_action_prompt = computed(() => props.show_action_prompt ?? DEFAULT_PROPS.show_action_prompt)
const show_status_prompt = computed(() => props.show_status_prompt ?? DEFAULT_PROPS.show_status_prompt)
const min_live_score = computed(() => props.min_live_score ?? DEFAULT_PROPS.min_live_score)
const min_real_score = computed(() => props.min_real_score ?? DEFAULT_PROPS.min_real_score)
const normalizedLivenessActionCount = computed(() => {
  return Math.min(liveness_action_count?.value ?? 0, (liveness_action_list?.value ?? []).length)
})

// 定义组件事件
const emit = defineEmits<{
  'detector-loaded': []
  'status-prompt': [data: StatusPromptData]
  'liveness-detected': [data: LivenessDetectedData]
  'action-prompt': [data: ActionPromptData]
  'liveness-action': [data: any]
  'liveness-completed': [data: LivenessCompletedData]
  'detector-error': [data: ErrorData]
  'detector-debug': [data: DebugData]  // 调试信息事件
}>()

// 视频元素引用
const videoRef: Ref<HTMLVideoElement | null> = ref(null)
// 结果图片元素引用，用于显示采集的图片或最后一帧
const resultImageRef: Ref<HTMLImageElement | null> = ref(null)
// 结果图片数据
const resultImageSrc: Ref<string> = ref('')
// 是否为移动设备
const isMobileDevice: Ref<boolean> = ref(false)
// 是否正在进行检测
const isDetecting: Ref<boolean> = ref(false)
// 组件是否已就绪（Human.js 加载完成）
const isReady: Ref<boolean> = ref(false)

// 缓存的临时 canvas 对象（用于画面捕获）
let captureCanvas: HTMLCanvasElement | null = null
let captureCtx: CanvasRenderingContext2D | null = null

// 视频宽度
let videoWidth: Ref<number> = ref(CONFIG.DETECTION.DEFAULT_VIDEO_WIDTH)
// 视频高度
let videoHeight: Ref<number> = ref(CONFIG.DETECTION.DEFAULT_VIDEO_HEIGHT)
// 缓存的实际视频流分辨率（从 getSettings 或 videoWidth 获取）
let actualVideoWidth: number = 0
let actualVideoHeight: number = 0
// Human 检测库实例
let human: Human | null = null
// 摄像头流对象
let stream: MediaStream | null = null

// ===== 检测循环优化相关 =====
// 使用 requestAnimationFrame 替代 setTimeout 进行帧率控制
let detectionFrameId: number | null = null
// 上一次检测的时间戳
let lastDetectionTime: number = 0

// ===== 定时器独立管理 =====
let actionTimeoutId: ReturnType<typeof setTimeout> | null = null
// 提示文本自动清空定时器
let promptTextClearTimeoutId: ReturnType<typeof setTimeout> | null = null
// 状态文本自动清空定时器
let statusPromptTextClearTimeoutId: ReturnType<typeof setTimeout> | null = null

// ===== 检测超时相关变量 =====
let detectionStartTime: number = 0

interface DetectionState {
  // === 活体动作检测 ===
  completedActions: Set<LivenessAction>
  currentAction: LivenessAction | null
  
  // === 图片采集 ===
  collectedImages: ScoredList<string>  // 连续采集的图片数组
}

// ===== 活体检测相关变量 =====
const detectionState = reactive<DetectionState>({
  completedActions: new Set(),
  currentAction: null,
  collectedImages: new ScoredList<string>(CONFIG.IMAGE_QUALITY.COLLECTION_COUNT),
})

/**
 * 发送调试信息事件
 * @param {string} stage - 当前阶段
 * @param {string} message - 调试信息
 * @param {Record<string, any>} details - 详细信息
 * @param {'info'|'warn'|'error'} level - 调试级别
 */
function emitDebug(stage: string, message: string, details?: Record<string, any>, level: 'info' | 'warn' | 'error' = 'info'): void {
  const debugData: DebugData = {
    level,
    stage,
    message,
    details,
    timestamp: Date.now()
  }
  emit(FACE_DETECTOR_EVENTS.DEBUG, debugData)
}

/**
 * 更新动作/提示文本
 * @param code 
 */
function updatePromptTexts(code: PromptCode): void {
  switch(code) {
    case PromptCode.FRAME_DETECTED:
      // 正常状态：清空 statusPromptText
      statusPromptText.value = ''
      if(statusPromptTextClearTimeoutId){
        clearTimeout(statusPromptTextClearTimeoutId)
        statusPromptTextClearTimeoutId = null
      }
      break
    default:
      // 其他提示：更新 statusPromptText
      statusPromptText.value = PROMPT_CODE_DESCRIPTIONS[code] || ''
      if(statusPromptTextClearTimeoutId){
        clearTimeout(statusPromptTextClearTimeoutId)
      }
      if(statusPromptText.value != ''){
        statusPromptTextClearTimeoutId = setTimeout(() => {
          statusPromptText.value = ''
          statusPromptTextClearTimeoutId = null
        }, CONFIG.DETECTION.PROMPT_TEXT_DURATION)
      }
      break
  }
}

/**
 * 发送状态提示事件
 * @param {PromptCode} code - 提示码
 * @param {Record<string, any>} data - 提示数据（count, size, frontal 等）
 */
function emitStatusPrompt(code: PromptCode, data?: Record<string, any>): void {
  updatePromptTexts(code)

  const promptData: StatusPromptData = {
    code,
    message: PROMPT_CODE_DESCRIPTIONS[code] || '',
    ...data
  }
  emit(FACE_DETECTOR_EVENTS.STATUS_PROMPT, promptData)
}

/**
 * 调度检测循环 - 使用 requestAnimationFrame 实现高效的帧率控制
 * @param {number} minDelayMs - 最小延迟时间（毫秒），0 表示立即运行
 */
function scheduleDetection(minDelayMs: number = CONFIG.DETECTION.DETECTION_FRAME_DELAY): void {
  if (!isDetecting.value) return

  if (detectionFrameId !== null) {
    cancelAnimationFrame(detectionFrameId)
    detectionFrameId = null
  }

  const loop = (timestamp: number) => {
    const timeSinceLastDetection = timestamp - lastDetectionTime
    if (timeSinceLastDetection >= minDelayMs) {
      lastDetectionTime = timestamp
      detectionFrameId = null
      detect()
    } else {
      detectionFrameId = requestAnimationFrame(loop)
    }
  }

  detectionFrameId = requestAnimationFrame(loop)
}

/**
 * 安全的检测调度 - 处理错误重试
 */
function scheduleNextDetection(delayMs: number = CONFIG.DETECTION.DETECTION_FRAME_DELAY): void {
  if (!isDetecting.value) return
  scheduleDetection(delayMs)
}

/**
 * 清理所有定时器
 */
function clearAllTimers(): void {
  if (actionTimeoutId) {
    clearTimeout(actionTimeoutId)
    actionTimeoutId = null
  }
  if (promptTextClearTimeoutId) {
    clearTimeout(promptTextClearTimeoutId)
    promptTextClearTimeoutId = null
  }
  if (statusPromptTextClearTimeoutId) {
    clearTimeout(statusPromptTextClearTimeoutId)
    statusPromptTextClearTimeoutId = null
  }
}

/**
 * 取消待处理的检测
 */
function cancelPendingDetection(): void {
  if (detectionFrameId !== null) {
    cancelAnimationFrame(detectionFrameId)
    detectionFrameId = null
  }
}

// 摄像头上显示的提示文本
const actionPromptText: Ref<string> = ref('')
// 摄像头上显示的状态文本（用于其他提示）
const statusPromptText: Ref<string> = ref('')
// 视频容器的边框颜色状态
const videoBorderColor: Ref<string> = ref(BORDER_COLOR_STATES.IDLE)

// 是否正在初始化检测库
const isInitializing: Ref<boolean> = ref(false)

// ===== 事件监听器引用 =====
let handleVisibilityChange: (() => void) | null = null

// ===== 生命周期钩子 =====
// 组件挂载时初始化
onMounted(async () => {
  detectDevice()
  // 监听设备方向改变事件
  window.addEventListener('orientationchange', handleOrientationChange)
  
  // Safari 兼容性：监听可见性变化，确保后台不被限流
  handleVisibilityChange = () => {
    if (document.hidden) {
      emitDebug('visibility', '页面隐藏，暂停检测')
      if (isDetecting.value) {
        cancelPendingDetection()
      }
    } else {
      emitDebug('visibility', '页面恢复，继续检测')
      if (isDetecting.value) {
        scheduleNextDetection(0) // 立即重新启动检测
      }
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  // 标记正在初始化
  isInitializing.value = true
  
  try {
    // 使用加载器异步加载 OpenCV 和 Human.js
    emitDebug('initialization', '开始加载人脸检测库...')
    console.log('[FaceDetector] 开始加载 OpenCV 和 Human.js...')
    
    const { cv } = await loadOpenCV()  // 确保 OpenCV 加载完成
    console.log('[FaceDetector] OpenCV 加载完成，版本:', cv?.getBuildInformation?.() || '未知')
    human = await loadHuman("/models", "/wasm")
    if (!human) {
      throw new Error('Human.js 加载失败，实例为空')
    }
    console.log('[FaceDetector] 库加载完成，Human.js 版本:', human.version)
    
    // 标记组件已就绪，发送 ready 事件
    isReady.value = true
    emit(FACE_DETECTOR_EVENTS.READY)
    emitDebug('initialization', '组件已就绪', {})
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : '未知错误'
    emitDebug('initialization', '人脸检测库加载失败', {
      error: errorMsg,
      errorStack: e instanceof Error ? e.stack : 'N/A'
    }, 'error')
    console.error('[FaceDetector] Failed to load detection libraries:', e)
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.ENGINE_NOT_INITIALIZED, message: '检测库加载失败: ' + errorMsg })
  } finally {
    isInitializing.value = false
  }
})

// 组件卸载时清理资源
onUnmounted(() => {
  stopDetection()
  
  // 清理所有事件监听器
  window.removeEventListener('orientationchange', handleOrientationChange)
  if (handleVisibilityChange) {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    handleVisibilityChange = null
  }
  
  // 清理所有定时器
  clearAllTimers()
  
  // 清理缓存的临时 canvas
  captureCanvas = null
  captureCtx = null
  
  // 清理待处理的检测帧
  cancelPendingDetection()
})

// ===== 常量定义 =====
// 使用 CONFIG 替代本地常量定义（已从 face-detector.ts 导入）

// ===== 配置合并辅助函数 =====
// 注：配置合并逻辑已移至 face-detector-loader.ts

// ===== 设备检测与方向处理 =====
/**
 * 检测设备类型和屏幕方向，并调整视频尺寸（1:1 比例）
 */
function detectDevice(): void {
  // 判断是否为移动设备
  isMobileDevice.value = navigator.userAgent.toLowerCase().match(/android|iphone/) !== null || window.innerWidth < CONFIG.MOBILE.WIDTH_THRESHOLD
  
  if (isMobileDevice.value) {
    // 移动设备：根据屏幕方向调整，但保持 1:1 比例
    // 取屏幕宽高中较小值作为视频边长（减去 padding）
    const screenSize = Math.min(window.innerWidth, window.innerHeight)
    const videoSize = Math.min(screenSize - CONFIG.MOBILE.VIDEO_WIDTH_OFFSET, CONFIG.MOBILE.MAX_WIDTH)
    videoWidth.value = videoSize
    videoHeight.value = videoSize
  } else {
    // 桌面设备：使用固定尺寸（1:1 比例）
    videoWidth.value = CONFIG.DETECTION.DEFAULT_VIDEO_WIDTH
    videoHeight.value = CONFIG.DETECTION.DEFAULT_VIDEO_HEIGHT
  }
}

/**
 * 处理设备方向改变事件
 */
function handleOrientationChange(): void {
  // 如果正在检测，则重启检测以适配新的方向
  if (isDetecting.value) {
    cancelPendingDetection()
    if (stream) stream.getTracks().forEach(t => t.stop())
    detectDevice()
    // 延迟重启，确保 DOM 更新完成
    setTimeout(() => {
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
  
  // 重置活体检测相关状态
  detectionState.completedActions.clear()
  detectionState.collectedImages.clear()
  detectionState.currentAction = null
  actionPromptText.value = ''
  statusPromptText.value = ''
  
  // 清空所有定时器
  clearAllTimers()
  
  // 清空结果图片
  resultImageSrc.value = ''
  
  // 重置检测超时计数器
  detectionStartTime = performance.now()
  
  // 清除缓存的视频尺寸，下次检测时重新获取
  actualVideoWidth = 0
  actualVideoHeight = 0
}

/**
 * 启动人脸检测
 */
async function startDetection(): Promise<void> {
  // 检查组件是否已就绪
  if (!isReady.value) {
    emitDebug('detection', '组件未就绪', { ready: isReady.value, reason: 'Human.js 库仍在加载中，请稍候...' }, 'warn')
    return
  }

  try {
    emitDebug('video-setup', '开始启动检测')
    
    // 重置检测状态和画布
    resetDetectionState()
    
    // 获取用户摄像头权限和视频流
    emitDebug('video-setup', '正在请求摄像头权限...')
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user', 
          width: { ideal: videoWidth.value }, 
          height: { ideal: videoWidth.value },
          aspectRatio: { ideal: 1.0 }
        },
        audio: false
      })
      emitDebug('video-setup', '摄像头流获取成功', { streamTracks: stream.getTracks().length })
    } catch (err) {
      emitDebug('video-setup', '获取摄像头权限失败', { error: (err as Error).message }, 'error')
      throw err
    }
    
    if (!stream) {
      emitDebug('video-setup', '视频流为空', {}, 'error')
      throw new Error('Stream is null')
    }
    
    emitDebug('video-setup', '视频流获取成功，准备设置视频元素', { streamTracks: stream.getTracks().length })
    
    // 获取实际的视频流分辨率
    const videoTrack = stream.getVideoTracks()[0]
    if (videoTrack) {
      const settings = videoTrack.getSettings?.()
      if (settings) {
        emitDebug('video-setup', '获取视频设置成功', { width: settings.width, height: settings.height })
        const minSize = Math.min(settings.width || videoWidth.value, settings.height || videoHeight.value)
        videoWidth.value = minSize
        videoHeight.value = minSize
        actualVideoWidth = minSize
        actualVideoHeight = minSize
      }
    }
    
    if (videoRef.value) {
      videoRef.value.style.display = 'block'
      videoRef.value.srcObject = stream
    }
    
    // 等待视频元素加载元数据和可播放
    emitDebug('video-setup', '等待视频就绪...')
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        emitDebug('video-setup', '视频加载超时', { timeout: CONFIG.DETECTION.VIDEO_LOAD_TIMEOUT }, 'error')
        reject(new Error('Video loading timeout'))
      }, CONFIG.DETECTION.VIDEO_LOAD_TIMEOUT)
      
      const checkVideoReady = () => {
        if (videoRef.value && videoRef.value.videoWidth > 0 && videoRef.value.videoHeight > 0) {
          clearTimeout(timeout)
          videoRef.value.removeEventListener('canplay', onCanPlay)
          videoRef.value.removeEventListener('loadedmetadata', onLoadedMetadata)
      emitDebug('video-setup', '视频就绪，准备检测', { videoWidth: videoRef.value.videoWidth, videoHeight: videoRef.value.videoHeight })
      resolve()
          return true
        }
        return false
      }
      
      const onCanPlay = () => {
        emitDebug('video-setup', 'canplay 事件触发')
        if (checkVideoReady()) {
          // 事件处理已完成
        }
      }
      
      const onLoadedMetadata = () => {
        emitDebug('video-setup', 'loadedmetadata 事件触发')
        if (checkVideoReady()) {
          // 事件处理已完成
        }
      }
      
      if (videoRef.value) {
        // 同时监听 canplay 和 loadedmetadata，以支持不同浏览器
        videoRef.value.addEventListener('canplay', onCanPlay, { once: true })
        videoRef.value.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
        
        // 播放视频
        videoRef.value.play().catch(err => {
          clearTimeout(timeout)
          videoRef.value?.removeEventListener('canplay', onCanPlay)
          videoRef.value?.removeEventListener('loadedmetadata', onLoadedMetadata)
          reject(err)
        })
        
        // 额外的轮询检查（备选方案，用于Safari等特殊情况）
        const pollInterval = setInterval(() => {
          if (checkVideoReady()) {
            clearInterval(pollInterval)
          }
        }, 100)
      }
    })
    
    emitDebug('video-setup', '启动检测循环')
    
    // 立即启动检测循环（使用 requestAnimationFrame）
    scheduleNextDetection(0)
  } catch (e) {
    // 若获取摄像头失败，触发错误事件
    emitDebug('video-setup', '启动检测失败', { error: (e as Error).message, stack: (e as Error).stack }, 'error')
    isDetecting.value = false
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.STREAM_ACQUISITION_FAILED, message: (e as Error).message })
  } finally {
    // 无论成功或失败，都确保资源状态一致
    emitDebug('video-setup', '检测启动流程结束', { isDetecting: isDetecting.value })
  }
}

/**
 * 停止人脸检测
 */
function stopDetection(success: boolean = false): void {
  isDetecting.value = false

  actionPromptText.value = ''
  statusPromptText.value = ''
  
  // 清理所有定时器和帧
  cancelPendingDetection()
  clearAllTimers()
  
  if (stream) stream.getTracks().forEach(t => t.stop())

  // 显示结果图片
  const bestImage = detectionState.collectedImages.getBestItem()
  if (success && bestImage) {
    displayResultImage(bestImage)
  } else {
    const lastFrameImageBase64 = captureFrame()
    if (lastFrameImageBase64) {
      displayResultImage(lastFrameImageBase64)
    }
  }
  
  // 隐藏视频，显示结果
  if (videoRef.value) {
    videoRef.value.style.display = 'none'
    videoRef.value.srcObject = null
  }
}

// ===== 人脸检测与活体验证核心逻辑 =====

/**
 * 处理检测到单张人脸的情况
 * @param {FaceResult} face - 当前帧图像的人脸检测结果
 * @param {Array<GestureResult>} gestures - 检测到的手势/表情
 */
function handleSingleFace(face: FaceResult, gestures: Array<GestureResult>): void {
  // 未采集到足够多的照片，继续采集
  if(detectionState.collectedImages.size() < CONFIG.IMAGE_QUALITY.COLLECTION_COUNT){
    // 采集模式下，继续采集图片
    scheduleNextDetection()
    return
  }

  // 未设置动作或设置了动作完成次数为0，无需进行动作活体检测，直接完成
  if (normalizedLivenessActionCount.value === 0) {
    completeActionLiveness()
    return
  }

  // 已经完成全部动作验证
  if (detectionState.completedActions.size >= normalizedLivenessActionCount.value) {
    completeActionLiveness()
    return
  }
  
  // 获取当前需要检测的随机动作
  if (!detectionState.currentAction) {
    selectNextRandomAction()
    emitDebug('liveness', '未选择任何动作', {}, 'warn')
    scheduleNextDetection()
    return
  }
  
  // 检测当前帧是否有指定的动作
  const detected = detectAction(detectionState.currentAction, gestures)
  
  // 如果检测到动作
  if (detected) {
    emitDebug('liveness', '检测到动作', { action: detectionState.currentAction })
    
    // 标记该动作已完成
    detectionState.completedActions.add(detectionState.currentAction)
    
    // 清空当前动作信息，准备选择下一个
    detectionState.currentAction = null
    
    // 清除超时定时器
    if (actionTimeoutId) clearTimeout(actionTimeoutId)
    actionTimeoutId = null
    actionPromptText.value = ''

    if (detectionState.completedActions.size >= normalizedLivenessActionCount.value) {
      completeActionLiveness()
      return
    } else {
      // 选择下一个动作
      selectNextRandomAction()
    }
  }
  // 继续检测下一帧
  scheduleNextDetection()  
}

/**
 * 处理检测到多个或零个人脸的情况
 * @param {number} faceCount - 人脸数量
 */
function handleMultipleFaces(faceCount: number): void {
  // 更新边框颜色
  updateBorderColor(faceCount)
  
  // 抛出对应的 status-prompt 事件
  if (faceCount === 0) {
    emitStatusPrompt(PromptCode.NO_FACE, { count: faceCount })
  } else if (faceCount > 1) {
    emitStatusPrompt(PromptCode.MULTIPLE_FACE, { count: faceCount })
  }
  
  // 如果已经采集了一张以上合格照片，表示已经处于采集阶段或检测阶段，需要重置检测流程
  if (detectionState.collectedImages.size() > 0) {
    emitDebug('detect', '检测期间人脸数量变化，重置检测流程', { expected: 1, actual: faceCount }, 'error')
    resetDetectionState()
  }

  scheduleNextDetection()
}

/**
 * 检测循环：不断获取视频帧进行人脸检测
 */
async function detect(): Promise<void> {
  if (!isDetecting.value) return
  
  try {
    // 快速检查必需的对象
    if (!videoRef.value || !human) {
      emitDebug('detection', '缺少必需对象，稍后重试', { hasVideoRef: !!videoRef.value, hasHuman: !!human }, 'warn')
      scheduleNextDetection(CONFIG.DETECTION.DETECTION_FRAME_DELAY)
      return
    }
    
    // Safari 兼容性检查：确保视频已加载且可绘制
    if (videoRef.value.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      emitDebug('detection', '视频未就绪', { readyState: videoRef.value.readyState, videoWidth: videoRef.value.videoWidth, videoHeight: videoRef.value.videoHeight }, 'warn')
      scheduleNextDetection(CONFIG.DETECTION.ERROR_RETRY_DELAY)
      return
    }
    
    // 检测超时控制：如果长时间没有检测到人脸，主动退出
    const elapsedTime = performance.now() - detectionStartTime
    if (elapsedTime > CONFIG.TIMEOUT.DETECTION_TIMEOUT) {
      emitDebug('detection', '检测超时', { elapsedSeconds: Math.round(CONFIG.TIMEOUT.DETECTION_TIMEOUT / 1000) }, 'error')
      videoBorderColor.value = BORDER_COLOR_STATES.ERROR
      emit(FACE_DETECTOR_EVENTS.ERROR, { 
        code: ErrorCode.DETECTION_ERROR, 
        message: `检测超时：未能在${Math.round(CONFIG.TIMEOUT.DETECTION_TIMEOUT / 1000)}秒内检测到合格人脸，请检查摄像头或重新开始` 
      })
      stopDetection()
      return
    }
    
    // 对当前视频帧进行人脸检测
    let result
    try {
      result = await human.detect(videoRef.value)
    } catch (detectError) {
      emitDebug('detection', '检测过程出错', { error: (detectError as Error).message }, 'error')
      throw detectError
    }
    
    // 调试日志：打印 detect 结果结构
    if (!result) {
      emitDebug('detection', '检测返回 null/undefined', {}, 'warn')
      scheduleNextDetection(CONFIG.DETECTION.DETECTION_FRAME_DELAY)
      return
    }
    
    // 获取检测到的所有人脸 - 尝试多种属性名（兼容不同版本的 Human.js）
    let faces = result.face || []
    
    // 每 30 帧记录一次检测结果
    if (detectionStartTime % 3000 < 100) {  // 大约每 3 秒记录一次
      emitDebug('detection', '检测结果', { 
        facesCount: faces.length, 
        resultKeys: Object.keys(result).slice(0, 5),
        hasGesture: !!result.gesture
      })
    }
    
    if (faces.length === 1) {
      // 处理单人脸的情况
      const face = faces[0] as any
      const faceBox = face.box || face.boxRaw
      
      if (!faceBox) {
        console.warn('[FaceDetector] Face detected but no box/boxRaw property:', Object.keys(face).slice(0, 10))
        scheduleNextDetection(CONFIG.DETECTION.DETECTION_FRAME_DELAY)
        return
      }
      
      // 计算人脸占视频画面的比例 (0-1)
      const faceRatio = (faceBox[2] * faceBox[3]) / (videoWidth.value * videoHeight.value)
      updateBorderColor(faceRatio)
      if (faceRatio <= min_face_ratio.value!) {
        emitStatusPrompt(PromptCode.FACE_TOO_SMALL, { size: faceRatio })
        emitDebug('detection', '人脸太小', { ratio: faceRatio.toFixed(4), minRatio: min_face_ratio.value!, maxRatio: max_face_ratio.value! }, 'info')
        scheduleNextDetection()
        return
      } 
      if (faceRatio >= max_face_ratio.value!) {
        emitStatusPrompt(PromptCode.FACE_TOO_LARGE, { size: faceRatio })
        emitDebug('detection', '人脸太大', { ratio: faceRatio.toFixed(4), minRatio: min_face_ratio.value!, maxRatio: max_face_ratio.value! }, 'info')
        scheduleNextDetection()
        return
      }

      // 检查人脸是否正对摄像头 (0-1 评分)
      let frontal = 1
      
      // 一次性绘制视频帧到 canvas，后续多次使用
      const frameCanvas = drawVideoToCanvas()
      if (!frameCanvas) {
        emitDebug('detection', '绘制视频帧到 canvas 失败', {}, 'warn')
        scheduleNextDetection()
        return
      }

      // 仅在采集阶段检查正对度，校验阶段不检查
      if (detectionState.collectedImages.size() < CONFIG.IMAGE_QUALITY.COLLECTION_COUNT) {
        frontal = checkFaceFrontal(face, result.gesture, frameCanvas)
        updateBorderColor(faceRatio, frontal)
        if (frontal < min_face_frontal.value!) {
          emitStatusPrompt(PromptCode.FACE_NOT_FRONTAL, { frontal: frontal })
          emitDebug('detection', '人脸正对度不够', { ratio: faceRatio.toFixed(4), frontal: frontal.toFixed(4), minFrontal: min_face_frontal.value! }, 'info')
          scheduleNextDetection()
          return
        }        
      }

      // 使用同一个 canvas 进行图片质量检查
      const qualityResult = checkImageQuality(frameCanvas, face, videoWidth.value, videoHeight.value)
      if (!qualityResult.passed) {
        if(qualityResult.blurReasons.length > 0){
          emitStatusPrompt(PromptCode.BLURRY_IMAGE, { score: qualityResult.score })
        } else {
          emitStatusPrompt(PromptCode.LOW_QUALITY, { score: qualityResult.score })
        }
        scheduleNextDetection()
        return
      }

      if (face.real == undefined || typeof face.real !== 'number') {
        emitDebug('detection', '人脸实度评分缺失，无法进行活体判断', {}, 'warn')
        scheduleNextDetection()
        return
      }

      if (face.real < min_real_score.value!) {
        emitDebug('detection', '人脸实度评分不足，疑似非活体', { realScore: face.real.toFixed(4), minRealScore: min_real_score.value! }, 'info')
        emit(FACE_DETECTOR_EVENTS.ERROR, { 
          code: ErrorCode.LIVENESS_DETECTION_FAILED, 
          message: '活体检测失败：检测到疑似非活体人脸，请重新尝试。' 
        })
        stopDetection()
        return
      }
      
      if (face.live == undefined || typeof face.live !== 'number') {
        emitDebug('detection', '人脸活度评分缺失，无法进行活体判断', {}, 'warn')
        scheduleNextDetection()
        return
      }

      if (face.live < min_live_score.value!) {
        emitDebug('detection', '人脸活度评分不足，本次不通过', { liveScore: face.live.toFixed(4), minLiveScore: min_live_score.value! }, 'info')
        scheduleNextDetection()
        return
      }
      
      // 将 canvas 转换为 Base64
      const frameImage = canvasToBase64(frameCanvas)
      if (!frameImage) {
        emitDebug('detection', '捕获人脸图像失败', {}, 'warn')
        scheduleNextDetection()
        return
      }

      detectionState.collectedImages.add(frameImage, qualityResult.score)
      emitStatusPrompt(PromptCode.FRAME_DETECTED, { score: qualityResult.score })

      const livenessData: LivenessDetectedData = {
        passed: true,
        size: faceRatio,
        frontal: frontal,
        quality: qualityResult.score,
        real: face.real,
        live: face.live
      }
      emit(FACE_DETECTOR_EVENTS.LIVENESS_DETECTED, livenessData)
      emitDebug('detection', '检测到单个人脸', livenessData)
      handleSingleFace(face, result.gesture)
    } else {
      // 处理多人脸或无人脸的情况
      emitDebug('detection', '多人脸/无人脸', { count: faces.length })
      handleMultipleFaces(faces.length)
    }
  } catch (error) {
    emitDebug('detection', '检测异常', { error: (error as Error).message, stack: (error as Error).stack }, 'error')
    // 发生错误时继续检测，但增加重试延迟
    scheduleNextDetection(CONFIG.DETECTION.ERROR_RETRY_DELAY)
  }
}

function completeActionLiveness(): void {
  emitDebug('liveness', '所有活体动作已完成')
  // 设置成功颜色
  videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
  // 抛出 liveness-completed 事件
  const bestImage = detectionState.collectedImages.getBestItem()
  if(!bestImage){
    emitDebug('liveness', '无法选取最佳质量图片，采集列表为空', {}, 'error')
    emit(FACE_DETECTOR_EVENTS.ERROR, { 
      code: ErrorCode.DETECTION_ERROR, 
      message: '采集图片列表为空，无法选取最佳图片。请重新尝试。' 
    })
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    stopDetection()
    return
  }
  const bestScore = detectionState.collectedImages.getBestScore()
  emit(FACE_DETECTOR_EVENTS.LIVENESS_COMPLETED, { 
    qualityScore: bestScore,
    imageData: bestImage, 
    liveness: 1 }
  )
  stopDetection(true)
}

/**
 * 选择下一个随机的活体检测动作
 */
function selectNextRandomAction(): void {
  // 从未完成的动作中随机选择
  const availableActions = liveness_action_list.value!.filter(action => !detectionState.completedActions.has(action))
  
  if (availableActions.length === 0) {
    emitDebug('liveness', '所有动作已完成')
    return
  }
  
  // 随机选择一个动作
  detectionState.currentAction = availableActions[Math.floor(Math.random() * availableActions.length)]
  
  // 发送动作提示事件
  const actionPromptData: ActionPromptData = {
    action: detectionState.currentAction || LivenessAction.BLINK,
    status: LivenessActionStatus.STARTED
  }
  emit(FACE_DETECTOR_EVENTS.ACTION_PROMPT, actionPromptData)
  
  emitDebug('liveness', '选择动作', { action: detectionState.currentAction })
  
  // 设置超时定时器
  if (actionTimeoutId) clearTimeout(actionTimeoutId)
  actionTimeoutId = setTimeout(() => {
    if (detectionState.currentAction) {
      emitDebug('liveness', '动作检测超时', { action: detectionState.currentAction }, 'error')
      // 设置错误颜色
      emitStatusPrompt(PromptCode.LOW_QUALITY, { action: detectionState.currentAction })
      resetDetectionState()
    }
  }, liveness_action_timeout.value! * 1000)
}

/**
 * 更新视频容器边框颜色
 * @param {number} countOrRatio - 人脸数量或人脸占画面比例
 * @param {number} frontal - 人脸正对度评分 (可选)
 */
function updateBorderColor(countOrRatio: number, frontal?: number, quality?: boolean): void {
  // 判断面部信息状态
  if (countOrRatio === 0) {
    // 未检测到人脸：灰色
    videoBorderColor.value = BORDER_COLOR_STATES.IDLE
  } else if (countOrRatio > 1 && frontal === undefined) {
    // 检测到多个人脸：红色
    videoBorderColor.value = BORDER_COLOR_STATES.MULTIPLE_FACES
  } else if (frontal !== undefined) {
    // 检测到单个人脸，检查是否符合条件
    const faceRatio = countOrRatio
    const isSizeValid = faceRatio > min_face_ratio.value! && faceRatio < max_face_ratio.value!
    const isFrontalValid = frontal >= min_face_frontal.value!
    const isQualityValid = quality !== undefined ? quality : true

    if (isSizeValid && isFrontalValid && isQualityValid) {
      // 条件都满足：绿色
      videoBorderColor.value = BORDER_COLOR_STATES.PERFECT
    } else if (isSizeValid || isFrontalValid || isQualityValid) {
      // 条件部分满足：黄色
      videoBorderColor.value = BORDER_COLOR_STATES.PARTIAL
    } else {
      // 条件都不满足：橙色
      videoBorderColor.value = BORDER_COLOR_STATES.INVALID
    }
  }
}


/**
 * 检测眨眼动作
 */
function isBlinkDetected(gestures: any): boolean {
  return gestures?.some((g: any) => g.gesture?.includes('blink')) ?? false
}

/**
 * 检测张嘴动作
 */
function isMouthOpenDetected(gestures: any): boolean {
  if (!gestures) return false
  
  return gestures.some((g: any) => {
    const mouthGesture = g.gesture
    if (!mouthGesture?.includes('mouth')) return false
    
    // 提取嘴巴打开的百分比
    const percentMatch = mouthGesture.match(/mouth (\d+)% open/)?.[1]
    const percent = percentMatch ? parseInt(percentMatch) : 0
    
    // 判断嘴巴打开（> 20% 认为是打开状态）
    return percent > CONFIG.LIVENESS.MIN_MOUTH_OPEN_PERCENT
  })
}

/**
 * 检测点头动作
 */
function isNodDetected(gestures: any): boolean {
  if (!gestures) return false
  
  // 获取当前帧的 head 动作
  const currentHead = gestures.find((g: any) => g.gesture?.includes('head'))?.gesture
  
  if (!currentHead) return false
  
  // 提取 head 方向（up/down）
  const headDirection = currentHead.match(/(up|down)/)?.[0]
  
  // 只要检测到抬头(up)或低头(down)就通过
  return !!headDirection
}

/**
 * 检测指定的动作是否被执行
 */
function detectAction(action: string, gestures: any): boolean {
  switch (action) {
    case LivenessAction.BLINK:
      return isBlinkDetected(gestures)
    case LivenessAction.MOUTH_OPEN:
      return isMouthOpenDetected(gestures)
    case LivenessAction.NOD:
      return isNodDetected(gestures)
    default:
      return false
  }
}

// ===== 工具方法 =====
/**
 * 显示捕获的人脸图片到结果图片元素上
 */
function displayResultImage(resultImageBase64: string): void {
  if (!resultImageBase64) return
  resultImageSrc.value = resultImageBase64
}

/**
 * 从视频帧绘制到 canvas（内部使用，不转 Base64）
 * @returns {HTMLCanvasElement | null} 绘制后的 canvas，如果失败返回 null
 */
function drawVideoToCanvas(): HTMLCanvasElement | null {
  try {
    if (!videoRef.value) return null
    
    // 使用缓存的实际视频流分辨率（从 getSettings 获取）
    // 如果缓存为空，则尝试从 video 元素的 videoWidth/videoHeight 获取
    let videoWidth_actual = actualVideoWidth || videoRef.value.videoWidth || videoWidth.value
    let videoHeight_actual = actualVideoHeight || videoRef.value.videoHeight || videoHeight.value
    
    // 最后的备选：使用设置的 width/height 属性
    if (!videoWidth_actual || !videoHeight_actual) {
      videoWidth_actual = videoRef.value.width || videoWidth.value
      videoHeight_actual = videoRef.value.height || videoHeight.value
    }
    
    // 再次检查是否为有效值
    if (!videoWidth_actual || !videoHeight_actual) {
      emitDebug('capture', '无法获取有效视频尺寸', { 
        actualVideoWidth, 
        actualVideoHeight, 
        videoWidth: videoRef.value.videoWidth, 
        videoHeight: videoRef.value.videoHeight,
        width: videoRef.value.width,
        height: videoRef.value.height
      }, 'error')
      return null
    }
    
    // 如果缓存的 canvas 尺寸不匹配，重新创建
    if (!captureCanvas || captureCanvas.width !== videoWidth_actual || captureCanvas.height !== videoHeight_actual) {
      captureCanvas = document.createElement('canvas')
      captureCanvas.width = videoWidth_actual
      captureCanvas.height = videoHeight_actual
      captureCtx = captureCanvas.getContext('2d')
      emitDebug('capture', 'Canvas 创建/调整大小', { width: videoWidth_actual, height: videoHeight_actual })
    }
    
    if (!captureCtx) return null
    
    // 在尝试绘制前，验证视频的可绘制性
    // readyState >= HAVE_CURRENT_DATA (2) 才能绘制
    if (videoRef.value.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      emitDebug('capture', '视频不可绘制', { 
        readyState: videoRef.value.readyState, 
        HAVE_CURRENT_DATA: HTMLMediaElement.HAVE_CURRENT_DATA 
      }, 'warn')
      return null
    }
    
    captureCtx.drawImage(videoRef.value, 0, 0, videoWidth_actual, videoHeight_actual)
    emitDebug('capture', '帧已绘制到 canvas')
    
    return captureCanvas
  } catch (e) {
    emitDebug('capture', '绘制帧到 canvas 失败', { error: (e as Error).message }, 'error')
    return null
  }
}

/**
 * 将 canvas 转换为 Base64 JPEG 图片数据
 * @param {HTMLCanvasElement} canvas - 输入的 canvas
 * @returns {string | null} Base64 格式的 JPEG 图片数据
 */
function canvasToBase64(canvas: HTMLCanvasElement): string | null {
  try {
    const imageData = canvas.toDataURL('image/jpeg', 0.9)
    emitDebug('capture', '图片已转换为 Base64', { size: imageData.length })
    return imageData
  } catch (e) {
    emitDebug('capture', '转换为 Base64 失败', { error: (e as Error).message }, 'error')
    return null
  }
}

/**
 * 捕获当前视频帧（返回 Base64）
 * @returns {string | null} Base64 格式的 JPEG 图片数据
 */
function captureFrame(): string | null {
  const canvas = drawVideoToCanvas()
  if (!canvas) return null
  return canvasToBase64(canvas)
}

/**
 * 在画布上绘制人脸检测框（正方形）
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {Array} faces - 人脸数组
 * @param {string} color - 检测框颜色
 * @param {number} canvasWidth - canvas 实际显示宽度
 * @param {number} canvasHeight - canvas 实际显示高度
 * @param {number} videoWidth - 视频源宽度
 * @param {number} videoHeight - 视频源高度
 */
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
}

/* 结果图片样式（检测时透明隐藏，完成后显示结果） */
.result-image {
  position: absolute;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  background: transparent;
  object-fit: cover;
  box-sizing: border-box;
  border-radius: 50%;  /* 圆形裁剪 */
}

/* 活体检测提示文本样式 */
.action-prompt {
  position: absolute;
  top: calc(50% - 35px);
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  z-index: 10;
  animation: fadeIn 0.3s ease-in;
  text-align: center;
  letter-spacing: 0.5px;
}

/* 状态提示文本样式 */
.status-prompt {
  position: absolute;
  top: calc(50% + 35px);
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  z-index: 10;
  animation: fadeIn 0.3s ease-in;
  text-align: center;
  letter-spacing: 0.5px;
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
