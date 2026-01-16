<div align="center">

> **Languages:** [English](#) · [中文](./README.md)

# Face Liveness Detection Engine

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
    <td>💯 <strong>Pure Frontend</strong><br/>Zero backend dependencies, all processing runs locally in browser</td>
    <td>🔬 <strong>Hybrid AI Solution</strong><br/>Deep integration of TensorFlow + OpenCV</td>
  </tr>
  <tr>
    <td>🧠 <strong>Dual Liveness Verification</strong><br/>Silent detection + Action recognition (blink, mouth open, nod)</td>
    <td>⚡ <strong>Event-Driven Architecture</strong><br/>100% TypeScript, seamlessly integrates with any framework</td>
  </tr>
  <tr>
    <td>🎯 <strong>Multi-Dimensional Analysis</strong><br/>Quality, frontality, motion score, screen detection</td>
    <td>🛡️ <strong>Multi-Layer Anti-Spoofing</strong><br/>Photo motion detection, screen temporal analysis, contour boundary detection</td>
  </tr>
</table>

---

## 🚀 Live Demo

<div align="center">

**[👉 Try Live Demo](https://face.lowtechsoft.com/) | Scan with phone for quick test**

[![Face Liveness Detection Demo QR Code](https://raw.githubusercontent.com/sssxyd/face-liveness-detector/main/demos/vue-demo/vue-demo.png)](https://face.lowtechsoft.com/)

</div>

---

## 🧬 Core Algorithm Design

| Detection Module | Technical Solution | Documentation |
|---------|--------|--------|
| **Face Recognition** | Human.js BlazeFace + FaceMesh | 468 facial landmarks + expression recognition |
| **Motion Liveness Detection** | 6-Indicator Voting System | [Motion Detection Algorithm](./docs/MOTION_DETECTION_ALGORITHM.md) - Optical flow, keypoint variance, eye/mouth movement, facial area changes |
| **Screen Capture Detection** | 4-Dimensional Temporal Analysis | [Screen Capture Detection Algorithm](./docs/SCREEN_CAPTURE_DETECTION_ALGORITHM.md) - Screen flicker, response time, DLP color wheel, optical distortion |
| **Screen Contour Detection** | Canny Edge + Contour Analysis | [Screen Contour Detection Algorithm](./docs/SCREEN_CORNERS_CONTOUR_DETECTION_ALGORITHM.md) - Single-frame rectangular boundary detection |

---

## 📦 Installation Guide

### Quick Install (3 packages)

```bash
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

> 📝 **Why three packages?**
> `@vladmandic/human` and `@techstark/opencv-js` are peer dependencies that need to be installed separately to avoid bundling large libraries, reducing final bundle size.

---

## ⚠️ Required Configuration Steps

### 1️⃣ Fix OpenCV.js ESM Compatibility

`@techstark/opencv-js` contains incompatible UMD format, **patch script must be applied**.

**References:**
- Issue details: [TechStark/opencv-js#44](https://github.com/TechStark/opencv-js/issues/44)
- Patch script: [patch-opencv.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/patch-opencv.js)

**Setup (Recommended):** Add to `package.json` postinstall hook

```json
{
  "scripts": {
    "postinstall": "node patch-opencv.cjs"
  }
}
```

### 2️⃣ Download Human.js Model Files

`@vladmandic/human` requires model files and TensorFlow WASM backend, **otherwise it won't load**.

**Download Scripts:**
- Model copy: [copy-models.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/copy-models.js)
- WASM download: [download-wasm.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/download-wasm.js)

**Setup (Recommended):** Configure as postinstall hook

```json
{
  "scripts": {
    "postinstall": "node scripts/copy-models.js && node scripts/download-wasm.js"
  }
}
```

---

## 🎯 Quick Start

### Basic Example

```typescript
import FaceDetectionEngine, { LivenessAction } from '@sssxyd/face-liveness-detector'

// Initialize engine
const engine = new FaceDetectionEngine({
  // Resource path configuration
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  tensorflow_backend: 'auto',
  
  // Detection settings
  detect_video_ideal_width: 1280,
  detect_video_ideal_height: 720,
  detect_video_mirror: true,
  detect_video_load_timeout: 5000,

  // Collection quality requirements
  collect_min_collect_count: 3,        // Collect at least 3 faces
  collect_min_face_ratio: 0.5,         // Face ratio 50%+
  collect_max_face_ratio: 0.9,         // Face ratio below 90%
  collect_min_face_frontal: 0.9,       // Face frontality 90%
  collect_min_image_quality: 0.5,      // Image quality 50%+

  // Liveness detection settings
  action_liveness_action_count: 1,     // Require 1 action
  action_liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  action_liveness_action_randomize: true,
  action_liveness_verify_timeout: 60000,
})

// Listen to core events
engine.on('detector-loaded', (data) => {
  if (data.success) {
    console.log('✅ Engine ready', {
      opencv: data.opencv_version,
      human: data.human_version
    })
  }
})

engine.on('detector-info', (data) => {
  // Real-time data per frame
  console.log({
    status: data.code,
    quality: (data.imageQuality * 100).toFixed(1) + '%',
    frontal: (data.faceFrontal * 100).toFixed(1) + '%',
    motion: (data.motionScore * 100).toFixed(1) + '%',
    screen: (data.screenConfidence * 100).toFixed(1) + '%'
  })
})

engine.on('detector-action', (data) => {
  // Action prompt
  console.log(`Please perform action: ${data.action} (${data.status})`)
})

engine.on('detector-finish', (data) => {
  // Detection completed
  if (data.success) {
    console.log('✅ Liveness verification passed!', {
      'Silent passed': data.silentPassedCount,
      'Actions completed': data.actionPassedCount,
      'Best quality': (data.bestQualityScore * 100).toFixed(1) + '%',
      'Total time': (data.totalTime / 1000).toFixed(2) + 's'
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
    // Initialize libraries
    await engine.initialize()
    
    // Get video element and start detection
    const videoEl = document.getElementById('video') as HTMLVideoElement
    await engine.startDetection(videoEl)
    
    // Detection runs automatically to completion or manual stop
    // engine.stopDetection(true)  // Stop and show best image
  } catch (error) {
    console.error('Detection start failed:', error)
  }
}

// Start when ready
startLivenessDetection()
```

---

## ⚙️ Detailed Configuration Reference

### Resource Path Configuration

| Option | Type | Description | Default |
|-----|------|------|--------|
| `human_model_path` | `string` | Human.js model files directory | `undefined` |
| `tensorflow_wasm_path` | `string` | TensorFlow WASM files directory | `undefined` |
| `tensorflow_backend` | `'auto' \| 'webgl' \| 'wasm'` | TensorFlow backend engine | `'auto'` |

### Debug Mode Configuration

| Option | Type | Description | Default |
|-----|------|------|--------|
| `debug_mode` | `boolean` | Enable debug mode | `false` |
| `debug_log_level` | `'info' \| 'warn' \| 'error'` | Debug log minimum level | `'info'` |
| `debug_log_stages` | `string[]` | Debug log stage filter (undefined=all) | `undefined` |
| `debug_log_throttle` | `number` | Debug log throttle interval (ms) | `100` |

### Video Detection Settings

| Option | Type | Description | Default |
|-----|------|------|--------|
| `detect_video_ideal_width` | `number` | Video width (pixels) | `1280` |
| `detect_video_ideal_height` | `number` | Video height (pixels) | `720` |
| `detect_video_mirror` | `boolean` | Horizontally flip video | `true` |
| `detect_video_load_timeout` | `number` | Load timeout (ms) | `5000` |

### Face Collection Quality Requirements

| Option | Type | Description | Default |
|-----|------|------|--------|
| `collect_min_collect_count` | `number` | Minimum collection count | `3` |
| `collect_min_face_ratio` | `number` | Minimum face ratio (0-1) | `0.5` |
| `collect_max_face_ratio` | `number` | Maximum face ratio (0-1) | `0.9` |
| `collect_min_face_frontal` | `number` | Minimum frontality (0-1) | `0.9` |
| `collect_min_image_quality` | `number` | Minimum image quality (0-1) | `0.5` |

### Face Frontality Parameters

| Option | Type | Description | Default |
|-----|------|------|--------|
| `yaw_threshold` | `number` | Yaw angle threshold (degrees) | `3` |
| `pitch_threshold` | `number` | Pitch angle threshold (degrees) | `4` |
| `roll_threshold` | `number` | Roll angle threshold (degrees) | `2` |

### Image Quality Parameters

| Option | Type | Description | Default |
|-----|------|------|--------|
| `require_full_face_in_bounds` | `boolean` | Face fully within bounds | `false` |
| `min_laplacian_variance` | `number` | Minimum blur detection value | `40` |
| `min_gradient_sharpness` | `number` | Minimum sharpness | `0.15` |
| `min_blur_score` | `number` | Minimum blur score | `0.6` |

### Liveness Detection Settings

| Option | Type | Description | Default |
|-----|------|------|--------|
| `action_liveness_action_list` | `LivenessAction[]` | Action list | `[BLINK, MOUTH_OPEN, NOD]` |
| `action_liveness_action_count` | `number` | Number of actions to complete | `1` |
| `action_liveness_action_randomize` | `boolean` | Randomize action order | `true` |
| `action_liveness_verify_timeout` | `number` | Timeout (ms) | `60000` |
| `action_liveness_min_mouth_open_percent` | `number` | Minimum mouth open ratio (0-1) | `0.2` |

### Motion Liveness Detection (Anti-Photo Attack)

| Option | Type | Description | Default |
|-----|------|------|--------|
| `motion_liveness_strict_photo_detection` | `boolean` | Strict photo detection mode | `false` |

> **Note**: Motion liveness detection uses built-in 6-indicator voting algorithm. Other parameters are internally optimized and require no manual configuration. See [Motion Detection Algorithm Documentation](./docs/MOTION_DETECTION_ALGORITHM.md).

> **Note**: Screen capture detection uses built-in 4-dimensional cascade algorithm (screen flicker, response time, DLP color wheel, optical distortion) and screen contour detection. All parameters are internally optimized and require no manual configuration. See [Screen Capture Detection Algorithm Documentation](./docs/SCREEN_CAPTURE_DETECTION_ALGORITHM.md) and [Screen Contour Detection Algorithm Documentation](./docs/SCREEN_CORNERS_CONTOUR_DETECTION_ALGORITHM.md).

---

## 🛠️ API Method Reference

### Core Methods

#### `initialize(): Promise<void>`
Load and initialize detection libraries. **Must be called before using other features.**

```typescript
await engine.initialize()
```

#### `startDetection(videoElement): Promise<void>`
Start face detection on video element.

```typescript
const videoEl = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(videoEl)
```

#### `stopDetection(success?: boolean): void`
Stop detection process.

```typescript
engine.stopDetection(true)  // true: show best detection image
```

#### `updateConfig(config): void`
Dynamically update configuration at runtime.

```typescript
engine.updateConfig({
  collect_min_face_ratio: 0.6,
  action_liveness_action_count: 0
})
```

#### `getOptions(): FaceDetectionEngineOptions`
Get current configuration object.

```typescript
const config = engine.getOptions()
```

#### `getEngineState(): EngineState`
Get current engine state.

```typescript
const state = engine.getEngineState()
```

---

## 📡 Event System

The engine uses **TypeScript event emitter pattern**, all events are type-safe.

### Event List

<table>
<tr>
<td><strong>detector-loaded</strong></td>
<td>Engine initialization completed</td>
</tr>
<tr>
<td><strong>detector-info</strong></td>
<td>Real-time detection data per frame</td>
</tr>
<tr>
<td><strong>detector-action</strong></td>
<td>Action liveness prompt and status</td>
</tr>
<tr>
<td><strong>detector-finish</strong></td>
<td>Detection completed (success/failure)</td>
</tr>
<tr>
<td><strong>detector-error</strong></td>
<td>Triggered when error occurs</td>
</tr>
<tr>
<td><strong>detector-debug</strong></td>
<td>Debug information (for development)</td>
</tr>
</table>

---

### 📋 detector-loaded

**Triggered when engine initialization completes**

```typescript
interface DetectorLoadedEventData {
  success: boolean        // Whether initialization succeeded
  error?: string          // Error message (on failure)
  opencv_version?: string // OpenCV.js version
  human_version?: string  // Human.js version
}
```

**Example:**
```typescript
engine.on('detector-loaded', (data) => {
  if (data.success) {
    console.log('✅ Engine ready')
    console.log(`OpenCV ${data.opencv_version} | Human.js ${data.human_version}`)
  } else {
    console.error('❌ Initialization failed:', data.error)
  }
})
```

---

### 📊 detector-info

**Returns real-time detection data per frame (high frequency event)**

```typescript
interface DetectorInfoEventData {
  passed: boolean         // Whether silent detection passed
  code: DetectionCode     // Detection status code
  message: string         // Status message
  faceCount: number       // Number of faces detected
  faceRatio: number       // Face ratio (0-1)
  faceFrontal: number     // Face frontality (0-1)
  imageQuality: number    // Image quality score (0-1)
  motionScore: number     // Motion score (0-1)
  keypointVariance: number // Keypoint variance (0-1)
  motionType: string      // Detected motion type
  screenConfidence: number // Screen capture confidence (0-1)
}
```

**Detection Status Codes:**
```typescript
enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',           // No face detected
  MULTIPLE_FACE = 'MULTIPLE_FACE',           // Multiple faces detected
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',         // Face too small
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',         // Face too large
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',     // Face not frontal enough
  FACE_NOT_REAL = 'FACE_NOT_REAL',           // Suspected spoofing
  FACE_NOT_LIVE = 'FACE_NOT_LIVE',           // Liveness score too low
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',     // Image quality too low
  FACE_CHECK_PASS = 'FACE_CHECK_PASS'        // All checks passed ✅
}
```

**Example:**
```typescript
engine.on('detector-info', (data) => {
  console.log({
    'Detection status': data.code,
    'Silent passed': data.passed ? '✅' : '❌',
    'Image quality': `${(data.imageQuality * 100).toFixed(1)}%`,
    'Face frontality': `${(data.faceFrontal * 100).toFixed(1)}%`,
    'Motion score': `${(data.motionScore * 100).toFixed(1)}%`,
    'Screen capture': `${(data.screenConfidence * 100).toFixed(1)}%`
  })
})
```

---

### 👤 detector-action

**Action liveness prompt and recognition status**

```typescript
interface DetectorActionEventData {
  action: LivenessAction          // Action to perform
  status: LivenessActionStatus    // Action status
}

enum LivenessAction {
  BLINK = 'blink',           // Blink
  MOUTH_OPEN = 'mouth_open', // Open mouth
  NOD = 'nod'                // Nod
}

enum LivenessActionStatus {
  STARTED = 'started',      // Prompt started
  COMPLETED = 'completed',  // Successfully recognized
  TIMEOUT = 'timeout'       // Recognition timeout
}
```

**Example:**
```typescript
engine.on('detector-action', (data) => {
  const actionLabels = {
    'blink': 'Blink',
    'mouth_open': 'Open Mouth',
    'nod': 'Nod'
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

**Detection process completed (success or failure)**

```typescript
interface DetectorFinishEventData {
  success: boolean         // Whether verification passed
  silentPassedCount: number    // Silent detection pass count
  actionPassedCount: number    // Actions completed count
  totalTime: number        // Total time elapsed (milliseconds)
  bestQualityScore: number // Best image quality (0-1)
  bestFrameImage: string | null  // Base64 frame image
  bestFaceImage: string | null   // Base64 face image
}
```

**Example:**
```typescript
engine.on('detector-finish', (data) => {
  if (data.success) {
    console.log('🎉 Liveness verification successful!', {
      'Silent passed': `${data.silentPassedCount} times`,
      'Actions completed': `${data.actionPassedCount} times`,
      'Best quality': `${(data.bestQualityScore * 100).toFixed(1)}%`,
      'Total time': `${(data.totalTime / 1000).toFixed(2)}s`
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

**Error occurred during detection**

```typescript
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
```typescript
engine.on('detector-error', (error) => {
  const errorMessages: Record<string, string> = {
    'DETECTOR_NOT_INITIALIZED': 'Engine not initialized',
    'CAMERA_ACCESS_DENIED': 'Camera permission denied',
    'STREAM_ACQUISITION_FAILED': 'Failed to acquire camera stream',
    'SUSPECTED_FRAUDS_DETECTED': 'Spoofing detected'
  }
  
  console.error(`❌ Error [${error.code}]: ${errorMessages[error.code] || error.message}`)
  showUserErrorPrompt(errorMessages[error.code])
})
```

---

### 🐛 detector-debug

**Debug information for development and troubleshooting**

```typescript
interface DetectorDebugEventData {
  level: 'info' | 'warn' | 'error'  // Log level
  stage: string                      // Processing stage
  message: string                    // Debug message
  details?: Record<string, any>      // Additional details
  timestamp: number                  // Unix timestamp
}
```

**Example:**
```typescript
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
```typescript
enum LivenessAction {
  BLINK = 'blink',           // Blink
  MOUTH_OPEN = 'mouth_open', // Open mouth
  NOD = 'nod'                // Nod
}
```

### LivenessActionStatus
```typescript
enum LivenessActionStatus {
  STARTED = 'started',      // Action prompt started
  COMPLETED = 'completed',  // Action successfully recognized
  TIMEOUT = 'timeout'       // Action recognition timeout
}
```

### DetectionCode
```typescript
enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',           // No face detected in video
  MULTIPLE_FACE = 'MULTIPLE_FACE',           // Multiple faces detected
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',         // Face size below minimum threshold
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',         // Face size above maximum threshold
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',     // Face angle not frontal enough
  FACE_NOT_REAL = 'FACE_NOT_REAL',           // Suspected spoofing detected
  FACE_NOT_LIVE = 'FACE_NOT_LIVE',           // Liveness score below threshold
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',     // Image quality below minimum
  FACE_CHECK_PASS = 'FACE_CHECK_PASS'        // All detection checks passed ✅
}
```

### ErrorCode
```typescript
enum ErrorCode {
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',  // Engine not initialized
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',          // Camera permission denied
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED', // Failed to acquire video stream
  SUSPECTED_FRAUDS_DETECTED = 'SUSPECTED_FRAUDS_DETECTED'  // Spoofing/fraud detected
}
```

---

## 🎓 Advanced Usage & Examples

### Complete Vue 3 Demo Project

For comprehensive examples and advanced usage patterns, refer to the official demo project:

**[Vue Demo Project](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/)** includes:

- ✅ Complete Vue 3 + TypeScript integration
- ✅ Real-time detection result visualization
- ✅ Dynamic configuration panel
- ✅ Complete handling of all engine events
- ✅ Real-time debug panel
- ✅ Responsive mobile + desktop UI
- ✅ Error handling and user feedback
- ✅ Result export and image capture

**Quick Start Demo:**

```bash
cd demos/vue-demo
npm install
npm run dev
```

Then open the displayed local URL in your browser.

---

## 📥 Local Deployment of Model Files

### Why Local Deployment?

- 🚀 **Improved Performance** - Avoid CDN delays
- 🔒 **Privacy Protection** - Fully offline operation
- 🌐 **Network Independence** - No external connection dependencies

### Available Scripts

Two download scripts are provided in the project root:

#### 1️⃣ Copy Human.js Models

```bash
node copy-models.js
```

**Features:**
- Copy models from `node_modules/@vladmandic/human/models`
- Save to `public/models/` directory
- Includes `.json` and `.bin` model files
- Automatically shows file sizes and progress

#### 2️⃣ Download TensorFlow WASM Files

```bash
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
- **Smart Multi-CDN Sources** with automatic fallback:
  1. unpkg.com (recommended)
  2. cdn.jsdelivr.net
  3. esm.sh
  4. cdn.esm.sh

### Configure Project to Use Local Files

After downloading, specify local paths when initializing the engine:

```typescript
const engine = new FaceDetectionEngine({
  // Use local files instead of CDN
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  
  // Other configurations...
})
```

### Automated Setup (Recommended)

Configure `postinstall` hook in `package.json` for automatic download:

```json
{
  "scripts": {
    "postinstall": "node scripts/copy-models.js && node scripts/download-wasm.js"
  }
}
```

---

## 🌐 Browser Compatibility

| Browser | Version | Support | Notes |
|--------|------|------|------|
| Chrome | 60+ | ✅ | Fully supported |
| Firefox | 55+ | ✅ | Fully supported |
| Safari | 11+ | ✅ | Fully supported |
| Edge | 79+ | ✅ | Fully supported |

**System Requirements:**

- 📱 Modern browsers with **WebRTC** support
- 🔒 **HTTPS environment** (localhost allowed for development)
- ⚙️ **WebGL** or **WASM** backend support
- 📹 **User authorization** - Camera permission required

---

## 📄 License

[MIT License](./LICENSE) - Free to use and modify

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

<div align="center">

**[⬆ Back to Top](#face-liveness-detection-engine)**

Made with ❤️ by [sssxyd](https://github.com/sssxyd)

</div>
