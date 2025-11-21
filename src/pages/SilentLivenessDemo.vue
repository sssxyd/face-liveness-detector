<template>
  <div class="silent-liveness">
    <div class="header">
      <h1>静默活体检测</h1>
      <p>自动检测真实人脸，无需任何用户操作</p>
    </div>

    <div class="control-panel">
      <button 
        v-if="!isDetecting" 
        @click="startDetection"
        :disabled="!isComponentReady"
        class="btn-primary"
      >
        {{ isComponentReady ? '开始检测' : '加载中...' }}
      </button>
      <button 
        v-else 
        @click="stopDetection"
        class="btn-danger"
      >
        停止检测
      </button>
    </div>

    <FaceDetector
      ref="faceDetectorRef"
      mode="silent_liveness"
      :min-face-ratio="minFaceRatio"
      :max-face-ratio="maxFaceRatio"
      :min-frontal="minFrontal"
      :silent-liveness-threshold="0.85"
      @ready="handleComponentReady"
      @status-prompt="handleStatusPrompt"
      @liveness-completed="handleLivenessCompleted"
      @liveness-detected="handleLivenessDetected"
      @error="handleError"
    />

    <div class="info-panel">
      <h3>检测信息</h3>
      <p>检测进行中...</p>
    </div>

    <div v-if="errorMessage" class="error-panel">
      <p v-if="errorCode">错误代码: {{ errorCode }}</p>
      <p>{{ errorMessage }}</p>
    </div>

    <div v-if="verifiedImage" class="result-panel">
      <h3>检测成功</h3>
      <div class="image-container">
        <img 
          :src="verifiedImage" 
          alt="Verified Face"
          loading="lazy"
          @error="handleImageError"
        />
      </div>
      <div v-if="livenessScore !== null" class="score-info">
        活体检测得分: <span class="score-value">{{ (livenessScore * 100).toFixed(1) }}%</span>
      </div>
      <button @click="resetDetection">重新检测</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, Ref } from 'vue'
import FaceDetector from '../components/facedetector/FaceDetector.vue'
import { ErrorCode } from '../components/facedetector/enums'
import { LivenessCompletedData, LivenessDetectedData } from '../components/facedetector/types'

// 人脸检测参数
const minFaceRatio: Ref<number> = ref(0.5)  // 最小人脸占比(0-1)
const maxFaceRatio: Ref<number> = ref(0.8)  // 最大人脸占比(0-1)
const minFrontal: Ref<number> = ref(0.9)    // 最小正对度(0-1)

const faceDetectorRef: Ref<any> = ref(null)
const livenessInfo: Ref<LivenessDetectedData | null> = ref(null)
const verifiedImage: Ref<string | null> = ref(null)
const errorCode: Ref<ErrorCode | null> = ref(null)
const errorMessage: Ref<string | null> = ref(null)
const livenessScore: Ref<number | null> = ref(null)
const isDetecting: Ref<boolean> = ref(false)
const isComponentReady: Ref<boolean> = ref(false)  // 组件是否就绪（Human.js 加载完成）

function handleComponentReady(): void {
  isComponentReady.value = true
  console.log('FaceDetector 组件已就绪')
}

function handleStatusPrompt(): void {
  // message will be handled by the UI
}

function handleLivenessDetected(data: LivenessDetectedData): void {
  livenessInfo.value = data
}

function handleLivenessCompleted(data: LivenessCompletedData): void {
  console.log('[SilentLiveness] Detection completed, imageData length:', data.imageData?.length || 0)
  if (data.imageData) {
    verifiedImage.value = data.imageData
    livenessScore.value = data.liveness || 0
    console.log('[SilentLiveness] Image set, verifiedImage:', verifiedImage.value ? 'has data' : 'null')
  } else {
    console.error('[SilentLiveness] No image data received')
  }
  isDetecting.value = false
  console.log('Liveness detection completed successfully!')
}

function handleError(error: { code: ErrorCode, message: string }): void {
  errorCode.value = error.code
  errorMessage.value = error.message
  isDetecting.value = false
}

async function startDetection(): Promise<void> {
  isDetecting.value = true
  errorCode.value = null
  errorMessage.value = null
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

function resetDetection(): void {
  verifiedImage.value = null
  errorMessage.value = null
  livenessScore.value = null
  isDetecting.value = false
  errorCode.value = null
}

function handleImageError(error: Event): void {
  console.error('[SilentLiveness] Image loading error:', error)
  errorMessage.value = '图片加载失败'
}
</script>

<style scoped>
.silent-liveness {
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

.info-panel p {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.error-panel {
  margin-top: 20px;
  padding: 15px;
  background-color: #f8d7da;
  border-radius: 8px;
  color: #721c24;
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

.score-info {
  margin: 10px 0;
  font-size: 14px;
  color: #155724;
  font-weight: 500;
}

.score-value {
  font-size: 18px;
  font-weight: 700;
  color: #0d5c0d;
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

@media (max-width: 768px) {
  .silent-liveness {
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
