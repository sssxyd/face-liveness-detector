<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as Human from '@vladmandic/human'

// Component state
const videoRef = ref(null)
const canvasRef = ref(null)
const statusMessage = ref('初始化中...')
const detectionStatus = ref('idle') // idle, detecting, success, liveness
const livenessPrompt = ref('')
const livenessStatus = ref('')

// Human.js instance
let human = null
let stream = null
let animationFrameId = null

// Detection settings
const config = {
  modelBasePath: '/node_modules/@vladmandic/human/models',
  backend: 'webgl',
  face: {
    enabled: true,
    detector: {
      rotation: false,
      maxDetected: 10,
      return: true,
    },
    mesh: {
      enabled: true,
    },
    iris: {
      enabled: true,
    },
    description: {
      enabled: false,
    },
    emotion: {
      enabled: false,
    },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: {
    enabled: true,
  },
}

// Liveness gestures
const gestures = [
  { name: '张嘴', check: 'mouth' },
  { name: '眨眼', check: 'blink' },
  { name: '摇头', check: 'shake' },
]

let currentGesture = null
let gestureStartTime = 0
let previousYaw = 0
let blinkCount = 0
let mouthOpenCount = 0
const GESTURE_TIMEOUT = 10000 // 10 seconds to complete gesture

// Initialize Human.js
const initHuman = async () => {
  try {
    human = new Human.Human(config)
    await human.load()
    statusMessage.value = '正在启动摄像头...'
  } catch (error) {
    statusMessage.value = '初始化失败: ' + error.message
  }
}

// Start camera
const startCamera = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
    })
    
    if (videoRef.value) {
      videoRef.value.srcObject = stream
      await videoRef.value.play()
      statusMessage.value = '请将脸部对准摄像头'
      detectionStatus.value = 'detecting'
      startDetection()
    }
  } catch (error) {
    statusMessage.value = '无法访问摄像头: ' + error.message
  }
}

// Check if face is complete and well-positioned
const validateFace = (face, videoWidth, videoHeight) => {
  if (!face || !face.mesh || face.mesh.length === 0) {
    return { valid: false, message: '未检测到人脸' }
  }

  // Get face bounding box
  const box = face.box
  const boxWidth = box[2]
  const boxHeight = box[3]
  const boxX = box[0]
  const boxY = box[1]

  // Check if face is too small (too far)
  const faceAreaRatio = (boxWidth * boxHeight) / (videoWidth * videoHeight)
  if (faceAreaRatio < 0.1) {
    return { valid: false, message: '请靠近摄像头' }
  }

  // Check if face is too large (too close)
  if (faceAreaRatio > 0.8) {
    return { valid: false, message: '请远离摄像头' }
  }

  // Check if face is centered
  const centerX = boxX + boxWidth / 2
  const centerY = boxY + boxHeight / 2
  const videoCenterX = videoWidth / 2
  const videoCenterY = videoHeight / 2

  const offsetX = Math.abs(centerX - videoCenterX) / videoWidth
  const offsetY = Math.abs(centerY - videoCenterY) / videoHeight

  if (offsetX > 0.25 || offsetY > 0.25) {
    return { valid: false, message: '请将脸部移至画面中央' }
  }

  // Check if face is complete (not cut off at edges)
  if (boxX < 10 || boxY < 10 || 
      boxX + boxWidth > videoWidth - 10 || 
      boxY + boxHeight > videoHeight - 10) {
    return { valid: false, message: '请保持完整的脸部在画面内' }
  }

  // Check face angle (frontal face check)
  if (face.rotation && face.rotation.angle) {
    const yaw = Math.abs(face.rotation.angle.yaw || 0)
    const pitch = Math.abs(face.rotation.angle.pitch || 0)
    const roll = Math.abs(face.rotation.angle.roll || 0)

    if (yaw > 20 || pitch > 20 || roll > 20) {
      return { valid: false, message: '请正对摄像头' }
    }
  }

  // Check face score/confidence
  if (face.score && face.score < 0.5) {
    return { valid: false, message: '人脸检测不清晰，请调整光线或位置' }
  }

  return { valid: true, message: '人脸检测成功！' }
}

