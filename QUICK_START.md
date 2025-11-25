# Quick Start Guide

## Installation

```bash
npm install @face-liveness/detection-engine @vladmandic/human @techstark/opencv-js
```

## Basic Usage (Copy & Paste)

### HTML Setup
```html
<!DOCTYPE html>
<html>
<head>
    <title>Face Liveness Detection</title>
    <style>
        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding: 20px; }
        video { width: 400px; border: 2px solid #ddd; border-radius: 8px; }
        #status { margin-top: 20px; font-size: 18px; }
        button { padding: 10px 20px; margin: 10px 5px; font-size: 16px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>Face Liveness Detection</h1>
    <video id="video" width="400" height="400" playsinline></video>
    <canvas id="canvas" style="display: none;"></canvas>
    <div id="status">Initializing...</div>
    <button id="startBtn">Start Detection</button>
    <button id="stopBtn">Stop Detection</button>
    <img id="result" style="display: none; max-width: 400px; margin-top: 20px;">
    
    <script type="module">
        // Import (will be bundled by your build tool)
        // For development, use: import('./path/to/index.esm.js')
        
        // Dynamic import for demo
        const module = await import('@face-liveness/detection-engine/dist/index.esm.js')
        const { default: FaceDetectionEngine, LivenessAction } = module
        
        // Create engine
        const engine = new FaceDetectionEngine({
            liveness_action_list: [LivenessAction.BLINK],
            liveness_action_count: 1
        })
        
        // Get DOM elements
        const statusDiv = document.getElementById('status')
        const startBtn = document.getElementById('startBtn')
        const stopBtn = document.getElementById('stopBtn')
        const videoEl = document.getElementById('video')
        const canvasEl = document.getElementById('canvas')
        const resultImg = document.getElementById('result')
        
        // Event handlers
        engine.on('detector-loaded', () => {
            statusDiv.textContent = '✅ Ready! Click "Start Detection"'
            startBtn.disabled = false
        })
        
        engine.on('status-prompt', (data) => {
            statusDiv.textContent = `📍 ${data.message}`
        })
        
        engine.on('liveness-detected', (data) => {
            statusDiv.textContent = `✓ Frame captured (Quality: ${(data.quality * 100).toFixed(0)}%)`
        })
        
        engine.on('action-prompt', (data) => {
            statusDiv.textContent = `👉 Please ${data.action}`
        })
        
        engine.on('liveness-completed', (data) => {
            statusDiv.textContent = '🎉 Verification Complete!'
            startBtn.disabled = false
            resultImg.src = data.imageData
            resultImg.style.display = 'block'
        })
        
        engine.on('detector-error', (error) => {
            statusDiv.textContent = `❌ Error: ${error.message}`
            statusDiv.style.color = 'red'
        })
        
        // Button handlers
        startBtn.onclick = async () => {
            try {
                startBtn.disabled = true
                await engine.startDetection(videoEl, canvasEl)
            } catch (err) {
                statusDiv.textContent = `Error: ${err.message}`
                startBtn.disabled = false
            }
        }
        
        stopBtn.onclick = () => {
            engine.stopDetection()
            statusDiv.textContent = 'Detection stopped'
            startBtn.disabled = false
        }
        
        // Initialize
        statusDiv.textContent = '⏳ Initializing engine...'
        startBtn.disabled = true
        await engine.initialize()
    </script>
</body>
</html>
```

## React Setup

### 1. Create Hook
```typescript
// hooks/useFaceDetection.ts
import { useEffect, useRef, useState } from 'react'
import FaceDetectionEngine from '@face-liveness/detection-engine'

export function useFaceDetection(config?: any) {
  const engineRef = useRef<FaceDetectionEngine | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [status, setStatus] = useState('Initializing...')

  useEffect(() => {
    const engine = new FaceDetectionEngine(config)
    engineRef.current = engine

    engine.on('detector-loaded', () => {
      setIsReady(true)
      setStatus('Ready')
    })

    engine.on('status-prompt', (data) => {
      setStatus(data.message)
    })

    engine.on('detector-error', (error) => {
      setStatus(`Error: ${error.message}`)
    })

    engine.initialize()

    return () => {
      engine.stopDetection()
    }
  }, [config])

  return { engine: engineRef.current, isReady, status }
}
```

