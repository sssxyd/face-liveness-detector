# Face Detection Engine

A framework-agnostic, TypeScript-based npm package for face liveness detection. This engine provides core face detection, liveness verification, and anti-spoofing capabilities without any UI framework dependencies.

## Features

- 🎯 **Framework Agnostic** - Works with any JavaScript framework or vanilla JS
- 🧠 **Intelligent Liveness Detection** - Action-based and silent liveness detection modes
- 🔍 **Face Quality Checks** - Comprehensive image quality and face frontality analysis
- 🚀 **High Performance** - Optimized detection loop with RequestAnimationFrame
- 📱 **Mobile Friendly** - Built-in mobile device adaptation
- ♿ **Event-Driven Architecture** - Easy integration with TypeScript/JavaScript applications
- 🛡️ **Anti-Spoofing** - Real-time anti-spoofing detection
- 📊 **Detailed Debugging** - Rich debug information for troubleshooting

## Installation

```bash
npm install @sssxyd/face-liveness-detector
```

## Quick Start - Using Local Model Files (Recommended)

To improve performance and reduce external dependencies, you can download and use local copies of model files:

### Step 1: Download Model Files

```bash
# Copy Human.js models locally
node copy-human-models.js

# Download TensorFlow.js WASM files
node download-tensorflow-wasm.js
```

This will create:
- `public/models/` - Human.js face detection models
- `public/wasm/` - TensorFlow.js WASM backend files

### Step 2: Initialize Engine with Local Files

```typescript
import FaceDetectionEngine from '@sssxyd/face-liveness-detector'

// Configure to use local model files
const engine = new FaceDetectionEngine({
  human_model_path: '/models',      // Path to downloaded models
  tensorflow_wasm_path: '/wasm',    // Path to WASM files
  min_face_ratio: 0.5,
  max_face_ratio: 0.9,
  liveness_action_count: 1,
  liveness_action_list: ['blink']
})

// Initialize and start detection
await engine.initialize()
const videoElement = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(videoElement)
```

### Step 3: Serve Static Files

Make sure your web server serves the `public/` directory:

```typescript
// Express.js example
app.use(express.static('public'))
```

## Quick Start - Using Default CDN Files

If you prefer not to host local files, the engine will automatically use CDN sources:

```typescript
import FaceDetectionEngine from '@sssxyd/face-liveness-detector'

// No need to specify paths - uses CDN by default
const engine = new FaceDetectionEngine({
  min_face_ratio: 0.5,
  max_face_ratio: 0.9,
  liveness_action_count: 1,
  liveness_action_list: ['blink']
})

await engine.initialize()
const videoElement = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(videoElement)
```

## Configuration

### FaceDetectionEngineConfig

```typescript
interface FaceDetectionEngineConfig {
  // ========== Resource Paths ==========
  human_model_path?: string        // Path to human.js models (default: undefined)
  tensorflow_wasm_path?: string    // Path to TensorFlow WASM files (default: undefined)

  // ========== Detection Settings ==========
  video_width?: number             // Width of the video stream (default: 640)
  video_height?: number            // Height of the video stream (default: 640)
  video_mirror?: boolean           // Mirror video horizontally (default: true)
  video_load_timeout?: number      // Timeout for loading video stream in ms (default: 5000)
  detection_frame_delay?: number   // Delay between detection frames in ms (default: 100)
  error_retry_delay?: number       // Delay before retrying after an error in ms (default: 200)

  // ========== Collection Settings ==========
  silent_detect_count?: number     // Number of silent detections to collect (default: 3)
  min_face_ratio?: number          // Minimum face size ratio (default: 0.5)
  max_face_ratio?: number          // Maximum face size ratio (default: 0.9)
  min_face_frontal?: number        // Minimum face frontality (default: 0.9)
  min_image_quality?: number       // Minimum image quality (default: 0.8)
  min_live_score?: number          // Minimum live score (default: 0.5)
  min_real_score?: number          // Minimum anti-spoofing score (default: 0.85)
  suspected_frauds_count?: number  // Number of suspected frauds to detect (default: 3)
  face_frontal_features?: {        // Face frontal features
    yaw_threshold: number          // Yaw angle threshold in degrees (default: 3)
    pitch_threshold: number        // Pitch angle threshold in degrees (default: 4)
    roll_threshold: number         // Roll angle threshold in degrees (default: 2)
  }
  image_quality_features?: {       // Image quality features
    require_full_face_in_bounds: boolean    // Require face completely within bounds (default: true)
    use_opencv_enhancement: boolean         // Use OpenCV enhancement for quality detection (default: true)
    min_laplacian_variance: number          // Minimum Laplacian variance for blur detection (default: 100)
    min_gradient_sharpness: number          // Minimum gradient sharpness for blur detection (default: 0.3)
    min_blur_score: number                  // Minimum blur score for blur detection (default: 0.6)
  }

  // ========== Liveness Settings ==========
  liveness_action_list?: LivenessAction[]  // List of liveness actions to detect (default: [BLINK, MOUTH_OPEN, NOD])
  liveness_action_count?: number           // Number of liveness actions to perform (default: 1)
  liveness_action_randomize?: boolean      // Whether to randomize liveness actions (default: true)
  liveness_verify_timeout?: number         // Timeout for liveness verification in ms (default: 60000)
  min_mouth_open_percent?: number          // Minimum mouth open percentage for detection (default: 0.2)
}
```

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

