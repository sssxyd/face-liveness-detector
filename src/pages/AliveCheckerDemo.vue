<template>
  <div class="face-alive-checker">
    <div class="header">
      <h1>人脸活体验证</h1>
      <p>请完成以下动作验证您是真人</p>
    </div>

    <div class="control-panel">
      <button 
        v-if="!isDetecting" 
        @click="startDetection"
        :disabled="!isComponentReady"
        class="btn-primary"
      >
        {{ isComponentReady ? '开始验证' : '加载中...' }}
      </button>
      <button 
        v-else 
        @click="stopDetection"
        class="btn-danger"
      >
        停止验证
      </button>
    </div>

    <FaceDetector
      ref="faceDetectorRef"
      mode="liveness"
      :liveness-checks="livenessChecks"
      :min-face-ratio="minFaceRatio"
      :max-face-ratio="maxFaceRatio"
      :min-frontal="minFrontal"
      :liveness-action-count="livenessActionCount"
      :liveness-action-timeout="livenessActionTimeout"
      :show-action-prompt="showActionPrompt"
      @ready="handleComponentReady"
      @status-prompt="handleStatusPrompt"
      @liveness-completed="handleLivenessCompleted"
      @error="handleError"
    />

    <div class="info-panel">
      <h3>检测信息</h3>
      <div v-if="actionMessage" class="prompt-detail">
        <div class="message-section">
          <div class="message-text">{{ actionMessage }}</div>
        </div>
      </div>
      <p v-else>等待开始验证...</p>
    </div>

    <div v-if="verifiedImage" class="result-panel">
      <h3>验证成功</h3>
      <div class="image-container">
        <img 
          :src="verifiedImage" 
          alt="Verified Face"
          loading="lazy"
          @error="handleImageError"
        />
      </div>
      <button @click="resetVerification">重新验证</button>
    </div>

    <div v-if="errorMessage" class="error-panel">
      <p>{{ errorMessage }}</p>
      <button @click="resetVerification">重试</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, Ref } from 'vue'
import FaceDetector from '../components/facedetector/FaceDetector.vue'
import { LivenessAction } from '../components/facedetector/enums'
import { LivenessCompletedData, StatusPromptData } from '../components/facedetector/types'

// Configurable liveness checks
const livenessChecks: Ref<LivenessAction[]> = ref([LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD])

const faceDetectorRef: Ref<any> = ref(null)
const actionMessage: Ref<string | null> = ref(null)
const verifiedImage: Ref<string | null> = ref(null)
const errorMessage: Ref<string | null> = ref(null)
const completedActions: Ref<string[]> = ref([])
const currentAction: Ref<string | null> = ref(null)
const isDetecting: Ref<boolean> = ref(false)
const minFaceRatio: Ref<number> = ref(0.5)
const maxFaceRatio: Ref<number> = ref(0.8)
const minFrontal: Ref<number> = ref(0.9)
const livenessActionCount: Ref<number> = ref(1)      // 活体检测动作次数
const livenessActionTimeout: Ref<number> = ref(60)   // 活体检测动作时间限制（秒）
const showActionPrompt: Ref<boolean> = ref(true)     // 是否显示活体检测动作提示文本
const isComponentReady: Ref<boolean> = ref(false)    // 组件是否就绪（Human.js 加载完成）

function handleComponentReady(): void {
  isComponentReady.value = true
  console.log('FaceDetector 组件已就绪')
}

function handleStatusPrompt(data: StatusPromptData): void {
  const { message } = data
  actionMessage.value = message
}

function handleLivenessCompleted(data: LivenessCompletedData): void {
  verifiedImage.value = data.imageData
  isDetecting.value = false
  console.log('Liveness verification completed!')
}

function handleError(error: { message: string }): void {
  errorMessage.value = error.message
  isDetecting.value = false
}

async function startDetection(): Promise<void> {
  isDetecting.value = true
  errorMessage.value = null
  completedActions.value = []
  currentAction.value = livenessChecks.value.length > 0 ? livenessChecks.value[0] : null
  try {
    await faceDetectorRef.value?.startDetection()
  } catch (err) {
    console.error('Failed to start detection:', err)
    errorMessage.value = '启动检测失败: ' + (err as Error).message
    isDetecting.value = false
  }
}

function stopDetection(): void {
  isDetecting.value = false
  faceDetectorRef.value?.stopDetection()
}

function resetVerification(): void {
  verifiedImage.value = null
  errorMessage.value = null
  actionMessage.value = null
  completedActions.value = []
  currentAction.value = null
  isDetecting.value = false
}

function handleImageError(error: Event): void {
  console.error('[FaceAliveChecker] Image loading error:', error)
  errorMessage.value = '图片加载失败'
}
</script>

<style scoped>
.face-alive-checker {
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

.prompt-detail {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.message-section {
  padding: 12px 15px;
  background-color: #d4edda;
  border-left: 4px solid #28a745;
  border-radius: 4px;
  animation: slideIn 0.3s ease;
}

.message-text {
  color: #155724;
  font-weight: 500;
  font-size: 14px;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.info-panel p {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.actions-panel {
  margin-top: 20px;
  padding: 15px;
  background-color: #fff3cd;
  border-radius: 8px;
}

.actions-panel h3 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #856404;
}

.action-list {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
}

.action-item {
  padding: 10px 15px;
  background-color: #fff;
  border-radius: 5px;
  border: 2px solid #ffc107;
  display: flex;
  align-items: center;
  gap: 10px;
}

.action-item.completed {
  background-color: #d4edda;
  border-color: #28a745;
}

.action-name {
  font-weight: 500;
  color: #333;
}

.status-pending {
  font-size: 12px;
  color: #856404;
}

.status-completed {
  font-size: 12px;
  color: #155724;
  font-weight: bold;
}

.current-action-panel {
  margin-top: 20px;
  padding: 15px;
  background-color: #e7f3ff;
  border-left: 4px solid #007bff;
  border-radius: 5px;
}

.current-action-panel h4 {
  margin: 0 0 8px 0;
  color: #0056b3;
  font-size: 16px;
}

.current-action-panel p {
  margin: 0;
  color: #0056b3;
  font-size: 14px;
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

.error-panel button {
  margin-top: 10px;
  padding: 8px 15px;
  background-color: #721c24;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.3s;
}

.error-panel button:hover {
  background-color: #5a1419;
}

@media (max-width: 768px) {
  .face-alive-checker {
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
  
  .action-list {
    gap: 10px;
  }
  
  .action-item {
    padding: 8px 12px;
    font-size: 13px;
  }
  
  .result-panel img {
    max-height: 300px;
  }
}
</style>
