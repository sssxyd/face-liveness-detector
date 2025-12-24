<div align="center">

> **Languages / 语言:** [English](#) · [中文](./README.md)

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
    <td>💯 <strong>Pure Frontend</strong><br/>Zero backend dependency, all processing runs locally in the browser</td>
    <td>🔬 <strong>Hybrid AI Solution</strong><br/>Deep fusion of TensorFlow + OpenCV</td>
  </tr>
  <tr>
    <td>🧠 <strong>Dual Liveness Verification</strong><br/>Silent detection + action recognition (blink, mouth open, nod)</td>
    <td>⚡ <strong>Event-Driven Architecture</strong><br/>100% TypeScript, seamless integration with any framework</td>
  </tr>
  <tr>
    <td>🎯 <strong>Multi-Dimensional Analysis</strong><br/>Quality, face frontalness, motion score, screen detection</td>
    <td>🛡️ <strong>Multi-Dimensional Anti-Spoofing</strong><br/>Photo, screen video, moire pattern, RGB emission detection</td>
  </tr>
</table>

---

## 🚀 Online Demo

<div align="center">

**[👉 Live Demo](https://face.lowtechsoft.com/) | Scan QR code for quick testing**

[![Face Liveness Detection Demo QR Code](https://raw.githubusercontent.com/sssxyd/face-liveness-detector/main/demos/vue-demo/vue-demo.png)](https://face.lowtechsoft.com/)

</div>

---

## 🧬 Core Algorithm Design

| Detection Module | Technology | Documentation |
|---------|--------|--------|
| **Face Recognition** | Human.js BlazeFace + FaceMesh | 468 facial feature points + expression recognition |
| **Motion Detection** | Multi-dimensional motion analysis | [Motion Detection Algorithm](./docs/MOTION_DETECTION_ALGORITHM.md) - optical flow, keypoint variance, facial region changes |
| **Screen Detection** | Three-dimensional feature fusion | [Screen Capture Detection](./docs/SCREEN_CAPTURE_DETECTION_ALGORITHM.md) - moire patterns, RGB emission, color features |

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
> `@vladmandic/human` and `@techstark/opencv-js` are peer dependencies that must be installed separately to avoid bundling large libraries and reduce the final bundle size.

---

## ⚠️ Required Configuration Steps

### 1️⃣ Fix OpenCV.js ESM Compatibility Issue

`@techstark/opencv-js` contains an incompatible UMD format that **must be patched**.

**Reference:**
- Issue: [TechStark/opencv-js#44](https://github.com/TechStark/opencv-js/issues/44)
- Patch script: [patch-opencv.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/patch-opencv.js)

**Setup Method (Recommended):** Add to `package.json` as `postinstall` hook

```json
{
  "scripts": {
    "postinstall": "node patch-opencv.cjs"
  }
}
```

### 2️⃣ Download Human.js Model Files

`@vladmandic/human` requires model files and TensorFlow WASM backend, **otherwise it will not load**.

**Download Scripts:**
- Model copy: [copy-models.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/copy-models.js)
- WASM download: [download-wasm.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/download-wasm.js)

**Setup Method (Recommended):** Configure as `postinstall` hook

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
  
  // Detection settings (recommend ≥720p, otherwise screen detection accuracy decreases)
  detect_video_ideal_width: 1920,
  detect_video_ideal_height: 1080,
  detect_video_mirror: true,
  detect_video_load_timeout: 5000,
  detect_frame_delay: 100,

  // Collection quality requirements
  collect_min_collect_count: 3,        // Minimum 3 face images collected
  collect_min_face_ratio: 0.5,         // Face occupies 50%+
  collect_max_face_ratio: 0.9,         // Face occupies <90%
  collect_min_face_frontal: 0.9,       // Face frontalness 90%
  collect_min_image_quality: 0.5,      // Image quality 50%+

  // Liveness detection settings
  action_liveness_action_count: 1,     // Requires 1 action
  action_liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  action_liveness_action_randomize: true,
  action_liveness_verify_timeout: 60000,

  // Anti-spoofing settings
  motion_liveness_min_motion_score: 0.15,
  motion_liveness_strict_photo_detection: false,
  screen_capture_confidence_threshold: 0.7,
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
  // Real-time per-frame data
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
  // Detection complete
  if (data.success) {
    console.log('✅ Liveness verification passed!', {
      silentPassed: data.silentPassedCount,
      actionsCompleted: data.actionPassedCount,
      bestQuality: (data.bestQualityScore * 100).toFixed(1) + '%',
      totalTime: (data.totalTime / 1000).toFixed(2) + 's'
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
    
    // Detection runs automatically until complete or manually stopped
    // engine.stopDetection(true)  // Stop and show best image
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
|-----|------|------|--------|
| `human_model_path` | `string` | Human.js model files directory | `undefined` |
| `tensorflow_wasm_path` | `string` | TensorFlow WASM files directory | `undefined` |
| `tensorflow_backend` | `'auto' \| 'webgl' \| 'wasm'` | TensorFlow backend engine | `'auto'` |

### Video Detection Settings

| Option | Type | Description | Default |
|-----|------|------|--------|
| `detect_video_ideal_width` | `number` | Video width (pixels) | `1920` |
| `detect_video_ideal_height` | `number` | Video height (pixels) | `1080` |
| `detect_video_mirror` | `boolean` | Horizontal flip video | `true` |
| `detect_video_load_timeout` | `number` | Load timeout (ms) | `5000` |
| `detect_frame_delay` | `number` | Frame delay (ms) | `100` |
| `detect_error_retry_delay` | `number` | Error retry delay (ms) | `200` |

### Face Collection Quality Requirements

| Option | Type | Description | Default |
|-----|------|------|--------|
| `collect_min_collect_count` | `number` | Minimum collection count | `3` |
| `collect_min_face_ratio` | `number` | Minimum face ratio (0-1) | `0.5` |
| `collect_max_face_ratio` | `number` | Maximum face ratio (0-1) | `0.9` |
| `collect_min_face_frontal` | `number` | Minimum frontalness (0-1) | `0.9` |
| `collect_min_image_quality` | `number` | Minimum image quality (0-1) | `0.5` |

### Face Frontalness Parameters

| Option | Type | Description | Default |
|-----|------|------|--------|
| `yaw_threshold` | `number` | Yaw angle threshold (degrees) | `3` |
| `pitch_threshold` | `number` | Pitch angle threshold (degrees) | `4` |
| `roll_threshold` | `number` | Roll angle threshold (degrees) | `2` |

### Image Quality Parameters

| Option | Type | Description | Default |
|-----|------|------|--------|
| `require_full_face_in_bounds` | `boolean` | Face fully in bounds | `false` |
| `min_laplacian_variance` | `number` | Minimum blur detection value | `40` |
| `min_gradient_sharpness` | `number` | Minimum sharpness | `0.15` |
| `min_blur_score` | `number` | Minimum blur score | `0.6` |

### Liveness Detection Settings

| Option | Type | Description | Default |
|-----|------|------|--------|
| `action_liveness_action_list` | `LivenessAction[]` | Action list | `[BLINK, MOUTH_OPEN, NOD]` |
| `action_liveness_action_count` | `number` | Actions to complete | `1` |
| `action_liveness_action_randomize` | `boolean` | Randomize action order | `true` |
| `action_liveness_verify_timeout` | `number` | Timeout (ms) | `60000` |
| `action_liveness_min_mouth_open_percent` | `number` | Minimum mouth open ratio (0-1) | `0.2` |

### Motion Liveness Detection (Anti-Photo Attack)

| Option | Type | Description | Default |
|-----|------|------|--------|
| `motion_liveness_min_motion_score` | `number` | Minimum motion score (0-1) | `0.15` |
| `motion_liveness_min_keypoint_variance` | `number` | Minimum keypoint variance (0-1) | `0.02` |
| `motion_liveness_frame_buffer_size` | `number` | Frame buffer size | `5` |
| `motion_liveness_eye_aspect_ratio_threshold` | `number` | Blink detection threshold | `0.15` |
| `motion_liveness_motion_consistency_threshold` | `number` | Consistency threshold (0-1) | `0.3` |
| `motion_liveness_min_optical_flow_threshold` | `number` | Minimum optical flow magnitude (0-1) | `0.02` |
| `motion_liveness_strict_photo_detection` | `boolean` | Strict photo detection mode | `false` |

### Screen Capture Detection

| Option | Type | Description | Default |
|-----|------|------|--------|
| `screen_capture_confidence_threshold` | `number` | Confidence threshold (0-1) | `0.7` |
| `screen_capture_detection_strategy` | `string` | Detection strategy | `'adaptive'` |
| `screen_moire_pattern_threshold` | `number` | Moire pattern threshold (0-1) | `0.65` |
| `screen_moire_pattern_enable_dct` | `boolean` | Enable DCT analysis | `true` |
| `screen_moire_pattern_enable_edge_detection` | `boolean` | Enable edge detection | `true` |

### Screen Color Features

| Option | Type | Description | Default |
|-----|------|------|--------|
| `screen_color_saturation_threshold` | `number` | Saturation threshold (%) | `40` |
| `screen_color_rgb_correlation_threshold` | `number` | RGB correlation threshold (0-1) | `0.75` |
| `screen_color_pixel_entropy_threshold` | `number` | Entropy threshold (0-8) | `6.5` |
| `screen_color_gradient_smoothness_threshold` | `number` | Smoothness threshold (0-1) | `0.7` |
| `screen_color_confidence_threshold` | `number` | Confidence threshold (0-1) | `0.65` |

### Screen RGB Emission Detection

| Option | Type | Description | Default |
|-----|------|------|--------|
| `screen_rgb_low_freq_start_percent` | `number` | Low frequency start (0-1) | `0.15` |
| `screen_rgb_low_freq_end_percent` | `number` | Low frequency end (0-1) | `0.35` |
| `screen_rgb_energy_score_weight` | `number` | Energy weight | `0.40` |
| `screen_rgb_asymmetry_score_weight` | `number` | Asymmetry weight | `0.40` |
| `screen_rgb_difference_factor_weight` | `number` | Difference weight | `0.20` |
| `screen_rgb_confidence_threshold` | `number` | Confidence threshold (0-1) | `0.65` |

---

## 🛠️ API Method Reference

### Core Methods

#### `initialize(): Promise<void>`
Load and initialize the detection library. **Must be called before using other functions.**

```typescript
await engine.initialize()
```

#### `startDetection(videoElement): Promise<void>`
Start face detection on a video element.

```typescript
const videoEl = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(videoEl)
```

#### `stopDetection(success?: boolean): void`
Stop the detection process.

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

The engine uses **TypeScript event emitter pattern** with full type safety.

### Event List

<table>
<tr>
<td><strong>detector-loaded</strong></td>
<td>Engine initialization complete</td>
</tr>
<tr>
<td><strong>detector-info</strong></td>
<td>Real-time per-frame detection data</td>
</tr>
<tr>
<td><strong>detector-action</strong></td>
<td>Action liveness prompt and status</td>
</tr>
<tr>
<td><strong>detector-finish</strong></td>
<td>Detection complete (success/failure)</td>
</tr>
<tr>
<td><strong>detector-error</strong></td>
<td>Error occurred</td>
</tr>
<tr>
<td><strong>detector-debug</strong></td>
<td>Debug information (development)</td>
</tr>
</table>

---

### 📋 detector-loaded

**Triggered when engine initialization completes**

```typescript
interface DetectorLoadedEventData {
  success: boolean        // Whether initialization succeeded
  error?: string          // Error message (if failed)
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

**Returns real-time detection data per frame (high-frequency event)**

```typescript
interface DetectorInfoEventData {
  passed: boolean         // Whether silent detection passed
  code: DetectionCode     // Detection status code
  message: string         // Status message
  faceCount: number       // Number of faces detected
  faceRatio: number       // Face ratio (0-1)
  faceFrontal: number     // Face frontalness (0-1)
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
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',           // No face detected in video
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
    status: data.code,
    silentPassed: data.passed ? '✅' : '❌',
    quality: `${(data.imageQuality * 100).toFixed(1)}%`,
    frontal: `${(data.faceFrontal * 100).toFixed(1)}%`,
    motion: `${(data.motionScore * 100).toFixed(1)}%`,
    screen: `${(data.screenConfidence * 100).toFixed(1)}%`
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
    'mouth_open': 'Open mouth',
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

**Detection process complete (success or failure)**

```typescript
interface DetectorFinishEventData {
  success: boolean         // Whether verification passed
  silentPassedCount: number    // Silent detection passes
  actionPassedCount: number    // Actions completed
  totalTime: number        // Total elapsed time (ms)
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
      silentPassed: `${data.silentPassedCount} times`,
      actionsCompleted: `${data.actionPassedCount} times`,
      bestQuality: `${(data.bestQualityScore * 100).toFixed(1)}%`,
      totalTime: `${(data.totalTime / 1000).toFixed(2)}s`
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
  STARTED = 'started',      // Prompt started
  COMPLETED = 'completed',  // Successfully recognized
  TIMEOUT = 'timeout'       // Recognition timeout
}
```

### DetectionCode
```typescript
enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',           // No face in video
  MULTIPLE_FACE = 'MULTIPLE_FACE',           // Multiple faces
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',         // Face below minimum size
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',         // Face above maximum size
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',     // Face angle not frontal
  FACE_NOT_REAL = 'FACE_NOT_REAL',           // Suspected spoofing
  FACE_NOT_LIVE = 'FACE_NOT_LIVE',           // Liveness score below threshold
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',     // Image quality below threshold
  FACE_CHECK_PASS = 'FACE_CHECK_PASS'        // All checks passed ✅
}
```

### ErrorCode
```typescript
enum ErrorCode {
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',  // Engine not initialized
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',          // Camera permission denied
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED', // Failed to get video stream
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
- ✅ Complete event handling examples
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

Then open the local URL shown in your browser.

---

## 📥 Deploying Model Files Locally

### Why Deploy Locally?

- 🚀 **Improve Performance** - Avoid CDN latency
- 🔒 **Privacy Protection** - Complete offline operation
- 🌐 **Network Independence** - No external dependencies

### Available Scripts

Two download scripts are provided in the project root:

#### 1️⃣ Copy Human.js Models

```bash
node copy-models.js
```

**Features:**
- Copy models from `node_modules/@vladmandic/human/models`
- Save to `public/models/` directory
- Include `.json` and `.bin` model files
- Automatically display file sizes and progress

#### 2️⃣ Download TensorFlow WASM Files

```bash
node download-wasm.js
```

**Features:**
- Automatically download TensorFlow.js WASM backend
- Save to `public/wasm/` directory
- Download 4 essential files:
  - `tf-backend-wasm.min.js`
  - `tfjs-backend-wasm.wasm`
  - `tfjs-backend-wasm-simd.wasm`
  - `tfjs-backend-wasm-threaded-simd.wasm`
- **Intelligent multi-CDN sources** with automatic fallback:
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
  
  // Other configuration...
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
|--------|---------|---------|-------|
| Chrome | 60+ | ✅ | Full support |
| Firefox | 55+ | ✅ | Full support |
| Safari | 11+ | ✅ | Full support |
| Edge | 79+ | ✅ | Full support |

**System Requirements:**

- 📱 Modern browser supporting **WebRTC**
- 🔒 **HTTPS environment** (localhost available for development)
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
