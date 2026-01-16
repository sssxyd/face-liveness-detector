<div align="center">

> **语言 / Languages:** [中文](#) · [English](./README.en.md)

# 人脸活体检测引擎

<p>
  <strong>基于 TensorFlow + OpenCV 的纯前端实时人脸活体检测解决方案</strong>
</p>

<p>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript">
  <img alt="NPM Package" src="https://img.shields.io/npm/v/@sssxyd/face-liveness-detector?label=npm&color=cb3837">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

</div>

---

## ✨ 功能特性

<table>
  <tr>
    <td>💯 <strong>纯前端实现</strong><br/>零后端依赖，所有处理在浏览器中本地运行</td>
    <td>🔬 <strong>混合 AI 方案</strong><br/>TensorFlow + OpenCV 深度融合</td>
  </tr>
  <tr>
    <td>🧠 <strong>双重活体验证</strong><br/>静默检测 + 动作识别（眨眼、张嘴、点头）</td>
    <td>⚡ <strong>事件驱动架构</strong><br/>100% TypeScript，与任何框架无缝集成</td>
  </tr>
  <tr>
    <td>🎯 <strong>全维度分析</strong><br/>质量、正对度、运动分数、屏幕检测</td>
    <td>🛡️ <strong>多维反欺骗</strong><br/>照片运动检测、屏幕时序分析、轮廓边界检测</td>
  </tr>
</table>

---

## 🚀 在线演示

<div align="center">

**[👉 实时体验演示](https://face.lowtechsoft.com/) | 用手机扫码快速测试**

[![人脸活体检测演示二维码](https://raw.githubusercontent.com/sssxyd/face-liveness-detector/main/demos/vue-demo/vue-demo.png)](https://face.lowtechsoft.com/)

</div>

---

## 🧬 核心算法设计

| 检测模块 | 技术方案 | 说明文档 |
|---------|--------|--------|
| **人脸识别** | Human.js BlazeFace + FaceMesh | 468个面部特征点 + 表情识别 |
| **运动活体检测** | 6指标投票系统 | [运动检测算法](./docs/MOTION_DETECTION_ALGORITHM.md) - 光流、关键点方差、眼嘴运动、面部区域变化 |
| **屏幕采集检测** | 4维度时序分析 | [屏幕采集检测算法](./docs/SCREEN_CAPTURE_DETECTION_ALGORITHM.md) - 屏幕闪烁、响应时间、DLP色轮、光学畸变 |
| **屏幕轮廓检测** | Canny边缘+轮廓分析 | [屏幕轮廓检测算法](./docs/SCREEN_CORNERS_CONTOUR_DETECTION_ALGORITHM.md) - 单帧矩形边界检测 |

---

## 📦 安装指南

### 快速安装（3 个包）

```bash
npm install @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js
```

<details>
<summary><strong>其他包管理器</strong></summary>

```bash
# Yarn
yarn add @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js

# pnpm
pnpm add @sssxyd/face-liveness-detector @vladmandic/human @techstark/opencv-js
```

</details>

> 📝 **为什么需要三个包？**
> `@vladmandic/human` 和 `@techstark/opencv-js` 是对等依赖（peer dependencies），需要单独安装以避免捆绑大型库，减小最终的打包体积。

---

## ⚠️ 必要配置步骤

### 1️⃣ 修复 OpenCV.js ESM 兼容性问题

`@techstark/opencv-js` 包含不兼容的 UMD 格式，**必须应用补丁脚本**。

**参考：**
- 问题详情：[TechStark/opencv-js#44](https://github.com/TechStark/opencv-js/issues/44)
- 补丁脚本：[patch-opencv.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/patch-opencv.js)

**设置方法（推荐）：** 添加到 `package.json` 的 `postinstall` 钩子

```json
{
  "scripts": {
    "postinstall": "node patch-opencv.cjs"
  }
}
```

### 2️⃣ 下载 Human.js 模型文件

`@vladmandic/human` 需要模型文件和 TensorFlow WASM 后端，**否则无法加载**。

**下载脚本：**
- 模型复制：[copy-models.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/copy-models.js)
- WASM 下载：[download-wasm.js](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/scripts/download-wasm.js)

**设置方法（推荐）：** 配置为 `postinstall` 钩子

```json
{
  "scripts": {
    "postinstall": "node scripts/copy-models.js && node scripts/download-wasm.js"
  }
}
```

---

## 🎯 快速开始

### 基础示例

```typescript
import FaceDetectionEngine, { LivenessAction } from '@sssxyd/face-liveness-detector'

// 初始化引擎
const engine = new FaceDetectionEngine({
  // 资源路径配置
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  tensorflow_backend: 'auto',
  
  // 检测设置
  detect_video_ideal_width: 1280,
  detect_video_ideal_height: 720,
  detect_video_mirror: true,
  detect_video_load_timeout: 5000,

  // 采集质量要求
  collect_min_collect_count: 3,        // 最少采集 3 张人脸
  collect_min_face_ratio: 0.5,         // 人脸占比 50%+
  collect_max_face_ratio: 0.9,         // 人脸占比 90% 以下
  collect_min_face_frontal: 0.9,       // 人脸正对度 90%
  collect_min_image_quality: 0.5,      // 图像质量 50%+

  // 活体检测设置
  action_liveness_action_count: 1,     // 需要 1 个动作
  action_liveness_action_list: [LivenessAction.BLINK, LivenessAction.MOUTH_OPEN, LivenessAction.NOD],
  action_liveness_action_randomize: true,
  action_liveness_verify_timeout: 60000,
})

// 监听核心事件
engine.on('detector-loaded', (data) => {
  if (data.success) {
    console.log('✅ 引擎就绪', {
      opencv: data.opencv_version,
      human: data.human_version
    })
  }
})

engine.on('detector-info', (data) => {
  // 每帧实时数据
  console.log({
    status: data.code,
    quality: (data.imageQuality * 100).toFixed(1) + '%',
    frontal: (data.faceFrontal * 100).toFixed(1) + '%',
    motion: (data.motionScore * 100).toFixed(1) + '%',
    screen: (data.screenConfidence * 100).toFixed(1) + '%'
  })
})

engine.on('detector-action', (data) => {
  // 动作提示
  console.log(`请执行动作: ${data.action} (${data.status})`)
})

engine.on('detector-finish', (data) => {
  // 检测完成
  if (data.success) {
    console.log('✅ 活体验证通过！', {
      静默通过: data.silentPassedCount,
      动作完成: data.actionPassedCount,
      最佳质量: (data.bestQualityScore * 100).toFixed(1) + '%',
      总耗时: (data.totalTime / 1000).toFixed(2) + 's'
    })
  } else {
    console.log('❌ 活体验证失败')
  }
})

engine.on('detector-error', (error) => {
  console.error(`❌ 错误 [${error.code}]: ${error.message}`)
})

// 启动检测
async function startLivenessDetection() {
  try {
    // 初始化库
    await engine.initialize()
    
    // 获取视频元素并开始检测
    const videoEl = document.getElementById('video') as HTMLVideoElement
    await engine.startDetection(videoEl)
    
    // 检测自动运行到完成或手动停止
    // engine.stopDetection(true)  // 停止并显示最佳图像
  } catch (error) {
    console.error('检测启动失败:', error)
  }
}

// 就绪时启动
startLivenessDetection()
```

---

## ⚙️ 详细配置参考

### 资源路径配置

| 选项 | 类型 | 说明 | 默认值 |
|-----|------|------|--------|
| `human_model_path` | `string` | Human.js 模型文件目录 | `undefined` |
| `tensorflow_wasm_path` | `string` | TensorFlow WASM 文件目录 | `undefined` |
| `tensorflow_backend` | `'auto' \| 'webgl' \| 'wasm'` | TensorFlow 后端引擎 | `'auto'` |

### 调试模式配置

| 选项 | 类型 | 说明 | 默认值 |
|-----|------|------|--------|
| `debug_mode` | `boolean` | 启用调试模式 | `false` |
| `debug_log_level` | `'info' \| 'warn' \| 'error'` | 调试日志最低级别 | `'info'` |
| `debug_log_stages` | `string[]` | 调试日志阶段过滤（undefined=全部） | `undefined` |
| `debug_log_throttle` | `number` | 调试日志节流间隔（ms） | `100` |

### 视频检测设置

| 选项 | 类型 | 说明 | 默认值 |
|-----|------|------|--------|
| `detect_video_ideal_width` | `number` | 视频宽度（像素） | `1280` |
| `detect_video_ideal_height` | `number` | 视频高度（像素） | `720` |
| `detect_video_mirror` | `boolean` | 水平翻转视频 | `true` |
| `detect_video_load_timeout` | `number` | 加载超时（ms） | `5000` |

### 人脸采集质量要求

| 选项 | 类型 | 说明 | 默认值 |
|-----|------|------|--------|
| `collect_min_collect_count` | `number` | 最少采集数量 | `3` |
| `collect_min_face_ratio` | `number` | 最小人脸占比 (0-1) | `0.5` |
| `collect_max_face_ratio` | `number` | 最大人脸占比 (0-1) | `0.9` |
| `collect_min_face_frontal` | `number` | 最小正对度 (0-1) | `0.9` |
| `collect_min_image_quality` | `number` | 最小图像质量 (0-1) | `0.5` |

### 人脸正对度参数

| 选项 | 类型 | 说明 | 默认值 |
|-----|------|------|--------|
| `yaw_threshold` | `number` | 偏航角阈值（度） | `3` |
| `pitch_threshold` | `number` | 俯仰角阈值（度） | `4` |
| `roll_threshold` | `number` | 翻滚角阈值（度） | `2` |

### 图像质量参数

| 选项 | 类型 | 说明 | 默认值 |
|-----|------|------|--------|
| `require_full_face_in_bounds` | `boolean` | 人脸完全在边界内 | `false` |
| `min_laplacian_variance` | `number` | 最小模糊检测值 | `40` |
| `min_gradient_sharpness` | `number` | 最小清晰度 | `0.15` |
| `min_blur_score` | `number` | 最小模糊分数 | `0.6` |

### 活体检测设置

| 选项 | 类型 | 说明 | 默认值 |
|-----|------|------|--------|
| `action_liveness_action_list` | `LivenessAction[]` | 动作列表 | `[BLINK, MOUTH_OPEN, NOD]` |
| `action_liveness_action_count` | `number` | 需要完成的动作数 | `1` |
| `action_liveness_action_randomize` | `boolean` | 随机化动作顺序 | `true` |
| `action_liveness_verify_timeout` | `number` | 超时时间（ms） | `60000` |
| `action_liveness_min_mouth_open_percent` | `number` | 最小张嘴比例 (0-1) | `0.2` |

### 运动活体检测（防照片攻击）

| 选项 | 类型 | 说明 | 默认值 |
|-----|------|------|--------|
| `motion_liveness_strict_photo_detection` | `boolean` | 严格照片检测模式 | `false` |

> **注意**：运动活体检测使用内置的6指标投票算法，其他参数已内置优化，无需手动配置。详见[运动检测算法文档](./docs/MOTION_DETECTION_ALGORITHM.md)。

> **注意**：屏幕采集检测使用内置的4维度级联算法（屏幕闪烁、响应时间、DLP色轮、光学畸变）和屏幕轮廓检测，所有参数已内置优化，无需手动配置。详见[屏幕采集检测算法文档](./docs/SCREEN_CAPTURE_DETECTION_ALGORITHM.md)和[屏幕轮廓检测算法文档](./docs/SCREEN_CORNERS_CONTOUR_DETECTION_ALGORITHM.md)。

---

## 🛠️ API 方法参考

### 核心方法

#### `initialize(): Promise<void>`
加载并初始化检测库。**必须在使用其他功能前调用。**

```typescript
await engine.initialize()
```

#### `startDetection(videoElement): Promise<void>`
在视频元素上开始人脸检测。

```typescript
const videoEl = document.getElementById('video') as HTMLVideoElement
await engine.startDetection(videoEl)
```

#### `stopDetection(success?: boolean): void`
停止检测过程。

```typescript
engine.stopDetection(true)  // true: 显示最佳检测图像
```

#### `updateConfig(config): void`
运行时动态更新配置。

```typescript
engine.updateConfig({
  collect_min_face_ratio: 0.6,
  action_liveness_action_count: 0
})
```

#### `getOptions(): FaceDetectionEngineOptions`
获取当前配置对象。

```typescript
const config = engine.getOptions()
```

#### `getEngineState(): EngineState`
获取引擎当前状态。

```typescript
const state = engine.getEngineState()
```

---

## 📡 事件系统

引擎采用 **TypeScript 事件发射器模式**，所有事件都是类型安全的。

### 事件列表

<table>
<tr>
<td><strong>detector-loaded</strong></td>
<td>引擎初始化完成</td>
</tr>
<tr>
<td><strong>detector-info</strong></td>
<td>每帧实时检测数据</td>
</tr>
<tr>
<td><strong>detector-action</strong></td>
<td>动作活体提示与状态</td>
</tr>
<tr>
<td><strong>detector-finish</strong></td>
<td>检测完成（成功/失败）</td>
</tr>
<tr>
<td><strong>detector-error</strong></td>
<td>错误发生时触发</td>
</tr>
<tr>
<td><strong>detector-debug</strong></td>
<td>调试信息（开发用）</td>
</tr>
</table>

---

### 📋 detector-loaded

**引擎初始化完成时触发**

```typescript
interface DetectorLoadedEventData {
  success: boolean        // 初始化是否成功
  error?: string          // 错误信息（失败时）
  opencv_version?: string // OpenCV.js 版本号
  human_version?: string  // Human.js 版本号
}
```

**示例：**
```typescript
engine.on('detector-loaded', (data) => {
  if (data.success) {
    console.log('✅ 引擎就绪')
    console.log(`OpenCV ${data.opencv_version} | Human.js ${data.human_version}`)
  } else {
    console.error('❌ 初始化失败:', data.error)
  }
})
```

---

### 📊 detector-info

**每帧返回实时检测数据（高频事件）**

```typescript
interface DetectorInfoEventData {
  passed: boolean         // 是否通过静默检测
  code: DetectionCode     // 检测状态码
  message: string         // 状态消息
  faceCount: number       // 检测到的人脸数
  faceRatio: number       // 人脸占比 (0-1)
  faceFrontal: number     // 人脸正对度 (0-1)
  imageQuality: number    // 图像质量分数 (0-1)
  motionScore: number     // 运动分数 (0-1)
  keypointVariance: number // 关键点方差 (0-1)
  motionType: string      // 检测到的运动类型
  screenConfidence: number // 屏幕采集置信度 (0-1)
}
```

**检测状态码：**
```typescript
enum DetectionCode {
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',           // 未检测到人脸
  MULTIPLE_FACE = 'MULTIPLE_FACE',           // 检测到多张人脸
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',         // 人脸太小
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',         // 人脸太大
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',     // 人脸不够正面
  FACE_NOT_REAL = 'FACE_NOT_REAL',           // 疑似欺骗
  FACE_NOT_LIVE = 'FACE_NOT_LIVE',           // 活体分数过低
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',     // 图像质量过低
  FACE_CHECK_PASS = 'FACE_CHECK_PASS'        // 所有检查通过 ✅
}
```

**示例：**
```typescript
engine.on('detector-info', (data) => {
  console.log({
    检测状态: data.code,
    静默通过: data.passed ? '✅' : '❌',
    图像质量: `${(data.imageQuality * 100).toFixed(1)}%`,
    人脸正对度: `${(data.faceFrontal * 100).toFixed(1)}%`,
    运动分数: `${(data.motionScore * 100).toFixed(1)}%`,
    屏幕采集: `${(data.screenConfidence * 100).toFixed(1)}%`
  })
})
```

---

### 👤 detector-action

**动作活体提示与识别状态**

```typescript
interface DetectorActionEventData {
  action: LivenessAction          // 要执行的动作
  status: LivenessActionStatus    // 动作状态
}

enum LivenessAction {
  BLINK = 'blink',           // 眨眼
  MOUTH_OPEN = 'mouth_open', // 张嘴
  NOD = 'nod'                // 点头
}

enum LivenessActionStatus {
  STARTED = 'started',      // 提示已开始
  COMPLETED = 'completed',  // 成功识别
  TIMEOUT = 'timeout'       // 识别超时
}
```

**示例：**
```typescript
engine.on('detector-action', (data) => {
  const actionLabels = {
    'blink': '眨眼',
    'mouth_open': '张嘴',
    'nod': '点头'
  }
  
  switch (data.status) {
    case 'started':
      console.log(`👤 请执行: ${actionLabels[data.action]}`)
      // 显示 UI 提示
      break
    case 'completed':
      console.log(`✅ 已识别: ${actionLabels[data.action]}`)
      // 更新进度条
      break
    case 'timeout':
      console.log(`⏱️ 超时: ${actionLabels[data.action]}`)
      // 显示重试提示
      break
  }
})
```

---

### ✅ detector-finish

**检测流程完成（成功或失败）**

```typescript
interface DetectorFinishEventData {
  success: boolean         // 是否通过验证
  silentPassedCount: number    // 静默检测通过数
  actionPassedCount: number    // 动作完成数
  totalTime: number        // 总耗时（毫秒）
  bestQualityScore: number // 最佳图像质量 (0-1)
  bestFrameImage: string | null  // Base64 帧图像
  bestFaceImage: string | null   // Base64 人脸图像
}
```

**示例：**
```typescript
engine.on('detector-finish', (data) => {
  if (data.success) {
    console.log('🎉 活体验证成功！', {
      静默通过: `${data.silentPassedCount} 次`,
      动作完成: `${data.actionPassedCount} 次`,
      最佳质量: `${(data.bestQualityScore * 100).toFixed(1)}%`,
      总耗时: `${(data.totalTime / 1000).toFixed(2)}s`
    })
    
    // 上传结果到服务器
    if (data.bestFrameImage) {
      uploadToServer({
        image: data.bestFrameImage,
        quality: data.bestQualityScore,
        timestamp: new Date()
      })
    }
  } else {
    console.log('❌ 验证失败，请重试')
  }
})
```

---

### ⚠️ detector-error

**检测过程中发生错误**

```typescript
interface DetectorErrorEventData {
  code: ErrorCode  // 错误代码
  message: string  // 错误信息
}

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
  const errorMessages: Record<string, string> = {
    'DETECTOR_NOT_INITIALIZED': '引擎未初始化',
    'CAMERA_ACCESS_DENIED': '摄像头权限被拒绝',
    'STREAM_ACQUISITION_FAILED': '无法获取摄像头数据流',
    'SUSPECTED_FRAUDS_DETECTED': '检测到欺骗行为'
  }
  
  console.error(`❌ 错误 [${error.code}]: ${errorMessages[error.code] || error.message}`)
  showUserErrorPrompt(errorMessages[error.code])
})
```

---

### 🐛 detector-debug

**开发和故障排除的调试信息**

```typescript
interface DetectorDebugEventData {
  level: 'info' | 'warn' | 'error'  // 日志级别
  stage: string                      // 处理阶段
  message: string                    // 调试信息
  details?: Record<string, any>      // 额外详情
  timestamp: number                  // Unix 时间戳
}
```

**示例：**
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

## 📖 类型定义

### LivenessAction
```typescript
enum LivenessAction {
  BLINK = 'blink',           // 眨眼
  MOUTH_OPEN = 'mouth_open', // 张嘴
  NOD = 'nod'                // 点头
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
  VIDEO_NO_FACE = 'VIDEO_NO_FACE',           // 视频中未检测到人脸
  MULTIPLE_FACE = 'MULTIPLE_FACE',           // 检测到多张人脸
  FACE_TOO_SMALL = 'FACE_TOO_SMALL',         // 人脸尺寸小于最小阈值
  FACE_TOO_LARGE = 'FACE_TOO_LARGE',         // 人脸尺寸大于最大阈值
  FACE_NOT_FRONTAL = 'FACE_NOT_FRONTAL',     // 人脸角度不够正面
  FACE_NOT_REAL = 'FACE_NOT_REAL',           // 检测到疑似欺骗
  FACE_NOT_LIVE = 'FACE_NOT_LIVE',           // 活体分数低于阈值
  FACE_LOW_QUALITY = 'FACE_LOW_QUALITY',     // 图像质量低于最小值
  FACE_CHECK_PASS = 'FACE_CHECK_PASS'        // 所有检测检查通过 ✅
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

---

## 🎓 高级用法与示例

### 完整的 Vue 3 演示项目

有关全面的示例和高级使用模式，请参考官方演示项目：

**[Vue 演示项目](https://github.com/sssxyd/face-liveness-detector/tree/main/demos/vue-demo/)** 包括：

- ✅ 完整的 Vue 3 + TypeScript 集成
- ✅ 实时检测结果可视化
- ✅ 动态配置面板
- ✅ 所有引擎事件的完整处理
- ✅ 实时调试面板
- ✅ 响应式移动端 + 桌面端 UI
- ✅ 错误处理和用户反馈
- ✅ 结果导出和图像捕获

**快速启动演示：**

```bash
cd demos/vue-demo
npm install
npm run dev
```

然后在浏览器中打开显示的本地 URL。

---

## 📥 本地部署模型文件

### 为什么需要本地部署？

- 🚀 **提升性能** - 避免 CDN 延迟
- 🔒 **隐私保护** - 完全离线运行
- 🌐 **网络独立** - 不依赖外部连接

### 可用脚本

项目根目录提供两个下载脚本：

#### 1️⃣ 复制 Human.js 模型

```bash
node copy-models.js
```

**功能：**
- 从 `node_modules/@vladmandic/human/models` 复制模型
- 保存到 `public/models/` 目录
- 包含 `.json` 和 `.bin` 模型文件
- 自动显示文件大小和进度

#### 2️⃣ 下载 TensorFlow WASM 文件

```bash
node download-wasm.js
```

**功能：**
- 自动下载 TensorFlow.js WASM 后端
- 保存到 `public/wasm/` 目录
- 下载 4 个关键文件：
  - `tf-backend-wasm.min.js`
  - `tfjs-backend-wasm.wasm`
  - `tfjs-backend-wasm-simd.wasm`
  - `tfjs-backend-wasm-threaded-simd.wasm`
- **智能多 CDN 源** 自动回退：
  1. unpkg.com（推荐）
  2. cdn.jsdelivr.net
  3. esm.sh
  4. cdn.esm.sh

### 配置项目使用本地文件

下载完成后，在引擎初始化时指定本地路径：

```typescript
const engine = new FaceDetectionEngine({
  // 使用本地文件而不是 CDN
  human_model_path: '/models',
  tensorflow_wasm_path: '/wasm',
  
  // 其他配置...
})
```

### 自动化设置（推荐）

在 `package.json` 中配置 `postinstall` 钩子实现自动下载：

```json
{
  "scripts": {
    "postinstall": "node scripts/copy-models.js && node scripts/download-wasm.js"
  }
}
```

---

## 🌐 浏览器兼容性

| 浏览器 | 版本 | 支持 | 备注 |
|--------|------|------|------|
| Chrome | 60+ | ✅ | 完全支持 |
| Firefox | 55+ | ✅ | 完全支持 |
| Safari | 11+ | ✅ | 完全支持 |
| Edge | 79+ | ✅ | 完全支持 |

**系统要求：**

- 📱 支持 **WebRTC** 的现代浏览器
- 🔒 **HTTPS 环境**（开发可用 localhost）
- ⚙️ **WebGL** 或 **WASM** 后端支持
- 📹 **用户授权** - 需要摄像头权限

---

## 📄 许可证

[MIT License](./LICENSE) - 自由使用和修改

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

<div align="center">

**[⬆ 返回顶部](#人脸活体检测引擎)**

Made with ❤️ by [sssxyd](https://github.com/sssxyd)

</div>


