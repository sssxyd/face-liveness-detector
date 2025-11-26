# API Changes Documentation

## Event System Updates

This document describes the events and data structures used by `FaceDetectionEngine`.

## Event Reference

The engine emits the following 7 events:

### 1. detector-loaded

Emitted after successful initialization of Human.js and OpenCV.js libraries.

**Data Properties:**
- `success: boolean` - Whether initialization succeeded
- `error?: string` - Error message if failed
- `opencv_version?: string` - OpenCV version
- `human_version?: string` - Human.js version

**Usage Example:**
```typescript
engine.on('detector-loaded', (data) => {
  if (data.success) {
    console.log('Ready:', data.human_version)
  }
})
```

### 2. status-prompt

Emitted for various status changes during detection.

**Data Properties:**
- `code: PromptCode` - Status code
- `size?: number` - Face size percentage (0-1)
- `frontal?: number` - Face frontality (0-1)
- `real?: number` - Anti-spoofing score (0-1)
- `live?: number` - Liveness score (0-1)
- `quality?: number` - Image quality (0-1)

**Possible Codes:** NO_FACE, MULTIPLE_FACE, FACE_TOO_SMALL, FACE_TOO_LARGE, FACE_NOT_FRONTAL, IMAGE_QUALITY_LOW, FRAME_DETECTED

### 3. face-detected

Emitted when a face frame passes all quality checks (silent liveness detection).

**Data Properties:**
- `passed: boolean` - Whether all checks passed
- `size: number` - Face size ratio (0-1)
- `frontal: number` - Face frontality score (0-1)
- `quality: number` - Image quality score (0-1)
- `real: number` - Anti-spoofing score (0-1)
- `live: number` - Liveness score (0-1)

### 4. action-prompt

Emitted when action-based liveness detection is requested.

**Data Properties:**
- `action: LivenessAction` - blink, mouth_open, or nod
- `status: LivenessActionStatus` - started, completed, or timeout

### 5. detector-finish

Emitted when detection process completes.

**Data Properties:**
- `success: boolean` - Overall result
- `silentPassedCount: number` - Frames collected
- `actionPassedCount: number` - Actions completed
- `totalTime: number` - Total time in milliseconds
- `bestQualityScore: number` - Best quality score (0-1)
- `bestFrameImage: string | null` - Base64 encoded full frame
- `bestFaceImage: string | null` - Base64 encoded face crop

### 6. detector-error

Emitted when an error occurs during detection.

**Data Properties:**
- `code: ErrorCode` - Error code
- `message: string` - Error message

**Error Codes:**
- DETECTOR_NOT_INITIALIZED
- CAMERA_ACCESS_DENIED
- STREAM_ACQUISITION_FAILED
- SUSPECTED_FRAUDS_DETECTED

### 7. detector-debug

Emitted for debug information (development purposes).

**Data Properties:**
- `level: 'info' | 'warn' | 'error'` - Debug level
- `stage: string` - Current detection stage
- `message: string` - Debug message
- `details?: Record<string, any>` - Additional data
- `timestamp: number` - Milliseconds since epoch

## Method Changes

### startDetection()

**Previous Signature:**
```
startDetection(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement)
```

**Current Signature:**
```
startDetection(videoElement: HTMLVideoElement)
```

Canvas elements are now managed internally by the engine.

## Migration Guide

### Update Event Handlers

**Old code** using `liveness-completed` event:
```typescript
engine.on('liveness-completed', (data) => {
  console.log('Quality:', data.qualityScore)
  console.log('Image:', data.imageData)
})
```

**New code** using `detector-finish` event:
```typescript
engine.on('detector-finish', (data) => {
  console.log('Quality:', data.bestQualityScore)
  console.log('Frame:', data.bestFrameImage)
  console.log('Success:', data.success)
})
```

### Update startDetection Calls

**Old:**
```
await engine.startDetection(videoEl, canvasEl)
```

**New:**
```
await engine.startDetection(videoEl)
```

## Configuration Parameters

Key configuration options for FaceDetectionEngine:

- `silent_detect_count` (default: 3) - Number of high-quality frames to collect
- `min_face_ratio` (default: 0.5) - Minimum face size as ratio
- `max_face_ratio` (default: 0.9) - Maximum face size as ratio
- `min_face_frontal` (default: 0.9) - Minimum face frontality (0-1)
- `min_image_quality` (default: 0.8) - Minimum image quality score
- `min_real_score` (default: 0.85) - Minimum anti-spoofing score
- `min_live_score` (default: 0.5) - Minimum liveness score
- `liveness_action_list` (default: [blink, mouth_open, nod]) - Actions to perform
- `liveness_action_count` (default: 1) - Number of actions required
- `liveness_action_timeout` (default: 60000) - Action timeout in milliseconds
- `detection_frame_delay` (default: 100) - Delay between frames in milliseconds
- `video_load_timeout` (default: 5000) - Video load timeout in milliseconds
- `video_width` (default: 640) - Video stream width in pixels
- `video_height` (default: 640) - Video stream height in pixels

---

**Last Updated:** November 2024
**Version:** 1.0.0
