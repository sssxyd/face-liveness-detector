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
      <div v-if="actionPromptText && props.showActionPrompt" class="action-prompt">{{ actionPromptText }}</div>
      <!-- 状态提示文本 -->
      <div v-if="statusPromptText && props.showStatusPrompt" class="status-prompt">{{ statusPromptText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 导入 Vue 3 Composition API 相关方法
import { ref, computed, onMounted, onUnmounted, Ref, reactive } from 'vue'
// 导入人脸检测库
import Human, { FaceResult, GestureResult } from '@vladmandic/human'
// 导入类型定义
import type { FaceCollectedData, LivenessCompletedData, ErrorData, FaceDetectorProps, LivenessDetectedData, DebugData, StatusPromptData } from './types'
import { CONFIG } from './config'
import { DetectionMode, LivenessAction, ErrorCode, PromptCode} from './enums'
import { FACE_DETECTOR_EVENTS, BORDER_COLOR_STATES, PROMPT_CODE_DESCRIPTIONS, ACTION_DESCRIPTIONS } from './constants'
import { detectBrowserInfo, isWebGLAvailable, getWebGLInfo } from './utils'
import { ScoredList } from './types'
// 导入人脸正对度检测模块
import { checkFaceFrontal } from './face-frontal-detection'
// 导入图像质量检测模块
import { checkImageQuality } from './image-quality-checker'

// 定义组件 props
const props = withDefaults(defineProps<FaceDetectorProps>(), {
  mode: DetectionMode.COLLECTION,
  livenessChecks: () => [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  minFaceRatio: 0.5,
  maxFaceRatio: 0.9,
  minFrontal: 0.9,
  silentLivenessThreshold: 0.85,  // 静默活体检测阈值 (0-1)
  livenessActionCount: 1,        // 活体检测动作次数，默认为1
  livenessActionTimeout: 60,      // 活体检测动作时间限制，默认60秒
  showActionPrompt: true,         // 是否显示活体检测动作提示文本，默认显示
  showStatusPrompt: true,         // 是否显示状态提示文本，默认显示
  humanConfig: () => ({
    // 运行时配置默认为空对象
    // 用户可传入此参数来在检测时覆盖初始化配置
    // 注意：初始化配置（在 onMounted 中）和运行时配置会合并
    // 运行时配置优先级更高
  })
})

const normalizedLivenessActionCount = computed(() => {
  // 如果 livenessActionCount > livenessChecks 长度，则设置为等于长度
  return Math.min(props.livenessActionCount, props.livenessChecks.length)
})

// 定义组件事件
const emit = defineEmits<{
  'ready': []
  'face-collected': [data: FaceCollectedData]
  'status-prompt': [data: StatusPromptData]
  'liveness-detected': [data: LivenessDetectedData]
  'liveness-completed': [data: LivenessCompletedData]
  'error': [data: ErrorData]
  'debug': [data: DebugData]  // 调试信息事件
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
    case PromptCode.NORMAL_STATE:
    case PromptCode.GOOD_IMAGE_QUALITY:
      // 正常状态：清空 statusPromptText
      statusPromptText.value = ''
      if(statusPromptTextClearTimeoutId){
        clearTimeout(statusPromptTextClearTimeoutId)
        statusPromptTextClearTimeoutId = null
      }
      break
    case PromptCode.PLEASE_PERFORM_ACTION:
      // 动作提示：更新 actionPromptText
      actionPromptText.value = `请${getActionDescription(detectionState.currentAction || '')}`
      if(promptTextClearTimeoutId){
        clearTimeout(promptTextClearTimeoutId)
      }
      if(actionPromptText.value != ''){
        promptTextClearTimeoutId = setTimeout(() => {
          actionPromptText.value = ''
          promptTextClearTimeoutId = null
        }, CONFIG.DETECTION.PROMPT_TEXT_DURATION)
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
  
  // 配置 Human 检测库
  isInitializing.value = true
  
  // 合并并应用 Human 配置
  const mergedConfig = mergeHumanConfig()
  
  // 检查浏览器环境和能力
  const browserInfo = detectBrowserInfo()
  
  emitDebug('initialization', '开始初始化 Human.js 库', {
    userAgent: navigator.userAgent.substring(0, 100),
    browser: browserInfo,
    modelBasePath: mergedConfig.modelBasePath,
    backend: mergedConfig.backend,
    selectedReason: `${isMobileDevice.value ? '移动设备' : '桌面设备'} - ${mergedConfig.backend} 后端`
  })
  
  // 检查 WebGL 支持
  const webglInfo = getWebGLInfo()
  emitDebug('initialization', webglInfo.available ? 'WebGL 可用' : 'WebGL 不可用', webglInfo)
  
  human = new Human(mergedConfig as any)
  try {
    emitDebug('initialization', '正在加载 Human.js 库...', { config: Object.keys(mergedConfig) })
    
    const loadStartTime = performance.now()
    await human.load()
    const loadTime = performance.now() - loadStartTime
    
    emitDebug('initialization', 'Human.js 库加载成功', {
      loadTime: `${loadTime.toFixed(2)}ms`,
      modelsAvailable: human.models ? Object.keys(human.models).length : 0,
      modelsStatus: human.models ? Object.entries(human.models).reduce((acc, [key, model]: any) => {
        acc[key] = {
          enabled: model?.enabled,
          loaded: model?.['loaded'] || model?.state,
          type: typeof model
        }
        return acc
      }, {} as Record<string, any>) : {}
    })
    
    // 标记组件已就绪，发送 ready 事件
    isReady.value = true
    emit(FACE_DETECTOR_EVENTS.READY)
    emitDebug('initialization', '组件已就绪', {})
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : '未知错误'
    emitDebug('initialization', 'Human.js 加载失败', {
      error: errorMsg,
      errorStack: e instanceof Error ? e.stack : 'N/A'
    }, 'error')
    console.error('[FaceDetector] Failed to load Human library:', e)
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.ENGINE_NOT_INITIALIZED, message: '检测库加载失败: ' + errorMsg })
  }
  isInitializing.value = false
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
/**
 * 检测最优的推理后端
 * 策略: 桌面优先 WebGL, 移动优先 WASM, 特殊浏览器强制 WASM
 */
function detectOptimalBackend(): string {
  const browserInfo = detectBrowserInfo()
  
  // 特殊浏览器：优先使用 WASM（更稳定可靠）
  if (browserInfo.isSafari || browserInfo.isWeChat || browserInfo.isAlipay || browserInfo.isQQ || browserInfo.isWebView) {
    return 'wasm'
  }
  
  // 移动设备：检测 WebGL 可用性
  if (browserInfo.isMobile) {
    return isWebGLAvailable() ? 'webgl' : 'wasm'
  }
  
  // 桌面设备：优先 WebGL（性能更好）
  return isWebGLAvailable() ? 'webgl' : 'wasm'
}

/**
 * 合并 Human.js 配置，用户配置优先级更高
 */
function mergeHumanConfig(): Record<string, any> {
  const defaultConfig = {
    // 自动检测最优后端
    backend: detectOptimalBackend(),
    // 模型文件本地路径
    modelBasePath: '/models',
    // WASM 文件本地路径
    wasmPath: '/wasm',
    // 人脸检测配置
    face: {
      enabled: true,
      detector: { rotation: false, return: true },
      mesh: { enabled: true },        // 面部网格点
      iris: { enabled: true },        // 虹膜检测
      antispoof: { enabled: true },   // 启用反欺骗检测（active liveness）
      liveness: { enabled: true }     // 启用活体检测（passive liveness）
    },
    body: { enabled: false },      // 禁用身体检测
    hand: { enabled: false },      // 禁用手部检测
    object: { enabled: false },    // 禁用物体检测
    gesture: { enabled: true }     // 启用手势检测(包含眨眼)
  }
  
  // 如果用户没有提供自定义配置，直接返回默认配置
  if (Object.keys(props.humanConfig).length === 0) {
    return defaultConfig
  }
  
  // 深度合并用户配置和默认配置
  return {
    ...defaultConfig,
    ...props.humanConfig,
    face: {
      ...defaultConfig.face,
      ...(props.humanConfig?.face || {})
    }
  }
}

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
  // 已采集足够多的照片，开始模式检测
  switch(props.mode){
    case DetectionMode.LIVENESS:
      handleActionLivenessDetection(gestures)
      break
    case DetectionMode.SILENT_LIVENESS:
      handleSilentLivenessDetection(face)
      break
    case DetectionMode.COLLECTION:
      handleCollection()
      break
    default:
      emitDebug('detection', '未知检测模式', { mode: props.mode }, 'error')
      emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.DETECTION_ERROR, message: `未知检测模式: ${props.mode}` })
      stopDetection()
      break
  }
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
    emitStatusPrompt(PromptCode.NO_FACE_DETECTED, { count: faceCount })
  } else if (faceCount > 1) {
    emitStatusPrompt(PromptCode.MULTIPLE_FACES_DETECTED, { count: faceCount })
  }
  
  // 如果已经采集了一张以上合格照片，表示已经处于采集阶段或检测阶段，需要重置检测流程
  if (detectionState.collectedImages.size() > 0) {
    emitDebug('detect', '检测期间人脸数量变化，重置检测流程', { expected: 1, actual: faceCount }, 'error')
    resetDetectionState()
  }

  scheduleNextDetection()
}