// Check for specific gesture
const checkGesture = (face, gestureName) => {
  if (!face) return false

  switch (gestureName) {
    case 'mouth':
      // Check if mouth is open based on mesh points
      if (face.mesh && face.mesh.length > 0) {
        // Points around mouth (simplified check)
        const upperLip = face.mesh[13] // Upper lip center
        const lowerLip = face.mesh[14] // Lower lip center
        if (upperLip && lowerLip) {
          const mouthHeight = Math.abs(upperLip[1] - lowerLip[1])
          if (mouthHeight > 15) {
            mouthOpenCount++
            if (mouthOpenCount > 3) return true
          } else {
            mouthOpenCount = 0
          }
        }
      }
      break

    case 'blink':
      // Check for blink gesture
      if (face.annotations && face.annotations.leftEyeIris && face.annotations.rightEyeIris) {
        // Check eye aspect ratio or use gesture detection
        // Simplified: detect if eyes are closed briefly
        const leftEyeOpen = face.annotations.leftEyeIris.length > 0
        const rightEyeOpen = face.annotations.rightEyeIris.length > 0
        
        if (!leftEyeOpen && !rightEyeOpen) {
          blinkCount++
          if (blinkCount > 2 && blinkCount < 10) return true
        } else {
          if (blinkCount > 10) blinkCount = 0
        }
      }
      break

    case 'shake':
      // Check for head shake (yaw rotation)
      if (face.rotation && face.rotation.angle && face.rotation.angle.yaw !== undefined) {
        const currentYaw = face.rotation.angle.yaw
        const yawDiff = Math.abs(currentYaw - previousYaw)
        
        if (yawDiff > 15) {
          previousYaw = currentYaw
          return true
        }
        previousYaw = currentYaw
      }
      break
  }

  return false
}

// Start liveness detection
const startLivenessDetection = () => {
  detectionStatus.value = 'liveness'
  // Randomly select a gesture
  const randomIndex = Math.floor(Math.random() * gestures.length)
  currentGesture = gestures[randomIndex]
  livenessPrompt.value = `请 ${currentGesture.name}`
  livenessStatus.value = '等待动作...'
  gestureStartTime = Date.now()
  
  // Reset gesture counters
  blinkCount = 0
  mouthOpenCount = 0
  previousYaw = 0
}

// Draw face detection results
const drawResults = (canvas, result, validation) => {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (result.face && result.face.length > 0) {
    result.face.forEach((face) => {
      const box = face.box
      
      // Draw bounding box
      ctx.strokeStyle = validation.valid ? '#00ff00' : '#ff0000'
      ctx.lineWidth = 3
      ctx.strokeRect(box[0], box[1], box[2], box[3])

      // Draw face mesh points
      if (face.mesh && face.mesh.length > 0) {
        ctx.fillStyle = validation.valid ? '#00ff00' : '#ff0000'
        face.mesh.forEach((point) => {
          ctx.beginPath()
          ctx.arc(point[0], point[1], 1, 0, 2 * Math.PI)
          ctx.fill()
        })
      }
    })
  }
}

// Main detection loop
const startDetection = async () => {
  const detect = async () => {
    if (!videoRef.value || !human || detectionStatus.value === 'idle') {
      return
    }

    const result = await human.detect(videoRef.value)
    
    // Check number of faces
    const faceCount = result.face ? result.face.length : 0
    
    if (faceCount === 0) {
      statusMessage.value = '未检测到人脸'
      if (detectionStatus.value === 'liveness') {
        livenessStatus.value = '失败：人脸消失'
        setTimeout(() => {
          detectionStatus.value = 'detecting'
          livenessPrompt.value = ''
          livenessStatus.value = ''
          statusMessage.value = '请将脸部对准摄像头'
        }, 2000)
      }
    } else if (faceCount > 1) {
      statusMessage.value = '检测到多张人脸，请确保只有一人'
      if (detectionStatus.value === 'liveness') {
        livenessStatus.value = '失败：检测到多张人脸'
        setTimeout(() => {
          detectionStatus.value = 'detecting'
          livenessPrompt.value = ''
          livenessStatus.value = ''
          statusMessage.value = '请将脸部对准摄像头'
        }, 2000)
      }
    } else {
      // Single face detected
      const face = result.face[0]
      const video = videoRef.value
      const validation = validateFace(face, video.videoWidth, video.videoHeight)

      // Draw results on canvas
      if (canvasRef.value) {
        canvasRef.value.width = video.videoWidth
        canvasRef.value.height = video.videoHeight
        drawResults(canvasRef.value, result, validation)
      }

      if (detectionStatus.value === 'detecting') {
        statusMessage.value = validation.message
        
        if (validation.valid) {
          // Face detection successful, start liveness detection
          detectionStatus.value = 'success'
          statusMessage.value = '人脸检测成功！即将开始活体检测...'
          setTimeout(() => {
            startLivenessDetection()
          }, 1500)
        }
      } else if (detectionStatus.value === 'liveness') {
        if (!validation.valid) {
          // Face moved out of valid position during liveness
          livenessStatus.value = '失败：' + validation.message
          setTimeout(() => {
            detectionStatus.value = 'detecting'
            livenessPrompt.value = ''
            livenessStatus.value = ''
            statusMessage.value = '请将脸部对准摄像头'
          }, 2000)
        } else {
          // Check gesture
          const gestureDetected = checkGesture(face, currentGesture.check)
          
          if (gestureDetected) {
            livenessStatus.value = '检测成功！'
            statusMessage.value = '活体检测完成！'
            detectionStatus.value = 'success'
            // Stop detection after success
            setTimeout(() => {
              stopDetection()
            }, 2000)
          } else {
            // Check timeout
            const elapsed = Date.now() - gestureStartTime
            if (elapsed > GESTURE_TIMEOUT) {
              livenessStatus.value = '超时，请重试'
              setTimeout(() => {
                detectionStatus.value = 'detecting'
                livenessPrompt.value = ''
                livenessStatus.value = ''
                statusMessage.value = '请将脸部对准摄像头'
              }, 2000)
            } else {
              livenessStatus.value = `等待动作... (${Math.ceil((GESTURE_TIMEOUT - elapsed) / 1000)}秒)`
            }
          }
        }
      }
    }

    animationFrameId = requestAnimationFrame(detect)
  }

  detect()
}

