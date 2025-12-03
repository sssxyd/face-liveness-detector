[中文](./README_zh.md) | [English](./README.md)

# Face Detection Engine

A pure frontend, real-time face liveness detection engine built on **[Human.js](https://github.com/vladmandic/human)** and **[OpenCV.js](https://github.com/TechStark/opencv-js)**. This TypeScript-based npm package provides real-time face detection, dual liveness verification (silent + action-based), automatic best frame selection, and anti-spoofing capabilities - all running 100% in the browser with zero backend dependency.

## Features

- 💯 **Pure Frontend Implementation** - Zero backend dependency, all processing runs locally in the browser
- 🔬 **Hybrid TensorFlow + OpenCV Solution** - Combines TensorFlow.js for AI detection with OpenCV.js for image processing
- 🧠 **Dual Detection Modes** - Both silent liveness detection and action-based detection (blink, mouth open, nod) with automatic best frame selection
- ⚡ **Pure JavaScript & Event-Driven** - 100% TypeScript, reactive event architecture, seamless integration with any frontend framework (Vue, React, Angular, Svelte, or vanilla JS)
- 🎯 **Comprehensive Face Analysis** - Real-time anti-spoofing, quality assessment, frontality detection, and blur detection

## 🚀 Try Online Demo

**[👉 Live Demo: https://face.lowtechsoft.com/](https://face.lowtechsoft.com/)**

Scan the QR code with your phone to test the detection engine right now:

[![Face Liveness Detection Demo QR Code](https://raw.githubusercontent.com/sssxyd/face-liveness-detector/main/demos/vue-demo/vue-demo.png)](https://face.lowtechsoft.com/)
## Installation

```bash
npm install @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js
```

Or with yarn:
```bash
yarn add @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js
```

Or with pnpm:
```bash
pnpm add @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js
```

> **Note**: `@vladmandic/human` and `@techstark/opencv-js` are peer dependencies and must be installed separately to avoid bundling large libraries. This keeps your final bundle size smaller if you're already using these libraries elsewhere in your project.

## Quick Start - Using Local Resources

> ⚠️ **CRITICAL**: `@techstark/opencv-js` contains an ESM incompatible UMD-format OpenCV.js library that **will cause load failures**. You MUST apply the patch script.
> - **Issue**: https://github.com/TechStark/opencv-js/issues/44
> - **Patch Script**: [patch-opencv.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/patch-opencv.js)
> - **Setup**: Add to your `package.json` scripts as a `postinstall` hook to auto-apply after dependencies install

> ⚠️ **CRITICAL**: `@vladmandic/human` requires downloading large model files and TensorFlow WASM backend files. The component **will fail to load without these resources**. Download them to your project directory and configure the paths.
> - **Models Download Script**: [copy-models.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/copy-models.js)
> - **WASM Download Script**: [download-wasm.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/download-wasm.js)
> - **Setup**: Run both scripts as `postinstall` hooks, then configure paths in your engine config


```typescript
import FaceDetectionEngine, { LivenessAction } from '@sssxyd/face-liveness-detector'

// Initialize the engine with custom configuration
const engine = new FaceDetectionEngine({
  // Configure resource paths
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  
  // Detection settings
  video_width: 640,
  video_height: 640,
  
  // Quality settings
  min_image_quality: 0.5,
  min_face_frontal: 0.9,
  
  // Liveness settings - choose your preferred actions
  liveness_action_count: 1,  // 0 for silent detection only, 1-3 for action-based
  liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD]
})

// Listen for events
engine.on('detector-loaded', (data) => {
  console.log('✅ Engine is ready')
  console.log(`OpenCV: ${data.opencv_version}`)
  console.log(`Human.js: ${data.human_version}`)
})

engine.on('detector-info', (data) => {
  // Real-time detection information
  console.log({
    quality: (data.quality * 100).toFixed(1) + '%',
    frontal: (data.frontal * 100).toFixed(1) + '%',
    liveness: (data.live * 100).toFixed(1) + '%',
    realness: (data.real * 100).toFixed(1) + '%'
  })
})

engine.on('detector-action', (data) => {
  // Action liveness prompts
  if (data.status === 'started') {
    console.log(`Please perform: ${data.action}`)
  } else if (data.status === 'completed') {
    console.log(`✅ Action recognized: ${data.action}`)
  }
})

engine.on('detector-finish', (data) => {
  if (data.success) {
    console.log('✅ Liveness verification passed!')
    console.log({
      silentDetections: data.silentPassedCount,
      actionsCompleted: data.actionPassedCount,
      imageQuality: (data.bestQualityScore * 100).toFixed(1) + '%',
      totalTime: (data.totalTime / 1000).toFixed(2) + 's',
      bestFrame: data.bestFrameImage,  // Base64 encoded
      bestFace: data.bestFaceImage     // Base64 encoded
    })
  } else {
    console.log('❌ Liveness verification failed')
  }
})

engine.on('detector-error', (error) => {
  console.error(`Error [${error.code}]: ${error.message}`)
})

engine.on('detector-debug', (debug) => {
  console.log(`[${debug.stage}] ${debug.message}`)
})

// Initialize and start detection
async function runDetection() {
  try {
    // Initialize libraries (models, TensorFlow WASM, etc.)
    await engine.initialize()
    
    // Get video element
    const videoElement = document.getElementById('video') as HTMLVideoElement
    
    // Start detection on the video stream
    await engine.startDetection(videoElement)
    
    // Detection runs until completion or error
    // Stop manually if needed:
    // engine.stopDetection(true)  // true to display best image
  } catch (error) {
    console.error('Failed to run detection:', error)
  }
}

// Call when ready
runDetection()
```

## Configuration

### FaceDetectionEngineConfig

#### Resource Paths

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `human_model_path` | `string` | Path to Human.js model files | `undefined` |
| `tensorflow_wasm_path` | `string` | Path to TensorFlow WASM files | `undefined` |
| `tensorflow_backend` | `'auto' \| 'webgl' \| 'wasm'` | TensorFlow backend selection | `'auto'` |

#### Video Detection Settings

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `video_width` | `number` | Video stream width in pixels | `640` |
| `video_height` | `number` | Video stream height in pixels | `640` |
| `video_mirror` | `boolean` | Mirror video horizontally | `true` |
| `video_load_timeout` | `number` | Video stream loading timeout in ms | `5000` |
| `detection_frame_delay` | `number` | Delay between detection frames in ms | `100` |
| `error_retry_delay` | `number` | Error retry delay in ms | `200` |

#### Detection Quality Settings

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `silent_detect_count` | `number` | Number of silent detections to collect | `3` |
| `min_face_ratio` | `number` | Minimum face size ratio (0-1) | `0.5` |
| `max_face_ratio` | `number` | Maximum face size ratio (0-1) | `0.9` |
| `min_face_frontal` | `number` | Minimum face frontality score (0-1) | `0.9` |
| `min_image_quality` | `number` | Minimum image quality score (0-1) | `0.5` |
| `min_live_score` | `number` | Minimum liveness score (0-1) | `0.5` |
| `min_real_score` | `number` | Minimum anti-spoofing score (0-1) | `0.85` |
| `suspected_frauds_count` | `number` | Number of frauds to detect before fail | `3` |

#### Face Frontality Features (`face_frontal_features`)

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `yaw_threshold` | `number` | Yaw angle threshold in degrees | `3` |
| `pitch_threshold` | `number` | Pitch angle threshold in degrees | `4` |
| `roll_threshold` | `number` | Roll angle threshold in degrees | `2` |

#### Image Quality Features (`image_quality_features`)

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `require_full_face_in_bounds` | `boolean` | Require face completely within bounds | `false` |
| `use_opencv_enhancement` | `boolean` | Use OpenCV enhancement for quality detection | `true` |
| `min_laplacian_variance` | `number` | Minimum Laplacian variance for blur detection | `50` |
| `min_gradient_sharpness` | `number` | Minimum gradient sharpness for blur detection | `0.15` |
| `min_blur_score` | `number` | Minimum blur score | `0.6` |

#### Liveness Detection Settings

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `liveness_action_list` | `LivenessAction[]` | List of liveness actions to detect | `[BLINK, MOUTH_OPEN, NOD]` |
| `liveness_action_count` | `number` | Number of liveness actions to perform | `1` |
| `liveness_action_randomize` | `boolean` | Randomize liveness actions order | `true` |
| `liveness_verify_timeout` | `number` | Timeout for liveness verification in ms | `60000` |
| `min_mouth_open_percent` | `number` | Minimum mouth open percentage (0-1) | `0.2` |


## API Reference

### Methods

#### `initialize(): Promise<void>`
Load and initialize detection libraries. Must be called before using detection.

```typescript
await engine.initialize()
```

#### `startDetection(videoElement): Promise<void>`
Start face detection on a video element.

```typescript
const videoElement = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(videoElement)
```

#### `stopDetection(success?: boolean): void`
Stop the detection process.

```typescript
engine.stopDetection(true)  // true to display best image
```

#### `updateConfig(config): void`
Update configuration during runtime.

```typescript
engine.updateConfig({
  min_face_ratio: 0.6,
  liveness_action_count: 2
})
```

#### `getConfig(): FaceDetectionEngineConfig`
Get current configuration.

```typescript
const config = engine.getConfig()
```

#### `getStatus(): Object`
Get engine status.

```typescript
const { isReady, isDetecting, isInitializing } = engine.getStatus()
```

### Events

The engine uses a TypeScript event emitter pattern. All events are type-safe:

#### `detector-loaded`
Fired when the engine finishes initialization.

**Data:**
```typescript
interface DetectorLoadedEventData {
  success: boolean        // Whether initialization succeeded
  error?: string          // Error message if any
  opencv_version?: string // OpenCV.js version
  human_version?: string  // Human.js version
}
```

**Example:**
```typescript
engine.on('detector-loaded', (data) => {
  if (data.success) {
    console.log('✅ Engine ready')
    console.log(`OpenCV: ${data.opencv_version}`)
    console.log(`Human.js: ${data.human_version}`)
  } else {
    console.error('Engine failed:', data.error)
  }
})
```

#### `detector-info`
Real-time detection information for each frame.

**Data:**
```typescript
interface DetectorInfoEventData {
  passed: boolean     // Whether silent liveness check passed
  code: DetectionCode // Detection status code
  size: number        // Face size ratio (0-1)
  frontal: number     // Face frontality score (0-1)
  quality: number     // Image quality score (0-1)
  real: number        // Anti-spoofing score (0-1)
  live: number        // Liveness score (0-1)
}
```

**Detection Codes:**
```typescript
enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',        // No face detected
  MULTIPLE_FACE = 'MULTIPLE_FACE',        // Multiple faces detected
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',      // Face too small
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',      // Face too large
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',  // Face not frontal enough
  FACE_NOT_REAL = 'FACE_NOT_REAL',        // Suspected spoofing
  FACE_NOT_LIVE = 'FACE_NOT_LIVE',        // Low liveness score
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',  // Image quality too low
  FACE_CHECK_PASS = 'FACE_CHECK_PASS'     // All checks passed
}
```

**Example:**
```typescript
engine.on('detector-info', (data) => {
  console.log({
    passed: data.passed,
    status: data.code,
    quality: (data.quality * 100).toFixed(1) + '%',
    frontal: (data.frontal * 100).toFixed(1) + '%',
    liveness: (data.live * 100).toFixed(1) + '%',
    realness: (data.real * 100).toFixed(1) + '%'
  })
})
```

#### `detector-action`
Action liveness prompts and status updates.

**Data:**
```typescript
interface DetectorActionEventData {
  action: LivenessAction    // The action to perform
  status: LivenessActionStatus // Action status
}
```

**Action Types:**
```typescript
enum LivenessAction {
  BLINK = 'blink',
  MOUTH_OPEN = 'mouth_open',
  NOD = 'nod'
}
```

**Action Status:**
```typescript
enum LivenessActionStatus {
  STARTED = 'started',      // Action prompt started
  COMPLETED = 'completed',  // Action recognized
  TIMEOUT = 'timeout'       // Action recognition timeout
}
```

**Example:**
```typescript
engine.on('detector-action', (data) => {
  switch (data.status) {
    case 'started':
      console.log(`👤 Please perform: ${data.action}`)
      // Update UI to show action prompt
      break
    case 'completed':
      console.log(`✅ Action recognized: ${data.action}`)
      // Update progress indicator
      break
    case 'timeout':
      console.log(`⏱️ Action timeout: ${data.action}`)
      break
  }
})
```

#### `detector-finish`
Fired when liveness detection completes (successfully or failed).

**Data:**
```typescript
interface DetectorFinishEventData {
  success: boolean         // Whether liveness verification passed
  silentPassedCount: number    // Number of silent detections passed
  actionPassedCount: number    // Number of actions completed
  totalTime: number        // Total detection time in ms
  bestQualityScore: number // Best image quality score (0-1)
  bestFrameImage: string | null  // Base64 encoded best frame image
  bestFaceImage: string | null   // Base64 encoded best face image
}
```

**Example:**
```typescript
engine.on('detector-finish', (data) => {
  if (data.success) {
    console.log('✅ Liveness verification passed!')
    console.log({
      silentDetections: data.silentPassedCount,
      actionsCompleted: data.actionPassedCount,
      quality: (data.bestQualityScore * 100).toFixed(1) + '%',
      time: (data.totalTime / 1000).toFixed(2) + 's'
    })
    
    // Send results to server
    if (data.bestFrameImage) {
      uploadVerificationResult({
        image: data.bestFrameImage,
        quality: data.bestQualityScore,
        timestamp: new Date()
      })
    }
  } else {
    console.log('❌ Liveness verification failed')
    // Prompt user to try again
  }
})
```

#### `detector-error`
Fired when an error occurs during detection.

**Data:**
```typescript
interface DetectorErrorEventData {
  code: ErrorCode // Error code
  message: string // Error message
}
```

**Error Codes:**
```typescript
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
  console.error(`❌ Error [${error.code}]: ${error.message}`)
  
  switch (error.code) {
    case 'CAMERA_ACCESS_DENIED':
      showErrorMessage('Please grant camera permissions')
      break
    case 'STREAM_ACQUISITION_FAILED':
      showErrorMessage('Failed to access camera')
      break
    case 'SUSPECTED_FRAUDS_DETECTED':
      showErrorMessage('Spoofing detected - please try again')
      break
    default:
      showErrorMessage('Detection failed: ' + error.message)
  }
})
```

#### `detector-debug`
Debug information for development and troubleshooting.

**Data:**
```typescript
interface DetectorDebugEventData {
  level: 'info' | 'warn' | 'error'  // Debug level
  stage: string                      // Current processing stage
  message: string                    // Debug message
  details?: Record<string, any>      // Additional details
  timestamp: number                  // Unix timestamp
}
```

**Example:**
```typescript
engine.on('detector-debug', (debug) => {
  const time = new Date(debug.timestamp).toLocaleTimeString()
  console.log(`[${time}] [${debug.stage}] ${debug.message}`)
  
  if (debug.details) {
    console.log('Details:', debug.details)
  }
  
  // Log errors for troubleshooting
  if (debug.level === 'error') {
    logErrorToServer({
      stage: debug.stage,
      message: debug.message,
      details: debug.details
    })
  }
})
```

## Enumerations

### LivenessAction
```typescript
enum LivenessAction {
  BLINK = 'blink',
  MOUTH_OPEN = 'mouth_open',
  NOD = 'nod'
}
```

### LivenessActionStatus
```typescript
enum LivenessActionStatus {
  STARTED = 'started',      // Action prompt has started
  COMPLETED = 'completed',  // Action successfully recognized
  TIMEOUT = 'timeout'       // Action recognition timeout
}
```

### DetectionCode
```typescript
enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',            // No face detected in the video
  MULTIPLE_FACE = 'MULTIPLE_FACE',            // Multiple faces detected
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',          // Face size below minimum threshold
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',          // Face size above maximum threshold
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',      // Face angle not frontal enough
  FACE_NOT_REAL = 'FACE_NOT_REAL',            // Suspected spoofing detected
  FACE_NOT_LIVE = 'FACE_NOT_LIVE',            // Liveness score below threshold
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',      // Image quality below minimum
  FACE_CHECK_PASS = 'FACE_CHECK_PASS'         // All detection checks passed
}
```

### ErrorCode
```typescript
enum ErrorCode {
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',  // Engine not initialized
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',          // Camera permission denied
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED', // Failed to get video stream
  SUSPECTED_FRAUDS_DETECTED = 'SUSPECTED_FRAUDS_DETECTED'  // Spoofing/fraud suspected
}
```

## Advanced Usage

For comprehensive examples and advanced usage patterns, please refer to the official demo project:

**👉 [Vue Demo Project](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/)**

The demo includes:
- Complete Vue 3 integration with TypeScript
- Real-time detection visualization
- Configuration panel for experimenting with different settings
- Event handling examples for all engine events
- Debug panel showing detailed detection information
- Responsive UI design for mobile and desktop
- Error handling and user feedback patterns
- Result export and image capture examples

To run the demo locally:

```bash
cd demos/vue-demo
npm install
npm run dev
```

Then open your browser to the displayed local URL to see the detection engine in action.

## Downloading and Hosting Model Files

To avoid CDN dependencies and improve performance, you can download model files locally:

### Available Download Scripts

Two scripts are provided in the root directory:

#### 1. Copy Human.js Models

```bash
node copy-human-models.js
```

**What it does:**
- Copies face detection models from `node_modules/@vladmandic/human/models`
- Saves to `public/models/` directory
- Downloads both `.json` and `.bin` model files
- Shows file size and progress

#### 2. Download TensorFlow.js WASM Files

```bash
node download-tensorflow-wasm.js
```

**What it does:**
- Downloads TensorFlow.js WASM backend files
- Saves to `public/wasm/` directory
- Downloads 4 critical files:
  - `tf-backend-wasm.min.js`
  - `tfjs-backend-wasm.wasm`
  - `tfjs-backend-wasm-simd.wasm`
  - `tfjs-backend-wasm-threaded-simd.wasm`
- **Supports multiple CDN sources** with automatic fallback:
  1. unpkg.com (primary)
  2. cdn.jsdelivr.net (backup)
  3. esm.sh (fallback)
  4. cdn.esm.sh (last resort)

### Configuration to Use Local Files

Once downloaded, configure the engine to use these local files:

```typescript
const engine = new FaceDetectionEngine({
  // Use local files instead of CDN
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  
  // ... rest of configuration
})
```

## Browser Requirements

- Modern browsers with WebRTC support (Chrome, Firefox, Edge, Safari 11+)
- HTTPS required for getUserMedia
- WebGL or WASM backend support

## Performance Tips

1. **Adjust detection frame delay** - Higher delay = lower CPU usage but slower detection
   ```typescript
   engine.updateConfig({ detection_frame_delay: 200 })
   ```

2. **Reduce canvas size** - Smaller canvases process faster
   ```typescript
   engine.updateConfig({ 
     video_width: 480,
     video_height: 480
   })
   ```

3. **Optimize light conditions** - Better lighting = better detection
   - Avoid backlighting
   - Ensure face is well-lit

4. **Monitor debug output** - Use debug events to identify bottlenecks
   ```typescript
   engine.on('detector-debug', (debug) => {
     if (debug.stage === 'detection') {
       console.time(debug.message)
     }
   })
   ```

## Troubleshooting

### "Camera access denied"
- Ensure HTTPS is used (or localhost for development)
- Check browser permissions
- User must grant camera access

### "Video loading timeout"
- Check internet connection
- Verify model files are accessible
- Increase `video_load_timeout`

### Poor detection accuracy
- Ensure good lighting
- Keep face centered in frame
- Face should be 50-90% of frame
- Face should be frontal (not tilted)

### High CPU usage
- Increase `detection_frame_delay`
- Reduce `video_width` and `video_height`
- Disable `show_action_prompt` if not needed

## License

MIT

## Support

For issues and questions, please visit: https://github.com/sssxyd/face-liveness-detector/issues
