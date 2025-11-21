<template>
  <div class="quality-test-container">
    <h1>图像质量检测演示</h1>
    
    <!-- 模式选择 -->
    <div class="controls">
      <div class="mode-selector">
        <h3>选择工作模式：</h3>
        <label>
          <input v-model="detectionMode" type="radio" :value="DetectionMode.COLLECTION" />
          采集模式 - 检测清晰的人脸图片
        </label>
        <label>
          <input v-model="detectionMode" type="radio" :value="DetectionMode.SILENT_LIVENESS" />
          静默活体检测 - 检测图像质量后进行活体检测
        </label>
      </div>
      
      <!-- 质量阈值调整 -->
      <div class="quality-settings">
        <h3>图像质量阈值：</h3>
        <div class="slider-group">
          <label>
            MIN_BOX_SCORE: {{ qualityThresholds.minBoxScore.toFixed(2) }}
            <input 
              v-model.number="qualityThresholds.minBoxScore" 
              type="range" 
              min="0" 
              max="1" 
              step="0.05"
            />
          </label>
        </div>
        <div class="slider-group">
          <label>
            MIN_FACE_SCORE: {{ qualityThresholds.minFaceScore.toFixed(2) }}
            <input 
              v-model.number="qualityThresholds.minFaceScore" 
              type="range" 
              min="0" 
              max="1" 
              step="0.05"
            />
          </label>
        </div>
        <div class="slider-group">
          <label>
            MIN_OVERALL_SCORE: {{ qualityThresholds.minOverallScore.toFixed(2) }}
            <input 
              v-model.number="qualityThresholds.minOverallScore" 
              type="range" 
              min="0" 
              max="1" 
              step="0.05"
            />
          </label>
        </div>
      </div>
      
      <!-- 控制按钮 -->
      <div class="action-buttons">
        <button @click="startDetection" :disabled="!isComponentReady" class="btn btn-primary">
          {{ isComponentReady ? (isDetecting ? '正在检测...' : '开始检测') : '加载中...' }}
        </button>
        <button @click="stopDetection" class="btn btn-secondary" :disabled="!isDetecting">
          停止检测
        </button>
      </div>
    </div>
    
    <!-- 人脸检测器 -->
    <div class="detector-wrapper">
      <FaceDetector
        ref="faceDetectorRef"
        :mode="detectionMode"
        :liveness-checks="[LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD]"
        :min-face-ratio="0.3"
        :max-face-ratio="0.9"
        :min-frontal="0.9"
        :silent-liveness-threshold="0.85"
        :show-action-prompt="true"
        @ready="handleComponentReady"
        @status-prompt="handleStatusPrompt"
        @face-collected="handleFaceCollected"
        @liveness-detected="handleLivenessDetected"
        @liveness-completed="handleLivenessCompleted"
        @error="handleError"
        @debug="handleDebug"
      />
    </div>
    
    <!-- 统计信息 -->
    <div class="stats-panel">
      <h3>检测统计信息：</h3>
      <table>
        <tr>
          <td>当前面部检测数：</td>
          <td>{{ stats.faceCount }}</td>
        </tr>
        <tr>
          <td>面部大小：</td>
          <td>{{ (stats.faceSize * 100).toFixed(2) }}%</td>
        </tr>
        <tr>
          <td>正脸评分：</td>
          <td>{{ (stats.frontal * 100).toFixed(2) }}%</td>
        </tr>
        <tr>
          <td>检测框质量：</td>
          <td>{{ (stats.boxScore * 100).toFixed(2) }}% <span :class="getQualityClass(stats.boxScore)">{{ getQualityLabel(stats.boxScore) }}</span></td>
        </tr>
        <tr>
          <td>网格质量：</td>
          <td>{{ (stats.faceScore * 100).toFixed(2) }}% <span :class="getQualityClass(stats.faceScore)">{{ getQualityLabel(stats.faceScore) }}</span></td>
        </tr>
        <tr>
          <td>综合评分：</td>
          <td>{{ (stats.overallScore * 100).toFixed(2) }}% <span :class="getQualityClass(stats.overallScore)">{{ getQualityLabel(stats.overallScore) }}</span></td>
        </tr>
        <tr v-if="stats.realScore >= 0">
          <td>真实人脸得分：</td>
          <td>{{ (stats.realScore * 100).toFixed(2) }}%</td>
        </tr>
        <tr v-if="stats.liveScore >= 0">
          <td>活体得分：</td>
          <td>{{ (stats.liveScore * 100).toFixed(2) }}%</td>
        </tr>
      </table>
    </div>
    
    <!-- 质量检测日志 -->
    <div class="debug-panel">
      <h3>质量检测日志：</h3>
      <div class="log-viewer">
        <div 
          v-for="(log, index) in qualityLogs" 
          :key="index"
          :class="['log-entry', 'level-' + log.level]"
        >
          <span class="timestamp">{{ formatTime(log.timestamp) }}</span>
          <span class="level">{{ log.level.toUpperCase() }}</span>
          <span class="message">{{ log.message }}</span>
          <span v-if="log.details" class="details">{{ JSON.stringify(log.details, null, 2) }}</span>
        </div>
      </div>
    </div>
    
    <!-- 采集结果展示 -->
    <div v-if="collectedImage" class="result-panel">
      <h3>采集结果：</h3>
      <img :src="collectedImage" alt="采集的人脸图片" class="result-image" />
      <p class="result-info">
        ✓ 图像已通过质量检测<br/>
        <span v-if="lastDetectionStats">
          boxScore: {{ (lastDetectionStats.boxScore * 100).toFixed(2) }}% | 
          faceScore: {{ (lastDetectionStats.faceScore * 100).toFixed(2) }}% | 
          score: {{ (lastDetectionStats.score * 100).toFixed(2) }}%
        </span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import FaceDetector from '../components/facedetector/FaceDetector.vue'