/**
 * 处理人脸采集：从已经采集的图片中选取最佳质量图片
 */
function handleCollection(): void {
  const bestImage = detectionState.collectedImages.getBestItem()
  if (!bestImage) {
    emitDebug('collection', '无法选取最佳质量图片，采集列表为空', {}, 'error')
    emit(FACE_DETECTOR_EVENTS.ERROR, { 
      code: ErrorCode.DETECTION_ERROR, 
      message: '采集图片列表为空，无法选取最佳图片。请重新尝试。' 
    })
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    stopDetection()
    return
  }
  const bestScore = detectionState.collectedImages.getBestScore()

  emitDebug('collection', '采集完成，选取最佳质量图片', { 
    bestScore: bestScore.toFixed(2),
  })

  emit(FACE_DETECTOR_EVENTS.FACE_COLLECTED, { 
    qualityScore: bestScore,
    imageData: bestImage
  })

  videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
  stopDetection(true)  
}

/**
 * 处理静默活体检测模式：对当前帧进行活体检测
 */
function handleSilentLivenessDetection(face: FaceResult): void {
  // 对当前帧进行活体检测
  performSilentLivenessDetection(face)
}

/**
 * 处理动作活体检测：检查当前帧是否完成指定动作
 * @param {Array} gestures - 检测到的手势/表情
 */
