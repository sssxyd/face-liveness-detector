<template>
  <div class="face-liveness-demo">
    <div class="header">
      <h1>活体人脸检测演示</h1>
      <p>Face Liveness Detection Demo - @sssxyd/face-liveness-detector</p>
    </div>

    <!-- 配置面板 -->
    <div class="config-panel">
      <h3>检测配置</h3>
      <div class="config-item">
        <label>动作检测数量 (0-3):</label>
        <input 
          type="range" 
          v-model.number="actionCount" 
          min="0" 
          max="3" 
          step="1"
          :disabled="isDetecting"
        />
        <span>{{ actionCount }} - {{ getActionCountLabel(actionCount) }}</span>
      </div>
      <div class="config-item">
        <label>最小人脸占比:</label>
        <input 
          type="range" 
          v-model.number="minFaceRatio" 
          min="0.3" 
          max="0.7" 
          step="0.1"
          :disabled="isDetecting"
        />
        <span>{{ (minFaceRatio * 100).toFixed(0) }}%</span>
      </div>
      <div class="config-item">
        <label>最大人脸占比:</label>
        <input 
          type="range" 
          v-model.number="maxFaceRatio" 
          min="0.7" 
          max="1.0" 
          step="0.1"
          :disabled="isDetecting"
        />
        <span>{{ (maxFaceRatio * 100).toFixed(0) }}%</span>
      </div>
      <div class="config-item">
        <label>模型地址:</label>
        <input 
          type="text" 
          v-model="humanModelPath"
          placeholder="输入Human模型路径"
          :disabled="isDetecting"
          class="config-text-input"
        />
      </div>
      <div class="config-item">
        <label>Wasm地址:</label>
        <input 
          type="text" 
          v-model="tensorflowWasmPath"
          placeholder="输入TensorFlow WASM路径"
          :disabled="isDetecting"
          class="config-text-input"
        />
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="control-panel">
      <button 
        v-if="!isDetecting"
        @click="startDetection"
        :disabled="!isEngineReady"
        class="btn-primary"
      >
        {{ isEngineReady ? '开始检测' : '初始化中...' }}
      </button>
      <button 
        v-else
        @click="stopDetection"
        class="btn-danger"
      >
        停止检测
      </button>
    </div>

    <!-- 视频显示区域 -->
    <div class="video-container">
      <video
        ref="videoElement"
        width="640"
        height="480"
        autoplay
        playsinline
        muted
      ></video>
      <div v-if="isDetecting" class="status-overlay">
        <div class="status-info">{{ statusMessage }}</div>
        <div v-if="currentAction" class="action-prompt">
          <span class="action-icon">{{ getActionIcon(currentAction) }}</span>
          <span class="action-text">{{ getActionText(currentAction) }}</span>
        </div>
      </div>
    </div>

    <!-- 检测信息面板 -->
    <div v-if="isDetecting" class="info-panel">
      <h3>检测信息</h3>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">静默检测:</span>
          <span class="value">{{ silentPassedCount }} / {{ config.silent_detect_count }}</span>
        </div>
        <div class="info-item">
          <span class="label">动作检测:</span>
          <span class="value">{{ actionPassedCount }} / {{ actionCount }}</span>
        </div>
        <div v-if="faceInfo.size > 0" class="info-item">
          <span class="label">人脸大小:</span>
          <span class="value">{{ (faceInfo.size * 100).toFixed(1) }}%</span>
        </div>
        <div v-if="faceInfo.frontal > 0" class="info-item">
          <span class="label">正面度:</span>
          <span class="value">{{ (faceInfo.frontal * 100).toFixed(1) }}%</span>
        </div>
        <div v-if="faceInfo.quality > 0" class="info-item">
          <span class="label">图像质量:</span>
          <span class="value">{{ (faceInfo.quality * 100).toFixed(1) }}%</span>
        </div>
        <div v-if="faceInfo.real > 0" class="info-item">
          <span class="label">真实度:</span>
          <span class="value">{{ (faceInfo.real * 100).toFixed(1) }}%</span>
        </div>
        <div v-if="faceInfo.live > 0" class="info-item">
          <span class="label">活体度:</span>
          <span class="value">{{ (faceInfo.live * 100).toFixed(1) }}%</span>
        </div>
      </div>
    </div>

    <!-- 结果显示 -->
    <div v-if="detectionResult" class="result-panel">
      <h3>{{ detectionResult.success ? '✅ 检测成功' : '❌ 检测失败' }}</h3>
      <div class="result-info">
        <div class="result-item">
          <span class="label">静默检测通过:</span>
          <span class="value">{{ detectionResult.silentPassedCount }} 次</span>
        </div>
        <div class="result-item">
          <span class="label">动作检测通过:</span>
          <span class="value">{{ detectionResult.actionPassedCount }} 个</span>
        </div>
        <div class="result-item">
          <span class="label">图像质量:</span>
          <span class="value">{{ (detectionResult.bestQualityScore * 100).toFixed(1) }}%</span>
        </div>
        <div class="result-item">
          <span class="label">总耗时:</span>
          <span class="value">{{ (detectionResult.totalTime / 1000).toFixed(2) }}s</span>
        </div>
      </div>
      <div class="result-images">
        <div v-if="detectionResult.bestFrameImage" class="image-box">
          <h4>最佳帧图像</h4>
          <img :src="detectionResult.bestFrameImage" alt="Frame" />
        </div>
        <div v-if="detectionResult.bestFaceImage" class="image-box">
          <h4>人脸图像</h4>
          <img :src="detectionResult.bestFaceImage" alt="Face" />
        </div>
      </div>
      <button @click="resetDetection" class="btn-primary">重新检测</button>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMessage" class="error-panel">
      <p>❌ {{ errorMessage }}</p>
      <button @click="resetDetection" class="btn-primary">重试</button>
    </div>

    <!-- 调试日志 -->
    <div v-if="showDebugPanel" class="debug-panel">
      <div class="debug-header">
        <h3>🔍 调试信息</h3>
        <button @click="showDebugPanel = false" class="close-btn">关闭</button>
      </div>
      <div class="debug-content">
        <div 
          v-for="(log, index) in debugLogs" 
          :key="index"
          :class="['log-item', `log-${log.level}`]"
        >
          <div class="log-header">
            <span class="log-time">{{ log.timestamp }}</span>
            <span class="log-stage">[{{ log.stage }}]</span>
            <span :class="['log-level', `level-${log.level}`]">{{ log.level }}</span>
          </div>
          <div class="log-message">{{ log.message }}</div>
          <div v-if="log.details" class="log-details">
            <pre>{{ JSON.stringify(log.details, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
    <button 
      v-if="!showDebugPanel && debugLogs.length > 0"
      @click="showDebugPanel = true" 
      class="show-debug-btn"
    >
      显示调试信息 ({{ debugLogs.length }})
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import FaceDetectionEngine, { 
  LivenessAction,
  type DetectorFinishEventData,
  type FaceDetectedEventData,
  type StatusPromptEventData,
  type ActionPromptEventData,
  type DetectorErrorEventData,
  type DetectorDebugEventData
} from '@sssxyd/face-liveness-detector'
import type { DetectorLoadedEventData } from '@sssxyd/face-liveness-detector/types'

// 配置参数
const actionCount = ref<number>(0)
const minFaceRatio = ref<number>(0.5)
const maxFaceRatio = ref<number>(0.8)
const humanModelPath = ref<string>('https://app.unpkg.com/@vladmandic/human@3.3.6/files/models')
const tensorflowWasmPath = ref<string>('https://app.unpkg.com/@tensorflow/tfjs-backend-wasm@4.22.0/files/dist')

// 引擎实例
let engine: FaceDetectionEngine | null = null
const videoElement = ref<HTMLVideoElement | null>(null)

// 状态
const isEngineReady = ref<boolean>(false)
const isDetecting = ref<boolean>(false)
const statusMessage = ref<string>('等待开始检测...')
const errorMessage = ref<string>('')

// 当前动作提示
const currentAction = ref<LivenessAction | null>(null)

// 检测信息
const silentPassedCount = ref<number>(0)
const actionPassedCount = ref<number>(0)
const faceInfo = ref({
  size: 0,
  frontal: 0,
  quality: 0,
  real: 0,
  live: 0
})

// 检测结果
const detectionResult = ref<DetectorFinishEventData | null>(null)

// 调试日志
const debugLogs = ref<Array<{
  timestamp: string
  stage: string
  level: string
  message: string
  details?: any
}>>([])
const showDebugPanel = ref<boolean>(false)
const maxDebugLogs = 100

// 计算配置
const config = computed(() => ({
  min_face_ratio: minFaceRatio.value,
  max_face_ratio: maxFaceRatio.value,
  min_face_frontal: 0.9,
  liveness_action_count: actionCount.value,
  liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  silent_detect_count: 3,
  min_real_score: 0.5,
  min_live_score: 0.5
}))

// 初始化引擎
onMounted(async () => {
  try {
    engine = new FaceDetectionEngine(config.value)
    
    // 监听事件
    engine.on('detector-loaded', handleEngineReady)
    engine.on('status-prompt', handleStatusPrompt)
    engine.on('face-detected', handleFaceDetected)
    engine.on('action-prompt', handleActionPrompt)
    engine.on('detector-finish', handleDetectionFinish)
    engine.on('detector-error', handleDetectionError)
    engine.on('detector-debug', handleDebugLog)
    
    // 初始化
    await engine.initialize()
  } catch (error: any) {
    console.error('引擎初始化失败:', error)
    errorMessage.value = `引擎初始化失败: ${error.message}`
  }
})

onUnmounted(() => {
  if (engine) {
    engine.stopDetection(false)
  }
})

// 事件处理函数
function handleEngineReady(data: DetectorLoadedEventData) {
  isEngineReady.value = data.success
  if (!data.success) {
    errorMessage.value = '引擎加载失败，' + (data.error || '未知错误')
    console.error('❌ 引擎加载失败')
    return
  }
  statusMessage.value = '引擎已就绪，可以开始检测'
  console.log(data.opencv_version || '未检测到 OpenCV')
  console.log(data.human_version || '未检测到 Human.js')
  console.log('✅ 引擎已就绪')
}

function handleStatusPrompt(data: StatusPromptEventData) {
  statusMessage.value = getPromptMessage(data.code)
}

function handleFaceDetected(data: FaceDetectedEventData) {
  if (data.passed) {
    silentPassedCount.value++
  }
  
  faceInfo.value = {
    size: data.size,
    frontal: data.frontal,
    quality: data.quality,
    real: data.real,
    live: data.live
  }
}

function handleActionPrompt(data: ActionPromptEventData) {
  if (data.status === 'started') {
    currentAction.value = data.action
    statusMessage.value = `请执行动作: ${getActionText(data.action)}`
  } else if (data.status === 'completed') {
    actionPassedCount.value++
    currentAction.value = null
    statusMessage.value = '动作识别成功！'
  } else if (data.status === 'timeout') {
    statusMessage.value = '动作识别超时'
  }
}

function handleDetectionFinish(data: DetectorFinishEventData) {
  isDetecting.value = false
  detectionResult.value = data
  currentAction.value = null
  
  if (data.success) {
    statusMessage.value = '检测成功完成！'
  } else {
    statusMessage.value = '检测未通过'
  }
}

function handleDetectionError(error: DetectorErrorEventData) {
  isDetecting.value = false
  errorMessage.value = `${error.code}: ${error.message}`
  console.error('检测错误:', error)
}

function handleDebugLog(debug: DetectorDebugEventData) {
  const timestamp = new Date().toLocaleTimeString()
  debugLogs.value.push({
    timestamp,
    stage: debug.stage,
    level: debug.level || 'info',
    message: debug.message,
    details: debug.details
  })
  
  // 限制日志数量
  if (debugLogs.value.length > maxDebugLogs) {
    debugLogs.value.shift()
  }
}

// 操作函数
async function startDetection() {
  if (!engine || !videoElement.value) {
    return
  }
  
  try {
    // 重置状态
    silentPassedCount.value = 0
    actionPassedCount.value = 0
    currentAction.value = null
    detectionResult.value = null
    errorMessage.value = ''
    faceInfo.value = { size: 0, frontal: 0, quality: 0, real: 0, live: 0 }
    
    // 更新配置
    engine.updateConfig(config.value)
    
    // 开始检测
    await engine.startDetection(videoElement.value)
    isDetecting.value = true
    statusMessage.value = '正在检测人脸...'
  } catch (error: any) {
    console.error('启动检测失败:', error)
    errorMessage.value = `启动检测失败: ${error.message}`
  }
}

function stopDetection() {
  if (engine) {
    engine.stopDetection(false)
    isDetecting.value = false
    currentAction.value = null
    statusMessage.value = '检测已停止'
  }
}

function resetDetection() {
  detectionResult.value = null
  errorMessage.value = ''
  silentPassedCount.value = 0
  actionPassedCount.value = 0
  faceInfo.value = { size: 0, frontal: 0, quality: 0, real: 0, live: 0 }
  statusMessage.value = '等待开始检测...'
}

// 辅助函数
function getPromptMessage(code: string): string {
  const messages: Record<string, string> = {
    'NO_FACE': '未检测到人脸，请面对摄像头',
    'MULTIPLE_FACE': '检测到多张人脸，请确保只有一人',
    'FACE_TOO_SMALL': '人脸太小，请靠近摄像头',
    'FACE_TOO_LARGE': '人脸太大，请远离摄像头',
    'FACE_NOT_FRONTAL': '请正对摄像头',
    'IMAGE_QUALITY_LOW': '图像质量不足，请保持稳定',
    'FRAME_DETECTED': '检测到有效帧'
  }
  return messages[code] || '检测中...'
}

function getActionText(action: LivenessAction): string {
  const texts: Record<string, string> = {
    [LivenessAction.BLINK]: '请眨眼',
    [LivenessAction.MOUTH_OPEN]: '请张嘴',
    [LivenessAction.NOD]: '请点头'
  }
  return texts[action] || action
}

function getActionIcon(action: LivenessAction): string {
  const icons: Record<string, string> = {
    [LivenessAction.BLINK]: '👁️',
    [LivenessAction.MOUTH_OPEN]: '👄',
    [LivenessAction.NOD]: '👆'
  }
  return icons[action] || '🔄'
}

function getActionCountLabel(count: number): string {
  const labels: Record<number, string> = {
    0: '仅静默检测',
    1: '随机1个动作',
    2: '随机2个动作',
    3: '随机3个动作'
  }
  return labels[count] || '未知'
}
</script>

<style scoped>
.face-liveness-demo {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h1 {
  color: #2c3e50;
  margin-bottom: 10px;
}

.header p {
  color: #7f8c8d;
  font-size: 14px;
}

/* 配置面板 */
.config-panel {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.config-panel h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #2c3e50;
}

.config-item {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  gap: 10px;
}

.config-item label {
  min-width: 140px;
  font-weight: 500;
  color: #555;
}

.config-item select,
.config-item input[type="range"] {
  flex: 1;
}

.config-item input[type="text"] {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
}

.config-item input[type="text"]:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.config-text-input {
  word-break: break-all;
}

.config-item span {
  min-width: 50px;
  text-align: right;
  font-weight: 500;
  color: #333;
}

/* 控制按钮 */
.control-panel {
  text-align: center;
  margin-bottom: 20px;
}

.btn-primary, .btn-danger {
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: #42b983;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #3aa876;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  background: #95a5a6;
  cursor: not-allowed;
}

.btn-danger {
  background: #e74c3c;
  color: white;
}

.btn-danger:hover {
  background: #c0392b;
}

/* 视频容器 */
.video-container {
  position: relative;
  width: 640px;
  height: 480px;
  margin: 0 auto 20px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.video-container video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.status-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%);
  padding: 15px;
  color: white;
}

.status-info {
  font-size: 16px;
  font-weight: 600;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.action-prompt {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(66, 185, 131, 0.95);
  padding: 30px 50px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.action-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 10px;
}

.action-text {
  font-size: 24px;
  font-weight: bold;
  color: white;
}

/* 信息面板 */
.info-panel {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.info-panel h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #2c3e50;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  background: white;
  border-radius: 6px;
  border-left: 3px solid #42b983;
}

.info-item .label {
  font-weight: 500;
  color: #555;
}

.info-item .value {
  font-weight: 700;
  color: #2c3e50;
}

/* 结果面板 */
.result-panel {
  background: #f8f9fa;
  padding: 25px;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: center;
}

.result-panel h3 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 24px;
}

.result-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  background: white;
  border-radius: 6px;
}

.result-item .label {
  font-weight: 500;
  color: #555;
}

.result-item .value {
  font-weight: 700;
  color: #42b983;
}

.result-images {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 20px 0;
}

.image-box {
  text-align: center;
}

.image-box h4 {
  margin-bottom: 10px;
  color: #2c3e50;
}

.image-box img {
  max-width: 300px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* 错误面板 */
.error-panel {
  background: #fee;
  border: 2px solid #e74c3c;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: center;
}

.error-panel p {
  color: #c0392b;
  font-weight: 600;
  margin-bottom: 15px;
}

/* 调试面板 */
.debug-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 500px;
  max-height: 400px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  z-index: 1000;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #e0e0e0;
}

.debug-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-btn {
  padding: 5px 12px;
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.debug-content {
  max-height: 340px;
  overflow-y: auto;
  padding: 10px;
}

.log-item {
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 6px;
  font-size: 12px;
  background: #f8f9fa;
}

.log-item.log-error {
  background: #fee;
}

.log-item.log-warn {
  background: #fffbf0;
}

.log-header {
  display: flex;
  gap: 8px;
  margin-bottom: 5px;
  font-family: monospace;
}

.log-time {
  color: #7f8c8d;
}

.log-stage {
  color: #3498db;
  font-weight: 600;
}

.log-level {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}

.level-info {
  background: #d4edda;
  color: #155724;
}

.level-warn {
  background: #fff3cd;
  color: #856404;
}

.level-error {
  background: #f8d7da;
  color: #721c24;
}

.log-message {
  color: #2c3e50;
  margin-bottom: 5px;
}

.log-details {
  background: white;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
}

.log-details pre {
  margin: 0;
  font-size: 11px;
  color: #555;
}

.show-debug-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 10px 20px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  z-index: 999;
}

.show-debug-btn:hover {
  background: #2980b9;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .face-liveness-demo {
    padding: 12px;
  }

  .header {
    margin-bottom: 20px;
  }

  .header h1 {
    font-size: 24px;
    margin-bottom: 8px;
  }

  .header p {
    font-size: 12px;
  }

  /* 配置面板响应式 */
  .config-panel {
    padding: 15px;
    margin-bottom: 15px;
  }

  .config-panel h3 {
    font-size: 16px;
    margin-bottom: 12px;
  }

  .config-item {
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 12px;
    gap: 6px;
  }

  .config-item label {
    min-width: auto;
    font-size: 13px;
  }

  .config-item input[type="range"] {
    width: 100%;
  }

  .config-item span {
    min-width: auto;
    display: block;
    font-size: 13px;
  }

  .config-item input[type="text"] {
    width: 100%;
    padding: 6px;
    font-size: 12px;
  }

  /* 按钮响应式 */
  .control-panel {
    margin-bottom: 15px;
  }

  .btn-primary, .btn-danger {
    padding: 10px 24px;
    font-size: 14px;
    width: 100%;
    max-width: 300px;
  }

  /* 视频容器响应式 */
  .video-container {
    width: 100%;
    height: auto;
    aspect-ratio: 4/3;
    margin-bottom: 15px;
  }

  /* 信息面板响应式 */
  .info-panel {
    padding: 12px;
    margin-bottom: 15px;
  }

  .info-panel h3 {
    font-size: 14px;
    margin-bottom: 10px;
  }

  .info-grid {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }

  .info-item {
    padding: 8px;
    font-size: 12px;
    flex-direction: column;
    border-left-width: 2px;
  }

  .info-item .label {
    font-size: 12px;
    margin-bottom: 3px;
  }

  .info-item .value {
    font-size: 13px;
  }

  /* 结果面板响应式 */
  .result-panel {
    padding: 15px;
    margin-bottom: 15px;
  }

  .result-panel h3 {
    font-size: 18px;
    margin-bottom: 15px;
  }

  .result-info {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
    margin-bottom: 15px;
  }

  .result-item {
    padding: 10px;
    font-size: 11px;
    flex-direction: column;
  }

  .result-item .label {
    font-size: 11px;
    margin-bottom: 3px;
  }

  .result-item .value {
    font-size: 12px;
  }

  .result-images {
    flex-direction: column;
    gap: 12px;
    margin: 15px 0;
  }

  .image-box {
    text-align: center;
  }

  .image-box h4 {
    font-size: 13px;
    margin-bottom: 8px;
  }

  .image-box img {
    max-width: 100%;
    height: auto;
  }

  /* 错误面板响应式 */
  .error-panel {
    padding: 15px;
    margin-bottom: 15px;
  }

  .error-panel p {
    font-size: 13px;
    margin-bottom: 12px;
  }

  /* 调试面板响应式 */
  .debug-panel {
    position: fixed;
    bottom: 60px;
    right: 10px;
    left: 10px;
    width: auto;
    max-height: 50vh;
    max-width: calc(100% - 20px);
    border-radius: 8px;
  }

  .debug-header {
    padding: 12px;
  }

  .debug-header h3 {
    font-size: 14px;
  }

  .close-btn {
    padding: 4px 8px;
    font-size: 11px;
  }

  .debug-content {
    max-height: calc(50vh - 50px);
    padding: 8px;
  }

  .log-item {
    margin-bottom: 8px;
    padding: 8px;
    font-size: 11px;
  }

  .log-header {
    gap: 6px;
    font-size: 10px;
  }

  .log-message {
    font-size: 11px;
    margin-bottom: 4px;
  }

  .log-details pre {
    font-size: 9px;
  }

  .show-debug-btn {
    bottom: 10px;
    right: 10px;
    left: 10px;
    width: auto;
    max-width: calc(100% - 20px);
    padding: 8px 12px;
    font-size: 12px;
  }

  /* 状态提示 */
  .status-info {
    font-size: 14px;
  }

  .action-prompt {
    padding: 20px 30px;
  }

  .action-icon {
    font-size: 36px;
  }

  .action-text {
    font-size: 18px;
  }
}

/* 超小屏幕（< 480px） */
@media (max-width: 480px) {
  .face-liveness-demo {
    padding: 8px;
  }

  .header h1 {
    font-size: 20px;
  }

  .header p {
    font-size: 11px;
  }

  .config-panel {
    padding: 12px;
  }

  .config-item {
    margin-bottom: 10px;
  }

  .config-item label {
    font-size: 12px;
  }

  .config-item span {
    font-size: 12px;
  }

  .btn-primary, .btn-danger {
    padding: 8px 16px;
    font-size: 13px;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .result-info {
    grid-template-columns: 1fr;
  }

  .result-images {
    flex-direction: column;
  }

  .status-info {
    font-size: 12px;
  }

  .action-prompt {
    padding: 15px 20px;
  }

  .action-icon {
    font-size: 32px;
  }

  .action-text {
    font-size: 16px;
  }
}
</style>
