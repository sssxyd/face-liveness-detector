<template>
  <div class="face-liveness-demo">
    <div class="header">
      <h1>Face Liveness Detection Demo</h1>
      <p>
        Powered by 
        <a href="https://github.com/sssxyd/face-liveness-detector" target="_blank" rel="noopener noreferrer">
          @sssxyd/face-liveness-detector
          <span class="github-stars">⭐</span>
        </a>
      </p>
    </div>

    <!-- Configuration Panel -->
    <div class="config-panel" v-if="!isDetecting">
      <h3>Detection Configuration</h3>
      <div class="config-item">
        <label>Action Detection Count (0-3):</label>
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
        <label>Minimum Image Quality:</label>
        <input 
          type="range" 
          v-model.number="minImageQuality" 
          min="0.3" 
          max="1" 
          step="0.1"
          :disabled="isDetecting"
        />
        <span>{{ (minImageQuality * 100).toFixed(0) }}%</span>
      </div>
      <div class="config-item">
        <label>Model Path:</label>
        <input 
          type="text" 
          v-model="humanModelPath"
          placeholder="Enter Human model path"
          :disabled="isDetecting"
          class="config-text-input"
        />
      </div>
      <div class="config-item">
        <label>WASM Path:</label>
        <input 
          type="text" 
          v-model="tensorflowWasmPath"
          placeholder="Enter TensorFlow WASM path"
          :disabled="isDetecting"
          class="config-text-input"
        />
      </div>
    </div>

    <!-- Control Panel -->
    <div class="control-panel">
      <button 
        v-if="!isDetecting"
        @click="startDetection"
        :disabled="!isEngineReady"
        class="btn-primary"
      >
        {{ isEngineReady ? 'Start Detection' : 'Initializing...' }}
      </button>
      <button 
        v-else
        @click="stopDetection"
        class="btn-danger"
      >
        Stop Detection
      </button>
    </div>

    <!-- Video Display Area -->
    <div :class="['video-container', `border-${borderColor}`]">
      <video
        ref="videoElement"
        width="640"
        height="640"
        autoplay
        playsinline
        muted
      ></video>
    </div>

    <!-- Action Prompt Display (Below Video) -->
    <div v-if="isDetecting && currentAction" class="action-prompt-container">
      <div class="action-prompt">
        <span class="action-icon">{{ getActionIcon(currentAction) }}</span>
        <span class="action-text">{{ getActionText(currentAction) }}</span>
      </div>
    </div>

    <!-- Messages Display (Below Video) -->
    <div class="messages-container">      
      <!-- Status Message Display -->
      <div class="status-message-panel">
        <div class="status-message">{{ statusMessage }}</div>
      </div>
    </div>

    <!-- Detection Info Panel -->
    <div v-if="isDetecting" class="info-panel">
      <h3>Detection Information</h3>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">Collect:</span>
          <span class="value">{{ silentPassedCount }} / {{ options.collect_min_collect_count }}</span>
        </div>
        <div class="info-item">
          <span class="label">Action:</span>
          <span class="value">{{ actionPassedCount }} / {{ actionCount }}</span>
        </div>
        <div class="info-item">
          <span class="label">Passed:</span>
          <span class="value">{{ faceInfo.passed ? 'Yes' : 'No' }}</span>
        </div>              
        <div class="info-item">
          <span class="label">Code:</span>
          <span class="value">{{ faceInfo.code }}</span>
        </div>  
        <div class="info-item info-item-full">
          <span class="label">Message:</span>
          <span class="value">{{ faceInfo.message }}</span>
        </div>
        <div class="info-item info-item-full">
          <span class="label">Data:</span>
          <div class="value value-data">
            <div v-for="(val, key) in faceInfo.data" :key="key" class="data-row">
              <span class="data-key">{{ key }}:</span>
              <span class="data-value">{{ val }}</span>
            </div>
            <div v-if="Object.keys(faceInfo.data).length === 0" class="data-empty">No data</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Result Display -->
    <div v-if="detectionResult" class="result-panel">
      <h3>{{ detectionResult.success ? '✅ Detection Successful' : '❌ Detection Failed' }}</h3>
      <div class="result-info">
        <div class="result-item">
          <span class="label">Silent Detection Passed:</span>
          <span class="value">{{ detectionResult.silentPassedCount }} times</span>
        </div>
        <div class="result-item">
          <span class="label">Action Detection Passed:</span>
          <span class="value">{{ detectionResult.actionPassedCount }} actions</span>
        </div>
        <div class="result-item">
          <span class="label">Image Quality:</span>
          <span class="value">{{ (detectionResult.bestQualityScore * 100).toFixed(1) }}%</span>
        </div>
        <div class="result-item">
          <span class="label">Best Frame Prefix:</span>
          <span class="value">{{ detectionResult.bestFrameImage?.slice(0, 10) }}</span>
        </div>        
        <div class="result-item">
          <span class="label">Total Time:</span>
          <span class="value">{{ (detectionResult.totalTime / 1000).toFixed(2) }}s</span>
        </div>
      </div>
      <div class="result-images">
        <div v-if="detectionResult.bestFrameImage" class="image-box">
          <h4>Best Frame Image</h4>
          <img :src="detectionResult.bestFrameImage" alt="Frame" />
        </div>
        <div v-if="detectionResult.bestFaceImage" class="image-box">
          <h4>Face Image</h4>
          <img :src="detectionResult.bestFaceImage" alt="Face" />
        </div>
      </div>
      <button @click="resetDetection" class="btn-primary">Detect Again</button>
    </div>

    <!-- Error Alert -->
    <div v-if="errorMessage" class="error-panel">
      <p>❌ {{ errorMessage }}</p>
      <button @click="resetDetection" class="btn-primary">Retry</button>
    </div>

    <!-- Debug Logs -->
    <div v-if="showDebugPanel" class="debug-panel">
      <div class="debug-header">
        <h3>🔍 Debug Information</h3>
        <button @click="showDebugPanel = false" class="close-btn">Close</button>
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
      Show Debug Information ({{ debugLogs.length }})
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { version as appVersion } from '../../package.json'
import FaceDetectionEngine, { 
  LivenessAction,
  type DetectorLoadedEventData,
  type DetectorFinishEventData,
  type DetectorInfoEventData,
  type DetectorActionEventData,
  type DetectorErrorEventData,
  type DetectorDebugEventData,
  type FaceDetectionEngineOptions,
  DetectionCode
} from '@sssxyd/face-liveness-detector'