The engine uses a TypeScript event emitter pattern:

#### `detector-loaded`
Engine has finished initialization.

```typescript
engine.on('detector-loaded', () => {
  console.log('Ready to start detection')
})
```

#### `face-detected`
A face frame has been detected with silent liveness scores.

```typescript
engine.on('face-detected', (data) => {
  console.log(`Quality: ${data.quality}, Frontal: ${data.frontal}`)  
  console.log(`Real: ${data.real}, Live: ${data.live}`)
})
```

#### `status-prompt`
Status update prompt.

```typescript
engine.on('status-prompt', (data: StatusPromptData) => {
  console.log(`Code: ${data.code}, Message: ${data.message}`)
})
```

#### `action-prompt`
Action liveness request.

```typescript
engine.on('action-prompt', (data: ActionPromptData) => {
  console.log(`Action: ${data.action}, Status: ${data.status}`)
})
```

#### `detector-finish`
Liveness detection completed (successfully or not).

```typescript
engine.on('detector-finish', (data) => {
  console.log('Detection finished:', {
    success: data.success,
    bestQuality: data.bestQualityScore,
    silentPassed: data.silentPassedCount,
    actionsPassed: data.actionPassedCount,
    frameImage: data.bestFrameImage,
    faceImage: data.bestFaceImage
  })
})
```

#### `detector-error`
An error occurred during detection.

```typescript
engine.on('detector-error', (error: ErrorData) => {
  console.error(`Error [${error.code}]: ${error.message}`)
})
```

#### `detector-debug`
Debug information (useful for development).

```typescript
engine.on('detector-debug', (debug: DebugData) => {
  console.log(`[${debug.level}] ${debug.stage}: ${debug.message}`)
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

### PromptCode
```typescript
enum PromptCode {
  NO_FACE = 'NO_FACE',
  MULTIPLE_FACE = 'MULTIPLE_FACE',
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',
  BLURRY_IMAGE = 'BLURRY_IMAGE',
  LOW_QUALITY = 'LOW_QUALITY',
  FRAME_DETECTED = 'FRAME_DETECTED'
}
```

### ErrorCode
```typescript
enum ErrorCode {
  ENGINE_NOT_INITIALIZED = 'ENGINE_NOT_INITIALIZED',
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED',
  DETECTION_ERROR = 'DETECTION_ERROR',
  // ... more error codes
}
```

## Advanced Usage

### Complete Integration Example with Events

```typescript
import FaceDetectionEngine from '@sssxyd/face-liveness-detector'

const engine = new FaceDetectionEngine({
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  min_face_ratio: 0.5,
  max_face_ratio: 0.9,
  liveness_action_count: 1,
  liveness_action_list: ['blink']
})

// Listen for events
engine.on('detector-loaded', () => {
  console.log('Engine is ready')
})

engine.on('face-detected', (data) => {
  console.log('Frame detected:', data)
})

engine.on('detector-finish', (data) => {
  console.log('Liveness verification complete:', {
    success: data.success,
    qualityScore: data.bestQualityScore,
    frameImage: data.bestFrameImage,
    faceImage: data.bestFaceImage
  })
})

engine.on('detector-error', (error) => {
  console.error('Detection error:', error.message)
})

engine.on('detector-debug', (debug) => {
  console.log(`[${debug.stage}] ${debug.message}`, debug.details)
})

// Initialize
await engine.initialize()

// Start detection with video element
const videoElement = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(videoElement)

// Stop detection
engine.stopDetection()
```

### Advanced Usage

### Custom Configuration with Local Models

```typescript
const engine = new FaceDetectionEngine({
  // Use local model files
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  
  // Require higher quality
  min_face_ratio: 0.6,
  max_face_ratio: 0.85,
  min_face_frontal: 0.95,
  min_image_quality: 0.9,
  
  // Multiple actions
  liveness_action_count: 3,
  liveness_action_list: ['blink', 'mouth_open', 'nod'],
  liveness_verify_timeout: 120000,  // 2 minutes
})
```

### Dynamic Configuration Updates

```typescript
engine.on('status-prompt', (data) => {
  if (data.code === PromptCode.FACE_TOO_SMALL) {
    // Make requirements more lenient if faces are small
    engine.updateConfig({ min_face_ratio: 0.4 })
  }
})
```

### Exporting Results

```typescript
let resultImage = null
let resultData = null

engine.on('liveness-completed', (data) => {
  resultImage = data.imageData  // Base64 encoded image
  resultData = {
    quality: data.qualityScore,
    liveness: data.liveness,
    timestamp: new Date()
  }
  
  // Send to server
  await fetch('/api/verify-liveness', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: resultImage,
      metadata: resultData
    })
  })
})
```

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