function handleActionLivenessDetection(gestures: Array<GestureResult>): void {
  // 检查是否全部动作完成
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
    // 如果用户提供了运行时配置，则使用；否则使用实例初始化时的配置
    const runtimeConfig = Object.keys(props.humanConfig).length > 0 ? props.humanConfig : undefined
    
    let result
    try {
      result = await human.detect(videoRef.value, runtimeConfig)
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
      if (faceRatio <= props.minFaceRatio) {
        emitStatusPrompt(PromptCode.FACE_TOO_SMALL, { size: faceRatio })
        emitDebug('detection', '人脸太小', { ratio: faceRatio.toFixed(4), minRatio: props.minFaceRatio, maxRatio: props.maxFaceRatio }, 'info')
        scheduleNextDetection()
        return
      } 
      if (faceRatio >= props.maxFaceRatio) {
        emitStatusPrompt(PromptCode.FACE_TOO_LARGE, { size: faceRatio })
        emitDebug('detection', '人脸太大', { ratio: faceRatio.toFixed(4), minRatio: props.minFaceRatio, maxRatio: props.maxFaceRatio }, 'info')
        scheduleNextDetection()
        return
      } 

      // 检查人脸是否正对摄像头 (0-1 评分)
      let frontal = 1
      // 仅在采集阶段检查正对度，校验阶段不检查
      if (detectionState.collectedImages.size() < CONFIG.IMAGE_QUALITY.COLLECTION_COUNT) {
        frontal = checkFaceFrontal(face, result.gesture)
        updateBorderColor(faceRatio, frontal)
        if (frontal < props.minFrontal) {
          emitStatusPrompt(PromptCode.FACE_NOT_FRONTAL, { frontal: frontal })
          emitDebug('detection', '人脸正对度不够', { ratio: faceRatio.toFixed(4), frontal: frontal.toFixed(4), minFrontal: props.minFrontal }, 'info')
          scheduleNextDetection()
          return
        }        
      }
      
      const imageQuality = checkImageQuality(face, videoWidth.value, videoHeight.value)
      updateBorderColor(faceRatio, frontal, imageQuality.passed)
      if (!imageQuality.passed) {
        emitStatusPrompt(PromptCode.POOR_IMAGE_QUALITY, { quality: imageQuality.score.toFixed(2) })
        emitDebug('detection', '人脸图像质量不符合要求', { ratio: faceRatio.toFixed(4), frontal: frontal.toFixed(4), qualityScore: imageQuality.score.toFixed(2), reasons: imageQuality.reasons }, 'info')
        scheduleNextDetection()
        return
      }

      const frameImage = captureFrame()
      if (!frameImage) {
        emitDebug('detection', '捕获人脸图像失败', {}, 'warn')
        scheduleNextDetection()
        return
      }

      detectionState.collectedImages.add(frameImage, imageQuality.score)

      emitDebug('detection', '检测到单个人脸', { ratio: faceRatio.toFixed(4), frontal: frontal.toFixed(4), quality: imageQuality.score.toFixed(4) })
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
  const availableActions = props.livenessChecks.filter(action => !detectionState.completedActions.has(action))
  
  if (availableActions.length === 0) {
    emitDebug('liveness', '所有动作已完成')
    return
  }
  
  // 随机选择一个动作
  detectionState.currentAction = availableActions[Math.floor(Math.random() * availableActions.length)]
  
  // 发送 status-prompt 事件
  emitStatusPrompt(PromptCode.PLEASE_PERFORM_ACTION, { 
    action: detectionState.currentAction 
  })
  
  emitDebug('liveness', '选择动作', { action: detectionState.currentAction })
  
  // 设置超时定时器
  if (actionTimeoutId) clearTimeout(actionTimeoutId)
  actionTimeoutId = setTimeout(() => {
    if (detectionState.currentAction) {
      emitDebug('liveness', '动作检测超时', { action: detectionState.currentAction }, 'error')
      // 设置错误颜色
      emitStatusPrompt(PromptCode.ACTION_TIMEOUT, { action: detectionState.currentAction })
      resetDetectionState()
    }
  }, props.livenessActionTimeout * 1000)
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
    const isSizeValid = faceRatio > props.minFaceRatio && faceRatio < props.maxFaceRatio
    const isFrontalValid = frontal >= props.minFrontal
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
 * 获取动作的描述文本
 */
function getActionDescription(action: string): string {
  return ACTION_DESCRIPTIONS[action] || action
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
 * 捕获当前视频帧并转换为 JPEG 图片
 * @returns {string} Base64 格式的 JPEG 图片数据
 */
function captureFrame(): string | null {
  try {
    if (!videoRef.value) return null
    
      // Safari 兼容性修复：
    // 某些情况下 videoWidth/videoHeight 可能为 0 或 undefined
    // 优先使用实际设置的宽高值，而不仅依赖于 video 元素的 videoWidth/videoHeight 属性
    let videoWidth_actual = videoRef.value.videoWidth
    let videoHeight_actual = videoRef.value.videoHeight
    
    // 如果获取不到视频实际尺寸，使用 canvas 尺寸作为后备
    if (!videoWidth_actual || !videoHeight_actual) {
      emitDebug('capture', '视频尺寸获取失败，使用备用值', { fallback: `${videoWidth.value}x${videoHeight.value}` }, 'warn')
      videoWidth_actual = videoWidth.value
      videoHeight_actual = videoHeight.value
    }
    
    // 再次检查是否为有效值
    if (!videoWidth_actual || !videoHeight_actual) {
      emitDebug('capture', '无法获取有效视频尺寸', {}, 'error')
      return null
    }
    
    // 如果缓存的 canvas 尺寸不匹配，重新创建
    if (!captureCanvas || captureCanvas.width !== videoWidth_actual || captureCanvas.height !== videoHeight_actual) {
      captureCanvas = document.createElement('canvas')
      captureCanvas.width = videoWidth_actual
      captureCanvas.height = videoHeight_actual
      captureCtx = captureCanvas.getContext('2d')
      emitDebug('capture', 'Canvas 创建/调整大小', { width: videoWidth_actual, height: videoHeight_actual })
    }    if (!captureCtx) return null
    
    // 在尝试绘制前，再次验证视频的可绘制性（Safari 特定修复）
    if (videoRef.value.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA && 
        videoRef.value.readyState !== HTMLMediaElement.HAVE_CURRENT_DATA) {
      emitDebug('capture', '视频不可绘制', { readyState: videoRef.value.readyState }, 'warn')
      return null
    }
    
    captureCtx.drawImage(videoRef.value, 0, 0, videoWidth_actual, videoHeight_actual)
    
    const imageData = captureCanvas.toDataURL('image/jpeg', 0.9)
    emitDebug('capture', '帧已捕获', { size: imageData.length })
    return imageData
  } catch (e) {
    emitDebug('capture', '捕获帧失败', { error: (e as Error).message }, 'error')
    return null
  }
}

/**
 * 进行静默活体检测（自动检测采集的图片是否为真实人脸）
 * @param {FaceResult} face - 人脸检测结果
 */
async function performSilentLivenessDetection(face: FaceResult): Promise<void> {
  emitDebug('liveness', '开始静默活体检测当前帧')
  
  // 根据 Human.js 的 FaceResult 类型定义：
  // - real?: number  - face anti-spoofing result confidence [0-1] （反欺骗检测：真实人脸置信度）
  // - live?: number  - face liveness result confidence [0-1] （活体检测：活体置信度）
  // 
  // 检测流程：
  // 1. 先检查 real（反欺骗检测）- 判断是否为真实人脸（排除欺诈）
  // 2. 如果是真实人脸，则使用 live（活体检测）- 进一步判断是否为活体

  const info: LivenessDetectedData = {
    real: face.real || -1,
    live: face.live || -1
  }
  emit(FACE_DETECTOR_EVENTS.LIVENESS_DETECTED, info)
      
  let realScore = 0
  let isFraudDetected = false
  
  // 策略 1: 优先使用 real 属性进行反欺骗检测（排除欺诈）
  if (face.real !== undefined && typeof face.real === 'number') {
    emitDebug('liveness', '反欺骗检测结果', { real: face.real, threshold: CONFIG.LIVENESS.ANTI_SPOOFING_THRESHOLD })
    
    // 如果 real 分数低于反欺骗阈值，说明检测到欺诈
    if (face.real < CONFIG.LIVENESS.ANTI_SPOOFING_THRESHOLD) {
      isFraudDetected = true
      realScore = face.real
      emitDebug('liveness', '检测到欺诈行为', { score: face.real }, 'error')
    } else {
      // real 分数充分，继续检查 live
      emitDebug('liveness', '反欺骗检测通过')
      
      // 策略 2: 如果反欺骗检测通过，再用 live 属性进行活体检测
      if (face.live !== undefined && typeof face.live === 'number') {
        realScore = face.live
        emitDebug('liveness', '使用 live 属性作为最终分数', { score: realScore })
      } else {
        // 如果没有 live，就用 real 作为最终分数
        realScore = face.real
        emitDebug('liveness', '无 live 属性，使用 real 作为最终分数', { score: realScore })
      }
    }
  }
  // 备选方案: 如果没有 real，尝试使用 live
  else if (face.live !== undefined && typeof face.live === 'number') {
    realScore = face.live
    emitDebug('liveness', '使用 live 属性（无反欺骗检测）', { score: realScore })
  }
  // 都没有
  else {
    emitDebug('liveness', '无活体检测结果', { keys: Object.keys(face) }, 'warn')
    // 设置错误颜色
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.NO_LIVENESS_RESULT, message: '无法获取活体检测结果，请确保 liveness 或 antispoof 模型已正确加载' })
    stopDetection()
    return
  }
      
  emitDebug('liveness', '活体分数提取', { score: realScore, isFraud: isFraudDetected })

  // 判断是否通过活体检测
  if (isFraudDetected) {
    // 检测到欺诈，直接失败，不再继续检测
    emitDebug('liveness', '活体检测失败 - 检测到欺诈', { score: realScore }, 'error')
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { 
      code: ErrorCode.FRAUD_DETECTED, 
      message: '检测到欺诈行为（可能是照片、视频或面具），请用真实人脸重试' 
    })
    stopDetection()
  } else if (realScore >= props.silentLivenessThreshold) {
    emitDebug('liveness', '活体检测成功', { score: realScore })
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
    // 发送成功事件
    emit(FACE_DETECTOR_EVENTS.LIVENESS_COMPLETED, {
      qualityScore: bestScore,
      imageData: bestImage,
      liveness: realScore
    })
    // 设置成功颜色
    videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
    stopDetection(true)
    
  } else {
    emitDebug('liveness', '活体分数不足，继续检测', { score: realScore, threshold: props.silentLivenessThreshold })
    // 分数不足时，继续检测，而不是报错
    // 继续检测下一帧
    scheduleNextDetection()
  }
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
