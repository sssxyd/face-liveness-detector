# DCloud 插件安装指南

## 系统要求

### 开发环境
- HBuilderX 3.0+ (推荐 4.0+)
- Node.js 14+

### 运行环境

#### uni-app
- **H5 平台**：现代浏览器（Chrome、Firefox、Safari、Edge）
- **App 平台**：
  - iOS 12+
  - Android 5.0+ (API 21+)
  - 需要 WASM 和 WebGL 支持

#### uni-app x（推荐）
- 最低版本：4.0+
- 支持平台：HarmonyOS、Android、iOS

### 浏览器需求
- 支持 WebGL 的现代浏览器
- 支持 WebAssembly (WASM)
- 支持 getUserMedia (摄像头权限)

## 安装步骤

### 1. 从 DCloud 插件市场安装（推荐）
1. 打开 HBuilderX
2. 进入 `工具 → 插件市场`
3. 搜索 `sssxyd-facedetection`
4. 点击`导入`将插件导入到项目的 `uni_modules` 目录

### 2. 手动安装
将整个 `sssxyd-facedetection` 文件夹复制到项目的 `uni_modules` 目录

### 3. 在项目中使用

#### 在 Vue 3 + TypeScript 中使用

```typescript
import { FaceLivenessDetectorSDK } from 'uni_modules/sssxyd-facedetection/js_sdk/face-detection-sdk.js'

export default {
  data() {
    return {
      detector: null
    }
  },
  async mounted() {
    // 创建检测器实例
    this.detector = new FaceLivenessDetectorSDK({    
      min_face_ratio: 0.5,
      max_face_ratio: 0.9,
      liveness_action_count: 1
    })
    
    // 监听事件
    this.detector.on('detector-loaded', () => {
      console.log('✅ 检测器已准备')
    })
    
    this.detector.on('detector-finish', (data) => {
      if (data.success) {
        console.log('✅ 活体检测通过！')
        console.log('最佳人脸图片:', data.bestFaceImage)
      } else {
        console.log('❌ 活体检测失败')
      }
    })
    
    this.detector.on('detector-error', (error) => {
      console.error('❌ 检测错误:', error.message)
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
  // 资源路径（自动检测）
  human_model_path: '/uni_modules/sssxyd-facedetection/static/models/',
  tensorflow_wasm_path: '/uni_modules/sssxyd-facedetection/static/wasm/',
  
  // 检测设置
  video_width: 640,
  video_height: 640,
  
  // 质量设置
  min_face_ratio: 0.3,      // 最小人脸占比
  max_face_ratio: 0.9,      // 最大人脸占比
  min_face_frontal: 0.9,    // 最小人脸正对度
  min_image_quality: 0.5,   // 最小图像质量
  
  // 活体设置
  silent_detect_count: 3,       // 静默检测次数
  liveness_action_count: 1,     // 动作检测次数
  liveness_action_list: ['blink', 'mouth_open', 'nod']
})
```

## 平台支持

| 平台 | 支持 | 说明 |
|------|------|------|
| iOS App | ✅ | iOS 12+ (uni-app 或 uni-app x) |
| Android App | ✅ | Android 5.0+ (uni-app 或 uni-app x) |
| H5/Web | ✅ | 需要 HTTPS 或 localhost |
| HarmonyOS | ✅ | uni-app x 4.0+ (推荐) |
| 微信小程序 | ❌ | 不支持 WASM 和 WebGL |
| 支付宝小程序 | ❌ | 不支持 WASM 和 WebGL |
| 抖音/头条小程序 | ❌ | 不支持 WASM 和 WebGL |
| 其他小程序 | ❌ | 不支持 WASM 和 WebGL |
| 快应用-华为 | ❌ | 不支持 WASM 和完整 WebGL |
| 快应用-联盟 | ❌ | 不支持 WASM 和完整 WebGL |

### 不支持的平台说明

#### 小程序平台（微信、支付宝、抖音/头条等）
本插件依赖 WebAssembly、WebGL 和标准摄像头 API (getUserMedia)，这些在小程序沙箱环境中不可用。

#### 快应用平台（华为、OPPO、小米、vivo 等）
快应用使用轻量级 JavaScript 引擎，不支持 WebAssembly，无法加载 OpenCV.js 和 TensorFlow.js WASM 后端，且 WebGL 支持不完整。

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

- **查看完整文档**：README.md
- **查看示例代码**：demos/vue-demo
- **提交问题**：https://github.com/sssxyd/face-liveness-detector/issues
- **DCloud 官方文档**：https://uniapp.dcloud.net.cn/
