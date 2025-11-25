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
npm install @face-liveness/detection-engine @vladmandic/human @techstark/opencv-js
```

## Quick Start

```typescript
import FaceDetectionEngine from '@face-liveness/detection-engine'

// Initialize engine
const engine = new FaceDetectionEngine({
  min_face_ratio: 0.5,
  max_face_ratio: 0.9,
  liveness_action_count: 1,
  liveness_action_list: ['blink']  // or 'mouth_open', 'nod'
})

// Listen for events
engine.on('detector-loaded', () => {
  console.log('Engine is ready')
})

engine.on('liveness-detected', (data) => {
  console.log('Frame detected:', data)
})

engine.on('liveness-completed', (data) => {
  console.log('Liveness verification complete:', {
    qualityScore: data.qualityScore,
    imageData: data.imageData,
    liveness: data.liveness
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
const canvasElement = document.getElementById('canvas') as HTMLCanvasElement

await engine.startDetection(videoElement, canvasElement)

// Stop detection
engine.stopDetection()
```

## Configuration

### FaceDetectionEngineConfig

```typescript
interface FaceDetectionEngineConfig {
  // Detection Settings
  camera_max_size?: number                    // Max camera resolution (default: 640)
  video_load_timeout?: number                 // Video load timeout in ms (default: 5000)
  detection_frame_delay?: number              // Delay between frames in ms (default: 100)
  detection_idle_timeout?: number             // Idle timeout in ms (default: 60000)

  // Collection Settings
  silent_detect_count?: number                // Number of silent detections (default: 3)
  min_face_ratio?: number                     // Min face size ratio (default: 0.5)
  max_face_ratio?: number                     // Max face size ratio (default: 0.9)
  min_face_frontal?: number                   // Min face frontality (default: 0.9)
  min_image_quality?: number                  // Min image quality (default: 0.8)
  min_live_score?: number                     // Min liveness score (default: 0.5)
  min_real_score?: number                     // Min anti-spoofing score (default: 0.85)

  // Liveness Settings
  show_action_prompt?: boolean                // Show action prompt (default: true)
  liveness_action_timeout?: number            // Action timeout in seconds (default: 60)
  liveness_action_list?: LivenessAction[]     // Actions to detect
  liveness_action_count?: number              // Number of actions required
  liveness_action_desc?: Record<string, string>  // Action descriptions

  // Status Settings
  show_status_prompt?: boolean                // Show status prompts (default: true)
  status_prompt_duration?: number             // Prompt duration in ms

  // Border Colors
  show_border_color?: boolean                 // Show border colors (default: true)
  border_color_idle?: string                  // Color for idle state
  border_color_success?: string               // Color for success
  border_color_error?: string                 // Color for error
}
```

## API Reference

### Methods

#### `initialize(): Promise<void>`
Load and initialize detection libraries. Must be called before using detection.

```typescript
await engine.initialize()
```

#### `startDetection(videoElement, canvasElement?): Promise<void>`
Start face detection on a video element.

```typescript
await engine.startDetection(videoElement, canvasElement)
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

#### `liveness-detected`
A valid face frame has been detected during collection phase.

```typescript
engine.on('liveness-detected', (data: LivenessDetectedData) => {
  console.log(`Quality: ${data.quality}, Frontal: ${data.frontal}`)
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

#### `liveness-completed`
Liveness detection completed successfully.

```typescript
engine.on('liveness-completed', (data: LivenessCompletedData) => {
  console.log('Liveness verified:', {
    qualityScore: data.qualityScore,
    liveness: data.liveness,
    imageData: data.imageData
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

### Custom Configuration

```typescript
const engine = new FaceDetectionEngine({
  // Require higher quality
  min_face_ratio: 0.6,
  max_face_ratio: 0.85,
  min_face_frontal: 0.95,
  min_image_quality: 0.9,
  
  // Multiple actions
  liveness_action_count: 3,
  liveness_action_list: ['blink', 'mouth_open', 'nod'],
  liveness_action_timeout: 120,  // 2 minutes per action
  
  // Custom labels
  liveness_action_desc: {
    blink: 'Please blink your eyes',
    mouth_open: 'Open your mouth',
    nod: 'Move your head'
  }
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
   engine.updateConfig({ camera_max_size: 480 })
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
- Reduce `camera_max_size`
- Disable `show_action_prompt` if not needed

## License

MIT

## Support

For issues and questions, please visit: https://github.com/sssxyd/face-liveness-detector/issues
