# 人脸活体检测 UniApp 插件

一个针对 **uni-app App 应用** 的人脸活体检测插件，基于 **[Human.js](https://github.com/vladmandic/human)** 和 **[OpenCV.js](https://github.com/TechStark/opencv-js)** 实现。提供实时人脸检测、双重活体验证（静默 + 动作检测）、自动最佳帧选择和防欺骗功能 - 所有处理都 100% 在客户端运行，零后端依赖。

## 功能特性

- 💯 **纯客户端实现** - 零后端依赖，所有处理在客户端本地运行
- 🔬 **完整的检测能力** - 集成 TensorFlow.js 进行 AI 检测和 OpenCV.js 进行图像处理
- 🧠 **双检测模式** - 支持静默活体检测和动作检测（眨眼、张嘴、点头），自动选择最佳帧
- ⚡ **开箱即用** - 所有依赖和资源已打包，无需额外配置
- 🎯 **全面的人脸分析** - 实时防欺骗、质量评估、正面度检测和模糊检测
- 🛡️ **高级防欺骗** - 实时活体分数和欺骗检测

## 🚀 在线演示

**[👉 在线演示: https://face.lowtechsoft.com/](https://face.lowtechsoft.com/)**

用手机扫描二维码立即测试检测引擎：

[![人脸活体检测演示二维码](https://raw.githubusercontent.com/sssxyd/face-liveness-detector/main/demos/vue-demo/vue-demo.png)](https://face.lowtechsoft.com/)

## 安装

### 从 DCloud 插件市场安装（推荐）
1. 打开 HBuilderX
2. 进入 `工具 → 插件市场`
3. 搜索 `sssxyd-facedetection`
4. 点击 `导入` 将插件导入到项目的 `uni_modules` 目录

### 手动安装
将 `sssxyd-facedetection` 文件夹复制到项目的 `uni_modules` 目录

## 快速开始

```typescript
import { FaceLivenessDetectorSDK } from 'uni_modules/sssxyd-facedetection/js_sdk/face-detection-sdk.js'
import { LivenessAction } from 'uni_modules/sssxyd-facedetection/js_sdk/face-detection-sdk.js'

export default {
  data() {
    return {
      detector: null
    }
  },
  async mounted() {
    // 创建检测器实例（资源路径自动获取）
    this.detector = new FaceLivenessDetectorSDK({    
      min_face_ratio: 0.5,
      max_face_ratio: 0.9,
      liveness_action_count: 1,
      liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD]
    })
    
    // 监听事件
    this.detector.on('detector-loaded', (data) => {
      console.log('✅ 检测器已准备')
      console.log(`OpenCV: ${data.opencv_version}`)
      console.log(`Human.js: ${data.human_version}`)
    })
    
    this.detector.on('detector-info', (data) => {
      // 实时检测信息
      console.log({
        quality: (data.quality * 100).toFixed(1) + '%',
        frontal: (data.frontal * 100).toFixed(1) + '%',
        liveness: (data.live * 100).toFixed(1) + '%',
        realness: (data.real * 100).toFixed(1) + '%'
      })
    })
    
    this.detector.on('detector-action', (data) => {
      // 动作活体提示
      if (data.status === 'started') {
        console.log(`请执行动作: ${data.action}`)
      } else if (data.status === 'completed') {
        console.log(`✅ 动作识别成功: ${data.action}`)
      }
    })
    
    this.detector.on('detector-finish', (data) => {
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
    
    this.detector.on('detector-error', (error) => {
      console.error(`错误 [${error.code}]: ${error.message}`)
    })
    
    // 初始化检测器
    await this.detector.initialize()
  },
  methods: {
    async startDetection() {
      const video = document.getElementById('face-detection-video') as HTMLVideoElement
      await this.detector.startDetection(video)
    }
  }
}
```

## 配置说明

所有配置都有默认值，无强制配置。常用配置：

```typescript
const detector = new FaceLivenessDetectorSDK({
  // 检测设置
  video_width: 640,
  video_height: 640,
  video_mirror: true,
  
  // 质量设置
  min_face_ratio: 0.3,      // 最小人脸占比
  max_face_ratio: 0.9,      // 最大人脸占比
  min_face_frontal: 0.9,    // 最小人脸正对度
  min_image_quality: 0.5,   // 最小图像质量
  
  // 活体设置
  silent_detect_count: 3,       // 静默检测次数
  liveness_action_count: 1,     // 动作检测次数（0-3）
  liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD]
})
```

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
- 所有引擎事件的事件处理示例
- 错误处理和用户反馈模式

## 浏览器需求

- 支持 WebRTC 的现代浏览器（Chrome、Firefox、Edge、Safari 11+）
- getUserMedia 需要 HTTPS（开发环境可用 localhost）
- WebGL 或 WASM 后端支持

## 常见问题

### Q: 如何在应用启动时预加载模型文件？
A: 在应用入口调用 `preloadResources()`：
```typescript
import { preloadResources } from 'uni_modules/sssxyd-facedetection/js_sdk/face-detection-sdk.js'
await preloadResources()
```

### Q: 如何查看实时检测信息？
A: 监听 `detector-info` 事件：
```typescript
detector.on('detector-info', (data) => {
  console.log('人脸占比:', (data.size * 100).toFixed(1) + '%')
  console.log('正对度:', (data.frontal * 100).toFixed(1) + '%')
  console.log('图像质量:', (data.quality * 100).toFixed(1) + '%')
})
```

### Q: 如何停止检测？
A: 调用 `stopDetection()`：
```typescript
detector.stopDetection(true)  // true 表示显示最佳图像
```

### Q: 如何保证用户隐私？
A: 所有检测都在客户端完成，图像数据不会上传到服务器，完全保护用户隐私。

## 获取帮助

- **查看完整文档**：[INSTALL.md](./INSTALL.md)
- **提交问题**：https://github.com/sssxyd/face-liveness-detector/issues
- **DCloud 官方文档**：https://uniapp.dcloud.net.cn/
