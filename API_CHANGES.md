# API Changes Documentation

## Event System Updates

This document describes the events and data structures used by `FaceDetectionEngine`.

### Event Map

The engine emits the following events:

#### 1. `detector-loaded`
**When:** After successful initialization of Human.js and OpenCV.js libraries  
**Data Type:** `DetectorLoadedEventData`

```typescript
interface DetectorLoadedEventData {
  success: boolean       // Whether initialization succeeded
  error?: string         // Error message if failed
  opencv_version?: string    // OpenCV version
  human_version?: string     // Human.js version
}
```

**Example:**
```typescript
engine.on('detector-loaded', (data) => {
  if (data.success) {
    console.log('Libraries loaded:', {
      opencv: data.opencv_version,
      human: data.human_version
    })
  }
})
```

#### 2. `status-prompt`
**When:** Various status changes during detection  
**Data Type:** `StatusPromptEventData`

```typescript
interface StatusPromptEventData {
  code: PromptCode       // Status code (enum)
  size?: number          // Face size percentage (0-1)
  frontal?: number       // Face frontality (0-1)
  real?: number          // Anti-spoofing score (0-1)
  live?: number          // Liveness score (0-1)
  quality?: number       // Image quality (0-1)
}

enum PromptCode {
  NO_FACE = 'NO_FACE',
  MULTIPLE_FACE = 'MULTIPLE_FACE',
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',
  IMAGE_QUALITY_LOW = 'IMAGE_QUALITY_LOW',
  FRAME_DETECTED = 'FRAME_DETECTED'
}
```

**Example:**
```typescript
engine.on('status-prompt', (data) => {
  switch(data.code) {
    case 'NO_FACE':
      console.log('No face detected')
      break
    case 'FRAME_DETECTED':
      console.log(`Quality: ${(data.quality * 100).toFixed(0)}%`)
      break
  }
})
```

#### 3. `face-detected`
**When:** A face frame passes all quality checks (silent liveness detection)  
**Data Type:** `FaceDetectedEventData`

```typescript
interface FaceDetectedEventData {
  passed: boolean        // Whether all checks passed
  size: number          // Face size as ratio of frame (0-1)
  frontal: number       // Face frontality score (0-1)
  quality: number       // Image quality score (0-1)
  real: number          // Anti-spoofing score (0-1)
  live: number          // Liveness score (0-1)
}
```

**Example:**
```typescript
engine.on('face-detected', (data) => {
  console.log('Frame quality metrics:', {
    size: (data.size * 100).toFixed(0) + '%',
    frontal: (data.frontal * 100).toFixed(0) + '%',
    quality: (data.quality * 100).toFixed(0) + '%',
    real: (data.real * 100).toFixed(0) + '%',
    live: (data.live * 100).toFixed(0) + '%'
  })
})
```

#### 4. `action-prompt`
**When:** Action-based liveness detection is requested  
**Data Type:** `ActionPromptEventData`

```typescript
interface ActionPromptEventData {
  action: LivenessAction       // Requested action
  status: LivenessActionStatus // Action status
}

enum LivenessAction {
  BLINK = 'blink',
  MOUTH_OPEN = 'mouth_open',
  NOD = 'nod'
}

enum LivenessActionStatus {
  STARTED = 'started',      // Action requested
  COMPLETED = 'completed',  // Action detected successfully
  TIMEOUT = 'timeout'       // Action timed out
}
```

**Example:**
```typescript
engine.on('action-prompt', (data) => {
  if (data.status === 'started') {
    console.log(`Please ${data.action}`)
  } else if (data.status === 'completed') {
    console.log(`${data.action} detected!`)
  } else if (data.status === 'timeout') {
    console.log(`${data.action} timed out`)
  }
})
```

#### 5. `detector-finish`
**When:** Detection process completes (successfully or fails)  
**Data Type:** `DetectorFinishEventData`

```typescript
interface DetectorFinishEventData {
  success: boolean            // Overall result
  silentPassedCount: number   // Silent liveness frames collected
  actionPassedCount: number   // Actions successfully completed
  totalTime: number           // Total detection time (ms)
  bestQualityScore: number    // Best quality score (0-1)
  bestFrameImage: string | null   // Base64 encoded full frame
  bestFaceImage: string | null    // Base64 encoded face crop
}
```

