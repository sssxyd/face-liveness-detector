# Face Detection Engine - NPM Package

## Project Overview

This is a framework-agnostic, TypeScript-based npm package extracted from the Vue.js FaceDetector component. It provides core face liveness detection functionality without any UI framework dependencies.

## Package Structure

```
packages/face-detection-engine/
├── src/
│   ├── index.ts                 # Main FaceDetectionEngine class
│   ├── types.ts                 # TypeScript type definitions
│   ├── enums.ts                 # Enumerations (LivenessAction, PromptCode, etc.)
│   ├── config.ts                # Configuration management and defaults
│   ├── event-emitter.ts         # Generic event emitter implementation
│   ├── library-loader.ts        # Human.js and OpenCV.js loader
│   ├── face-frontal-checker.ts  # Face frontality detection
│   ├── image-quality-checker.ts # Image quality assessment
│   └── exports.ts               # Re-exports for public API
├── dist/                        # Compiled output (ESM + UMD)
├── types/                       # Generated TypeScript definitions
├── package.json                 # NPM package configuration
├── tsconfig.json                # TypeScript configuration
├── rollup.config.js             # Build configuration
├── README.md                    # Main documentation
├── INTEGRATION.md               # Framework integration examples
└── LICENSE                      # MIT License
```

## How It Works

### Core Components

#### 1. **FaceDetectionEngine** (Main Class)
- Orchestrates the entire detection process
- Manages library initialization (Human.js, OpenCV.js)
- Controls detection loop with requestAnimationFrame
- Emits events for different stages of detection

#### 2. **Event Emitter**
- Custom implementation of observer pattern
- Supports `on()`, `off()`, `once()`, `emit()` methods
- Fully typed with TypeScript
- Framework-agnostic

#### 3. **Configuration System**
- Flat configuration interface (all settings as individual properties)
- Deep merge with defaults
- Runtime configuration updates
- Fully typed with validation support

#### 4. **Detection Utilities**
- **Face Frontal Checker**: Uses gesture recognition, face angles
- **Image Quality Checker**: Evaluates sharpness, face completeness
- **Library Loader**: Handles async loading of Human.js and OpenCV.js

### Detection Flow

```
┌─────────────────────────────────┐
│  Initialize Engine              │
│  Load Libraries (Human + OpenCV)│
└──────────────┬──────────────────┘
               │
        emit: detector-loaded
               │
┌──────────────▼──────────────────┐
│  Start Detection                 │
│  Request Camera Permission       │
│  Setup Video Stream              │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│  Detection Loop (RAF)            │
│  Process Video Frames            │
└──────────────┬──────────────────┘
               │
       ┌───────┴────────┐
       │                │
   NO FACE          SINGLE FACE
   or               │
  MULTIPLE      ┌───┴──────────┬──────────────┐
   FACES        │              │              │
   │        Check        Check      Check
   │        Size         Quality     Frontal
   │        │            │          │
   │        └────┬────────┴──────────┘
   │             │
   │         COLLECT IMAGES
   │         (until count met)
   │
   │     ┌─────────────────────┐
   │     │ Action Liveness?    │
   └─────┤ - No  → Complete ✓  │
         │ - Yes → Prompt action│
         └─────────────────────┘

emit: status-prompt
emit: liveness-detected
emit: action-prompt
emit: liveness-completed ✓
emit: detector-error ✗
```

## Configuration Examples

### Minimal Configuration
```typescript
const engine = new FaceDetectionEngine()
```

### Standard Configuration
```typescript
const engine = new FaceDetectionEngine({
  min_face_ratio: 0.5,
  max_face_ratio: 0.9,
  min_face_frontal: 0.9,
  liveness_action_list: [LivenessAction.BLINK],
  liveness_action_count: 1
})
```

### Strict Configuration (High Security)
```typescript
const engine = new FaceDetectionEngine({
  min_face_ratio: 0.6,
  max_face_ratio: 0.85,
  min_face_frontal: 0.95,
  min_image_quality: 0.9,
  min_real_score: 0.95,
  min_live_score: 0.8,
  liveness_action_list: [
    LivenessAction.BLINK,
    LivenessAction.MOUTH_OPEN,
    LivenessAction.NOD
  ],
  liveness_action_count: 3,
  liveness_action_timeout: 180
})
```

### Lenient Configuration (High Usability)
```typescript
const engine = new FaceDetectionEngine({
  min_face_ratio: 0.4,
  max_face_ratio: 0.95,
  min_face_frontal: 0.8,
  min_image_quality: 0.6,
  min_real_score: 0.7,
  min_live_score: 0.3,
  liveness_action_count: 1,
  liveness_action_timeout: 120
})
```

## Build and Distribution

### Building the Package

```bash
# Install dependencies
npm install

# Build (ESM + UMD)
npm run build

# Watch mode
npm run dev

# Clean build artifacts
npm clean

# Type checking
npm run type-check
```

### Output Files

After building, the package contains:

```
dist/
├── index.esm.js         # ES Module version
├── index.esm.js.map     # Source map
├── index.js             # UMD version
├── index.js.map         # Source map
├── ... (other modules)

types/
└── *.d.ts              # TypeScript declarations
```