import { DetectionMode, LivenessAction } from '../components/facedetector/enums'

const faceDetectorRef = ref()
const isDetecting = ref(false)
const isComponentReady = ref(false)  // 组件是否就绪（Human.js 加载完成）
const detectionMode = ref(DetectionMode.COLLECTION)

// 质量检测阈值
const qualityThresholds = reactive({
  minBoxScore: 0.6,
  minFaceScore: 0.8,
  minOverallScore: 0.7
})

// 统计信息
const stats = reactive({
  faceCount: 0,
  faceSize: 0,
  frontal: 0,
  boxScore: 0,
  faceScore: 0,
  overallScore: 0,
  realScore: -1,
  liveScore: -1
})

// 质量检测日志
const qualityLogs = ref<Array<{ level: string; timestamp: number; message: string; details?: any }>>([])

// 采集的图片
const collectedImage = ref('')
const lastDetectionStats = ref<any>(null)

// 处理组件就绪
const handleComponentReady = () => {
  isComponentReady.value = true
  console.log('FaceDetector 组件已就绪')
}

// 处理事件方法
const handleStatusPrompt = () => {
  // message will be handled by the UI
}

const handleFaceCollected = (data: any) => {
  collectedImage.value = data.imageData
  addLog('info', '✓ 人脸采集完成 - 图像质量符合要求')
}

const handleLivenessDetected = (data: any) => {
  stats.realScore = data.real
  stats.liveScore = data.live
  addLog('info', `活体检测结果 - real: ${data.real.toFixed(2)}, live: ${data.live.toFixed(2)}`)
}

const handleLivenessCompleted = (data: any) => {
  collectedImage.value = data.imageData
  addLog('info', `✓ 活体检测通过 - liveness: ${(data.liveness * 100).toFixed(2)}%`)
}

const handleError = (error: any) => {
  addLog('error', `错误 [${error.code}]: ${error.message}`)
}

