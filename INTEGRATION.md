# Integration Guide

This guide shows how to integrate the Face Detection Engine into your application using different frameworks or vanilla JavaScript.

## Table of Contents

- [Vanilla JavaScript](#vanilla-javascript)
- [React](#react)
- [Vue 3](#vue-3)
- [Angular](#angular)
- [Svelte](#svelte)

## Vanilla JavaScript

### Basic Setup

```html
<!DOCTYPE html>
<html>
<head>
    <title>Face Liveness Detection</title>
</head>
<body>
    <video id="video" width="640" height="640" playsinline></video>
    <canvas id="canvas"></canvas>
    <div id="status">Initializing...</div>
    
    <script type="module">
        import FaceDetectionEngine, { LivenessAction, PromptCode } from '@face-liveness/detection-engine'
        
        const engine = new FaceDetectionEngine({
            liveness_action_list: [LivenessAction.BLINK],
            liveness_action_count: 1
        })
        
        // UI Updates
        const statusDiv = document.getElementById('status')
        
        engine.on('detector-loaded', () => {
            statusDiv.textContent = 'Ready. Please allow camera access.'
            startDetection()
        })
        
        engine.on('status-prompt', (data) => {
            statusDiv.textContent = data.message
        })
        
        engine.on('liveness-completed', (data) => {
            statusDiv.textContent = 'Verification complete!'
            console.log('Result:', data)
            
            // Display result image
            const img = new Image()
            img.src = data.imageData
            document.body.appendChild(img)
        })
        
        engine.on('detector-error', (error) => {
            statusDiv.textContent = `Error: ${error.message}`
            statusDiv.style.color = 'red'
        })
        
        async function startDetection() {
            const video = document.getElementById('video')
            const canvas = document.getElementById('canvas')
            await engine.startDetection(video, canvas)
        }
        
        // Initialize
        await engine.initialize()
    </script>
</body>
</html>
```

## React

### Functional Component with Hooks

```typescript
import React, { useEffect, useRef, useState } from 'react'
import FaceDetectionEngine, { 
  LivenessAction, 
  LivenessCompletedData, 
  ErrorData 
} from '@face-liveness/detection-engine'

export function FaceDetectionComponent() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<FaceDetectionEngine | null>(null)
  
  const [status, setStatus] = useState('Initializing...')
  const [isReady, setIsReady] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)

  useEffect(() => {
    const engine = new FaceDetectionEngine({
      liveness_action_list: [LivenessAction.BLINK],
      liveness_action_count: 1
    })
    
    engineRef.current = engine

    // Event listeners
    engine.on('detector-loaded', () => {
      setIsReady(true)
      setStatus('Ready. Allow camera access to begin.')
    })

    engine.on('status-prompt', (data) => {
      setStatus(data.message)
    })

    engine.on('liveness-detected', (data) => {
      setStatus(`Quality: ${(data.quality * 100).toFixed(0)}%`)
    })

    engine.on('action-prompt', (data) => {
      setStatus(`Please ${data.action}`)
    })

    engine.on('liveness-completed', (data: LivenessCompletedData) => {
      setStatus('Verification complete!')
      setResultImage(data.imageData)
      handleLivenessComplete(data)
    })

    engine.on('detector-error', (error: ErrorData) => {
      setStatus(`Error: ${error.message}`)
    })

    engine.on('detector-debug', (debug) => {
      if (debug.level === 'error') {
        console.error(`[${debug.stage}]`, debug.message, debug.details)
      }
    })

    // Initialize
    engine.initialize()

    return () => {
      engine.stopDetection()
    }
  }, [])

  const handleStartClick = async () => {
    if (videoRef.current && engineRef.current) {
      try {
        await engineRef.current.startDetection(
          videoRef.current,
          canvasRef.current || undefined
        )
      } catch (error) {
        setStatus(`Failed to start: ${(error as Error).message}`)
      }
    }
  }

  const handleStopClick = () => {
    engineRef.current?.stopDetection()
    setStatus('Detection stopped')
  }

  const handleLivenessComplete = (data: LivenessCompletedData) => {
    // Send to server for final verification
    fetch('/api/verify-face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: data.imageData,
        qualityScore: data.qualityScore,
        liveness: data.liveness
      })
    })
      .then(r => r.json())
      .then(result => {
        console.log('Server verification result:', result)
        setStatus(`Verification result: ${result.success ? 'PASS' : 'FAIL'}`)
      })
      .catch(err => {
        setStatus(`Server error: ${err.message}`)
      })
  }

  return (
    <div className="face-detection-container">
      <h1>Face Liveness Detection</h1>
      
      <div className="video-section">
        <video 
          ref={videoRef} 
          width={640} 
          height={640}
          className="video-element"
        />
        <canvas 
          ref={canvasRef} 
          width={640} 
          height={640}
          style={{ display: 'none' }}
        />
      </div>

      <div className="status-section">
        <p className="status-text">{status}</p>
      </div>

      {resultImage && (
        <div className="result-section">
          <h3>Verification Result:</h3>
          <img src={resultImage} alt="Captured Face" className="result-image" />
        </div>
      )}

      <div className="controls">
        <button 
          onClick={handleStartClick}
          disabled={!isReady}
          className="btn-start"
        >
          Start Detection
        </button>
        <button 
          onClick={handleStopClick}
          className="btn-stop"
        >
          Stop Detection
        </button>
      </div>
    </div>
  )
}

export default FaceDetectionComponent
```

### CSS Styling

```css
.face-detection-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.video-section {
  position: relative;
  width: 100%;
  max-width: 640px;
  margin-bottom: 20px;
}

.video-element {
  width: 100%;
  height: auto;
  border: 3px solid #ddd;
  border-radius: 12px;
  background: #000;
}

.status-section {
  width: 100%;
  max-width: 640px;
  padding: 12px;
  text-align: center;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 20px;
}

.status-text {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.result-section {
  width: 100%;
  max-width: 640px;
  margin-bottom: 20px;
}

.result-image {
  width: 100%;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.controls {
  display: flex;
  gap: 12px;
  width: 100%;
  max-width: 640px;
}

.btn-start,
.btn-stop {
  flex: 1;
  padding: 12px 24px;
  font-size: 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
}

.btn-start {
  background: #42b983;
  color: white;
}

.btn-start:hover:not(:disabled) {
  background: #38a372;
}

.btn-start:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-stop {
  background: #f5222d;
  color: white;
}

.btn-stop:hover {
  background: #c81715;
}
```

## Vue 3

### Composition API Component

```vue
<template>
  <div class="face-detection-container">
    <h1>Face Liveness Detection</h1>
    
    <div class="video-section">
      <video 
        ref="videoElement" 
        width="640" 
        height="640"
        class="video-element"
        playsinline
      />
      <canvas 
        ref="canvasElement" 
        width="640" 
        height="640"
        style="display: none"
      />
    </div>

    <div class="status-section">
      <p class="status-text">{{ status }}</p>
    </div>

    <div v-if="resultImage" class="result-section">
      <h3>Verification Result:</h3>
      <img :src="resultImage" alt="Captured Face" class="result-image" />
    </div>

    <div class="controls">
      <button 
        @click="startDetection"
        :disabled="!isReady"
        class="btn-start"
      >
        Start Detection
      </button>
      <button 
        @click="stopDetection"
        class="btn-stop"
      >
        Stop Detection
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import FaceDetectionEngine, { 
  LivenessAction, 
  LivenessCompletedData, 
  ErrorData 
} from '@face-liveness/detection-engine'

const videoElement = ref<HTMLVideoElement | null>(null)
const canvasElement = ref<HTMLCanvasElement | null>(null)
const engine = ref<FaceDetectionEngine | null>(null)

const status = ref('Initializing...')
const isReady = ref(false)
const resultImage = ref<string | null>(null)

onMounted(async () => {
  engine.value = new FaceDetectionEngine({
    liveness_action_list: [LivenessAction.BLINK],
    liveness_action_count: 1
  })

  // Event listeners
  engine.value.on('detector-loaded', () => {
    isReady.value = true
    status.value = 'Ready. Allow camera access to begin.'
  })

  engine.value.on('status-prompt', (data) => {
    status.value = data.message
  })

  engine.value.on('action-prompt', (data) => {
    status.value = `Please ${data.action}`
  })

  engine.value.on('liveness-completed', (data: LivenessCompletedData) => {
    status.value = 'Verification complete!'
    resultImage.value = data.imageData
  })

  engine.value.on('detector-error', (error: ErrorData) => {
    status.value = `Error: ${error.message}`
  })

  await engine.value.initialize()
})

const startDetection = async () => {
  if (videoElement.value && engine.value) {
    try {
      await engine.value.startDetection(
        videoElement.value,
        canvasElement.value || undefined
      )
    } catch (error) {
      status.value = `Failed to start: ${(error as Error).message}`
    }
  }
}

const stopDetection = () => {
  engine.value?.stopDetection()
  status.value = 'Detection stopped'
}

onUnmounted(() => {
  engine.value?.stopDetection()
})
</script>

<style scoped>
.face-detection-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.video-section {
  position: relative;
  width: 100%;
  max-width: 640px;
  margin-bottom: 20px;
}

.video-element {
  width: 100%;
  height: auto;
  border: 3px solid #ddd;
  border-radius: 12px;
  background: #000;
}

.status-section {
  width: 100%;
  max-width: 640px;
  padding: 12px;
  text-align: center;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 20px;
}

.status-text {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.result-section {
  width: 100%;
  max-width: 640px;
  margin-bottom: 20px;
}

.result-image {
  width: 100%;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.controls {
  display: flex;
  gap: 12px;
  width: 100%;
  max-width: 640px;
}

.btn-start,
.btn-stop {
  flex: 1;
  padding: 12px 24px;
  font-size: 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
}

.btn-start {
  background: #42b983;
  color: white;
}

.btn-start:hover:not(:disabled) {
  background: #38a372;
}

.btn-start:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-stop {
  background: #f5222d;
  color: white;
}

.btn-stop:hover {
  background: #c81715;
}
</style>
```

## Angular

### Service and Component

```typescript
// face-detection.service.ts
import { Injectable } from '@angular/core'
import { Subject } from 'rxjs'
import FaceDetectionEngine, { ErrorData, LivenessCompletedData } from '@face-liveness/detection-engine'

@Injectable({
  providedIn: 'root'
})
export class FaceDetectionService {
  private engine: FaceDetectionEngine | null = null
  
  statusChanged$ = new Subject<string>()
  resultCompleted$ = new Subject<LivenessCompletedData>()
  errorOccurred$ = new Subject<ErrorData>()

  async initialize(config?: any) {
    this.engine = new FaceDetectionEngine(config)

    this.engine.on('detector-loaded', () => {
      this.statusChanged$.next('Engine ready')
    })

    this.engine.on('status-prompt', (data) => {
      this.statusChanged$.next(data.message)
    })

    this.engine.on('liveness-completed', (data) => {
      this.resultCompleted$.next(data)
    })

    this.engine.on('detector-error', (error) => {
      this.errorOccurred$.next(error)
    })

    await this.engine.initialize()
  }

  async startDetection(video: HTMLVideoElement, canvas?: HTMLCanvasElement) {
    if (!this.engine) throw new Error('Engine not initialized')
    await this.engine.startDetection(video, canvas)
  }

  stopDetection() {
    this.engine?.stopDetection()
  }
}
```

```typescript
// face-detection.component.ts
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core'
import { FaceDetectionService } from './face-detection.service'
import { Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'

@Component({
  selector: 'app-face-detection',
  templateUrl: './face-detection.component.html',
  styleUrls: ['./face-detection.component.css']
})
export class FaceDetectionComponent implements OnInit, OnDestroy {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>

  status = 'Initializing...'
  isReady = false
  resultImage: string | null = null
  private destroy$ = new Subject<void>()

  constructor(private faceService: FaceDetectionService) {}

  ngOnInit() {
    this.faceService.statusChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        this.status = message
        if (message === 'Engine ready') {
          this.isReady = true
        }
      })

    this.faceService.resultCompleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.resultImage = data.imageData
      })

    this.faceService.errorOccurred$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        this.status = `Error: ${error.message}`
      })

    this.faceService.initialize({
      liveness_action_count: 1
    })
  }

  startDetection() {
    this.faceService.startDetection(
      this.videoRef.nativeElement,
      this.canvasRef.nativeElement
    )
  }

  stopDetection() {
    this.faceService.stopDetection()
  }

  ngOnDestroy() {
    this.destroy$.next()
    this.destroy$.complete()
    this.faceService.stopDetection()
  }
}
```

## Svelte

### Svelte Component

```svelte
<script>
  import { onMount } from 'svelte'
  import FaceDetectionEngine, { LivenessAction } from '@face-liveness/detection-engine'

  let videoElement
  let canvasElement
  let engine = null
  let status = 'Initializing...'
  let isReady = false
  let resultImage = null

  onMount(async () => {
    engine = new FaceDetectionEngine({
      liveness_action_list: [LivenessAction.BLINK],
      liveness_action_count: 1
    })

    engine.on('detector-loaded', () => {
      isReady = true
      status = 'Ready. Allow camera access to begin.'
    })

    engine.on('status-prompt', (data) => {
      status = data.message
    })

    engine.on('action-prompt', (data) => {
      status = `Please ${data.action}`
    })

    engine.on('liveness-completed', (data) => {
      status = 'Verification complete!'
      resultImage = data.imageData
    })

    engine.on('detector-error', (error) => {
      status = `Error: ${error.message}`
    })

    await engine.initialize()

    return () => {
      engine?.stopDetection()
    }
  })

  async function handleStart() {
    if (videoElement && engine) {
      try {
        await engine.startDetection(videoElement, canvasElement)
      } catch (error) {
        status = `Failed: ${error.message}`
      }
    }
  }

  function handleStop() {
    engine?.stopDetection()
    status = 'Detection stopped'
  }
</script>

<div class="container">
  <h1>Face Liveness Detection</h1>
  
  <div class="video-section">
    <video bind:this={videoElement} width="640" height="640" playsinline />
    <canvas bind:this={canvasElement} width="640" height="640" style="display: none" />
  </div>

  <div class="status-section">
    <p>{status}</p>
  </div>

  {#if resultImage}
    <div class="result-section">
      <h3>Verification Result:</h3>
      <img src={resultImage} alt="Captured Face" />
    </div>
  {/if}

  <div class="controls">
    <button on:click={handleStart} disabled={!isReady}>
      Start Detection
    </button>
    <button on:click={handleStop}>
      Stop Detection
    </button>
  </div>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
  }

  .video-section {
    width: 100%;
    max-width: 640px;
    margin-bottom: 20px;
  }

  video {
    width: 100%;
    height: auto;
    border: 3px solid #ddd;
    border-radius: 12px;
    background: #000;
  }

  .status-section {
    width: 100%;
    max-width: 640px;
    padding: 12px;
    text-align: center;
    background: #f5f5f5;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .result-section {
    width: 100%;
    max-width: 640px;
    margin-bottom: 20px;
  }

  img {
    width: 100%;
    border-radius: 8px;
  }

  .controls {
    display: flex;
    gap: 12px;
    width: 100%;
    max-width: 640px;
  }

  button {
    flex: 1;
    padding: 12px 24px;
    font-size: 16px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    background: #42b983;
    color: white;
    transition: background 0.3s;
  }

  button:hover:not(:disabled) {
    background: #38a372;
  }

  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  button:last-child {
    background: #f5222d;
  }

  button:last-child:hover {
    background: #c81715;
  }
</style>
```

## Server-Side Integration

### Node.js/Express Backend

```typescript
import express from 'express'

const app = express()
app.use(express.json({ limit: '50mb' }))

app.post('/api/verify-face', async (req, res) => {
  try {
    const { image, qualityScore, liveness } = req.body

    // Validate scores
    if (qualityScore < 0.8) {
      return res.json({ success: false, reason: 'Low image quality' })
    }

    if (liveness < 0.5) {
      return res.json({ success: false, reason: 'Low liveness score' })
    }

    // Convert base64 to buffer for additional processing
    const buffer = Buffer.from(image.split(',')[1], 'base64')

    // Optional: Send to external verification service
    // const externalResult = await verifyWithExternalService(buffer)

    res.json({ 
      success: true, 
      message: 'Face verification passed',
      timestamp: new Date()
    })
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: (error as Error).message 
    })
  }
})

app.listen(3000, () => {
  console.log('Server running on port 3000')
})
```

---

For more examples and advanced usage, see the main [README.md](./README.md)