### Using the Package

#### As ES Module
```typescript
import FaceDetectionEngine from '@face-liveness/detection-engine'
```

#### As CommonJS
```javascript
const FaceDetectionEngine = require('@face-liveness/detection-engine')
```

#### In Browser (UMD)
```html
<script src="dist/index.js"></script>
<script>
  const engine = new FaceDetectionEngine.default()
</script>
```

## API Surface

### Main Class Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Load and initialize libraries |
| `startDetection(video, canvas?)` | Start face detection |
| `stopDetection(success?)` | Stop detection |
| `updateConfig(config)` | Update configuration |
| `getConfig()` | Get current config |
| `getStatus()` | Get engine status |

### Event System

| Event | Data | Description |
|-------|------|-------------|
| `detector-loaded` | void | Libraries loaded, engine ready |
| `status-prompt` | StatusPromptData | Status update |
| `liveness-detected` | LivenessDetectedData | Frame accepted |
| `action-prompt` | ActionPromptData | Action requested |
| `liveness-completed` | LivenessCompletedData | Detection complete ✓ |
| `detector-error` | ErrorData | Error occurred ✗ |
| `detector-debug` | DebugData | Debug information |

## Type Exports

All types are fully typed and exported:

```typescript
// Interfaces
export type {
  FaceDetectionEngineConfig,
  FaceFrontalFeatures,
  ImageQualityFeatures,
  StatusPromptData,
  ActionPromptData,
  LivenessDetectedData,
  LivenessCompletedData,
  ErrorData,
  DebugData,
  EventListener,
  EventMap
}

// Enums
export { 
  DetectionMode,
  LivenessAction,
  LivenessActionStatus,
  PromptCode,
  ErrorCode
}

// Classes
export { 
  FaceDetectionEngine,
  SimpleEventEmitter,
  ScoredList
}

// Config & Utilities
export { 
  CONFIG,
  DEFAULT_CONFIG,
  mergeConfig,
  PROMPT_CODE_DESCRIPTIONS,
  BORDER_COLOR_STATES,
  checkFaceFrontal,
  checkImageQuality,
  loadOpenCV,
  loadHuman,
  getCvSync
}
```

## Migration from Vue Component

### Before (Vue Component)
```vue
<template>
  <FaceDetector 
    :min_face_ratio="0.5"
    :liveness_action_count="1"
    @detector-loaded="onReady"
    @liveness-completed="onComplete"
  />
</template>

<script setup>
import FaceDetector from '@/components/facedetector/FaceDetector.vue'
</script>
```

### After (NPM Package)
```typescript
import FaceDetectionEngine from '@face-liveness/detection-engine'

const engine = new FaceDetectionEngine({
  min_face_ratio: 0.5,
  liveness_action_count: 1
})

engine.on('detector-loaded', onReady)
engine.on('liveness-completed', onComplete)

await engine.initialize()
await engine.startDetection(videoElement)
```

## Publishing to NPM

### Preparation

1. Update version in `package.json`
2. Update CHANGELOG
3. Commit changes: `git commit -m "Release v1.0.0"`
4. Tag release: `git tag v1.0.0`

### Publishing

```bash
# Login to npm
npm login

# Build package
npm run build

# Publish
npm publish --access public

# Verify
npm info @face-liveness/detection-engine
```

## Performance Considerations

### Optimization Tips

1. **Adjust detection frame delay** for CPU usage
   ```typescript
   engine.updateConfig({ detection_frame_delay: 200 })
   ```

2. **Reduce canvas size** for faster processing
   ```typescript
   engine.updateConfig({ camera_max_size: 480 })
   ```

3. **Tune quality thresholds** based on use case
   ```typescript
   engine.updateConfig({ min_image_quality: 0.6 })
   ```

### Benchmarks

- Initialization: ~2-3 seconds
- Per-frame detection: ~50-100ms (depending on device)
- Memory usage: ~50-150MB
- CPU usage: ~20-30% (Intel i5, modern phone)

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+
- Mobile browsers (iOS Safari, Chrome Android)

### Requirements

- HTTPS (or localhost for development)
- WebRTC support
- WebGL or WASM backend

## Troubleshooting

### Common Issues

1. **"Cannot find module '@vladmandic/human'"**
   - Install peer dependency: `npm install @vladmandic/human`

2. **"Camera access denied"**
   - Ensure HTTPS
   - Check browser permissions
   - Verify device has camera

3. **"Video loading timeout"**
   - Increase timeout: `{ video_load_timeout: 10000 }`
   - Check network/model loading

4. **Poor detection accuracy**
   - Check lighting
   - Ensure face is centered
   - Reduce quality thresholds

## Support & Contributions

- Issues: https://github.com/sssxyd/face-liveness-detector/issues
- Discussions: https://github.com/sssxyd/face-liveness-detector/discussions

## License

MIT - See LICENSE file for details

---

**Version:** 1.0.0  
**Last Updated:** 2024  
**Status:** Production Ready
