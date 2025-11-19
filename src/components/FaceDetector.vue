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
      <!-- 活体检测提示文本 -->
      <div v-if="actionPromptText && props.showActionPrompt" class="action-prompt">{{ actionPromptText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 导入 Vue 3 Composition API 相关方法
import { ref, computed, onMounted, onUnmounted, Ref, reactive } from 'vue'
// 导入人脸检测库
import Human from '@vladmandic/human'
// 导入类型定义
import type { FaceDetectedData, FaceCollectedData, LivenessCompletedData, LivenessActionData, ErrorData, FaceDetectorProps, LivenessDetectedData } from './face-detector'
import { DetectionMode, LivenessAction, LivenessActionStatus, ACTION_DESCRIPTIONS, FACE_DETECTOR_EVENTS, BORDER_COLOR_STATES, CONFIG, ErrorCode } from './face-detector'

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
  'face-detected': [data: FaceDetectedData]
  'face-collected': [data: FaceCollectedData]
  'liveness-action': [data: LivenessActionData]
  'liveness-detected': [data: LivenessDetectedData]
  'liveness-completed': [data: LivenessCompletedData]
  'error': [data: ErrorData]
}>()

// 视频元素引用
const videoRef: Ref<HTMLVideoElement | null> = ref(null)
// 结果图片元素引用，用于显示采集的图片或最后一帧
const resultImageRef: Ref<HTMLImageElement | null> = ref(null)
// 结果图片数据
const resultImageSrc: Ref<string> = ref('')
// 是否为移动设备
const isMobileDevice: Ref<boolean> = ref(false)
// 是否为竖屏方向
const isPortrait: Ref<boolean> = ref(true)
// 是否正在进行检测
const isDetecting: Ref<boolean> = ref(false)

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

// ===== 检测超时相关变量 =====
let detectionStartTime: number = 0
let noFaceFrameCount: number = 0

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
    // 否则等待后续调度，直到满足时间条件
    const remainingDelay = minDelayMs - timeSinceLastDetection
    setTimeout(() => {
      scheduleDetection(minDelayMs)
    }, remainingDelay)
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
  
  // Safari 兼容性：监听可见性变化，确保后台不被限流
  const handleVisibilityChange = () => {
    if (document.hidden) {
      console.log('[FaceDetector] Page hidden, pausing detection')
      if (isDetecting.value) {
        cancelPendingDetection()
      }
    } else {
      console.log('[FaceDetector] Page visible again, resuming detection')
      if (isDetecting.value) {
        scheduleNextDetection(0) // 立即重新启动检测
      }
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  // 配置 Human 检测库
  isInitializing.value = true
  
  // 默认配置
  const defaultConfig = {
    // 模型文件本地路径
    modelBasePath: '/models',
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
  
  // 深度合并用户配置和默认配置
  const mergedConfig = {
    ...defaultConfig,
    ...props.humanConfig,
    face: {
      ...defaultConfig.face,
      ...(props.humanConfig?.face || {})
    }
  }
  
  human = new Human(mergedConfig as any)
  try {
    console.log('[FaceDetector] Loading Human.js library...')
    const userAgent = navigator.userAgent
    const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent)
    console.log('[FaceDetector] Browser: Safari=' + isSafari + ', UserAgent=' + userAgent)
    
    await human.load()
    console.log('[FaceDetector] Human.js library loaded successfully')
    console.log('[FaceDetector] Available models:', human.models)
  } catch (e) {
    console.error('[FaceDetector] Failed to load Human library:', e)
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.ENGINE_NOT_INITIALIZED, message: '检测库加载失败: ' + (e instanceof Error ? e.message : '未知错误') })
  }
  isInitializing.value = false
  
  // 返回清理函数
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
})

// 组件卸载时清理资源
onUnmounted(() => {
  stopDetection()
  window.removeEventListener('orientationchange', handleOrientationChange)
  document.removeEventListener('visibilitychange', () => {}) // 移除可见性监听
  // 清理缓存的临时 canvas
  captureCanvas = null
  captureCtx = null
  // 清理待处理的检测帧
  cancelPendingDetection()
})

