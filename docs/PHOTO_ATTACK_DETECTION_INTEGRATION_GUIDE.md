## 照片攻击检测器 - 快速集成指南

### 安装与导入

```typescript
// 导入必要的类和类型
import { PhotoAttackDetector, type PhotoAttackDetectionResult } from '@sssxyd/face-liveness-detector'
import type { FaceResult } from '@vladmandic/human'
```

### 基础使用（3 步）

```typescript
// 1️⃣ 创建检测器实例
const photoDetector = new PhotoAttackDetector({
  frameBufferSize: 15,  // 缓冲 15 帧（0.5 秒@30fps）
})

// 2️⃣ 为每一帧人脸添加检测数据
faceResult.forEach(result => {
  photoDetector.addFrame(result)
})

// 3️⃣ 执行检测
const detectionResult = photoDetector.detect()

if (detectionResult.isPhoto) {
  console.log('❌ 检测到照片攻击')
  console.log(`消息: ${detectionResult.getMessage()}`)
} else {
  console.log('✅ 检测到真实人脸')
}
```

### 检测结果详解

```typescript
interface PhotoAttackDetectionResult {
  isPhoto: boolean                    // 是否为照片
  details: {
    frameCount: number                // 用于检测的帧数
    
    // ===== 方案一：深度方差 =====
    depthVariance: number             // 深度方差值（越小越可能是照片）
    keyPointDepthVariance: number     // 关键点深度方差
    depthRange: number                // 深度范围
    isFlatDepth: boolean              // 是否为平坦深度
    depthVarianceScore: number        // 深度方差置信度 [0-1]
    
    // ===== 方案二：运动透视一致性 =====
    motionDisplacementVariance: number           // 运动位移方差
    perspectiveRatio: number                     // 透视比率（近/远）
    motionDirectionConsistency: number           // 运动方向一致性
    affineTransformPatternMatch: number          // 仿射变换匹配度
    perspectiveScore: number                     // 透视置信度 [0-1]
    
    // ===== 综合 =====
    photoConfidence: number           // 总置信度 [0-1]
    dominantFeature: string           // 主要特征类型
  }
  
  getMessage(): string                // 获取可读的检测结果消息
}
```

### 实际集成示例

#### Vue 3 组件集成

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PhotoAttackDetector } from '@sssxyd/face-liveness-detector'
import type { FaceResult } from '@vladmandic/human'

const detectionStatus = ref('检测中...')
const photoDetector = ref(new PhotoAttackDetector())

// 在每帧检测后调用
function onFaceDetected(faceResult: FaceResult) {
  photoDetector.value.addFrame(faceResult)
  
  // 每收集 5 帧后进行一次检测
  if (photoDetector.value.getFrameCount() >= 5) {
    const result = photoDetector.value.detect()
    
    if (result.isPhoto) {
      detectionStatus.value = `⚠️ 检测结果: 照片 (${(result.details.photoConfidence * 100).toFixed(1)}%)`
    } else {
      detectionStatus.value = `✅ 检测结果: 真实人脸`
    }
  }
}

onMounted(() => {
  // 初始化摄像头和人脸检测...
})
</script>

<template>
  <div class="detection-container">
    <div class="status">{{ detectionStatus }}</div>
  </div>
</template>
```

#### React 组件集成

```typescript
import { useState, useCallback } from 'react'
import { PhotoAttackDetector } from '@sssxyd/face-liveness-detector'
import type { FaceResult } from '@vladmandic/human'

export function PhotoAttackDetectionComponent() {
  const [status, setStatus] = useState('检测中...')
  const [detector] = useState(() => new PhotoAttackDetector())

  const handleFaceDetected = useCallback((faceResult: FaceResult) => {
    detector.addFrame(faceResult)

    if (detector.getFrameCount() >= 5) {
      const result = detector.detect()
      
      if (result.isPhoto) {
        setStatus(`⚠️ 检测到照片 (${(result.details.photoConfidence * 100).toFixed(1)}%)`)
      } else {
        setStatus('✅ 真实人脸')
      }
    }
  }, [detector])

  return (
    <div className="detection-container">
      <div className="status">{status}</div>
    </div>
  )
}
```

### 配置选项详解

```typescript
interface PhotoAttackDetectorOptions {
  // 帧缓冲大小（推荐 15-20）
  // - 值越大：检测越准确，但延迟越高
  // - 值越小：响应越快，但可能误判
  frameBufferSize?: number                      // 默认: 15

  // 深度方差阈值（推荐 0.0005 ~ 0.002）
  // - 超过此值认为是真实人脸
  // - 低于此值认为是照片
  depthVarianceThreshold?: number               // 默认: 0.001

  // 运动方差阈值（推荐 0.008 ~ 0.015）
  // - 用于判断各关键点运动差异
  motionVarianceThreshold?: number              // 默认: 0.01

