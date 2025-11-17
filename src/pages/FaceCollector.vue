<template>
  <div class="face-collector">
    <div class="header">
      <h1>人脸采集</h1>
      <p>请正对摄像头，采集您的正脸照片</p>
    </div>

    <FaceDetector
      ref="faceDetectorRef"
      mode="collection"
      @face-detected="handleFaceDetected"
      @face-collected="handleFaceCollected"
      @error="handleError"
    />

    <div class="info-panel">
      <h3>采集信息</h3>
      <p v-if="faceInfo">
        人脸大小: {{ faceInfo.size }}% | 正面置信度: {{ faceInfo.frontal }}%
      </p>
      <p v-else>等待人脸检测中...</p>
    </div>

    <div v-if="collectedImage" class="result-panel">
      <h3>采集成功</h3>
      <img :src="collectedImage" alt="Collected Face" />
      <button @click="resetCollection">重新采集</button>
    </div>

    <div v-if="errorMessage" class="error-panel">
      <p>{{ errorMessage }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import FaceDetector from '../components/FaceDetector.vue'

const faceDetectorRef = ref(null)
const faceInfo = ref(null)
const collectedImage = ref(null)
const errorMessage = ref(null)

function handleFaceDetected(data) {
  faceInfo.value = data.faceInfo
}

function handleFaceCollected(data) {
  collectedImage.value = data.imageData
  console.log('Face collected successfully!', data.faceBox)
}

function handleError(error) {
  errorMessage.value = error.message
}

function resetCollection() {
  collectedImage.value = null
  faceInfo.value = null
  errorMessage.value = null
  faceDetectorRef.value?.startDetection()
}

// Start detection on mount
import { onMounted } from 'vue'
onMounted(() => {
  faceDetectorRef.value?.startDetection()
})
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
  
  .result-panel img {
    max-height: 300px;
  }
}
</style>