// ===== 常量定义 =====
// 使用 CONFIG 替代本地常量定义（已从 face-detector.ts 导入）

// ===== 设备检测与方向处理 =====
/**
 * 检测设备类型和屏幕方向，并调整视频尺寸（1:1 比例）
 */
function detectDevice(): void {
  // 判断是否为移动设备
  isMobileDevice.value = navigator.userAgent.toLowerCase().match(/android|iphone/) !== null || window.innerWidth < CONFIG.MOBILE.WIDTH_THRESHOLD
  // 判断是否为竖屏
  isPortrait.value = window.innerHeight >= window.innerWidth
  
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
  isPortrait.value = window.innerHeight >= window.innerWidth
  
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
  
  // 清空所有定时器
  if (actionTimeoutId) clearTimeout(actionTimeoutId)
  
  // 清空结果图片
  resultImageSrc.value = ''
  
  // 重置检测超时计数器
  detectionStartTime = performance.now()
  noFaceFrameCount = 0
}

/**
 * 启动人脸检测
 */
async function startDetection(): Promise<void> {
  try {
    // 检查 Human 库是否已初始化
    if (!human) {
      emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.DETECTOR_NOT_INITIALIZED, message: '检测库未初始化' })
      return
    }
    
    console.log('[FaceDetector] Starting detection...')
    
    // 重置检测状态和画布
    resetDetectionState()
    
    // 获取用户摄像头权限和视频流
    console.log('[FaceDetector] Requesting camera access...')
    stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: 'user', 
        // 请求 1:1 的正方形视频（宽高相同）
        width: { ideal: videoWidth.value }, 
        height: { ideal: videoWidth.value },  // 确保高度等于宽度
        // 优先使用可用的分辨率
        aspectRatio: { ideal: 1.0 }
      },
      audio: false
    })
    
    console.log('[FaceDetector] Camera stream obtained')
    
    // 获取实际的视频流分辨率（Safari 兼容性修复）
    const videoTrack = stream.getVideoTracks()[0]
    if (videoTrack) {
      const settings = videoTrack.getSettings?.()
      if (settings) {
        console.log('[FaceDetector] Actual video settings:', settings.width, 'x', settings.height)
        // 更新实际的视频尺寸为 1:1 比例
        // 优先取较小的尺寸作为边长，保证能显示完整
        const minSize = Math.min(settings.width || videoWidth.value, settings.height || videoHeight.value)
        videoWidth.value = minSize
        videoHeight.value = minSize
        console.log('[FaceDetector] Normalized to 1:1 ratio:', minSize, 'x', minSize)
      }
    }
    
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
      
      const checkVideoReady = () => {
        // Safari 兼容性：检查 videoWidth 和 videoHeight
        // 某些浏览器的 canplay 事件可能不可靠，需要额外检查实际视频尺寸
        if (videoRef.value && videoRef.value.videoWidth > 0 && videoRef.value.videoHeight > 0) {
          clearTimeout(timeout)
          videoRef.value.removeEventListener('canplay', onCanPlay)
          videoRef.value.removeEventListener('loadedmetadata', onLoadedMetadata)
          console.log('[FaceDetector] Video ready, dimensions:', videoRef.value.videoWidth, 'x', videoRef.value.videoHeight)
          resolve()
          return true
        }
        return false
      }
      
      const onCanPlay = () => {
        console.log('[FaceDetector] canplay event fired')
        if (checkVideoReady()) {
          // 事件处理已完成，不再需要做什么
        }
      }
      
      const onLoadedMetadata = () => {
        console.log('[FaceDetector] loadedmetadata event fired')
        if (checkVideoReady()) {
          // 事件处理已完成，不再需要做什么
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
    
    console.log('[FaceDetector] Video is ready, starting detection loop...')
    
    // 立即启动检测循环（使用 requestAnimationFrame）
    scheduleNextDetection(0)
  } catch (e) {
    // 若获取摄像头失败，触发错误事件
    console.error('[FaceDetector] Error:', e)
    isDetecting.value = false
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.STREAM_ACQUISITION_FAILED, message: (e as Error).message })
  }
}