const handleDebug = (debug: any) => {
  // 监听质量检测相关的调试信息
  if (debug.stage === 'quality-check' || debug.stage === 'quality') {
    const level = debug.level || 'info'
    addLog(level, debug.message, debug.details)
    
    // 更新统计信息
    if (debug.details) {
      if (debug.details.boxScore !== undefined) stats.boxScore = debug.details.boxScore
      if (debug.details.faceScore !== undefined) stats.faceScore = debug.details.faceScore
      if (debug.details.overallScore !== undefined) stats.overallScore = debug.details.overallScore
      if (debug.details.score !== undefined) {
        stats.overallScore = debug.details.score
        lastDetectionStats.value = debug.details
      }
    }
  }
}

const addLog = (level: string, message: string, details?: any) => {
  qualityLogs.value.unshift({ level, message, details, timestamp: Date.now() })
  // 限制日志数量
  if (qualityLogs.value.length > 50) {
    qualityLogs.value.pop()
  }
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

const getQualityClass = (score: number) => {
  if (score >= 0.8) return 'quality-good'
  if (score >= 0.6) return 'quality-fair'
  return 'quality-poor'
}

const getQualityLabel = (score: number) => {
  if (score >= 0.8) return '优'
  if (score >= 0.6) return '良'
  return '差'
}

const startDetection = () => {
  isDetecting.value = true
  collectedImage.value = ''
  qualityLogs.value = []
  stats.realScore = -1
  stats.liveScore = -1
  faceDetectorRef.value?.startDetection()
}

const stopDetection = () => {
  isDetecting.value = false
  faceDetectorRef.value?.stopDetection()
}
</script>

<style scoped>
.quality-test-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
  text-align: center;
  color: #333;
  margin-bottom: 30px;
}

h3 {
  color: #555;
  margin-top: 0;
  font-size: 16px;
}

.controls {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.mode-selector {
  margin-bottom: 20px;
}

.mode-selector label {
  display: block;
  margin: 10px 0;
  cursor: pointer;
  font-size: 14px;
}

.mode-selector input {
  margin-right: 8px;
  cursor: pointer;
}

.quality-settings {
  margin: 20px 0;
  background: white;
  padding: 15px;
  border-radius: 4px;
}

.slider-group {
  margin: 12px 0;
}

.slider-group label {
  display: flex;
  align-items: center;
  font-size: 14px;
  gap: 10px;
}

.slider-group input[type="range"] {
  flex: 1;
  max-width: 200px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s;
}

.btn-primary {
  background: #42b983;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #369970;
}

.btn-secondary {
  background: #ddd;
  color: #666;
}

.btn-secondary:hover:not(:disabled) {
  background: #ccc;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.detector-wrapper {
  margin: 30px 0;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.stats-panel {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.stats-panel table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.stats-panel tr {
  border-bottom: 1px solid #eee;
}

.stats-panel tr:last-child {
  border-bottom: none;
}

.stats-panel td {
  padding: 10px;
  text-align: left;
}

.stats-panel td:first-child {
  font-weight: 500;
  width: 40%;
  color: #555;
}

.stats-panel td:last-child {
  color: #333;
}

.quality-good {
  color: #42b983;
  font-weight: bold;
}

.quality-fair {
  color: #ffc107;
  font-weight: bold;
}

.quality-poor {
  color: #f56c6c;
  font-weight: bold;
}

.debug-panel {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.log-viewer {
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
  font-size: 12px;
  font-family: 'Courier New', monospace;
}

.log-entry {
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-entry.level-info {
  background: #e7f3ff;
  color: #0050b3;
}

.log-entry.level-warn {
  background: #fffbe6;
  color: #ad6800;
}

.log-entry.level-error {
  background: #fff1f0;
  color: #820000;
}

.log-entry .timestamp {
  color: #999;
  min-width: 80px;
}

.log-entry .level {
  min-width: 50px;
  font-weight: bold;
}

.log-entry .message {
  flex: 1;
}

.log-entry .details {
  width: 100%;
  display: block;
  margin-top: 4px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 2px;
  white-space: pre-wrap;
  word-break: break-all;
}

.result-panel {
  background: white;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.result-image {
  max-width: 400px;
  max-height: 400px;
  border-radius: 4px;
  margin: 10px 0;
}

.result-info {
  color: #42b983;
  font-size: 14px;
  margin: 10px 0 0 0;
}
</style>