**Example:**
```typescript
engine.on('detector-finish', (data) => {
  if (data.success) {
    console.log('✓ Liveness verification successful')
    console.log({
      quality: data.bestQualityScore,
      silentFrames: data.silentPassedCount,
      actionsCompleted: data.actionPassedCount,
      time: data.totalTime + 'ms'
    })
    
    // Use captured images
    if (data.bestFrameImage) displayImage(data.bestFrameImage)
    if (data.bestFaceImage) displayCrop(data.bestFaceImage)
  } else {
    console.log('✗ Liveness verification failed')
  }
})
```

#### 6. `detector-error`
**When:** An error occurs during detection  
**Data Type:** `DetectorErrorEventData`

```typescript
interface DetectorErrorEventData {
  code: ErrorCode
  message: string
}

enum ErrorCode {
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED',
  SUSPECTED_FRAUDS_DETECTED = 'SUSPECTED_FRAUDS_DETECTED'
}
```

**Example:**
```typescript
engine.on('detector-error', (error) => {
  console.error(`[${error.code}] ${error.message}`)
  
  switch(error.code) {
    case 'CAMERA_ACCESS_DENIED':
      alert('Please allow camera access')
      break
    case 'DETECTOR_NOT_INITIALIZED':
      alert('Failed to load detection engine')
      break
  }
})
```

#### 7. `detector-debug`
**When:** Debug information is available (development purposes)  
**Data Type:** `DetectorDebugEventData`

```typescript
interface DetectorDebugEventData {
  level: 'info' | 'warn' | 'error'
  stage: string                    // Current stage
  message: string                  // Debug message
  details?: Record<string, any>    // Additional data
  timestamp: number                // Milliseconds since epoch
}
```

**Example:**
```typescript
engine.on('detector-debug', (debug) => {
  const prefix = debug.level === 'error' ? '❌' 
               : debug.level === 'warn' ? '⚠️' 
               : 'ℹ️'
  
  console.log(`${prefix} [${debug.stage}] ${debug.message}`, debug.details)
})
```

## Method Signatures

### startDetection()

**Old Signature:**
```typescript
startDetection(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement): Promise<void>
```

**New Signature:**
```typescript
startDetection(videoElement: HTMLVideoElement): Promise<void>
```

**Changes:**
- Canvas element is no longer required as a parameter
- Engine manages internal canvas elements internally
- Video element is the only required parameter

**Example:**
```typescript
const video = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(video)
```

## Migration Guide

### Updating Event Handlers

#### Old Code:
```typescript
engine.on('liveness-completed', (data) => {
  console.log('Quality:', data.qualityScore)
  console.log('Image:', data.imageData)
  console.log('Liveness:', data.liveness)
})
```

#### New Code:
```typescript
engine.on('detector-finish', (data) => {
  console.log('Quality:', data.bestQualityScore)
  console.log('Frame Image:', data.bestFrameImage)
  console.log('Face Image:', data.bestFaceImage)
  console.log('Success:', data.success)
  console.log('Silent Frames:', data.silentPassedCount)
  console.log('Actions Passed:', data.actionPassedCount)
})
```

### Updating startDetection() Calls

#### Old Code:
```typescript
const video = document.getElementById('video') as HTMLVideoElement
const canvas = document.getElementById('canvas') as HTMLCanvasElement
await engine.startDetection(video, canvas)
```

#### New Code:
```typescript
const video = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(video)
```

## Configuration

All configuration parameters are available in the `FaceDetectionEngineConfig` interface.

### Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `silent_detect_count` | 3 | Number of high-quality frames to collect |
| `min_face_ratio` | 0.5 | Minimum face size (0-1) |
| `max_face_ratio` | 0.9 | Maximum face size (0-1) |
| `min_face_frontal` | 0.9 | Minimum face frontality (0-1) |
| `min_image_quality` | 0.8 | Minimum image quality (0-1) |
| `min_real_score` | 0.85 | Minimum anti-spoofing score (0-1) |
| `min_live_score` | 0.5 | Minimum liveness score (0-1) |
| `liveness_action_list` | [blink, mouth_open, nod] | Actions to request |
| `liveness_action_count` | 1 | Number of actions required |
| `liveness_action_timeout` | 60000 | Action timeout (ms) |
| `detection_frame_delay` | 100 | Delay between frames (ms) |
| `video_load_timeout` | 5000 | Video load timeout (ms) |
| `video_width` | 640 | Video stream width (px) |
| `video_height` | 640 | Video stream height (px) |

---

**Last Updated:** November 2024  
**Version:** 1.0.0