  // 透视比率阈值（推荐 0.85 ~ 0.90）
  // - 近处点位移/远处点位移的预期值为 1.0
  // - 如果比率接近 1.0，说明是照片
  perspectiveRatioThreshold?: number            // 默认: 0.85

  // 运动一致性阈值（推荐 0.75 ~ 0.85）
  // - 运动向量方向一致性超过此值时，认为是照片
  motionConsistencyThreshold?: number           // 默认: 0.8
}
```

### 根据场景调整参数

#### 场景 1：高安全要求（银行、支付）

```typescript
const photoDetector = new PhotoAttackDetector({
  frameBufferSize: 20,              // 更多帧数，更准确
  depthVarianceThreshold: 0.001,    // 严格的深度要求
  motionConsistencyThreshold: 0.75, // 严格的一致性要求
})
```

#### 场景 2：用户体验优先（社交应用）

```typescript
const photoDetector = new PhotoAttackDetector({
  frameBufferSize: 10,              // 更少帧数，更快响应
  depthVarianceThreshold: 0.002,    // 宽松的深度要求
  motionConsistencyThreshold: 0.85, // 宽松的一致性要求
})
```

#### 场景 3：弱光环境（夜间）

```typescript
const photoDetector = new PhotoAttackDetector({
  frameBufferSize: 25,              // 更多帧数，平均噪声
  depthVarianceThreshold: 0.0015,   // 中等深度要求
  motionConsistencyThreshold: 0.80, // 平衡要求
})
```

### 常见集成问题

#### 问题 1：如何获取 FaceResult？

```typescript
import Human from '@vladmandic/human'

const human = new Human()
const video = document.querySelector('video')

async function detectFace() {
  const result = await human.detect(video)
  
  if (result.face && result.face.length > 0) {
    const faceResult = result.face[0]
    photoDetector.addFrame(faceResult)
  }
}
```

#### 问题 2：如何在实时视频中使用？

```typescript
let animationFrameId: number

async function continuousDetection() {
  const video = document.querySelector('video')
  const result = await human.detect(video)
  
  if (result.face && result.face.length > 0) {
    photoDetector.addFrame(result.face[0])
    
    // 每 10 帧检测一次（避免过频繁）
    if (photoDetector.getFrameCount() >= 10) {
      const detection = photoDetector.detect()
      console.log(detection.getMessage())
      // photoDetector.reset()  // 可选：重置以检测下一个人
    }
  }
  
  animationFrameId = requestAnimationFrame(continuousDetection)
}

continuousDetection()
```

#### 问题 3：如何同时使用多个检测器？

```typescript
// 为了检测多个人脸
const detectors = new Map<number, PhotoAttackDetector>()

function onMultipleFacesDetected(results: FaceResult[]) {
  results.forEach((faceResult, index) => {
    if (!detectors.has(index)) {
      detectors.set(index, new PhotoAttackDetector())
    }
    
    const detector = detectors.get(index)!
    detector.addFrame(faceResult)
    
    if (detector.getFrameCount() >= 5) {
      const result = detector.detect()
      console.log(`Face ${index}: ${result.getMessage()}`)
    }
  })
}
```

### 性能优化建议

1. **使用 Web Worker**：在后台线程进行检测计算
   ```typescript
   const worker = new Worker('photo-detection-worker.js')
   worker.postMessage({ frameData: faceResult })
   worker.onmessage = (e) => {
     console.log(e.data.result)
   }
   ```

2. **帧采样**：不是每一帧都进行检测
   ```typescript
   let frameCount = 0
   if (frameCount % 3 === 0) {  // 每 3 帧检测一次
     photoDetector.addFrame(faceResult)
   }
   frameCount++
   ```

3. **缓冲大小平衡**：选择合适的缓冲区大小
   ```typescript
   // 根据帧率选择
   const fps = 30
   const bufferSeconds = 0.5
   const frameBufferSize = fps * bufferSeconds  // 15
   ```

### 故障排除

| 症状 | 原因 | 解决方案 |
|------|------|--------|
| 始终检测为照片 | 深度推断失败 | 增加 `depthVarianceThreshold` |
| 始终检测为真人 | 阈值设置过宽松 | 降低各个阈值 |
| 误判率高 | 数据不足 | 增加 `frameBufferSize` |
| 响应延迟高 | 缓冲帧太多 | 减少 `frameBufferSize` |

### API 参考

```typescript
// 创建实例
new PhotoAttackDetector(options?: Partial<PhotoAttackDetectorOptions>)

// 添加帧
photoDetector.addFrame(faceResult: FaceResult): void

// 执行检测
photoDetector.detect(): PhotoAttackDetectionResult

// 获取缓冲帧数
photoDetector.getFrameCount(): number

// 重置检测器
photoDetector.reset(): void
```

### 详细文档

有关算法原理、性能分析、防护机制等详细信息，请参考：
[PHOTO_ATTACK_DETECTION_ALGORITHM.md](./PHOTO_ATTACK_DETECTION_ALGORITHM.md)
