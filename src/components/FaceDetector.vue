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
import Human from '@vladmandic/human'
// 导入类型定义
import type { FaceCollectedData, LivenessCompletedData, ErrorData, FaceDetectorProps, LivenessDetectedData, DebugData, StatusPromptData } from './face-detector'
import { DetectionMode, LivenessAction, FACE_DETECTOR_EVENTS, BORDER_COLOR_STATES, CONFIG, ErrorCode, PromptCode, PROMPT_CODE_DESCRIPTIONS, ACTION_DESCRIPTIONS, detectBrowserInfo, isWebGLAvailable, getWebGLInfo } from './face-detector'

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

// ===== 活体检测相关类型定义 =====
interface DetectionState {
  // === 流程控制 ===
  isLivenessStarted: boolean
  isSilentLivenessStarted: boolean
  
  // === 活体动作检测 ===
  completedActions: Set<LivenessAction>
  currentAction: LivenessAction | null
  
  // === 图片采集 ===
  baselineImage: string | null
}

// ===== 活体检测相关变量 =====
const detectionState = reactive<DetectionState>({
  isLivenessStarted: false,
  isSilentLivenessStarted: false,
  completedActions: new Set(),
  currentAction: null,
  baselineImage: null
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
  // 清除之前的待处理帧
  if (detectionFrameId !== null) {
    cancelAnimationFrame(detectionFrameId)
  }

  const currentTime = performance.now()
  const timeSinceLastDetection = currentTime - lastDetectionTime
  
  if (timeSinceLastDetection >= minDelayMs) {
    // 如果已经过了足够的时间，立即运行检测
    lastDetectionTime = currentTime
    detectionFrameId = requestAnimationFrame(() => {
      detectionFrameId = null
      detect()
    })
  } else {
    // 否则安排在合适的时间运行
    detectionFrameId = requestAnimationFrame(scheduleDetectionCallback)
  }
}

/**
 * requestAnimationFrame 的回调函数 - 持续监听是否该执行检测
 */
function scheduleDetectionCallback(): void {
  const currentTime = performance.now()
  const timeSinceLastDetection = currentTime - lastDetectionTime
  const minDelayMs = CONFIG.DETECTION.DETECTION_FRAME_DELAY
  
  if (timeSinceLastDetection >= minDelayMs) {
    // 时间到了，执行检测
    lastDetectionTime = currentTime
    detectionFrameId = null
    detect()
  } else {
    // 时间未到，继续监听
    detectionFrameId = requestAnimationFrame(scheduleDetectionCallback)
  }
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
  detectionState.baselineImage = null
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

  if (success && detectionState.baselineImage) {
    displayResultImage(detectionState.baselineImage)
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
 * @param {number} faceRatio - 人脸占画面比例 (%)
 * @param {number} frontal - 人脸正对度评分 (0-100)
 * @param {Array} gestures - 检测到的手势/表情
 */
function handleSingleFace(faceRatio: number, frontal: number, gestures: any): void {
  // 更新边框颜色
  updateBorderColor(faceRatio, frontal)
  
  // 判断人脸是否符合条件：大小在范围内，且正对度符合要求
  if (faceRatio > props.minFaceRatio && faceRatio < props.maxFaceRatio && frontal >= props.minFrontal) {
    emitDebug('detection', '检测到符合条件的人脸', { ratio: faceRatio.toFixed(4), frontal: frontal.toFixed(4), mode: props.mode })
    
    // 抛出正常状态提示，清空动作文本
    emitStatusPrompt(PromptCode.NORMAL_STATE)
    
    // 根据检测模式处理
    if (props.mode === DetectionMode.COLLECTION) {
      handleCollectionMode()
    } else if (props.mode === DetectionMode.SILENT_LIVENESS) {
      handleSilentLivenessMode()
    } else if (props.mode === DetectionMode.LIVENESS) {
      handleLivenessMode(gestures)
    }
  } else {
    // 人脸不符合条件，根据具体原因抛出提示
    let promptCode: PromptCode | null = null
    const promptData: Record<string, any> = {}
    
    if (faceRatio <= props.minFaceRatio) {
      promptCode = PromptCode.FACE_TOO_SMALL
      promptData.size = faceRatio
    } else if (faceRatio >= props.maxFaceRatio) {
      promptCode = PromptCode.FACE_TOO_LARGE
      promptData.size = faceRatio
    } else if (frontal < props.minFrontal) {
      promptCode = PromptCode.FACE_NOT_FRONTAL
      promptData.frontal = frontal
    }
    
    if (promptCode) {
      emitStatusPrompt(promptCode, promptData)
    }
    
    emitDebug('detection', '人脸不符合条件', { ratio: faceRatio.toFixed(4), frontal: frontal.toFixed(4), minRatio: props.minFaceRatio, maxRatio: props.maxFaceRatio, minFrontal: props.minFrontal }, 'info')
    scheduleNextDetection()
  }
}

/**
 * 验证活体检测是否应该中止 - 检查人脸数量变化
 * @param {number} faceCount - 人脸数量
 * @returns {boolean} 如果应该中止检测则返回 true
 */
function shouldStopLivenessOnFaceCountChange(faceCount: number): boolean {
  // 在 LIVENESS 模式下，已开始检测但人脸数量不为 1 时应中止
  if (props.mode === DetectionMode.LIVENESS && detectionState.isLivenessStarted && faceCount !== 1) {
    emitDebug('liveness', '活体检测期间人脸数量变化', { expected: 1, actual: faceCount }, 'error')
    return true
  }
  
  // 在 SILENT_LIVENESS 模式下，已开始检测但人脸数量不为 1 时应中止
  if (props.mode === DetectionMode.SILENT_LIVENESS && detectionState.isSilentLivenessStarted && faceCount !== 1) {
    emitDebug('liveness', '静默活体检测期间人脸数量变化', { expected: 1, actual: faceCount }, 'error')
    return true
  }
  
  return false
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
  
  // 检查活体检测期间是否发生人脸数量变化
  if (shouldStopLivenessOnFaceCountChange(faceCount)) {
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.FACE_COUNT_CHANGED, message: `检测到人脸数量变化，期望1张，实际${faceCount}张。请保持正脸对着摄像头，重新开始检测。` })
    stopDetection()
    return
  }

  scheduleNextDetection()
}

/**
 * 处理采集模式：检测到合格人脸后截取图片
 */
function handleCollectionMode(): void {
  // 如果已经采集过基线图片，说明已处于质量检测中，继续收集更好质量的图片
  if (detectionState.baselineImage && !isDetecting.value) {
    // 检测完成
    return
  }
  
  // 第一次采集 - 先采集图片并检测质量
  detectionState.baselineImage = captureFrame()
  
  // 当前已有人脸检测结果，从全局 detect 方法中获取的 result 中提取人脸数据
  // 但由于 detect 中的 result 是局部变量，我们通过 human.result 获取最新检测结果
  if (human && human.result && human.result.face && human.result.face.length > 0) {
    const currentFace = human.result.face[0]
    const qualityCheck = checkImageQuality(currentFace, videoWidth.value, videoHeight.value)
    
    if (qualityCheck.passed) {
      emitStatusPrompt(PromptCode.GOOD_IMAGE_QUALITY, {quality: qualityCheck.score.toFixed(2) })
      emitDebug('quality', '图像质量符合要求，采集完成', { score: qualityCheck.score.toFixed(2) })
      emit(FACE_DETECTOR_EVENTS.FACE_COLLECTED, { 
        imageData: detectionState.baselineImage 
      })
      videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
      stopDetection(true)
    } else {
      emitStatusPrompt(PromptCode.POOR_IMAGE_QUALITY, {quality: qualityCheck.score.toFixed(2) })
      emitDebug('quality', '图像质量不足，继续采集更好质量的图片', { 
        score: qualityCheck.score.toFixed(2),
        reasons: qualityCheck.reasons
      }, 'warn')
      // 重置基线图片，继续采集
      detectionState.baselineImage = null
      // 继续检测
      scheduleNextDetection()
      return
    }
  } else {
    // 无法获取人脸检测结果 - 这是一个错误条件，不应该直接通过
    // 可能原因：Human.js 检测结果不完整或格式异常
    emitDebug('quality', '无法获取人脸检测结果用于质量评估', { 
      hasHuman: !!human, 
      hasResult: !!human?.result, 
      hasFaces: !!human?.result?.face,
      faceCount: human?.result?.face?.length || 0
    }, 'error')
    emit(FACE_DETECTOR_EVENTS.ERROR, { 
      code: ErrorCode.DETECTION_ERROR, 
      message: '检测结果格式异常，无法评估图像质量。请重新尝试。' 
    })
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    stopDetection()
  }
}

/**
 * 处理静默活体检测模式：采集图片后自动进行活体检测
 */
function handleSilentLivenessMode(): void {
  if (!detectionState.isSilentLivenessStarted) {
    emitDebug('liveness', '静默活体检测开始')
    detectionState.baselineImage = captureFrame()  // 捕获完整摄像头照片
    
    // 进行图像质量检查
    if (human && human.result && human.result.face && human.result.face.length > 0) {
      const currentFace = human.result.face[0]
      const qualityCheck = checkImageQuality(currentFace, videoWidth.value, videoHeight.value)
      
      if (!qualityCheck.passed) {
        emitStatusPrompt(PromptCode.POOR_IMAGE_QUALITY, {quality: qualityCheck.score.toFixed(2) })
        emitDebug('quality', '采集的图像质量不足，继续采集', { 
          score: qualityCheck.score.toFixed(2),
          reasons: qualityCheck.reasons
        }, 'warn')
        // 重置基线图片，继续采集更好质量的帧
        detectionState.baselineImage = null
        scheduleNextDetection()
        return
      }
      
      emitStatusPrompt(PromptCode.GOOD_IMAGE_QUALITY, {quality: qualityCheck.score.toFixed(2) })
      emitDebug('quality', '采集的图像质量符合要求', { score: qualityCheck.score.toFixed(2) })
    }
    
    detectionState.isSilentLivenessStarted = true
    // 异步执行活体检测
    performSilentLivenessDetection()
  } else {
    // 已经开始了静默活体检测，继续捕获新的图片进行检测
    emitDebug('liveness', '继续静默活体检测，捕获新帧')
    detectionState.baselineImage = captureFrame()  // 捕获新的图片
    
    // 异步执行活体检测
    performSilentLivenessDetection()
  }
}

/**
 * 处理活体检测模式：需要用户执行指定动作
 * @param {Array} gestures - 检测到的手势/表情
 */
function handleLivenessMode(gestures: any): void {
  verifyLiveness(gestures)
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
    
    // 如果 face 属性为空，尝试其他可能的属性名
    if (!faces || faces.length === 0) {
      faces = (result as any).faces || (result as any).detections || []
      if (faces.length > 0) {
        emitDebug('detection', '使用备选属性名获取人脸数据', { propertyUsed: 'faces/detections' })
      }
    }
    
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
      
      // 检查人脸是否正对摄像头 (0-1 评分)
      const frontal = checkFaceFrontal(face, result.gesture)
      
      emitDebug('detection', '检测到单个人脸', { ratio: faceRatio.toFixed(4), frontal: frontal.toFixed(4) })
      
      handleSingleFace(faceRatio, frontal, result.gesture)
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

/**
 * 检查单个质量指标
 */
function checkQualityMetric(value: any, threshold: number, metricName: string): { passed: boolean, reason?: string } {
  if (value === undefined || value === null) {
    return { passed: false, reason: `${metricName} 属性缺失` }
  }
  if (value < threshold) {
    return { passed: false, reason: `${metricName}: ${value.toFixed(2)} < ${threshold}` }
  }
  return { passed: true }
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
      return landmarks.flat().map((v, i) => {
        if (i % 2 === 0) return { x: v, y: landmarks[i + 1] }
      }).filter(Boolean)
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
  if (typeof lm?.confidence === 'number' && lm.confidence >= 0 && lm.confidence <= 1) {
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
    return 0.6  // 中等置信度
  }
  
  return 0  // 完全无效数据
}

/**
 * 检查人脸的完整性（五官齐全、未被裁剪）
 * @param {Object} face - 人脸检测结果
 * @param {number} imageWidth - 图片宽度（用于边界检测）
 * @param {number} imageHeight - 图片高度（用于边界检测）
 * @returns {Object} { passed: boolean, score: number, reasons: string[] }
 */
function checkFaceCompleteness(face: any, imageWidth: number, imageHeight: number): { passed: boolean, score: number, reasons: string[] } {
  const reasons: string[] = []
  const config = CONFIG.IMAGE_QUALITY.FACE_COMPLETENESS
  let score = 1.0
  
  emitDebug('completeness-check', '开始人脸完整性检测', {
    faceBox: face.box || face.boxRaw,
    hasLandmarks: !!face.landmarks,
    hasKeypoints: !!face.keypoints,
    imageSize: `${imageWidth}x${imageHeight}`
  })

  // 1. 检查人脸框的边界完整性
  const faceBox = face.box || face.boxRaw
  if (faceBox && faceBox.length >= 4) {
    const [x, y, width, height] = faceBox
    
    // 改进的边界检测：检查人脸是否被严重裁剪（而不是"接近"边界）
    // 允许人脸框的边缘稍微超出或接近边界，只要主要部分在框内即可
    const margin = config.BOUNDARY_MARGIN  // 现在是 10
    
    // 只有当人脸被严重裁剪时才判定为问题
    const isSeverelyClipped = 
      x + margin < 0 ||  // 左边严重超出
      y + margin < 0 ||  // 上边严重超出
      (x + width - margin) > imageWidth ||  // 右边严重超出
      (y + height - margin) > imageHeight   // 下边严重超出
    
    if (isSeverelyClipped) {
      const reason = '人脸被严重裁剪，请调整位置'
      reasons.push(reason)
      score -= 0.2  // 减少惩罚（从 0.3 → 0.2）
      emitDebug('completeness-check', reason, { x, y, width, height, margin })
    }
  }

  // 2. 检查面部关键点/地标（五官）的完整性
  const landmarks = getValidLandmarks(face)
  
  if (landmarks && landmarks.length > 0) {
    emitDebug('completeness-check', '关键点信息', {
      totalLandmarks: landmarks.length,
      firstLandmark: landmarks[0],
      method: 'getValidLandmarks'
    })
    
    // 计算检测到的有效关键点数量
    const totalLandmarks = landmarks.length
    const validLandmarks = landmarks.filter((lm: any) => {
      const confidence = getKeypointConfidence(lm)
      return confidence >= config.KEYPOINT_CONFIDENCE_THRESHOLD
    }).length
    
    const keypointRatio = validLandmarks / totalLandmarks
    
    // 改进：使用相对比例，而不是固定的 0.8
    // 现在改为 0.65，更容易通过
    if (keypointRatio < config.MIN_KEYPOINT_RATIO) {
      const reason = `检测到的关键点不足：${(keypointRatio * 100).toFixed(0)}% < ${(config.MIN_KEYPOINT_RATIO * 100).toFixed(0)}%（${validLandmarks}/${totalLandmarks}）`
      reasons.push(reason)
      score -= 0.15  // 减少惩罚（从 0.25 → 0.15）
      emitDebug('completeness-check', reason, { validLandmarks, totalLandmarks, keypointRatio })
    }
    
    // 3. 检查特定五官（眼睛、鼻子、嘴巴）是否都检测到了
    // 改进：根据关键点总数自适应计算预期数量
    const eyeLandmarks = landmarks.filter((lm: any, idx: number) => 
      idx < Math.min(10, totalLandmarks * 0.15) && 
      getKeypointConfidence(lm) >= config.KEYPOINT_CONFIDENCE_THRESHOLD
    )
    
    const noseLandmarks = landmarks.filter((lm: any, idx: number) => 
      idx >= Math.min(10, totalLandmarks * 0.15) && 
      idx < Math.min(20, totalLandmarks * 0.4) && 
      getKeypointConfidence(lm) >= config.KEYPOINT_CONFIDENCE_THRESHOLD
    )
    
    const mouthLandmarks = landmarks.filter((lm: any, idx: number) => 
      idx >= Math.min(20, totalLandmarks * 0.4) && 
      getKeypointConfidence(lm) >= config.KEYPOINT_CONFIDENCE_THRESHOLD
    )
    
    // 改进的五官检测：使用更宽松的阈值和更低的惩罚
    // 眼睛：从 < 4 改为 < 2
    if (eyeLandmarks.length < config.MIN_EYE_KEYPOINTS) {
      const reason = `眼睛检测不充分（${eyeLandmarks.length} 个点），请确保眼睛清晰可见`
      reasons.push(reason)
      score -= 0.08  // 减少惩罚（从 0.15 → 0.08）
      emitDebug('completeness-check', reason, { eyeLandmarks: eyeLandmarks.length, threshold: config.MIN_EYE_KEYPOINTS })
    }
    
    // 鼻子：从 < 2 改为 < 1
    if (noseLandmarks.length < config.MIN_NOSE_KEYPOINTS) {
      const reason = `鼻子检测不充分（${noseLandmarks.length} 个点），请调整角度`
      reasons.push(reason)
      score -= 0.05  // 减少惩罚（从 0.1 → 0.05）
      emitDebug('completeness-check', reason, { noseLandmarks: noseLandmarks.length, threshold: config.MIN_NOSE_KEYPOINTS })
    }
    
    // 嘴巴：从 < 2 改为 < 1
    if (mouthLandmarks.length < config.MIN_MOUTH_KEYPOINTS) {
      const reason = `嘴巴检测不充分（${mouthLandmarks.length} 个点），请调整角度`
      reasons.push(reason)
      score -= 0.05  // 减少惩罚（从 0.1 → 0.05）
      emitDebug('completeness-check', reason, { mouthLandmarks: mouthLandmarks.length, threshold: config.MIN_MOUTH_KEYPOINTS })
    }
  } else {
    // 改进：不直接标记为失败，而是降低分数
    // 可能是 Human.js 版本不同导致的属性名差异
    const warning = '未检测到标准格式的人脸关键点/地标，这可能是 Human.js 版本或检测结果格式差异'
    emitDebug('completeness-check', warning, { 
      faceKeys: Object.keys(face).slice(0, 15),
      note: '将继续以其他质量指标评估'
    }, 'warn')
    
    // 只进行轻微的扣分，而不是直接失败
    score -= 0.2  // 减少惩罚（从 0.5 → 0.2）
    // 不加入 reasons，避免直接失败
  }
  
  // 确保分数在 0-1 之间
  score = Math.max(0, Math.min(1, score))
  const passed = reasons.length === 0
  
  if (!passed) {
    emitDebug('completeness-check', '人脸完整性检测未通过', {
      score: score.toFixed(2),
      reasons,
      guidance: '提示：如果人脸符合预期但仍未通过，可能是配置过于严格'
    }, 'warn')
  } else {
    emitDebug('completeness-check', '人脸完整性检测通过', {
      score: score.toFixed(2)
    })
  }
  
  return { passed, score, reasons }
}

/**
 * 检查图像质量是否符合要求（包括质量和人脸完整性）
 * @param {Object} face - 人脸检测结果，包含 boxScore、faceScore、score 等字段
 * @param {number} imageWidth - 图片宽度（可选，默认为视频宽度）
 * @param {number} imageHeight - 图片高度（可选，默认为视频高度）
 * @returns {Object} 包含质量评估结果的对象 { passed: boolean, score: number, reasons: string[] }
 */
function checkImageQuality(face: any, imageWidth?: number, imageHeight?: number): { passed: boolean, score: number, reasons: string[] } {
  const reasons: string[] = []
  const config = CONFIG.IMAGE_QUALITY
  
  // 如果未提供图片尺寸，使用视频尺寸
  const imgWidth = imageWidth || videoWidth.value
  const imgHeight = imageHeight || videoHeight.value

  emitDebug('quality-check', '开始图像质量检测', { 
    boxScore: face.boxScore,
    faceScore: face.faceScore,
    overallScore: face.score,
    imageSize: `${imgWidth}x${imgHeight}`
  })
  
  // ===== 第一步：检查图像质量指标 =====
  const metrics = [
    { value: face.boxScore, threshold: config.MIN_BOX_SCORE, name: '人脸检测框得分' },
    { value: face.faceScore, threshold: config.MIN_FACE_SCORE, name: '人脸网格得分' },
    { value: face.score, threshold: config.MIN_OVERALL_SCORE, name: '综合得分' }
  ]
  
  let qualityScore = 1.0
  const qualityReasons: string[] = []
  
  metrics.forEach(({ value, threshold, name }) => {
    const result = checkQualityMetric(value, threshold, name)
    if (!result.passed && result.reason) {
      qualityReasons.push(result.reason)
    }
  })
  
  if (qualityReasons.length > 0) {
    reasons.push(...qualityReasons)
    qualityScore = Math.max(...metrics.map(m => m.value ?? 0))
  }

  // ===== 第二步：检查人脸完整性 =====
  const completenessCheck = checkFaceCompleteness(face, imgWidth, imgHeight)
  if (!completenessCheck.passed) {
    reasons.push(...completenessCheck.reasons)
  }
  
  // 综合两个检测的分数（取最小值，确保两者都达到标准）
  const finalScore = Math.min(qualityScore, completenessCheck.score)
  const passed = reasons.length === 0
  
  if (!passed) {
    emitStatusPrompt(PromptCode.POOR_IMAGE_QUALITY, { score: finalScore })
    emitDebug('quality-check', '图像质量检测未通过', { 
      passed, 
      score: finalScore.toFixed(2),
      qualityScore: qualityScore.toFixed(2),
      completenessScore: completenessCheck.score.toFixed(2),
      reasons
    }, 'warn')
  } else {
    emitDebug('quality-check', '图像质量检测通过', {
      score: finalScore.toFixed(2),
      qualityScore: qualityScore.toFixed(2),
      completenessScore: completenessCheck.score.toFixed(2)
    })
  }
  
  return { passed, score: finalScore, reasons }
}

/**
 * 检查人脸是否正对摄像头
 * @param {Object} face - 人脸检测结果
 * @param {Array} gestures - 检测到的手势/表情
 * @returns {number} 正对度评分 (0-1)
 */
function checkFaceFrontal(face: any, gestures: any): number {
  // 优先使用 gestures 中的 facing center 判定
  if (gestures && gestures.length > 0) {
    const isFacingCenter = gestures.some((g: any) => g.gesture?.includes('facing center'))
    
    // 如果识别到 "facing center"，则判定为正脸，返回 1.0
    if (isFacingCenter) {
      emitDebug('detection', '检测到正脸', { method: 'gesture: facing center' })
      return 1.0
    }
    
    // 如果识别到 facing left 或 facing right，返回较低分数
    const isFacingLeft = gestures.some((g: any) => g.gesture?.includes('facing left'))
    const isFacingRight = gestures.some((g: any) => g.gesture?.includes('facing right'))
    
    if (isFacingLeft || isFacingRight) {
      emitDebug('detection', '检测到非正脸', { method: 'gesture', direction: isFacingLeft ? 'left' : 'right' })
      return 0.5 // 返回 0.5，表示偏转
    }
  }
  
  // 备用方案：使用角度算法计算正对度评分（更严格的精确判定）
  // 获取人脸的 yaw (左右摇晃)、pitch (上下俯仰)、roll (旋转) 角度
  const ang = face.rotation?.angle || { yaw: 0, pitch: 0, roll: 0 }
  
  // 更严格的角度阈值判定
  // 要求：yaw < 5°、pitch < 5°、roll < 3°，才能达到较高的正脸评分
  
  // 基础评分，从 1.0 开始
  let score = 1.0
  
  // Yaw 角度惩罚（左右摇晃）- 权重最高 (60%)
  // 目标：yaw 应该在 ±3° 以内
  const yawThreshold = CONFIG.LIVENESS.FRONTAL_YAW_THRESHOLD
  const yawPenalty = Math.abs(ang.yaw) > yawThreshold 
    ? Math.abs(ang.yaw) - yawThreshold  // 超出部分作为惩罚
    : 0
  // yaw 每超过 1° 扣 0.15
  score -= yawPenalty * 0.15
  
  // Pitch 角度惩罚（上下俯仰）- 权重中等 (25%)
  // 目标：pitch 应该在 ±4° 以内
  const pitchThreshold = CONFIG.LIVENESS.FRONTAL_PITCH_THRESHOLD
  const pitchPenalty = Math.abs(ang.pitch) > pitchThreshold 
    ? Math.abs(ang.pitch) - pitchThreshold
    : 0
  // pitch 每超过 1° 扣 0.1
  score -= pitchPenalty * 0.1
  
  // Roll 角度惩罚（旋转）- 权重最低 (15%)
  // 目标：roll 应该在 ±2° 以内
  const rollThreshold = CONFIG.LIVENESS.FRONTAL_ROLL_THRESHOLD
  const rollPenalty = Math.abs(ang.roll) > rollThreshold 
    ? Math.abs(ang.roll) - rollThreshold
    : 0
  // roll 每超过 1° 扣 0.12
  score -= rollPenalty * 0.12
  
  // 确保评分在 0-1 之间
  return Math.max(0, Math.min(1, score))
}

/**
 * 活体检测验证：检测用户是否执行指定的活体动作
 * @param {Array} gestures - 检测到的手势/表情
 */
function verifyLiveness(gestures: any): void {
  // 如果是第一次检测到符合条件的人脸，先捕获并暂存（不立即emit）
  if (detectionState.completedActions.size === 0 && !detectionState.baselineImage) {
    emitDebug('liveness', '首次检测到符合条件的人脸')
    detectionState.baselineImage = captureFrame()  // 捕获完整摄像头照片
    // 标记活体检测已开始，后续 detect 方法需要检查人脸数量
    detectionState.isLivenessStarted = true
    
    // 选择第一个随机动作
    selectNextRandomAction()
  }
  
  // 检查是否全部动作完成
  if (detectionState.completedActions.size >= normalizedLivenessActionCount.value) {
    emitDebug('liveness', '所有活体动作已完成')
    // 设置成功颜色
    videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
    // 抛出 liveness-completed 事件
    emit(FACE_DETECTOR_EVENTS.LIVENESS_COMPLETED, { 
      imageData: detectionState.baselineImage, 
      liveness: 100 }
    )
    stopDetection(true)
    return
  }  // 获取当前需要检测的随机动作
  if (!detectionState.currentAction) {
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
  }
  
  // 继续检测下一帧
  scheduleNextDetection()
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
      videoBorderColor.value = BORDER_COLOR_STATES.ERROR
      emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.ACTION_TIMEOUT, message: `动作检测超时（${props.livenessActionTimeout}秒）：未在规定时间内检测到${getActionDescription(detectionState.currentAction)}，请重试` })
      stopDetection()
    }
  }, props.livenessActionTimeout * 1000)
}

