<template>
  <div class="face-collector">
    <div class="header">
      <h1>人脸采集</h1>
      <p>请正对摄像头，采集您的正脸照片</p>
    </div>

    <div class="control-panel">
      <button 
        v-if="!isDetecting" 
        @click="startDetection"
        class="btn-primary"
      >
        开始采集
      </button>
      <button 
        v-else 
        @click="stopDetection"
        class="btn-danger"
      >
        停止采集
      </button>
    </div>

    <FaceDetector
      ref="faceDetectorRef"
      mode="collection"
      :min-face-ratio="minFaceRatio"
      :max-face-ratio="maxFaceRatio"
      :min-frontal="minFrontal"
      @face-detected="handleFaceDetected"
      @face-collected="handleFaceCollected"
      @error="handleError"
      @debug="handleDebug"
    />

    <div class="info-panel">
      <h3>采集信息</h3>
      <div v-if="faceInfo" class="face-info-detail">
        <div class="info-row">
          <span class="label">人脸数量:</span>
          <span class="value" :class="faceInfo.count === 1 ? 'success' : 'warning'">
            {{ faceInfo.count }}
          </span>
        </div>
        <div class="info-row">
          <span class="label">人脸画面占比:</span>
          <span class="value">{{ faceInfo.size.toFixed(2) }}</span>
          <span class="progress-bar">
            <span class="progress-fill" :style="{ width: Math.min(faceInfo.size, 100) + '%' }"></span>
          </span>
        </div>
        <div class="info-row">
          <span class="label">正脸置信度:</span>
          <span class="value" :class="faceInfo.frontal >= minFrontal ? 'success' : 'warning'">
            {{ faceInfo.frontal.toFixed(2) }}
          </span>
          <span class="progress-bar">
            <span class="progress-fill" :style="{ width: (faceInfo.frontal * 100) + '%' }"></span>
          </span>
        </div>
        <div v-if="isDetecting && faceInfo.frontal < minFrontal" class="hint-text">
          💡 请将脸正对摄像头
        </div>
        <div v-if="isDetecting && faceInfo.size < minFaceRatio" class="hint-text">
          💡 请靠近摄像头（目标：{{ (minFaceRatio * 100).toFixed(0) }}%-{{ (maxFaceRatio * 100).toFixed(0) }}%）
        </div>
        <div v-if="isDetecting && faceInfo.size > maxFaceRatio" class="hint-text">
          💡 请远离摄像头（目标：{{ (minFaceRatio * 100).toFixed(0) }}%-{{ (maxFaceRatio * 100).toFixed(0) }}%）
        </div>
        <div v-if="isDetecting && faceInfo.size >= minFaceRatio && faceInfo.size <= maxFaceRatio && faceInfo.frontal >= minFrontal" class="hint-text success-hint">
          ✓ 完美！准备采集中...
        </div>
      </div>
      <p v-else>等待开始采集...</p>
    </div>

    <div v-if="collectedImage" class="result-panel">
      <h3>采集成功</h3>
      <div class="image-container">
        <img 
          :src="collectedImage" 
          alt="Collected Face"
          loading="lazy"
          @error="handleImageError"
        />
      </div>
      <button @click="resetCollection">重新采集</button>
    </div>

    <div v-if="errorMessage" class="error-panel">
      <p>{{ errorMessage }}</p>
    </div>

    <!-- Debug 信息面板 -->
    <div v-if="showDebugPanel" class="debug-panel">
      <div class="debug-header">
        <h3>🔍 调试信息</h3>
        <button @click="showDebugPanel = false" class="close-btn">关闭</button>
        <button @click="debugLogs = []" class="clear-btn">清空</button>
      </div>
      <div class="debug-content">
        <div v-if="debugLogs.length === 0" class="no-logs">
          等待调试信息...
        </div>
        <div v-else class="logs-container">
          <div 
            v-for="(log, index) in debugLogs" 
            :key="index"
            :class="['log-item', `level-${log.level}`]"
          >
            <div class="log-header">
              <span class="stage">{{ log.stage }}</span>
              <span class="level">{{ log.level }}</span>
              <span class="time">{{ new Date(log.timestamp).toLocaleTimeString() }}</span>
            </div>
            <div class="log-message">{{ log.message }}</div>
            <div v-if="log.details" class="log-details">
              <pre>{{ JSON.stringify(log.details, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 打开 Debug 面板按钮 -->
    <button v-if="!showDebugPanel && debugLogs.length > 0" @click="showDebugPanel = true" class="show-debug-btn">
      显示调试信息 ({{ debugLogs.length }})
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, Ref } from 'vue'
import FaceDetector from '../components/FaceDetector.vue'
import { FaceCollectedData, FaceDetectedData, DebugData} from '../components/face-detector'

// 人脸检测参数
const minFaceRatio: Ref<number> = ref(0.5)  // 最小人脸占比(0-1)
const maxFaceRatio: Ref<number> = ref(0.8)  // 最大人脸占比(0-1)
const minFrontal: Ref<number> = ref(0.9)    // 最小正对度(0-1)

const faceDetectorRef: Ref<any> = ref(null)
const faceInfo: Ref<FaceDetectedData | null> = ref(null)
const collectedImage: Ref<string | null> = ref(null)
const errorMessage: Ref<string | null> = ref(null)
const isDetecting: Ref<boolean> = ref(false)

// Debug 相关数据
const debugLogs: Ref<DebugData[]> = ref([])
const showDebugPanel: Ref<boolean> = ref(true)
const maxDebugLogs: number = 50  // 最多保存 50 条日志

function handleFaceDetected(data: FaceDetectedData): void {
  faceInfo.value = data
}

function handleFaceCollected(data: FaceCollectedData): void {
  if (data.imageData) {
    collectedImage.value = data.imageData
  } else {
    console.error('[FaceCollector] No image data received')
  }
  isDetecting.value = false
}

function handleError(error: { message: string }): void {
  errorMessage.value = error.message
  isDetecting.value = false
}

function handleDebug(debugData: DebugData): void {
  // 添加调试日志到列表
  debugLogs.value.unshift(debugData)
  
  // 限制日志数量，防止内存溢出
  if (debugLogs.value.length > maxDebugLogs) {
    debugLogs.value = debugLogs.value.slice(0, maxDebugLogs)
  }
}

async function startDetection(): Promise<void> {
  isDetecting.value = true
  errorMessage.value = null
  try {
    await faceDetectorRef.value?.startDetection()
  } catch (err) {
    errorMessage.value = '启动检测失败: ' + (err as Error).message
    isDetecting.value = false
  }
}

function stopDetection(): void {
  isDetecting.value = false
  faceDetectorRef.value?.stopDetection()
}

function resetCollection(): void {
  collectedImage.value = null
  faceInfo.value = null
  errorMessage.value = null
  isDetecting.value = false
}

function handleImageError(): void {
  errorMessage.value = '图片加载失败'
}
</script>

<style scoped>
.face-collector {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h1 {
  margin: 0 0 10px 0;
  color: #333;
}

.header p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.control-panel {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
  gap: 10px;
}

.btn-primary,
.btn-danger {
  padding: 12px 30px;
  font-size: 16px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s ease;
}

.btn-primary {
  background-color: #42b983;
  color: white;
}

.btn-primary:hover {
  background-color: #358f6b;
  box-shadow: 0 2px 8px rgba(66, 185, 131, 0.3);
}

.btn-danger {
  background-color: #f56c6c;
  color: white;
}

.btn-danger:hover {
  background-color: #dd001b;
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.3);
}

.info-panel {
  margin-top: 20px;
  padding: 15px;
  background-color: #f0f0f0;
  border-radius: 8px;
  text-align: center;
}

.info-panel h3 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #333;
}

.face-info-detail {
  text-align: left;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px;
  background-color: #fff;
  border-radius: 5px;
  flex-wrap: wrap;
}

.info-row .label {
  font-weight: 500;
  color: #555;
  min-width: 100px;
}

.info-row .value {
  font-weight: 600;
  color: #333;
  min-width: 60px;
  text-align: right;
}

.info-row .value.success {
  color: #42b983;
}

.info-row .value.warning {
  color: #f56c6c;
}

.progress-bar {
  flex: 1;
  min-width: 150px;
  height: 8px;
  background-color: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-left: auto;
}

.progress-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #42b983, #35a372);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.hint-text {
  margin-top: 12px;
  padding: 10px;
  background-color: #fff3cd;
  color: #856404;
  border-left: 4px solid #ffc107;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
}

