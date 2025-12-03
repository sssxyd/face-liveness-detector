> **语言 / Languages:** [中文](#) · [English](./README.md)

# 人脸检测引擎

一个基于 **[Human.js](https://github.com/vladmandic/human)** 和 **[OpenCV.js](https://github.com/TechStark/opencv-js)** 的纯前端实时人脸活体检测引擎。这个基于 TypeScript 的 npm 包提供实时人脸检测、双重活体验证（静默 + 动作检测）、自动最佳帧选择和防欺骗功能 - 所有处理都 100% 在浏览器中运行，零后端依赖。

## 功能特性

- 💯 **纯前端实现** - 零后端依赖，所有处理在浏览器中本地运行
- 🔬 **混合 TensorFlow + OpenCV 方案** - 结合 TensorFlow.js 进行 AI 检测和 OpenCV.js 进行图像处理
- 🧠 **双检测模式** - 支持静默活体检测和动作检测（眨眼、张嘴、点头），自动选择最佳帧
- ⚡ **纯 JavaScript 和事件驱动** - 100% TypeScript，响应式事件架构，与任何前端框架（Vue、React、Angular、Svelte 或原生 JS）无缝集成
- 🎯 **全面的人脸分析** - 实时防欺骗、质量评估、正面度检测和模糊检测
- 🛡️ **高级防欺骗** - 实时活体分数和欺骗检测

## 🚀 在线演示

**[👉 在线演示: https://face.lowtechsoft.com/](https://face.lowtechsoft.com/)**

用手机扫描二维码立即测试检测引擎：

[![人脸活体检测演示二维码](https://raw.githubusercontent.com/sssxyd/face-liveness-detector/main/demos/vue-demo/vue-demo.png)](https://face.lowtechsoft.com/)

## 安装

```bash
npm install @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js
```

或使用 yarn：
```bash
yarn add @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js
```

或使用 pnpm：
```bash
pnpm add @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js
```

> **注意**：`@vladmandic/human` 和 `@techstark/opencv-js` 是对等依赖，必须单独安装以避免捆绑大型库。如果您在项目的其他地方已经使用这些库，这样做可以减小最终的打包大小。

## 快速开始 - 使用本地资源

> ⚠️ **重要提示**：`@techstark/opencv-js` 包含一个 ESM 不兼容的 UMD 格式 OpenCV.js 库，**会导致加载失败**。您必须应用补丁脚本。
> - **问题链接**：https://github.com/TechStark/opencv-js/issues/44
> - **补丁脚本**：[patch-opencv.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/patch-opencv.js)
> - **设置方法**：添加到 `package.json` 的脚本中作为 `postinstall` 钩子，在依赖安装后自动应用

> ⚠️ **重要提示**：`@vladmandic/human` 需要下载大型模型文件和 TensorFlow WASM 后端文件。**没有这些资源组件将无法加载**。下载它们到您的项目目录并配置路径。
> - **模型下载脚本**：[copy-models.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/copy-models.js)
> - **WASM 下载脚本**：[download-wasm.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/download-wasm.js)
> - **设置方法**：运行两个脚本作为 `postinstall` 钩子，然后在引擎配置中配置路径

```typescript
import FaceDetectionEngine, { LivenessAction } from '@sssxyd/face-liveness-detector'

// 使用自定义配置初始化引擎
const engine = new FaceDetectionEngine({
  // 配置资源路径
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  
  // 检测设置
  video_width: 640,
  video_height: 640,
  
  // 质量设置
  min_image_quality: 0.5,
  min_face_frontal: 0.9,
  
  // 活体设置 - 选择您偏好的动作
  liveness_action_count: 1,  // 0 表示仅静默检测，1-3 表示动作检测
  liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD]
})

// 监听事件
engine.on('detector-loaded', (data) => {
  console.log('✅ 引擎已就绪')
  console.log(`OpenCV: ${data.opencv_version}`)
  console.log(`Human.js: ${data.human_version}`)
})

engine.on('detector-info', (data) => {
  // 实时检测信息
  console.log({
    quality: (data.quality * 100).toFixed(1) + '%',
    frontal: (data.frontal * 100).toFixed(1) + '%',
    liveness: (data.live * 100).toFixed(1) + '%',
    realness: (data.real * 100).toFixed(1) + '%'
  })
})

engine.on('detector-action', (data) => {
  // 动作活体提示
  if (data.status === 'started') {
    console.log(`请执行动作: ${data.action}`)
  } else if (data.status === 'completed') {
    console.log(`✅ 动作识别成功: ${data.action}`)
  }
})

engine.on('detector-finish', (data) => {
  if (data.success) {
    console.log('✅ 活体验证通过！')
    console.log({
      silentDetections: data.silentPassedCount,
      actionsCompleted: data.actionPassedCount,
      imageQuality: (data.bestQualityScore * 100).toFixed(1) + '%',
      totalTime: (data.totalTime / 1000).toFixed(2) + 's',
      bestFrame: data.bestFrameImage,  // Base64 编码
      bestFace: data.bestFaceImage     // Base64 编码
    })
  } else {
    console.log('❌ 活体验证失败')
  }
})

engine.on('detector-error', (error) => {
  console.error(`错误 [${error.code}]: ${error.message}`)
})

engine.on('detector-debug', (debug) => {
  console.log(`[${debug.stage}] ${debug.message}`)
})

// 初始化并开始检测
async function runDetection() {
  try {
    // 初始化库（模型、TensorFlow WASM 等）
    await engine.initialize()
    
    // 获取视频元素
    const videoElement = document.getElementById('video') as HTMLVideoElement
    
    // 在视频流上开始检测
    await engine.startDetection(videoElement)
    
    // 检测一直运行到完成或出错
    // 如需停止可手动调用:
    // engine.stopDetection(true)  // true 表示显示最佳图像
  } catch (error) {
    console.error('检测启动失败:', error)
  }
}

// 就绪时调用
runDetection()
```

## 配置

### FaceDetectionEngineConfig

#### 资源路径

| 属性 | 类型 | 描述 | 默认值 |
|-----|------|------|--------|
| `human_model_path` | `string` | Human.js 模型文件路径 | `undefined` |
| `tensorflow_wasm_path` | `string` | TensorFlow WASM 文件路径 | `undefined` |
| `tensorflow_backend` | `'auto' \| 'webgl' \| 'wasm'` | TensorFlow 后端选择 | `'auto'` |

#### 视频检测设置

| 属性 | 类型 | 描述 | 默认值 |
|-----|------|------|--------|
| `video_width` | `number` | 视频流宽度（像素） | `640` |
| `video_height` | `number` | 视频流高度（像素） | `640` |
| `video_mirror` | `boolean` | 水平镜像翻转视频 | `true` |
| `video_load_timeout` | `number` | 视频流加载超时时间（毫秒） | `5000` |
| `detection_frame_delay` | `number` | 检测帧间延迟（毫秒） | `100` |
| `error_retry_delay` | `number` | 错误重试延迟（毫秒） | `200` |

#### 检测质量设置

| 属性 | 类型 | 描述 | 默认值 |
|-----|------|------|--------|
| `silent_detect_count` | `number` | 静默检测收集数量 | `3` |
| `min_face_ratio` | `number` | 最小人脸尺寸比例 (0-1) | `0.5` |
| `max_face_ratio` | `number` | 最大人脸尺寸比例 (0-1) | `0.9` |
| `min_face_frontal` | `number` | 最小人脸正面度 (0-1) | `0.9` |
| `min_image_quality` | `number` | 最小图像质量分数 (0-1) | `0.5` |
| `min_live_score` | `number` | 最小活体分数 (0-1) | `0.5` |
| `min_real_score` | `number` | 最小防欺骗分数 (0-1) | `0.85` |
| `suspected_frauds_count` | `number` | 检测到欺骗前的检测数量 | `3` |

#### 人脸正面度特征 (`face_frontal_features`)

| 属性 | 类型 | 描述 | 默认值 |
|-----|------|------|--------|
| `yaw_threshold` | `number` | 偏航角阈值（度数） | `3` |
| `pitch_threshold` | `number` | 俯仰角阈值（度数） | `4` |
| `roll_threshold` | `number` | 翻滚角阈值（度数） | `2` |

#### 图像质量特征 (`image_quality_features`)

| 属性 | 类型 | 描述 | 默认值 |
|-----|------|------|--------|
| `require_full_face_in_bounds` | `boolean` | 要求人脸完全在边界内 | `false` |
| `use_opencv_enhancement` | `boolean` | 使用 OpenCV 增强进行质量检测 | `true` |
| `min_laplacian_variance` | `number` | 最小拉普拉斯方差（模糊检测） | `50` |
| `min_gradient_sharpness` | `number` | 最小梯度清晰度（模糊检测） | `0.15` |
| `min_blur_score` | `number` | 最小模糊分数 | `0.6` |

#### 活体检测设置

| 属性 | 类型 | 描述 | 默认值 |
|-----|------|------|--------|
| `liveness_action_list` | `LivenessAction[]` | 活体检测动作列表 | `[BLINK, MOUTH_OPEN, NOD]` |
| `liveness_action_count` | `number` | 需要执行的活体动作数量 | `1` |
| `liveness_action_randomize` | `boolean` | 是否随机化活体动作顺序 | `true` |
| `liveness_verify_timeout` | `number` | 活体验证超时时间（毫秒） | `60000` |
| `min_mouth_open_percent` | `number` | 最小张嘴百分比 (0-1) | `0.2` |

## API 参考

### 方法

#### `initialize(): Promise<void>`
加载并初始化检测库。使用检测功能前必须调用。

```typescript
await engine.initialize()
```

#### `startDetection(videoElement): Promise<void>`
在视频元素上开始人脸检测。

```typescript
const videoElement = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(videoElement)
```

#### `stopDetection(success?: boolean): void`
停止检测过程。

```typescript
engine.stopDetection(true)  // true 表示显示最佳图像
```

#### `updateConfig(config): void`
在运行时更新配置。

```typescript
engine.updateConfig({
  min_face_ratio: 0.6,
  liveness_action_count: 2
})
```

#### `getConfig(): FaceDetectionEngineConfig`
获取当前配置。

```typescript
const config = engine.getConfig()
```

#### `getStatus(): Object`
获取引擎状态。

```typescript
const { isReady, isDetecting, isInitializing } = engine.getStatus()
```

### 事件

引擎使用 TypeScript 事件发射器模式。所有事件都是类型安全的：

#### `detector-loaded`
引擎完成初始化时触发。

**数据：**
```typescript
interface DetectorLoadedEventData {
  success: boolean        // 初始化是否成功
  error?: string          // 错误信息（如有）
  opencv_version?: string // OpenCV.js 版本
  human_version?: string  // Human.js 版本
}
```

**示例：**
```typescript
engine.on('detector-loaded', (data) => {
  if (data.success) {
    console.log('✅ 引擎就绪')
    console.log(`OpenCV: ${data.opencv_version}`)
    console.log(`Human.js: ${data.human_version}`)
  } else {
    console.error('引擎初始化失败:', data.error)
  }
})
```

#### `detector-info`
每帧的实时检测信息。

**数据：**
```typescript
interface DetectorInfoEventData {
  passed: boolean     // 静默活体检查是否通过
  code: DetectionCode // 检测状态码
  size: number        // 人脸尺寸比例 (0-1)
  frontal: number     // 人脸正面度分数 (0-1)
  quality: number     // 图像质量分数 (0-1)
  real: number        // 防欺骗分数 (0-1)
  live: number        // 活体分数 (0-1)
}
```

**检测代码：**
```typescript
enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',        // 未检测到人脸
  MULTIPLE_FACE = 'MULTIPLE_FACE',        // 检测到多张人脸
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',      // 人脸太小
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',      // 人脸太大
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',  // 人脸不够正面
  FACE_NOT_REAL = 'FACE_NOT_REAL',        // 疑似欺骗
  FACE_NOT_LIVE = 'FACE_NOT_LIVE',        // 活体分数过低
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',  // 图像质量过低
  FACE_CHECK_PASS = 'FACE_CHECK_PASS'     // 所有检查通过
}
```

**示例：**
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
动作活体提示和状态更新。

**数据：**
```typescript
interface DetectorActionEventData {
  action: LivenessAction    // 要执行的动作
  status: LivenessActionStatus // 动作状态
}
```

**动作类型：**
```typescript
enum LivenessAction {
  BLINK = 'blink',
  MOUTH_OPEN = 'mouth_open',
  NOD = 'nod'
}
```

**动作状态：**
```typescript
enum LivenessActionStatus {
  STARTED = 'started',      // 动作提示已开始
  COMPLETED = 'completed',  // 动作识别成功
  TIMEOUT = 'timeout'       // 动作识别超时
}
```

**示例：**
```typescript
engine.on('detector-action', (data) => {
  switch (data.status) {
    case 'started':
      console.log(`👤 请执行: ${data.action}`)
      // 更新 UI 显示动作提示
      break
    case 'completed':
      console.log(`✅ 动作识别: ${data.action}`)
      // 更新进度指示器
      break
    case 'timeout':
      console.log(`⏱️ 动作超时: ${data.action}`)
      break
  }
})
```

#### `detector-finish`
活体检测完成时触发（成功或失败）。

**数据：**
```typescript
interface DetectorFinishEventData {
  success: boolean         // 活体验证是否通过
  silentPassedCount: number    // 静默检测通过数量
  actionPassedCount: number    // 动作完成数量
  totalTime: number        // 总检测时间（毫秒）
  bestQualityScore: number // 最佳图像质量分数 (0-1)
  bestFrameImage: string | null  // Base64 编码的最佳帧图像
  bestFaceImage: string | null   // Base64 编码的最佳人脸图像
}
```

**示例：**
```typescript
engine.on('detector-finish', (data) => {
  if (data.success) {
    console.log('✅ 活体验证通过！')
    console.log({
      silentDetections: data.silentPassedCount,
      actionsCompleted: data.actionPassedCount,
      quality: (data.bestQualityScore * 100).toFixed(1) + '%',
      time: (data.totalTime / 1000).toFixed(2) + 's'
    })
    
    // 发送结果到服务器
    if (data.bestFrameImage) {
      uploadVerificationResult({
        image: data.bestFrameImage,
        quality: data.bestQualityScore,
        timestamp: new Date()
      })
    }
  } else {
    console.log('❌ 活体验证失败')
    // 提示用户重试
  }
})
```

#### `detector-error`
检测过程中发生错误时触发。

**数据：**
```typescript
interface DetectorErrorEventData {
  code: ErrorCode // 错误代码
  message: string // 错误信息
}
```

**错误代码：**
```typescript
enum ErrorCode {
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED',
  SUSPECTED_FRAUDS_DETECTED = 'SUSPECTED_FRAUDS_DETECTED'
}
```

**示例：**
```typescript
engine.on('detector-error', (error) => {
  console.error(`❌ 错误 [${error.code}]: ${error.message}`)
  
  switch (error.code) {
    case 'CAMERA_ACCESS_DENIED':
      showErrorMessage('请授予摄像头权限')
      break
    case 'STREAM_ACQUISITION_FAILED':
      showErrorMessage('摄像头访问失败')
      break
    case 'SUSPECTED_FRAUDS_DETECTED':
      showErrorMessage('检测到欺骗 - 请重试')
      break
    default:
      showErrorMessage('检测失败: ' + error.message)
  }
})
```

#### `detector-debug`
开发和故障排除的调试信息。

**数据：**
```typescript
interface DetectorDebugEventData {
  level: 'info' | 'warn' | 'error'  // 调试级别
  stage: string                      // 当前处理阶段
  message: string                    // 调试信息
  details?: Record<string, any>      // 额外详情
  timestamp: number                  // Unix 时间戳
}
```

**示例：**
```typescript
engine.on('detector-debug', (debug) => {
  const time = new Date(debug.timestamp).toLocaleTimeString()
  console.log(`[${time}] [${debug.stage}] ${debug.message}`)
  
  if (debug.details) {
    console.log('详情:', debug.details)
  }
  
  // 记录错误以便故障排除
  if (debug.level === 'error') {
    logErrorToServer({
      stage: debug.stage,
      message: debug.message,
      details: debug.details
    })
  }
})
```

## 枚举

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
  STARTED = 'started',      // 动作提示已开始
  COMPLETED = 'completed',  // 动作成功识别
  TIMEOUT = 'timeout'       // 动作识别超时
}
```

### DetectionCode
```typescript
enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',            // 视频中未检测到人脸
  MULTIPLE_FACE = 'MULTIPLE_FACE',            // 检测到多张人脸
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',          // 人脸尺寸小于最小阈值
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',          // 人脸尺寸大于最大阈值
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',      // 人脸角度不够正面
  FACE_NOT_REAL = 'FACE_NOT_REAL',            // 检测到疑似欺骗
  FACE_NOT_LIVE = 'FACE_NOT_LIVE',            // 活体分数低于阈值
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',      // 图像质量低于最小值
  FACE_CHECK_PASS = 'FACE_CHECK_PASS'         // 所有检测检查通过
}
```

### ErrorCode
```typescript
enum ErrorCode {
  DETECTOR_NOT_INITIALIZED = 'DETECTOR_NOT_INITIALIZED',  // 引擎未初始化
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',          // 摄像头权限被拒
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED', // 获取视频流失败
  SUSPECTED_FRAUDS_DETECTED = 'SUSPECTED_FRAUDS_DETECTED'  // 检测到欺骗/欺诈
}
```

## 高级用法

有关全面的示例和高级用法模式，请参考官方演示项目：

**👉 [Vue 演示项目](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/)**

演示包括：
- 完整的 Vue 3 与 TypeScript 集成
- 实时检测可视化
- 配置面板用于尝试不同设置
- 所有引擎事件的事件处理示例
- 显示详细检测信息的调试面板
- 移动端和桌面端响应式 UI 设计
- 错误处理和用户反馈模式
- 结果导出和图像捕获示例

本地运行演示：

```bash
cd demos/vue-demo
npm install
npm run dev
```

然后在浏览器中打开显示的本地 URL 查看检测引擎运行情况。

## 下载并托管模型文件

为了避免 CDN 依赖并提高性能，您可以在本地下载模型文件：

### 可用的下载脚本

根目录提供了两个脚本：

#### 1. 复制 Human.js 模型

```bash
node copy-human-models.js
```

**功能：**
- 从 `node_modules/@vladmandic/human/models` 复制人脸检测模型
- 保存到 `public/models/` 目录
- 下载 `.json` 和 `.bin` 模型文件
- 显示文件大小和进度

#### 2. 下载 TensorFlow.js WASM 文件

```bash
node download-tensorflow-wasm.js
```

**功能：**
- 下载 TensorFlow.js WASM 后端文件
- 保存到 `public/wasm/` 目录
- 下载 4 个关键文件：
  - `tf-backend-wasm.min.js`
  - `tfjs-backend-wasm.wasm`
  - `tfjs-backend-wasm-simd.wasm`
  - `tfjs-backend-wasm-threaded-simd.wasm`
- **支持多个 CDN 源**，并自动回退：
  1. unpkg.com（主要）
  2. cdn.jsdelivr.net（备用）
  3. esm.sh（备选）
  4. cdn.esm.sh（最后选择）

### 配置使用本地文件

下载完成后，配置引擎使用这些本地文件：

```typescript
const engine = new FaceDetectionEngine({
  // 使用本地文件而不是 CDN
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  
  // 其他配置...
})
```

## 浏览器需求

- 支持 WebRTC 的现代浏览器（Chrome、Firefox、Edge、Safari 11+）
- getUserMedia 需要 HTTPS（开发环境可用 localhost）
- WebGL 或 WASM 后端支持

## 性能优化建议

1. **调整检测帧延迟** - 延迟越大 = CPU 使用越低，但检测越慢
   ```typescript
   engine.updateConfig({ detection_frame_delay: 200 })
   ```

2. **减小画布尺寸** - 更小的画布处理更快
   ```typescript
   engine.updateConfig({ 
     video_width: 480,
     video_height: 480
   })
   ```

3. **优化光线条件** - 更好的光线 = 更好的检测
   - 避免背光
   - 确保人脸光线充足

4. **监控调试输出** - 使用调试事件识别瓶颈
   ```typescript
   engine.on('detector-debug', (debug) => {
     if (debug.stage === 'detection') {
       console.time(debug.message)
     }
   })
   ```

## 故障排除

### "摄像头访问被拒"
- 确保使用 HTTPS（开发环境可用 localhost）
- 检查浏览器权限
- 用户必须授予摄像头访问权限

### "视频加载超时"
- 检查网络连接
- 验证模型文件是否可访问
- 增加 `video_load_timeout`

### 检测精度不佳
- 确保光线充足
- 保持人脸在画面中居中
- 人脸应占画面的 50-90%
- 人脸应正面（不倾斜）

### CPU 使用率过高
- 增加 `detection_frame_delay`
- 减小 `video_width` 和 `video_height`
- 禁用 `show_action_prompt`（如不需要）

## 许可证

MIT

## 支持

如有问题，请访问：https://github.com/sssxyd/face-liveness-detector/issues