/**
 * 更新视频容器边框颜色
 * @param {number} countOrRatio - 人脸数量或人脸占画面比例
 * @param {number} frontal - 人脸正对度评分 (可选)
 */
function updateBorderColor(countOrRatio: number, frontal?: number): void {
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
 * 使用 Human.js 的 liveness 检测能力
 */
async function performSilentLivenessDetection(): Promise<void> {
  if (!detectionState.baselineImage) {
    emitDebug('liveness', '没有捕获图片用于活体检测', {}, 'error')
    // 设置错误颜色
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.CAPTURE_FAILED, message: '未能捕获图片，请重试' })
    stopDetection()
    return
  }

  if (!human) {
    emitDebug('liveness', 'Human.js 未初始化', {}, 'error')
    // 设置错误颜色
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.ENGINE_NOT_INITIALIZED, message: 'AI 检测引擎未初始化，请稍后重试' })
    stopDetection()
    return
  }

  try {
    emitDebug('liveness', '开始静默活体检测')
    
    // 创建临时图片对象用于 Human.js 检测
    const tempImg = new Image()
    
    tempImg.onload = async () => {
      try {
        // 使用 Human.js 的检测功能分析采集的图片
        // 如果用户提供了运行时配置，则使用；否则使用实例初始化时的配置
        const runtimeConfig = Object.keys(props.humanConfig).length > 0 ? props.humanConfig : undefined
        const result = await human!.detect(tempImg, runtimeConfig)
        
        if (!result) {
          emitDebug('liveness', 'Human.js 检测返回无结果', {}, 'warn')
          // 设置错误颜色
          videoBorderColor.value = BORDER_COLOR_STATES.ERROR
          emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.LIVENESS_ANALYSIS_FAILED, message: '活体检测失败，无法分析图片，请重试' })
          stopDetection()
          return
        }

        emitDebug('liveness', '检测完成', { faceCount: result.face?.length || 0 })

        // 提取 liveness 检测结果
        const faces = result.face || []
        if (faces.length === 0) {
          emitDebug('liveness', '图片中未检测到人脸', {}, 'warn')
          // 设置错误颜色
          videoBorderColor.value = BORDER_COLOR_STATES.ERROR
          emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.NO_FACE_IN_IMAGE, message: '未在图片中检测到人脸，请确保采集了清晰的人脸照片' })
          stopDetection()
          return
        }

        // 获取第一张脸的数据
        const faceData = faces[0] as any
        
        // 检查图像质量 - 在进行活体检测前先验证采集图片的质量
        const qualityCheck = checkImageQuality(faceData, tempImg.width, tempImg.height)
        if (!qualityCheck.passed) {
          emitStatusPrompt(PromptCode.POOR_IMAGE_QUALITY, {quality: qualityCheck.score.toFixed(2) })
          emitDebug('quality', '采集图片质量不足，重新采集', { 
            score: qualityCheck.score.toFixed(2),
            reasons: qualityCheck.reasons
          }, 'warn')
          // 重置并继续采集，寻找更清晰的帧
          detectionState.baselineImage = null
          detectionState.isSilentLivenessStarted = false
          scheduleNextDetection()
          return
        }
        
        emitDebug('liveness', '人脸数据提取', { keys: Object.keys(faceData).slice(0, 10), live: faceData.live, real: faceData.real })
        
        // 根据 Human.js 的 FaceResult 类型定义：
        // - real?: number  - face anti-spoofing result confidence [0-1] （反欺骗检测：真实人脸置信度）
        // - live?: number  - face liveness result confidence [0-1] （活体检测：活体置信度）
        // 
        // 检测流程：
        // 1. 先检查 real（反欺骗检测）- 判断是否为真实人脸（排除欺诈）
        // 2. 如果是真实人脸，则使用 live（活体检测）- 进一步判断是否为活体

        const info: LivenessDetectedData = {
          real: faceData.real || -1,
          live: faceData.live || -1
        }
        emit(FACE_DETECTOR_EVENTS.LIVENESS_DETECTED, info)
        
        let realScore = 0
        let isFraudDetected = false
        
        // 策略 1: 优先使用 real 属性进行反欺骗检测（排除欺诈）
        if (faceData.real !== undefined && typeof faceData.real === 'number') {
          emitDebug('liveness', '反欺骗检测结果', { real: faceData.real, threshold: CONFIG.LIVENESS.ANTI_SPOOFING_THRESHOLD })
          
          // 如果 real 分数低于反欺骗阈值，说明检测到欺诈
          if (faceData.real < CONFIG.LIVENESS.ANTI_SPOOFING_THRESHOLD) {
            isFraudDetected = true
            realScore = faceData.real
            emitDebug('liveness', '检测到欺诈行为', { score: faceData.real }, 'error')
          } else {
            // real 分数充分，继续检查 live
            emitDebug('liveness', '反欺骗检测通过')
            
            // 策略 2: 如果反欺骗检测通过，再用 live 属性进行活体检测
            if (faceData.live !== undefined && typeof faceData.live === 'number') {
              realScore = faceData.live
              emitDebug('liveness', '使用 live 属性作为最终分数', { score: realScore })
            } else {
              // 如果没有 live，就用 real 作为最终分数
              realScore = faceData.real
              emitDebug('liveness', '无 live 属性，使用 real 作为最终分数', { score: realScore })
            }
          }
        }
        // 备选方案: 如果没有 real，尝试使用 live
        else if (faceData.live !== undefined && typeof faceData.live === 'number') {
          realScore = faceData.live
          emitDebug('liveness', '使用 live 属性（无反欺骗检测）', { score: realScore })
        }
        // 都没有
        else {
          emitDebug('liveness', '无活体检测结果', { keys: Object.keys(faceData) }, 'warn')
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
          
          // 设置成功颜色
          videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
          
          // 发送成功事件
          emit(FACE_DETECTOR_EVENTS.LIVENESS_COMPLETED, {
            imageData: detectionState.baselineImage,
            liveness: realScore
          })
          
          stopDetection(true)
        } else {
          emitDebug('liveness', '活体分数不足，继续检测', { score: realScore, threshold: props.silentLivenessThreshold })
          // 分数不足时，继续检测，而不是报错
          // 继续检测下一帧
          scheduleNextDetection()
        }
      } catch (e) {
        emitDebug('liveness', '活体分析出错', { error: (e as Error).message }, 'error')
        // 设置错误颜色
        videoBorderColor.value = BORDER_COLOR_STATES.ERROR
        emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.LIVENESS_DETECTION_FAILED, message: `活体检测出错: ${e instanceof Error ? e.message : '未知错误'}` })
        stopDetection()
      }
    }

    tempImg.onerror = () => {
      emitDebug('liveness', '采集图片加载失败', {}, 'error')
      // 设置错误颜色
      videoBorderColor.value = BORDER_COLOR_STATES.ERROR
      emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.IMAGE_LOAD_FAILED, message: '无法加载采集的图片进行活体检测' })
      stopDetection()
    }

    // 加载采集的图片
    tempImg.src = detectionState.baselineImage
  } catch (e) {
    emitDebug('liveness', '静默活体检测异常', { error: (e as Error).message }, 'error')
    // 设置错误颜色
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.DETECTION_ERROR, message: `活体检测异常: ${e instanceof Error ? e.message : '未知错误'}` })
    stopDetection()
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