.hint-text.success-hint {
  background-color: #d4edda;
  color: #155724;
  border-left-color: #28a745;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

.info-panel p {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.result-panel {
  margin-top: 20px;
  padding: 20px;
  background-color: #d4edda;
  border-radius: 8px;
  text-align: center;
}

.result-panel h3 {
  margin: 0 0 15px 0;
  color: #155724;
}

.image-container {
  width: 100%;
  max-width: 400px;
  margin: 0 auto 15px;
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.result-panel img {
  width: 100%;
  height: auto;
  max-height: 400px;
  object-fit: contain;
  display: block;
}

.result-panel button {
  padding: 10px 20px;
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

.result-panel button:hover {
  background-color: #358f6b;
}

.error-panel {
  margin-top: 20px;
  padding: 15px;
  background-color: #f8d7da;
  border-radius: 8px;
  color: #721c24;
  font-size: 14px;
}

/* Debug 面板样式 */
.debug-panel {
  margin-top: 20px;
  padding: 15px;
  background-color: #1e1e1e;
  border-radius: 8px;
  color: #e0e0e0;
  font-family: 'Courier New', monospace;
  max-height: 500px;
  display: flex;
  flex-direction: column;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #333;
}

.debug-header h3 {
  margin: 0;
  color: #4ec9b0;
  font-size: 14px;
}

.close-btn, .clear-btn {
  padding: 5px 10px;
  background-color: #333;
  color: #e0e0e0;
  border: 1px solid #555;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  margin-left: 10px;
}

.close-btn:hover, .clear-btn:hover {
  background-color: #444;
  border-color: #666;
}

.debug-content {
  flex: 1;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.5;
}

.no-logs {
  text-align: center;
  color: #888;
  padding: 20px;
}

.logs-container {
  display: flex;
  flex-direction: column-reverse;
}

.log-item {
  padding: 10px;
  margin-bottom: 5px;
  border-left: 3px solid #666;
  background-color: #2d2d2d;
  border-radius: 3px;
}

.log-item.level-info {
  border-left-color: #4ec9b0;
  color: #4ec9b0;
}

.log-item.level-warn {
  border-left-color: #dcdcaa;
  color: #dcdcaa;
}

.log-item.level-error {
  border-left-color: #f48771;
  color: #f48771;
}

.log-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  font-size: 11px;
  color: #888;
}

.stage {
  font-weight: bold;
  color: #9cdcfe;
}

.level {
  text-transform: uppercase;
  font-weight: bold;
}

.time {
  font-size: 10px;
}

.log-message {
  margin-bottom: 5px;
  word-break: break-all;
}

.log-details {
  background-color: #1e1e1e;
  padding: 8px;
  border-radius: 3px;
  margin-top: 5px;
  overflow-x: auto;
}

.log-details pre {
  margin: 0;
  font-size: 10px;
  color: #ce9178;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.show-debug-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 10px 15px;
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(66, 185, 131, 0.3);
}

@media (max-width: 768px) {
  .face-collector {
    padding: 15px;
  }
  
  .header {
    margin-bottom: 20px;
  }
  
  .header h1 {
    font-size: 20px;
  }
  
  .control-panel {
    margin-bottom: 15px;
  }
  
  .btn-primary,
  .btn-danger {
    padding: 10px 20px;
    font-size: 14px;
    flex: 1;
    max-width: 150px;
  }
  
  .result-panel img {
    max-height: 300px;
  }
}
</style>