// 配置参数
const actionCount = ref<number>(0)
const minImageQuality = ref<number>(0.5)
const humanModelPath = ref<string>('/models')
const tensorflowWasmPath = ref<string>('/wasm')

// 引擎实例
let engine: FaceDetectionEngine | null = null
const videoElement = ref<HTMLVideoElement | null>(null)

// 状态
const isEngineReady = ref<boolean>(false)
const isDetecting = ref<boolean>(false)
const statusMessage = ref<string>('waiting...')
const errorMessage = ref<string>('')
const borderColor = ref<'idle' | 'warn' | 'yes' | 'success' | 'failed'>('idle')

// 当前动作提示
const currentAction = ref<LivenessAction | null>(null)

// 检测信息
const silentPassedCount = ref<number>(0)
const actionPassedCount = ref<number>(0)
const faceInfo = ref({
  passed: false,
  code: '',
  message: '',
  data: {},
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
const options = computed<FaceDetectionEngineOptions>(() => ({
  debug_mode: true,
  debug_log_level: 'warn',
  human_model_path: humanModelPath.value,
  tensorflow_wasm_path: tensorflowWasmPath.value,
  collect_min_image_quality: minImageQuality.value,
  collect_min_face_frontal: 0.9,
  collect_min_collect_count: 3,
  action_liveness_action_count: actionCount.value,
}))

// 初始化引擎
onMounted(async () => {
  try {
    engine = new FaceDetectionEngine(options.value)
    
    // Listen to events
    engine.on('detector-loaded', handleEngineReady)
    engine.on('detector-info', handleDetectorInfo)
    engine.on('detector-action', handleDetectorAction)
    engine.on('detector-finish', handleDetectionFinish)
    engine.on('detector-error', handleDetectionError)
    engine.on('detector-debug', handleDebugLog)
    
    // Initialize
    statusMessage.value = 'Initializing engine...'
    await engine.initialize()
  } catch (error: any) {
    console.error('Engine initialization failed:', error)
    errorMessage.value = `Engine initialization failed: ${error.message}`
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
    errorMessage.value = 'Engine loading failed: ' + (data.error || 'Unknown error')
    console.error('❌ Engine loading failed')
    return
  }
  statusMessage.value = `App v${appVersion} | Engine ready, Opencv: ${data.opencv_version || 'N/A'}, Human: ${data.human_version || 'N/A'}`
  console.log(`✅ App v${appVersion} initialized successfully`)
}


function handleDetectorInfo(data: DetectorInfoEventData) {
  if (data.passed) {
    silentPassedCount.value++
  }

  switch(data.code){
    case DetectionCode.FACE_CHECK_PASS:
      borderColor.value = 'yes'
      statusMessage.value = 'Face Collected'
      break
    case DetectionCode.VIDEO_NO_FACE:
    case DetectionCode.MULTIPLE_FACE:
      borderColor.value = 'failed'
      statusMessage.value = data.message || getPromptMessage(data.code)
      break
    default:
      borderColor.value = 'warn'
      statusMessage.value = data.message || getPromptMessage(data.code)
      break
  }
  
  const { passed, code, message, ...restData } = data
  faceInfo.value = {
    passed,
    code: String(code),
    message,
    data: restData
  }
}

function handleDetectorAction(data: DetectorActionEventData) {
  if (data.status === 'started') {
    currentAction.value = data.action
    statusMessage.value = `Please perform action: ${getActionText(data.action)}`
  } else if (data.status === 'completed') {
    actionPassedCount.value++
    currentAction.value = null
    statusMessage.value = 'Action recognized successfully!'
  } else if (data.status === 'timeout') {
    statusMessage.value = 'Action recognition timeout'
  }
}

function handleDetectionFinish(data: DetectorFinishEventData) {
  isDetecting.value = false
  detectionResult.value = data
  currentAction.value = null
  
  if (data.success) {
    statusMessage.value = 'Detection completed successfully!'
    borderColor.value = 'success'
  } else {
    statusMessage.value = 'Detection failed'
    borderColor.value = 'failed'
  }
}

function handleDetectionError(error: DetectorErrorEventData) {
  isDetecting.value = false
  errorMessage.value = `${error.code}: ${error.message}`
  console.error('Detection error:', error)
}

function handleDebugLog(debug: DetectorDebugEventData) {
  // 只在检测进行中或初始化时记录日志
  if (!isDetecting.value && engine?.listenerCount?.('detector-debug') === 1) {
    return
  }
  
  const timestamp = new Date().toLocaleTimeString()
  debugLogs.value.push({
    timestamp,
    stage: debug.stage,
    level: debug.level || 'info',
    message: debug.message,
    details: debug.details
  })
  
  // Limit log quantity
  if (debugLogs.value.length > maxDebugLogs) {
    debugLogs.value.shift()
  }
}

// Operation functions
async function startDetection() {
  if (!engine || !videoElement.value) {
    return
  }
  
  try {
    // Reset state
    silentPassedCount.value = 0
    actionPassedCount.value = 0
    currentAction.value = null
    detectionResult.value = null
    errorMessage.value = ''
    faceInfo.value = { passed: false, code: '', message: '', data: {} }
    
    // Update configuration
    engine.updateOptions(options.value)
    
    // Start detection
    await engine.startDetection(videoElement.value)
    isDetecting.value = true
    statusMessage.value = 'Detecting face...'
  } catch (error: any) {
    console.error('Failed to start detection:', error)
    errorMessage.value = `Failed to start detection: ${error.message}`
  }
}

function stopDetection() {
  if (engine) {
    engine.stopDetection(false)
    isDetecting.value = false
    currentAction.value = null
    statusMessage.value = 'Detection stopped'
    borderColor.value = 'idle'
  }
}

function resetDetection() {
  detectionResult.value = null
  errorMessage.value = ''
  silentPassedCount.value = 0
  actionPassedCount.value = 0
  faceInfo.value = { passed: false, code: '', message: '', data: {} }
  statusMessage.value = 'Waiting to start detection...'
  borderColor.value = 'idle'
}

// Helper functions
function getPromptMessage(code: string): string {
  const messages: Record<string, string> = {
    [DetectionCode.VIDEO_NO_FACE]: 'Face not detected, please face the camera',
    [DetectionCode.MULTIPLE_FACE]: 'Multiple faces detected, ensure only one person',
    [DetectionCode.FACE_TOO_SMALL]: 'Face too small, please move closer to the camera',
    [DetectionCode.FACE_TOO_LARGE]: 'Face too large, please move away from the camera',
    [DetectionCode.FACE_NOT_FRONTAL]: 'Please face the camera directly',
    [DetectionCode.FACE_LOW_QUALITY]: 'Image quality too low, please improve lighting or camera focus',
    [DetectionCode.FACE_CHECK_PASS]: 'Face detected successfully'
  }
  return messages[code] || 'Detecting...'
}

function getActionText(action: LivenessAction): string {
  const texts: Record<string, string> = {
    [LivenessAction.BLINK]: 'Please blink',
    [LivenessAction.MOUTH_OPEN]: 'Please open your mouth',
    [LivenessAction.NOD_DOWN]: 'Please nod down',
    [LivenessAction.NOD_UP]: 'Please nod up'
  }
  return texts[action] || action
}

function getActionIcon(action: LivenessAction): string {
  const icons: Record<string, string> = {
    [LivenessAction.BLINK]: '👁️',
    [LivenessAction.MOUTH_OPEN]: '👄',
    [LivenessAction.NOD_DOWN]: '👇',
    [LivenessAction.NOD_UP]: '👆'
  }
  return icons[action] || '🔄'
}

function getActionCountLabel(count: number): string {
  const labels: Record<number, string> = {
    0: 'Silent detection only',
    1: 'Random 1 action',
    2: 'Random 2 actions',
    3: 'Random 3 actions'
  }
  return labels[count] || 'Unknown'
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

.header a {
  color: #3498db;
  text-decoration: none;
  transition: color 0.3s;
}

.header a:hover {
  color: #2980b9;
  text-decoration: underline;
}

.github-stars {
  margin-left: 6px;
  display: inline-block;
  animation: star-twinkle 2s ease-in-out infinite;
}

@keyframes star-twinkle {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
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
  height: 640px;
  margin: 0 auto;
  background: #000;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 12px solid #95a5a6;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

/* Border color states */
.video-container.border-idle {
  border-color: #95a5a6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.video-container.border-warn {
  border-color: #f39c12;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 20px rgba(243, 156, 18, 0.5);
}

.video-container.border-yes {
  border-color: #3498db;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 20px rgba(52, 152, 219, 0.5);
}

.video-container.border-success {
  border-color: #2ecc71;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 20px rgba(46, 204, 113, 0.8);
}

.video-container.border-failed {
  border-color: #e74c3c;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 20px rgba(231, 76, 60, 0.8);
}

.video-container video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.action-prompt-container {
  text-align: center;
  margin-top: 15px;
  margin-bottom: 20px;
}

.action-prompt {
  display: inline-block;
  background: rgba(66, 185, 131, 0.95);
  padding: 20px 40px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.action-icon {
  font-size: 48px;
  display: inline-block;  
  margin-right: 10px;     
}

.action-text {
  font-size: 24px;
  font-weight: bold;
  color: white;
  display: inline-block;  /* 加这一行 */
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
  grid-template-columns: repeat(2, 1fr);
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

.info-item.info-item-full {
  grid-column: 1 / -1;
  flex-direction: column;
}

.info-item .label {
  font-weight: 500;
  color: #555;
}

.info-item .value {
  font-weight: 700;
  color: #2c3e50;
}

.value-data {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.data-row {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid #e0e0e0;
}

.data-row:last-child {
  border-bottom: none;
}

.data-key {
  font-weight: 600;
  color: #3498db;
  min-width: 80px;
}

.data-value {
  color: #2c3e50;
  word-break: break-all;
  flex: 1;
}

.data-empty {
  color: #95a5a6;
  font-style: italic;
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
    max-width: 400px;
    height: auto;
    aspect-ratio: 1/1;
    margin: 0 auto 15px;
    border-radius: 50%;
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
    grid-template-columns: repeat(2, 1fr);
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

  .messages-container {
    max-width: calc(100% - 20px);
    gap: 8px;
  }

  .status-message-panel {
    width: 100%;
  }

  .status-message {
    font-size: 14px;
    padding: 10px 15px;
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
    grid-template-columns: repeat(2, 1fr);
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