### 2. Use in Component
```typescript
// components/FaceDetection.tsx
import { useRef } from 'react'
import { useFaceDetection } from '../hooks/useFaceDetection'
import { LivenessAction } from '@face-liveness/detection-engine'

export function FaceDetection() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { engine, isReady } = useFaceDetection({
    liveness_action_list: [LivenessAction.BLINK],
    liveness_action_count: 1
  })

  const handleStart = async () => {
    if (videoRef.current && engine) {
      await engine.startDetection(videoRef.current)
    }
  }

  return (
    <div>
      <h1>Face Liveness Detection</h1>
      <video ref={videoRef} width={400} height={400} />
      <button onClick={handleStart} disabled={!isReady}>
        Start Detection
      </button>
    </div>
  )
}
```

## Vue 3 Setup

### Component
```vue
<template>
  <div>
    <h1>Face Liveness Detection</h1>
    <video ref="videoElement" width="400" height="400" playsinline />
    <p>{{ status }}</p>
    <button @click="startDetection" :disabled="!isReady">
      Start Detection
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import FaceDetectionEngine, { LivenessAction } from '@face-liveness/detection-engine'

const videoElement = ref<HTMLVideoElement | null>(null)
const engine = ref<FaceDetectionEngine | null>(null)
const isReady = ref(false)
const status = ref('Initializing...')

onMounted(async () => {
  engine.value = new FaceDetectionEngine({
    liveness_action_list: [LivenessAction.BLINK],
    liveness_action_count: 1
  })

  engine.value.on('detector-loaded', () => {
    isReady.value = true
    status.value = 'Ready'
  })

  engine.value.on('status-prompt', (data) => {
    status.value = data.message
  })

  await engine.value.initialize()
})

const startDetection = async () => {
  if (videoElement.value && engine.value) {
    await engine.value.startDetection(videoElement.value)
  }
}

onUnmounted(() => {
  engine.value?.stopDetection()
})
</script>
```

## Configuration Presets

### 1. Basic (Default)
```typescript
const engine = new FaceDetectionEngine()
```

### 2. Strict (High Security)
```typescript
const engine = new FaceDetectionEngine({
  min_face_ratio: 0.6,
  max_face_ratio: 0.85,
  min_face_frontal: 0.95,
  min_real_score: 0.95,
  liveness_action_count: 3
})
```

### 3. Lenient (High Usability)
```typescript
const engine = new FaceDetectionEngine({
  min_face_ratio: 0.4,
  max_face_ratio: 0.95,
  min_face_frontal: 0.7,
  min_real_score: 0.7,
  liveness_action_count: 1
})
```

## Event Monitoring

### Listen to All Events
```typescript
const engine = new FaceDetectionEngine()

engine.on('detector-loaded', () => console.log('Ready'))
engine.on('status-prompt', (data) => console.log('Status:', data))
engine.on('liveness-detected', (data) => console.log('Frame:', data))
engine.on('action-prompt', (data) => console.log('Action:', data))
engine.on('liveness-completed', (data) => console.log('Result:', data))
engine.on('detector-error', (error) => console.error('Error:', error))
engine.on('detector-debug', (debug) => console.log(`[${debug.stage}]`, debug.message))
```

## Handling Results

### Get Captured Image
```typescript
engine.on('liveness-completed', (data) => {
  // data.imageData is base64 encoded
  const img = new Image()
  img.src = data.imageData
  document.body.appendChild(img)
})
```

### Send to Server
```typescript
engine.on('liveness-completed', async (data) => {
  const response = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: data.imageData,
      quality: data.qualityScore,
      liveness: data.liveness
    })
  })
  const result = await response.json()
  console.log('Server result:', result)
})
```

## Troubleshooting

### Issue: "Camera access denied"
**Solution:**
1. Make sure you're using HTTPS (or localhost)
2. Check browser camera permissions
3. Verify device has a working camera

