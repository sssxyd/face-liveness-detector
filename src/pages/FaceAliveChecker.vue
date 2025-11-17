<template>
  <div class="face-alive-checker">
    <div class="header">
      <h1>人脸活体验证</h1>
      <p>请完成以下动作验证您是真人</p>
    </div>

    <FaceDetector
      ref="faceDetectorRef"
      mode="liveness"
      :liveness-checks="livenessChecks"
      @face-detected="handleFaceDetected"
      @liveness-action="handleLivenessAction"
      @liveness-completed="handleLivenessCompleted"
      @error="handleError"
    />

    <div class="info-panel">
      <h3>检测信息</h3>
      <p v-if="faceInfo">
        人脸大小: {{ faceInfo.size }}% | 正面置信度: {{ faceInfo.frontal }}%
      </p>
      <p v-else>等待人脸检测中...</p>
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
      <img :src="verifiedImage" alt="Verified Face" />
      <button @click="resetVerification">重新验证</button>
    </div>

    <div v-if="errorMessage" class="error-panel">
      <p>{{ errorMessage }}</p>
      <button @click="resetVerification">重试</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import FaceDetector from '../components/FaceDetector.vue'

// Configurable liveness checks
const livenessChecks = ref(['blink', 'shake'])

const faceDetectorRef = ref(null)
const faceInfo = ref(null)
const verifiedImage = ref(null)
const errorMessage = ref(null)
const completedActions = ref([])
const currentAction = ref(null)

function getActionLabel(action) {
  const labels = {
    blink: '眨眼',
    shake: '摇头'
  }
  return labels[action] || action
}

function handleFaceDetected(data) {
  faceInfo.value = data.faceInfo
}

function handleLivenessAction(data) {
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

function handleLivenessCompleted(data) {
  verifiedImage.value = data.imageData
  console.log('Liveness verification completed!', data.faceBox)
}

function handleError(error) {
  errorMessage.value = error.message
}

function resetVerification() {
  verifiedImage.value = null
  faceInfo.value = null
  errorMessage.value = null
  completedActions.value = []
  currentAction.value = null
  faceDetectorRef.value?.startDetection()
}

// Start detection on mount
import { onMounted } from 'vue'
onMounted(() => {
  if (livenessChecks.value.length > 0) {
    currentAction.value = livenessChecks.value[0]
  }
  faceDetectorRef.value?.startDetection()
})
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

.info-panel {
  margin-top: 20px;
  padding: 15px;
  background-color: #f0f0f0;
  border-radius: 8px;
  text-align: center;
}

.info-panel h3 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #333;
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

.result-panel img {
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
  margin-bottom: 15px;
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