/**
 * 停止人脸检测
 */
function stopDetection(success: boolean = false): void {
  isDetecting.value = false
  
  // 清理所有定时器和帧
  cancelPendingDetection()
  if (actionTimeoutId) clearTimeout(actionTimeoutId)
  
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
  // 人脸信息
  const faceInfo: FaceDetectedData = {
    count: 1,
    size: faceRatio, 
    frontal: frontal
  }  // 触发 face-detected 事件
  emit(FACE_DETECTOR_EVENTS.FACE_DETECTED, faceInfo)
  // 更新边框颜色
  updateBorderColor(faceInfo)
  
  // 判断人脸是否符合条件：大小在范围内，且正对度符合要求
  if (faceRatio > props.minFaceRatio && faceRatio < props.maxFaceRatio && frontal >= props.minFrontal) {
    console.log('[FaceDetector] Valid face detected')
    
    // 根据检测模式处理
    if (props.mode === DetectionMode.COLLECTION) {
      handleCollectionMode()
    } else if (props.mode === DetectionMode.SILENT_LIVENESS) {
      handleSilentLivenessMode()
    } else if (props.mode === DetectionMode.LIVENESS) {
      handleLivenessMode(gestures)
    }
  } else {
    // 人脸不符合条件，继续检测
    console.log('[FaceDetector] Face not valid, ratio:', faceRatio, 'frontal:', frontal)
    scheduleNextDetection()
  }
}

/**
 * 处理检测到多个或零个人脸的情况
 * @param {number} faceCount - 人脸数量
 */
function handleMultipleFaces(faceCount: number): void {
  const faceInfo: FaceDetectedData = {
    count: faceCount,
    size: 0,
    frontal: 0
  }
  emit(FACE_DETECTOR_EVENTS.FACE_DETECTED, faceInfo)
  // 更新边框颜色
  updateBorderColor(faceInfo)
  
  // 在 LIVENESS 或 SILENT_LIVENESS 模式下，如果已开始活体检测，不能检测不到人脸或多个人脸
  if (props.mode === DetectionMode.LIVENESS && detectionState.isLivenessStarted && faceCount !== 1) {
    console.error('[FaceDetector] Face count changed during liveness detection, expected 1 but got', faceCount)
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.FACE_COUNT_CHANGED, message: `检测到人脸数量变化，期望1张，实际${faceCount}张。请保持正脸对着摄像头，重新开始检测。` })
    stopDetection()
    return
  }
  
  if (props.mode === DetectionMode.SILENT_LIVENESS && detectionState.isSilentLivenessStarted && faceCount !== 1) {
    console.error('[FaceDetector] Face count changed during silent liveness detection, expected 1 but got', faceCount)
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
  detectionState.baselineImage = captureFrame()
  emit(FACE_DETECTOR_EVENTS.FACE_COLLECTED, { 
    imageData: detectionState.baselineImage 
  })
  videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
  stopDetection(true)
}

/**
 * 处理静默活体检测模式：采集图片后自动进行活体检测
 */