```typescript
try {
  await engine.startDetection(video)
} catch (error) {
  if (error.message.includes('camera')) {
    alert('Please allow camera access')
  }
}
```

### Issue: "Video loading timeout"
**Solution:** Increase timeout
```typescript
const engine = new FaceDetectionEngine({
  video_load_timeout: 10000  // 10 seconds instead of 5
})
```

### Issue: Poor detection accuracy
**Solution:** 
- Improve lighting
- Keep face centered in frame
- Ensure face is 50-90% of video area
- Face should be frontal (not tilted)

```typescript
// Adjust thresholds if needed
engine.updateConfig({
  min_face_ratio: 0.4,  // More lenient size
  min_face_frontal: 0.7  // More lenient angle
})
```

## Performance Tips

### Reduce CPU Usage
```typescript
const engine = new FaceDetectionEngine({
  detection_frame_delay: 200,  // Process fewer frames
  camera_max_size: 480         // Smaller resolution
})
```

### Optimize for Mobile
```typescript
const engine = new FaceDetectionEngine({
  camera_max_size: 480,
  detection_frame_delay: 100,
  min_image_quality: 0.6,  // More lenient quality
  min_real_score: 0.7
})
```

## Full Example with Error Handling

```typescript
import FaceDetectionEngine, { LivenessAction, ErrorCode } from '@face-liveness/detection-engine'

async function initializeFaceDetection() {
  try {
    // Create engine
    const engine = new FaceDetectionEngine({
      liveness_action_list: [LivenessAction.BLINK],
      liveness_action_count: 1,
      min_face_ratio: 0.5,
      max_face_ratio: 0.9
    })

    // Handle events
    engine.on('detector-loaded', () => {
      console.log('✅ Engine ready')
    })

    engine.on('status-prompt', (data) => {
      console.log(`📍 ${data.message}`)
    })

    engine.on('liveness-completed', (data) => {
      console.log('🎉 Detection complete!')
      console.log('Quality:', data.qualityScore)
      console.log('Image:', data.imageData?.substring(0, 50) + '...')
      
      // Send result to server
      sendToServer(data)
    })

    engine.on('detector-error', (error) => {
      console.error(`❌ [${error.code}] ${error.message}`)
      handleError(error)
    })

    // Initialize
    console.log('⏳ Initializing...')
    await engine.initialize()

    // Get video element
    const video = document.getElementById('video') as HTMLVideoElement
    const canvas = document.getElementById('canvas') as HTMLCanvasElement

    // Start detection
    console.log('📹 Starting detection...')
    await engine.startDetection(video, canvas)

    return engine
  } catch (error) {
    console.error('Failed to initialize:', error)
    throw error
  }
}

async function sendToServer(data: any) {
  try {
    const response = await fetch('/api/verify-face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    const result = await response.json()
    console.log('Server verified:', result)
  } catch (error) {
    console.error('Failed to send to server:', error)
  }
}

function handleError(error: any) {
  const messages: Record<string, string> = {
    [ErrorCode.CAMERA_ACCESS_DENIED]: 'Camera access was denied',
    [ErrorCode.ENGINE_NOT_INITIALIZED]: 'Engine failed to initialize',
    [ErrorCode.STREAM_ACQUISITION_FAILED]: 'Failed to access camera',
    [ErrorCode.DETECTION_ERROR]: 'Detection encountered an error'
  }
  
  alert(messages[error.code] || error.message)
}

// Start when page loads
window.addEventListener('DOMContentLoaded', () => {
  initializeFaceDetection().catch(console.error)
})
```

## Next Steps

1. ✅ Copy a template above for your framework
2. ✅ Replace video/canvas element IDs with yours
3. ✅ Adjust configuration for your use case
4. ✅ Test with real camera
5. ✅ Handle results and errors
6. ✅ Deploy to production

## Resources

- **README.md** - Full documentation
- **INTEGRATION.md** - Framework examples
- **PACKAGE_GUIDE.md** - Internal package structure
- **GitHub Issues** - Report problems
- **GitHub Discussions** - Ask questions

---

Happy detecting! 🎉