// Stop detection
const stopDetection = () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  detectionStatus.value = 'idle'
}

// Cleanup
const cleanup = () => {
  stopDetection()
  
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    stream = null
  }
}

// Lifecycle hooks
onMounted(async () => {
  await initHuman()
  await startCamera()
})

onUnmounted(() => {
  cleanup()
})

// Reset detection
const reset = () => {
  cleanup()
  statusMessage.value = '初始化中...'
  detectionStatus.value = 'idle'
  livenessPrompt.value = ''
  livenessStatus.value = ''
  setTimeout(async () => {
    await initHuman()
    await startCamera()
  }, 500)
}
</script>

<template>
  <div class="face-detector">
    <h2>人脸检测与活体识别</h2>
    
    <div class="video-container">
      <video ref="videoRef" autoplay playsinline muted></video>
      <canvas ref="canvasRef" class="overlay-canvas"></canvas>
      
      <div class="status-overlay">
        <div class="status-message" :class="{ 
          'success': detectionStatus === 'success',
          'error': statusMessage.includes('失败') || statusMessage.includes('错误')
        }">
          {{ statusMessage }}
        </div>
        
        <div v-if="livenessPrompt" class="liveness-prompt">
          <h3>{{ livenessPrompt }}</h3>
          <p>{{ livenessStatus }}</p>
        </div>
      </div>
    </div>

    <div class="controls">
      <button @click="reset" class="reset-btn">重新开始</button>
    </div>

    <div class="instructions">
      <h3>使用说明：</h3>
      <ol>
        <li>将您的脸部对准摄像头</li>
        <li>确保脸部完整且位于画面中央</li>
        <li>保持适当的距离（不要太近或太远）</li>
        <li>正对摄像头，不要侧脸</li>
        <li>人脸检测成功后，按照提示完成活体检测动作</li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.face-detector {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

h2 {
  text-align: center;
  color: #2c3e50;
  margin-bottom: 20px;
}

.video-container {
  position: relative;
  width: 100%;
  max-width: 640px;
  margin: 0 auto 20px;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

video {
  width: 100%;
  height: auto;
  display: block;
}

.overlay-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.status-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
  padding: 20px;
  color: white;
}

.status-message {
  font-size: 18px;
  font-weight: bold;
  text-align: center;
  padding: 10px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 5px;
  margin-bottom: 10px;
}

.status-message.success {
  background: rgba(0, 255, 0, 0.3);
  color: #00ff00;
}

.status-message.error {
  background: rgba(255, 0, 0, 0.3);
  color: #ff6b6b;
}

.liveness-prompt {
  text-align: center;
  background: rgba(33, 150, 243, 0.8);
  padding: 15px;
  border-radius: 8px;
}

.liveness-prompt h3 {
  margin: 0 0 10px 0;
  font-size: 24px;
  color: white;
}

.liveness-prompt p {
  margin: 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
}

.controls {
  text-align: center;
  margin: 20px 0;
}

.reset-btn {
  background: #2196F3;
  color: white;
  border: none;
  padding: 12px 30px;
  font-size: 16px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.3s;
}

.reset-btn:hover {
  background: #1976D2;
}

.reset-btn:active {
  transform: scale(0.98);
}

.instructions {
  background: #f5f5f5;
  padding: 20px;
  border-radius: 8px;
  margin-top: 20px;
}

.instructions h3 {
  margin-top: 0;
  color: #2c3e50;
}

.instructions ol {
  padding-left: 20px;
  line-height: 1.8;
}

.instructions li {
  margin-bottom: 8px;
  color: #555;
}
</style>
