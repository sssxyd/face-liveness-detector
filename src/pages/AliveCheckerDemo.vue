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
        class="btn-primary"
      >
        开始验证
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
      @face-detected="handleFaceDetected"
      @liveness-action="handleLivenessAction"
      @liveness-completed="handleLivenessCompleted"
      @error="handleError"
    />

    <div class="info-panel">
      <h3>检测信息</h3>
      <div v-if="faceInfo" class="face-info-detail">
        <div class="info-row">
          <span class="label">人脸数量:</span>
          <span class="value" :class="faceInfo.count === 1 ? 'success' : 'warning'">
            {{ faceInfo.count }}
          </span>
        </div>
        <div class="info-row">
          <span class="label">人脸画面占比:</span>
          <span class="value">{{ faceInfo.size }}%</span>
          <span class="progress-bar">
            <span class="progress-fill" :style="{ width: Math.min(faceInfo.size, 100) + '%' }"></span>
          </span>
        </div>
        <div class="info-row">
          <span class="label">正脸置信度:</span>
          <span class="value" :class="faceInfo.frontal >= minFrontal ? 'success' : 'warning'">
            {{ faceInfo.frontal }}%
          </span>
          <span class="progress-bar">
            <span class="progress-fill" :style="{ width: faceInfo.frontal + '%' }"></span>
          </span>
        </div>
        <div v-if="isDetecting && faceInfo.frontal < minFrontal" class="hint-text">
          💡 请将脸正对摄像头
        </div>
        <div v-if="isDetecting && faceInfo.size < minFaceRatio" class="hint-text">
          💡 请靠近摄像头（目标：{{ minFaceRatio }}%-{{ maxFaceRatio }}%）
        </div>
        <div v-if="isDetecting && faceInfo.size > maxFaceRatio" class="hint-text">
          💡 请远离摄像头（目标：{{ minFaceRatio }}%-{{ maxFaceRatio }}%）
        </div>
        <div v-if="isDetecting && faceInfo.size >= minFaceRatio && faceInfo.size <= maxFaceRatio && faceInfo.frontal >= minFrontal" class="hint-text success-hint">
          ✓ 完美！准备验证中...
        </div>
      </div>
      <p v-else>等待开始验证...</p>
    </div>

    <div class="actions-panel">
      <h3>需要完成的动作</h3>
      <div class="action-list">
        <div
          v-for="action in livenessChecks"
          :key="action"
          class="action-item"
          :class="{ completed: completedActions.includes(action) }"
        >
          <span class="action-name">{{ getActionLabel(action) }}</span>
          <span v-if="completedActions.includes(action)" class="status-completed">✓ 已完成</span>
          <span v-else class="status-pending">待完成</span>
        </div>
      </div>
    </div>

    <div class="current-action-panel" v-if="currentAction">
      <h4>请{{ getActionLabel(currentAction) }}</h4>
      <p>正在检测中...</p>
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
import FaceDetector from '../components/FaceDetector.vue'
import { LivenessAction, type FaceInfo } from '../types/face-detector'

// Configurable liveness checks
const livenessChecks: Ref<string[]> = ref([LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD])

const faceDetectorRef: Ref<any> = ref(null)
const faceInfo: Ref<FaceInfo | null> = ref(null)
const verifiedImage: Ref<string | null> = ref(null)
const errorMessage: Ref<string | null> = ref(null)
const completedActions: Ref<string[]> = ref([])
const currentAction: Ref<string | null> = ref(null)
const isDetecting: Ref<boolean> = ref(false)
const minFaceRatio: Ref<number> = ref(50)
const maxFaceRatio: Ref<number> = ref(80)
const minFrontal: Ref<number> = ref(90)
const livenessActionCount: Ref<number> = ref(1)      // 活体检测动作次数
const livenessActionTimeout: Ref<number> = ref(60)   // 活体检测动作时间限制（秒）

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    [LivenessAction.BLINK]: '眨眼',
    [LivenessAction.MOUTH_OPEN]: '张嘴',
    [LivenessAction.NOD]: '点头'
  }
  return labels[action] || action
}

function handleFaceDetected(data: { faceInfo: FaceInfo }): void {
  faceInfo.value = data.faceInfo
}

function handleLivenessAction(data: { action: string; status: string }): void {
  if (data.status === 'completed') {
    if (!completedActions.value.includes(data.action)) {
      completedActions.value.push(data.action)
    }
    // Move to next action
    const nextIndex = livenessChecks.value.findIndex(
      (a) => !completedActions.value.includes(a)
    )
    currentAction.value = nextIndex >= 0 ? livenessChecks.value[nextIndex] : null
  }
}

function handleLivenessCompleted(data: { faceImageData: string | null}): void {
  verifiedImage.value = data.faceImageData
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
  faceInfo.value = null
  errorMessage.value = null
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