function handleSilentLivenessMode(): void {
  if (!detectionState.isSilentLivenessStarted) {
    console.log('[FaceDetector] Valid face detected, entering silent liveness detection')
    detectionState.baselineImage = captureFrame()  // 捕获完整摄像头照片
    detectionState.isSilentLivenessStarted = true

    // 异步执行活体检测
    performSilentLivenessDetection()
  } else {
    // 已经开始了静默活体检测，继续捕获新的图片进行检测
    console.log('[FaceDetector] Silent liveness already started, capturing new frame for re-detection')
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
      console.warn('[FaceDetector] Missing required objects, retrying...')
      scheduleNextDetection(CONFIG.DETECTION.DETECTION_FRAME_DELAY)
      return
    }
    
    // Safari 兼容性检查：确保视频已加载且可绘制
    if (videoRef.value.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      console.warn('[FaceDetector] Video not ready, readyState:', videoRef.value.readyState)
      scheduleNextDetection(CONFIG.DETECTION.ERROR_RETRY_DELAY)
      return
    }
    
    // 检测超时控制：如果长时间没有检测到人脸，主动退出
    const elapsedTime = performance.now() - detectionStartTime
    if (elapsedTime > CONFIG.TIMEOUT.DETECTION_TIMEOUT) {
      console.error('[FaceDetector] Detection timeout: no valid face detected for', Math.round(CONFIG.TIMEOUT.DETECTION_TIMEOUT / 1000), 'seconds')
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
    const result = await human.detect(videoRef.value, runtimeConfig)
    
    // 获取检测到的所有人脸
    const faces = result.face || []
    
    if (faces.length === 1) {
      // 重置无人脸计数器
      noFaceFrameCount = 0
      
      // 处理单人脸的情况
      const face = faces[0] as any
      const faceBox = face.box || face.boxRaw
      
      if (!faceBox) {
        scheduleNextDetection(CONFIG.DETECTION.DETECTION_FRAME_DELAY)
        return
      }
      
      // 计算人脸占视频画面的比例 (0-1)
      const faceRatio = (faceBox[2] * faceBox[3]) / (videoWidth.value * videoHeight.value)
      
      // 检查人脸是否正对摄像头 (0-1 评分)
      const frontal = checkFaceFrontal(face, result.gesture)
      
      handleSingleFace(faceRatio, frontal, result.gesture)
    } else {
      // 累计无人脸帧数，用于超时检测
      noFaceFrameCount++
      
      // 处理多人脸或无人脸的情况
      handleMultipleFaces(faces.length)
    }
  } catch (error) {
    console.error('[FaceDetector] Detection error:', error)
    // 发生错误时继续检测，但增加重试延迟
    scheduleNextDetection(CONFIG.DETECTION.ERROR_RETRY_DELAY)
  }
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
      console.log('[FaceDetector] Face is frontal (from gesture: facing center)')
      return 1.0
    }
    
    // 如果识别到 facing left 或 facing right，返回较低分数
    const isFacingLeft = gestures.some((g: any) => g.gesture?.includes('facing left'))
    const isFacingRight = gestures.some((g: any) => g.gesture?.includes('facing right'))
    
    if (isFacingLeft || isFacingRight) {
      console.log('[FaceDetector] Face is not fully frontal (from gesture: facing', isFacingLeft ? 'left' : 'right', ')')
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
    console.log('[FaceDetector] First valid face detected in liveness mode, capturing baseline')
    detectionState.baselineImage = captureFrame()  // 捕获完整摄像头照片
    // 标记活体检测已开始，后续 detect 方法需要检查人脸数量
    detectionState.isLivenessStarted = true
    
    // 选择第一个随机动作
    selectNextRandomAction()
  }
  
  // 检查是否全部动作完成
  if (detectionState.completedActions.size >= normalizedLivenessActionCount.value) {
    console.log('[FaceDetector] All liveness checks completed')
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
    console.warn('[FaceDetector] No current action selected')
    scheduleNextDetection()
    return
  }
  
  // 检测当前帧是否有指定的动作
  const detected = detectAction(detectionState.currentAction, gestures)
  
  // 如果检测到动作
  if (detected) {
    console.log('[FaceDetector] Action detected:', detectionState.currentAction)
    
    // 标记该动作已完成
    detectionState.completedActions.add(detectionState.currentAction)
    emit(FACE_DETECTOR_EVENTS.LIVENESS_ACTION, { action: detectionState.currentAction, description: getActionDescription(detectionState.currentAction), status: LivenessActionStatus.COMPLETED })
    
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
    console.log('[FaceDetector] All actions have been completed')
    return
  }
  
  // 随机选择一个动作
  detectionState.currentAction = availableActions[Math.floor(Math.random() * availableActions.length)]
  
  // 更新提示文本
  updateActionPrompt(detectionState.currentAction)
  emit(FACE_DETECTOR_EVENTS.LIVENESS_ACTION, { action: detectionState.currentAction, description: getActionDescription(detectionState.currentAction), status: LivenessActionStatus.STARTED })
  
  console.log('[FaceDetector] Selected action:', detectionState.currentAction)
  
  // 设置超时定时器
  if (actionTimeoutId) clearTimeout(actionTimeoutId)
  actionTimeoutId = setTimeout(() => {
    if (detectionState.currentAction) {
      emit(FACE_DETECTOR_EVENTS.LIVENESS_ACTION, { action: detectionState.currentAction, description: getActionDescription(detectionState.currentAction), status: LivenessActionStatus.TIMEOUT })
      console.error('[FaceDetector] Action timeout:', detectionState.currentAction)
      // 设置错误颜色
      videoBorderColor.value = BORDER_COLOR_STATES.ERROR
      emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.ACTION_TIMEOUT, message: `动作检测超时（${props.livenessActionTimeout}秒）：未在规定时间内检测到${getActionDescription(detectionState.currentAction)}，请重试` })
      stopDetection()
    }
  }, props.livenessActionTimeout * 1000)
}

