# Face Liveness Detection Engine

<div align="center">

> **Languages:** [中文](./README.md) · English

<p>
  <strong>Pure Frontend Real-time Face Liveness Detection Solution Based on TensorFlow + OpenCV</strong>
</p>

<p>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript">
  <img alt="NPM Package" src="https://img.shields.io/npm/v/@sssxyd/face-liveness-detector?label=npm&color=cb3837">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

</div>

---

## ✨ Features

<table>
  <tr>
    <td>💯 <strong>Pure Frontend Implementation</strong><br/>Zero backend dependency, all processing runs locally in browser</td>
    <td>🔬 <strong>Mixed AI Solution</strong><br/>TensorFlow + OpenCV深度融合</td>
  </tr>
  <tr>
    <td>🧠 <strong>Dual Liveness Verification</strong><br/>Silent detection + gesture recognition (blink, mouth open, head up, nod)</td>
    <td>⚡ <strong>Event-driven Architecture</strong><br/>100% TypeScript, seamlessly integrates with any framework</td>
  </tr>
  <tr>
    <td>🎯 <strong>Full-dimensional Analysis</strong><br/>Quality, frontal orientation, motion scores</td>
    <td>🛡️ <strong>Multi-dimensional Anti-Spoofing</strong><br/>Photo motion detection, geometric feature analysis</td>
  </tr>
</table>

---

## 🚀 Online Demo

<div align="center">