/**
 * 更新视频容器边框颜色
 */
function updateBorderColor(faceInfo: FaceDetectedData): void {
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
    // 点头检测优化：只要检测到抬头或者低头，就算通过
    // 简化规则：只需检测到 "head up" 或 "head down"
    
    // 获取当前帧的 head 动作
    const currentHead = gestures.find((g: any) => g.gesture?.includes('head'))?.gesture
    
    if (currentHead) {
      // 提取 head 方向（up/down）
      const headDirection = currentHead.match(/(up|down)/)?.[0]
      
      // 只要检测到抬头(up)或低头(down)就通过
      if (headDirection) {
        return true
      }
    }
  }
  
  return false
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
      console.warn('[FaceDetector] video.videoWidth/videoHeight is 0, using fallback:', videoWidth.value, 'x', videoHeight.value)
      videoWidth_actual = videoWidth.value
      videoHeight_actual = videoHeight.value
    }
    
    // 再次检查是否为有效值
    if (!videoWidth_actual || !videoHeight_actual) {
      console.error('[FaceDetector] Unable to get valid video dimensions')
      return null
    }
    
    // 如果缓存的 canvas 尺寸不匹配，重新创建
    if (!captureCanvas || captureCanvas.width !== videoWidth_actual || captureCanvas.height !== videoHeight_actual) {
      captureCanvas = document.createElement('canvas')
      captureCanvas.width = videoWidth_actual
      captureCanvas.height = videoHeight_actual
      captureCtx = captureCanvas.getContext('2d')
      console.log('[FaceDetector] Canvas created/resized:', videoWidth_actual, 'x', videoHeight_actual)
    }
    
    if (!captureCtx) return null
    
    // 在尝试绘制前，再次验证视频的可绘制性（Safari 特定修复）
    if (videoRef.value.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA && 
        videoRef.value.readyState !== HTMLMediaElement.HAVE_CURRENT_DATA) {
      console.warn('[FaceDetector] Video not ready for drawing, readyState:', videoRef.value.readyState)
      return null
    }
    
    captureCtx.drawImage(videoRef.value, 0, 0, videoWidth_actual, videoHeight_actual)
    
    const imageData = captureCanvas.toDataURL('image/jpeg', 0.9)
    console.log('[FaceDetector] Frame captured, size:', imageData.length, 'bytes')
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
// function captureFaceFrame(faceBox: number[]): string | null {
//   try {
//     if (!faceBox || !videoRef.value) {
//       console.warn('[FaceDetector] Invalid faceBox, using full frame')
//       return captureFrame()
//     }

//     const [x, y, width, height] = faceBox
    
//     // 如果缓存的 canvas 尺寸不匹配，重新创建
//     if (!captureCanvas || captureCanvas.width !== width || captureCanvas.height !== height) {
//       captureCanvas = document.createElement('canvas')
//       captureCanvas.width = width
//       captureCanvas.height = height
//       captureCtx = captureCanvas.getContext('2d')
//     }
    
//     if (!captureCtx) return null
    
//     // 从视频中裁切人脸区域
//     captureCtx.drawImage(
//       videoRef.value,
//       x, y, width, height,      // 源区域（视频中的人脸位置）
//       0, 0, width, height        // 目标区域（canvas）
//     )
    