**[👉 Live Demo Experience](https://face.lowtechsoft.com/) | Scan QR code with mobile for quick testing**

[![Face Liveness Detection Demo QR Code](https://raw.githubusercontent.com/sssxyd/face-liveness-detector/main/demos/vue-demo/vue-demo.png)](https://face.lowtechsoft.com/)

</div>

---

## 🧬 Core Algorithm Design

| Detection Module | Technical Solution | Documentation |
|------------------|--------------------|---------------|
| **Face Recognition** | Human.js BlazeFace + FaceMesh | 468 facial landmarks + expression recognition |
| **Face Motion Detection** | Keypoint Motion Analysis | [Face Motion Detection Algorithm](./docs/FaceMovingDetectorAlgorithm.md) - Based on centering and frame-to-frame displacement calculation to detect head movement |
| **Photo Attack Detection** | Geometric Feature Analysis | [Photo Attack Detection Algorithm](./docs/PhotoAttackDetectorAlgorithm.md) - Perspective consistency, displacement variance, motion consistency analysis |
| **Gesture Liveness Detection** | Human.js Gesture Module | [Gesture Detection Algorithm](./docs/FaceLivenessDetectionAlgorithm.md) - Random gesture validation including blink, mouth open, nod, head up, etc. |

---

## 📦 Installation Guide

### Quick Install (3 packages)

```
npm install @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js
```

<details>
<summary><strong>Other Package Managers</strong></summary>

```bash
# Yarn
yarn add @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js

# pnpm
pnpm add @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js
```

</details>

> 📝 **Why Three Packages?**
> `@vladmandic/human` and `@techstark/opencv-js` are peer dependencies that need to be installed separately to avoid bundling large libraries and reduce final bundle size.

---

## ⚠️ Essential Configuration Steps

### 1️⃣ Fix OpenCV.js ESM Compatibility Issues

`@techstark/opencv-js` contains incompatible UMD format, **patch script must be applied**.

**Reference:**
- Issue Details: [TechStark/opencv-js#44](https://github.com/TechStark/opencv-js/issues/44)
- Patch Script: [patch-opencv.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/patch-opencv.js)

**Setup Method (Recommended):** Add to `postinstall` hook in `package.json`

```
{
  "scripts": {
    "postinstall": "node patch-opencv.cjs"
  }
}
```

### 2️⃣ Download Human.js Model Files

`@vladmandic/human` requires model files and TensorFlow WASM backend, otherwise **it won't load**.

**Download Scripts:**
- Model Copy: [copy-models.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/copy-models.js)
- WASM Download: [download-wasm.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/download-wasm.js)

**Setup Method (Recommended):** Configure as `postinstall` hook

```
{
  "scripts": {
    "postinstall": "node scripts/copy-models.js && node scripts/download-wasm.js"
  }
}
```

---

## 🎯 Quick Start

### Basic Example

```
import FaceDetectionEngine, { LivenessAction } from '@sssxyd/face-liveness-detector'

// Initialize engine
const engine = new FaceDetectionEngine({
  // Resource path configuration
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',

  // Camera resolution settings, default 1280x720, lowering to 640x480 increases speed with slight accuracy loss
  detect_video_ideal_width: 1280,
  detect_video_ideal_height: 720,

  // Action liveness detection settings
  action_liveness_action_count: 1,     // Number of actions required from user, range [0-4], 0 means no action liveness detection, recommend setting to 2 for high reliability
  action_liveness_verify_timeout: 15000, // Timeout for each action detection, default 15000ms, recommend not less than 1000ms

  // Photo attack detection settings
  photo_attack_passed_frame_count: 10, // Consecutive X frames passing photo attack detection before final acceptance, default 15, minimum shouldn't be lower than 5, smaller values increase detection speed but decrease accuracy
})

// Listen to core events
engine.on('detector-loaded', (data) => {
  if (data.success) {
    console.log('✅ Engine Ready', {
      opencv: data.opencv_version,
      human: data.human_version
    })
  }
})

engine.on('detector-info', (data) => {
  // Per-frame real-time data
  console.log({
    status: data.code,
    quality: (data.imageQuality * 100).toFixed(1) + '%',
    frontal: (data.faceFrontal * 100).toFixed(1) + '%',
    motion: (data.motionScore * 100).toFixed(1) + '%',
    screen: (data.screenConfidence * 100).toFixed(1) + '%'
  })
})

engine.on('detector-action', (data) => {
  // Action prompts
  console.log(`Please perform action: ${data.action} (${data.status})`)
})

engine.on('detector-finish', (data) => {
  // Detection complete
  if (data.success) {
    console.log('✅ Liveness verification passed!', {
      Silent Passed: data.silentPassedCount,
      Actions Completed: data.actionPassedCount,
      Best Quality: (data.bestQualityScore * 100).toFixed(1) + '%',
      Total Time: (data.totalTime / 1000).toFixed(2) + 's'
    })
  } else {
    console.log('❌ Liveness verification failed')
  }
})

engine.on('detector-error', (error) => {
  console.error(`❌ Error [${error.code}]: ${error.message}`)
})

// Start detection
async function startLivenessDetection() {
  try {
    // Initialize library
    await engine.initialize()
    
    // Get video element and start detection
    const videoEl = document.getElementById('video') as HTMLVideoElement
    await engine.startDetection(videoEl)
    
    // Detection runs automatically until completion or manual stop
    // engine.stopDetection(true)  // Stop and display best image
  } catch (error) {
    console.error('Detection startup failed:', error)
  }
}

// Start when ready
startLivenessDetection()
```

---

## ⚙️ Detailed Configuration Reference

### Resource Path Configuration

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `human_model_path` | `string` | Human.js model file directory | `undefined` |
| `tensorflow_wasm_path` | `string` | TensorFlow WASM file directory | `undefined` |
| `tensorflow_backend` | `'auto' \| 'webgl' \| 'wasm'` | TensorFlow backend engine | `'auto'` |

### Debug Mode Configuration

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `debug_mode` | `boolean` | Enable debug mode | `false` |
| `debug_log_level` | `'info' \| 'warn' \| 'error'` | Minimum debug log level | `'info'` |
| `debug_log_stages` | `string[]` | Debug log stage filtering (undefined=all) | `undefined` |
| `debug_log_throttle` | `number` | Debug log throttle interval (ms) | `100` |

### Detection Function Configuration

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `enable_face_moving_detection` | `boolean` | Enable face motion detection | `true` |
| `enable_photo_attack_detection` | `boolean` | Enable photo attack detection | `true` |

### Video Detection Settings

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `detect_video_ideal_width` | `number` | Video width (pixels) | `1280` |
| `detect_video_ideal_height` | `number` | Video height (pixels) | `720` |
| `detect_video_mirror` | `boolean` | Horizontal flip video | `true` |
| `detect_video_load_timeout` | `number` | Load timeout (ms) | `5000` |

### Face Collection Quality Requirements

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `collect_min_collect_count` | `number` | Minimum collection count | `3` |
| [collect_min_face_ratio](file:///Users/wangguanda/Downloads/电商-订单/face-liveness-detector/src/config.ts#L115-L115) | `number` | Minimum face ratio (0-1) | `0.5` |
| `collect_max_face_ratio` | `number` | Maximum face ratio (0-1) | `0.9` |
| `collect_min_face_frontal` | `number` | Minimum frontal orientation (0-1) | `0.9` |
| `collect_min_image_quality` | `number` | Minimum image quality (0-1) | `0.5` |

### Face Frontality Parameters

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `yaw_threshold` | `number` | Yaw angle threshold (degrees) | `3` |
| `pitch_threshold` | `number` | Pitch angle threshold (degrees) | `4` |
| `roll_threshold` | `number` | Roll angle threshold (degrees) | `2` |

### Image Quality Parameters

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `require_full_face_in_bounds` | `boolean` | Face completely within bounds | `false` |
| `min_laplacian_variance` | `number` | Minimum Laplacian variance detection value | `40` |
| `min_gradient_sharpness` | `number` | Minimum gradient sharpness | `0.15` |
| `min_blur_score` | `number` | Minimum blur score | `0.6` |

### Liveness Detection Settings

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `action_liveness_action_list` | `LivenessAction[]` | Action list | `[BLINK, MOUTH_OPEN, NOD_DOWN, NOD_UP]` |
| `action_liveness_action_count` | `number` | Number of actions to complete | `1` |
| `action_liveness_action_randomize` | `boolean` | Randomize action order | `true` |
| `action_liveness_verify_timeout` | `number` | Single action verification timeout (ms) | `15000` |
| `action_liveness_min_mouth_open_percent` | `number` | Minimum mouth open percentage (0-1) | `0.2` |

### Photo Attack Detection Settings

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `photo_attack_passed_frame_count` | `number` | Number of consecutive successful frames for photo attack detection | `15` |

> **Note**: Photo attack detection uses built-in geometric feature analysis algorithm (perspective ratio, displacement variance, directional consistency, affine transformation matching), all parameters are internally optimized and require no manual configuration. See [Photo Attack Detection Algorithm Document](./docs/PHOTO_ATTACK_DETECTION_ALGORITHM.md) for details.

---

## 🛠️ API Methods Reference

### Core Methods

#### `initialize(): Promise<void>`
Load and initialize detection library. **Must be called before using other features.**

```
await engine.initialize()
```

#### `startDetection(videoElement): Promise<void>`
Start face detection on video element.

```
const videoEl = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(videoEl)
```

#### `stopDetection(success?: boolean): void`
Stop detection process.

```
engine.stopDetection(true)  // true: Show best detection image
```

#### `updateConfig(config): void`
Dynamically update configuration at runtime.

```
engine.updateConfig({
  collect_min_face_ratio: 0.6,
  action_liveness_action_count: 0
})
```

#### `getOptions(): FaceDetectionEngineOptions`
Get current configuration object.

```
const config = engine.getOptions()
```

#### `getEngineState(): EngineState`
Get current engine state.

```
const state = engine.getEngineState()
```

---

## 📡 Event System

Engine uses **TypeScript Event Emitter Pattern**, all events are type-safe.

### Event List

<table>
<tr>
<td><strong>detector-loaded</strong></td>
<td>Engine initialization completed</td>
</tr>
<tr>
<td><strong>detector-info</strong></td>
<td>Per-frame real-time detection data</td>
</tr>
<tr>
<td><strong>detector-action</strong></td>
<td>Action liveness prompts and status</td>
</tr>
<tr>
<td><strong>detector-finish</strong></td>
<td>Detection complete (success/failure)</td>
</tr>
<tr>
<td><strong>detector-error</strong></td>
<td>Triggered when error occurs</td>
</tr>
<tr>
<td><strong>detector-debug</strong></td>
<td>Debug information (development)</td>
</tr>
</table>

---

### 📋 detector-loaded

**Triggers when engine initialization completes**

```
interface DetectorLoadedEventData {
  success: boolean        // Whether initialization was successful
  error?: string          // Error message (when failed)
  opencv_version?: string // OpenCV.js version
  human_version?: string  // Human.js version
}
```

**Example:**
```
engine.on('detector-loaded', (data) => {
  if (data.success) {
    console.log('✅ Engine Ready')
    console.log(`OpenCV ${data.opencv_version} | Human.js ${data.human_version}`)
  } else {
    console.error('❌ Initialization failed:', data.error)
  }
})
```

---

### 📊 detector-info

**Returns real-time detection data per frame (high-frequency event)**

```
interface DetectorInfoEventData {
  passed: boolean         // Whether passed silent detection
  code: DetectionCode     // Detection status code
  message: string         // Status message
  faceCount: number       // Number of faces detected
  faceRatio: number       // Face ratio (0-1)
  faceFrontal: number     // Face frontal orientation (0-1)
  imageQuality: number    // Image quality score (0-1)
  motionScore: number     // Motion score (0-1)
  keypointVariance: number // Keypoint variance (0-1)
  motionType: string      // Detected motion type
  screenConfidence: number // Screen capture confidence (0-1)
}
```

**Detection Status Codes:**
```
enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',                // No face detected in video
  MULTIPLE_FACE = 'MULTIPLE_FACE',                // Multiple faces detected
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',              // Face too small
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',              // Face too large
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',          // Face not frontal enough
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',          // Image quality too low
  FACE_IMAGE_CAPTURED = 'FACE_IMAGE_CAPTURED'     // Image captured
  PHOTO_ATTACK_DETECTED = "PHOTO_ATTACK_DETECTED" // Photo attack detected
}
```

**Example:**
```
engine.on('detector-info', (data) => {
  console.log({
    Detection Status: data.code,
    Silent Pass: data.passed ? '✅' : '❌',
    Image Quality: `${(data.imageQuality * 100).toFixed(1)}%`,
    Face Frontality: `${(data.faceFrontal * 100).toFixed(1)}%`,
  })
})
```

---

### 👤 detector-action

**Action liveness prompts and recognition status**

```
interface DetectorActionEventData {
  action: LivenessAction          // Action to perform
  status: LivenessActionStatus    // Action status
}

enum LivenessAction {
  BLINK = 'blink',           // Blink
  MOUTH_OPEN = 'mouth_open', // Mouth open
  NOD_DOWN = 'nod_down',     // Nod down
  NOD_UP = 'nod_up'          // Nod up
}

enum LivenessActionStatus {
  STARTED = 'started',      // Prompt started
  COMPLETED = 'completed',  // Recognition successful
  TIMEOUT = 'timeout'       // Recognition timeout
}
```

**Example:**
```
engine.on('detector-action', (data) => {
  const actionLabels = {
    'blink': 'Blink',
    'mouth_open': 'Mouth Open',
    'nod_down': 'Nod Down',
    'nod_up': 'Nod Up'
  }
  
  switch (data.status) {
    case 'started':
      console.log(`👤 Please perform: ${actionLabels[data.action]}`)
      // Show UI prompt
      break
    case 'completed':
      console.log(`✅ Recognized: ${actionLabels[data.action]}`)
      // Update progress bar
      break
    case 'timeout':
      console.log(`⏱️ Timeout: ${actionLabels[data.action]}`)
      // Show retry prompt
      break
  }
})
```

---

### ✅ detector-finish

**Detection process complete (success or failure)**

```
interface DetectorFinishEventData {
  success: boolean         // Whether verification passed
  silentPassedCount: number    // Number of silent detections passed
  actionPassedCount: number    // Number of actions completed
  totalTime: number        // Total time (milliseconds)
  bestQualityScore: number // Best image quality (0-1)
  bestFrameImage: string | null  // Base64 frame image
  bestFaceImage: string | null   // Base64 face image
}
```

**Example:**
```
engine.on('detector-finish', (data) => {
  if (data.success) {
    console.log('🎉 Liveness verification successful!', {
      Silent Passed: `${data.silentPassedCount} times`,
      Actions Completed: `${data.actionPassedCount} times`,
      Best Quality: `${(data.bestQualityScore * 100).toFixed(1)}%`,
      Total Time: `${(data.totalTime / 1000).toFixed(2)}s`
    })
    
    // Upload result to server
    if (data.bestFrameImage) {
      uploadToServer({
        image: data.bestFrameImage,
        quality: data.bestQualityScore,
        timestamp: new Date()
      })
    }
  } else {
    console.log('❌ Verification failed, please retry')
  }
})
```

---

### ⚠️ detector-error

**Error occurred during detection process**

```
interface DetectorErrorEventData {
  code: ErrorCode  // Error code
  message: string  // Error message
}

enum ErrorCode {
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED',
  SUSPECTED_FRAUDS_DETECTED = 'SUSPECTED_FRAUDS_DETECTED'
}
```

**Example:**
```
engine.on('detector-error', (error) => {
  const errorMessages: Record<string, string> = {
    'DETECTOR_NOT_INITIALIZED': 'Engine not initialized',
    'CAMERA_ACCESS_DENIED': 'Camera access denied',
    'STREAM_ACQUISITION_FAILED': 'Failed to acquire camera data stream',
    'SUSPECTED_FRAUDS_DETECTED': 'Fraudulent activity detected'
  }
  
  console.error(`❌ Error [${error.code}]: ${errorMessages[error.code] || error.message}`)
  showUserErrorPrompt(errorMessages[error.code])
})
```

---

### 🐛 detector-debug

**Debug information for development and troubleshooting**

```
interface DetectorDebugEventData {
  level: 'info' | 'warn' | 'error'  // Log level
  stage: string                      // Processing stage
  message: string                    // Debug information
  details?: Record<string, any>      // Additional details
  timestamp: number                  // Unix timestamp
}
```

**Example:**
```
engine.on('detector-debug', (debug) => {
  const time = new Date(debug.timestamp).toLocaleTimeString()
  const prefix = `[${time}] [${debug.stage}]`
  
  if (debug.level === 'error') {
    console.error(`${prefix} ❌ ${debug.message}`, debug.details)
  } else {
    console.log(`${prefix} ℹ️ ${debug.message}`)
  }
})
```

---

## 📖 Type Definitions

### LivenessAction
```
enum LivenessAction {
  BLINK = 'blink',           // Blink
  MOUTH_OPEN = 'mouth_open', // Mouth open
  NOD_DOWN = 'nod_down',     // Nod down
  NOD_UP = 'nod_up'          // Nod up
}
```

### LivenessActionStatus
```
enum LivenessActionStatus {
  STARTED = 'started',      // Action prompt started
  COMPLETED = 'completed',  // Action recognized successfully
  TIMEOUT = 'timeout'       // Action recognition timeout
}
```

### DetectionCode
```
enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',                  // No face detected in video
  MULTIPLE_FACE = 'MULTIPLE_FACE',                  // Multiple faces detected
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',                // Face size smaller than minimum threshold
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',                // Face size larger than maximum threshold
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',            // Face angle not frontal enough
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',            // Image quality below minimum
  FACE_IMAGE_CAPTURED = 'FACE_IMAGE_CAPTURED'       // Face image captured
  FACE_NOT_MOVING = 'FACE_NOT_MOVING',              // Face not moving 
  PHOTO_ATTACK_DETECTED = 'PHOTO_ATTACK_DETECTED',  // Photo attack detected
}
```


### ErrorCode
```
enum ErrorCode {
  // Detector initialization failed
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',
  // Camera access denied
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',
  // Video stream acquisition failed
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED',
  // Internal error
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
```

---

## 🎓 Advanced Usage & Examples

### Complete Vue 3 Demo Project

For a comprehensive example and advanced usage patterns, please refer to the official demo project:

**[Vue Demo Project](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/)** includes:

- ✅ Complete Vue 3 + TypeScript integration
- ✅ Real-time detection result visualization
- ✅ Dynamic configuration panel
- ✅ Complete handling of all engine events
- ✅ Real-time debugging panel
- ✅ Responsive mobile + desktop UI
- ✅ Error handling and user feedback
- ✅ Result export and image capture

**Quick Start Demo:**

```
cd demos/vue-demo
npm install
npm run dev
```

Then open the displayed local URL in your browser.

---

## 📥 Local Deployment of Model Files

### Why Local Deployment?

- 🚀 **Performance Boost** - Avoid CDN latency
- 🔒 **Privacy Protection** - Fully offline operation
- 🌐 **Network Independence** - Not dependent on external connections

### Available Scripts

Two download scripts provided in project root:

#### 1️⃣ Copy Human.js Models

```
node copy-models.js
```

**Features:**
- Copy models from `node_modules/@vladmandic/human/models`
- Save to `public/models/` directory
- Includes `.json` and `.bin` model files
- Automatically displays file size and progress

#### 2️⃣ Download TensorFlow WASM Files

```
node download-wasm.js
```

**Features:**
- Automatically download TensorFlow.js WASM backend
- Save to `public/wasm/` directory
- Download 4 key files:
  - `tf-backend-wasm.min.js`
  - `tfjs-backend-wasm.wasm`
  - `tfjs-backend-wasm-simd.wasm`
  - `tfjs-backend-wasm-threaded-simd.wasm`
- **Smart Multi-CDN Sources** automatic fallback:
  1. unpkg.com (recommended)
  2. cdn.jsdelivr.net
  3. esm.sh
  4. cdn.esm.sh

### Configure Project to Use Local Files

After downloading, specify local paths during engine initialization:

```
const engine = new FaceDetectionEngine({
  // Use local files instead of CDN
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  
  // Other configurations...
})
```

### Automated Setup (Recommended)

Configure `postinstall` hook in `package.json` for automatic download:

```
{
  "scripts": {
    "postinstall": "node scripts/copy-models.js && node scripts/download-wasm.js"
  }
}
```

---

## 🌐 Browser Compatibility

| Browser | Version | Support | Notes |
|---------|---------|---------|-------|
| Chrome | 60+ | ✅ | Full Support |
| Firefox | 55+ | ✅ | Full Support |
| Safari | 11+ | ✅ | Full Support |
| Edge | 79+ | ✅ | Full Support |

**System Requirements:**

- 📱 Supports modern browsers with **WebRTC**
- 🔒 **HTTPS Environment** (localhost OK for development)
- ⚙️ **WebGL** or **WASM** backend support
- 📹 **User Authorization** - Requires camera permission

---

## 📄 License

[MIT License](./LICENSE) - Free to use and modify

## 🤝 Contributing

Issues and Pull Requests welcome!

---

<div align="center">

**[⬆ Back to Top](#face-liveness-detection-engine)**

Made with ❤️ by [sssxyd](https://github.com/sssxyd)

</div>