//     const croppedImageData = captureCanvas.toDataURL('image/jpeg', 0.9)
//     console.log('[FaceDetector] Face frame captured and cropped, size:', croppedImageData.length, 'box:', faceBox)
//     return croppedImageData
//   } catch (e) {
//     console.error('[FaceDetector] Failed to capture face frame:', e)
//     // 降级：返回完整帧
//     return captureFrame()
//   }
// }

/**
 * 进行静默活体检测（自动检测采集的图片是否为真实人脸）
 * 使用 Human.js 的 liveness 检测能力
 */
async function performSilentLivenessDetection(): Promise<void> {
  if (!detectionState.baselineImage) {
    console.error('[FaceDetector] No captured image for silent liveness detection')
    // 设置错误颜色
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.CAPTURE_FAILED, message: '未能捕获图片，请重试' })
    stopDetection()
    return
  }

  if (!human) {
    console.error('[FaceDetector] Human.js not initialized')
    // 设置错误颜色
    videoBorderColor.value = BORDER_COLOR_STATES.ERROR
    emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.ENGINE_NOT_INITIALIZED, message: 'AI 检测引擎未初始化，请稍后重试' })
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
        // 如果用户提供了运行时配置，则使用；否则使用实例初始化时的配置
        const runtimeConfig = Object.keys(props.humanConfig).length > 0 ? props.humanConfig : undefined
        const result = await human!.detect(tempImg, runtimeConfig)
        
        if (!result) {
          console.warn('[FaceDetector] Human.js detection returned no result')
          // 设置错误颜色
          videoBorderColor.value = BORDER_COLOR_STATES.ERROR
          emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.LIVENESS_ANALYSIS_FAILED, message: '活体检测失败，无法分析图片，请重试' })
          stopDetection()
          return
        }

        console.log('[FaceDetector] Detection complete, face count:', result.face?.length || 0)

        // 提取 liveness 检测结果
        const faces = result.face || []
        if (faces.length === 0) {
          console.warn('[FaceDetector] No face detected in captured image for liveness check')
          // 设置错误颜色
          videoBorderColor.value = BORDER_COLOR_STATES.ERROR
          emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.NO_FACE_IN_IMAGE, message: '未在图片中检测到人脸，请确保采集了清晰的人脸照片' })
          stopDetection()
          return
        }

        // 获取第一张脸的数据
        const faceData = faces[0] as any
        
        console.log('[FaceDetector] Full face data keys:', Object.keys(faceData))
        console.log('[FaceDetector] Live value:', faceData.live, 'Real value:', faceData.real)
        
        // 根据 Human.js 的 FaceResult 类型定义：
        // - real?: number  - face anti-spoofing result confidence [0-1] （反欺骗检测：真实人脸置信度）
        // - live?: number  - face liveness result confidence [0-1] （活体检测：活体置信度）
        // 
        // 检测流程：
        // 1. 先检查 real（反欺骗检测）- 判断是否为真实人脸（排除欺诈）
        // 2. 如果是真实人脸，则使用 live（活体检测）- 进一步判断是否为活体

        const info: LivenessDetectedData = {
          real: faceData.real || -1,
          live: faceData.liveness || -1
        }
        emit(FACE_DETECTOR_EVENTS.LIVENESS_DETECTED, info)
        
        let realScore = 0
        let isFraudDetected = false
        
        // 策略 1: 优先使用 real 属性进行反欺骗检测（排除欺诈）
        if (faceData.real !== undefined && typeof faceData.real === 'number') {
          console.log('[FaceDetector] Antispoof (real) property found:', faceData.real, 'threshold:', CONFIG.LIVENESS.ANTI_SPOOFING_THRESHOLD)
          
          // 如果 real 分数低于反欺骗阈值，说明检测到欺诈
          if (faceData.real < CONFIG.LIVENESS.ANTI_SPOOFING_THRESHOLD) {
            isFraudDetected = true
            realScore = faceData.real
            console.warn('[FaceDetector] ⚠️ FRAUD DETECTED! Antispoof score too low:', faceData.real, '< threshold:', CONFIG.LIVENESS.ANTI_SPOOFING_THRESHOLD)
          } else {
            // real 分数充分，继续检查 live
            console.log('[FaceDetector] ✓ Antispoof check passed, real score:', faceData.real)
            
            // 策略 2: 如果反欺骗检测通过，再用 live 属性进行活体检测
            if (faceData.live !== undefined && typeof faceData.live === 'number') {
              realScore = faceData.live
              console.log('[FaceDetector] ✓ Using live property for final score:', realScore)
            } else {
              // 如果没有 live，就用 real 作为最终分数
              realScore = faceData.real
              console.log('[FaceDetector] ℹ No live property, using real as final score:', realScore)
            }
          }
        }
        // 备选方案: 如果没有 real，尝试使用 live
        else if (faceData.live !== undefined && typeof faceData.live === 'number') {
          realScore = faceData.live
          console.log('[FaceDetector] Using live property (no antispoof available):', realScore)
        }
        // 都没有
        else {
          console.warn('[FaceDetector] Neither live nor real property found')
          console.log('[FaceDetector] Face data contents:', {
            keys: Object.keys(faceData),
            liveValue: faceData.live,
            realValue: faceData.real,
            livenessValue: faceData.liveness
          })
          // 设置错误颜色
          videoBorderColor.value = BORDER_COLOR_STATES.ERROR
          emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.NO_LIVENESS_RESULT, message: '无法获取活体检测结果，请确保 liveness 或 antispoof 模型已正确加载' })
          stopDetection()
          return
        }
        
        console.log('[FaceDetector] Extracted liveness score:', realScore, 'Fraud detected:', isFraudDetected)

        // 判断是否通过活体检测
        if (isFraudDetected) {
          // 检测到欺诈，直接失败，不再继续检测
          console.error('[FaceDetector] ❌ LIVENESS CHECK FAILED - Fraud detected! Score:', realScore)
          videoBorderColor.value = BORDER_COLOR_STATES.ERROR
          emit(FACE_DETECTOR_EVENTS.ERROR, { 
            code: ErrorCode.FRAUD_DETECTED, 
            message: '检测到欺诈行为（可能是照片、视频或面具），请用真实人脸重试' 
          })
          stopDetection()
        } else if (realScore >= props.silentLivenessThreshold) {
          console.log('[FaceDetector] ✓ Liveness detection PASSED - Score:', realScore)
          
          // 设置成功颜色
          videoBorderColor.value = BORDER_COLOR_STATES.SUCCESS
          
          // 发送成功事件
          emit(FACE_DETECTOR_EVENTS.LIVENESS_COMPLETED, {
            imageData: detectionState.baselineImage,
            liveness: realScore
          })
          
          stopDetection(true)
        } else {
          console.warn('[FaceDetector] Liveness detection score insufficient:', realScore, '< threshold:', props.silentLivenessThreshold, 'continuing detection...')
          // 分数不足时，继续检测，而不是报错
          // 继续检测下一帧
          scheduleNextDetection()
        }
      } catch (e) {
        console.error('[FaceDetector] Error during liveness analysis:', e)
        // 设置错误颜色
        videoBorderColor.value = BORDER_COLOR_STATES.ERROR
        emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.LIVENESS_DETECTION_FAILED, message: `活体检测出错: ${e instanceof Error ? e.message : '未知错误'}` })
        stopDetection()
      }
    }

    tempImg.onerror = () => {
      console.error('[FaceDetector] Failed to load captured image for liveness detection')
      // 设置错误颜色
      videoBorderColor.value = BORDER_COLOR_STATES.ERROR
      emit(FACE_DETECTOR_EVENTS.ERROR, { code: ErrorCode.IMAGE_LOAD_FAILED, message: '无法加载采集的图片进行活体检测' })
      stopDetection()
    }

    // 加载采集的图片
    tempImg.src = detectionState.baselineImage
  } catch (e) {
    console.error('[FaceDetector] Error in performSilentLivenessDetection:', e)
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

/* 检测框画布样式（z-index最高，在所有元素上方） */
.detection-canvas {
  position: absolute;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  background: transparent;
  box-sizing: border-box;
  border-radius: 50%;  /* 圆形 */
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
