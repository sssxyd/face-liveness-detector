#!/usr/bin/env node

/**
 * UniApp SDK Build Script
 * Packages the face detection library as a UniApp plugin
 * 
 * Usage: node build-uniapp-sdk.js
 */

const fs = require('fs-extra')
const path = require('path')
const { execSync } = require('child_process')

const ROOT_DIR = process.cwd()
const DIST_DIR = path.join(ROOT_DIR, 'dist', 'uniapp')
const PLUGIN_DIR = path.join(ROOT_DIR, 'dist', 'face-liveness-detector-plugin')

console.log('🚀 Building UniApp SDK Plugin...\n')

// Step 1: Clean previous builds
console.log('📦 Step 1: Cleaning previous builds...')
try {
  fs.removeSync(DIST_DIR)
  fs.removeSync(PLUGIN_DIR)
  console.log('✅ Cleaned previous builds\n')
} catch (error) {
  console.error('❌ Error cleaning builds:', error.message)
  process.exit(1)
}

// Step 2: Build with Rollup (UniApp config)
console.log('📦 Step 2: Building with Rollup...')
try {
  execSync('npm run build:uniapp', { stdio: 'inherit' })
  console.log('✅ Build completed\n')
} catch (error) {
  console.error('❌ Error during build:', error.message)
  process.exit(1)
}

// Step 2.5: Patch OpenCV.js in bundled code
console.log('📦 Step 2.5: Patching OpenCV.js in bundles...')
try {
  execSync('node scripts/patch-build-opencv.cjs', { stdio: 'inherit' })
  console.log('✅ OpenCV.js patching completed\n')
} catch (error) {
  console.error('⚠ Warning: OpenCV.js patching failed:', error.message)
  console.log('⚠ Continuing build (patch may not be necessary if not bundled)\n')
}

// Step 3: Create plugin package structure
console.log('📦 Step 3: Creating plugin package structure...')
try {
  // Create directories
  fs.ensureDirSync(path.join(PLUGIN_DIR, 'js_sdk'))
  fs.ensureDirSync(path.join(PLUGIN_DIR, 'static', 'models'))
  fs.ensureDirSync(path.join(PLUGIN_DIR, 'static', 'wasm'))
  fs.ensureDirSync(path.join(PLUGIN_DIR, 'changelog'))

  // Copy SDK files
  fs.copySync(
    path.join(DIST_DIR, 'face-detection-sdk.js'),
    path.join(PLUGIN_DIR, 'js_sdk', 'face-detection-sdk.js')
  )

  // Copy models and WASM
  const modelsDir = path.join(DIST_DIR, 'models')
  const wasmDir = path.join(DIST_DIR, 'wasm')
  
  if (fs.existsSync(modelsDir)) {
    fs.copySync(modelsDir, path.join(PLUGIN_DIR, 'static', 'models'))
  }
  
  if (fs.existsSync(wasmDir)) {
    fs.copySync(wasmDir, path.join(PLUGIN_DIR, 'static', 'wasm'))
  }

  // Copy types if available
  const typesDir = path.join(DIST_DIR, 'types')
  if (fs.existsSync(typesDir)) {
    fs.copySync(typesDir, path.join(PLUGIN_DIR, 'js_sdk', 'types'))
  }

  console.log('✅ Plugin structure created\n')
} catch (error) {
  console.error('❌ Error creating plugin structure:', error.message)
  process.exit(1)
}

// Step 4: Create plugin.json (DCloud format)
console.log('📦 Step 4: Creating plugin configuration...')
try {
  const pluginConfig = {
    name: 'face-liveness-detector',
    version: getPackageVersion(),
    description: 'Pure JS/TS implementation of liveness face detection SDK for UniApp',
    author: 'xuyd',
    license: 'MIT',
    platforms: {
      'ios': {
        'Cloud': false,
        'AppCloud': false
      },
      'android': {
        'Cloud': false,
        'AppCloud': false
      },
      'h5': {
        'Cloud': false,
        'AppCloud': false
      }
    },
    dependencies: {
      '@vladmandic/human': '^3.3.0',
      '@techstark/opencv-js': '^4.12.0-release.1'
    },
    permissions: [
      {
        'name': 'CAMERA',
        'reason': 'Used for face detection and liveness verification'
      }
    ],
    apis: [
      {
        name: 'FaceLivenessDetectorSDK',
        description: 'Main SDK class for face liveness detection',
        methods: [
          {
            name: 'initialize',
            description: 'Initialize the detection engine'
          },
          {
            name: 'startDetection',
            description: 'Start face detection from video element'
          },
          {
            name: 'stopDetection',
            description: 'Stop face detection'
          },
          {
            name: 'on',
            description: 'Register event listener'
          },
          {
            name: 'off',
            description: 'Unregister event listener'
          }
        ]
      }
    ]
  }

  fs.writeJsonSync(
    path.join(PLUGIN_DIR, 'plugin.json'),
    pluginConfig,
    { spaces: 2 }
  )

  console.log('✅ Plugin configuration created\n')
} catch (error) {
  console.error('❌ Error creating plugin config:', error.message)
  process.exit(1)
}

// Step 5: Create README for UniApp plugin
console.log('📦 Step 5: Creating documentation...')
try {
  const readme = `# 人脸活体检测 SDK (Face Liveness Detector)

## 简介

人脸活体检测 SDK 是一个纯 JavaScript/TypeScript 实现的客户端活体检测库，基于 Human.js 和 OpenCV.js。

**主要特性：**
- ✅ 纯前端实现，无需后端服务
- ✅ 支持 App 和 H5 平台
- ✅ 多种活体检测动作（眨眼、张嘴、点头）
- ✅ 实时人脸质量评估
- ✅ 自动选择最优后端（WebGL/WASM）
- ✅ 详细的事件通知和调试日志

## 安装

### 方式一：从 DCloud 插件市场安装
在 UniApp 项目中，通过插件市场搜索"人脸活体检测"并安装。

### 方式二：手动安装
将插件包复制到项目的 uni_modules 目录

## 快速开始

### 基础使用

import FaceLivenessDetector from '@sssxyd/face-liveness-detector/uniapp'

const detector = new FaceLivenessDetector({
  min_face_ratio: 0.3,
  max_face_ratio: 0.9,
  liveness_action_count: 1,
  liveness_action_list: ['blink', 'mouth_open']
})

detector.on('detector-loaded', (data) => {
  console.log('检测器初始化完成', data)
})

detector.on('detector-finish', (data) => {
  if (data.success) {
    console.log('活体检测成功！')
    console.log('最佳人脸图片:', data.bestFaceImage)
  } else {
    console.log('活体检测失败')
  }
})

detector.on('detector-error', (error) => {
  console.error('检测错误:', error.message)
})

await detector.initialize()

const videoElement = document.getElementById('video')
await detector.startDetection(videoElement)

### 配置选项

min_face_ratio: 0.3 (最小人脸占比)
max_face_ratio: 0.9 (最大人脸占比)
min_face_frontal: 0.6 (最小人脸正对度)
min_image_quality: 0.5 (最小图像质量分数)
silent_detect_count: 3 (无动作检测次数)
liveness_action_count: 1 (活体动作次数)
liveness_action_list: ['blink'] (活体动作类型)
liveness_verify_timeout: 10000 (活体动作超时时间 ms)
detection_frame_delay: 100 (帧处理延迟 ms)
error_retry_delay: 500 (错误重试延迟 ms)
video_width: 640 (视频宽度)
video_height: 480 (视频高度)
video_mirror: true (视频镜像翻转)
tensorflow_backend: 'auto' (auto | webgl | wasm)

## 事件回调

### detector-loaded
初始化完成事件
data.success: boolean
data.opencv_version: string
data.human_version: string

### detector-finish
检测完成事件
data.success: boolean
data.silentPassedCount: number
data.actionPassedCount: number
data.totalTime: number (ms)
data.bestQualityScore: number (0-1)
data.bestFrameImage: string (Base64)
data.bestFaceImage: string (Base64)

### detector-error
错误事件
error.code: string
error.message: string

### detector-action
活体动作事件
action.action: 'blink' | 'mouth_open' | 'nod'
action.status: 'STARTED' | 'COMPLETED' | 'TIMEOUT'

### detector-info
实时检测信息（调试用）
info.passed: boolean
info.code: number
info.size: number (人脸占比)
info.frontal: number (正对度)
info.quality: number (图像质量)

## 完整示例

参考 demos/vue-demo 目录中的 Vue 示例项目。

## 平台支持

iOS App: 需要 iOS 12+
Android App: 需要 Android 5.0+
H5/Web: 需要 HTTPS 环境
微信小程序: 不支持
支付宝小程序: 不支持
其他小程序: 不支持

## 性能优化建议

1. 预加载资源：在应用启动时调用 preloadResources() 预加载模型
2. 销毁实例：检测完成后及时调用 stopDetection()
3. 网络优化：确保良好的网络环境加载模型文件
4. 后端选择：自动检测最优后端，也可手动指定 tensorflow_backend

## 故障排除

### 模型加载失败
- 检查网络连接
- 确认模型文件存在
- 查看浏览器控制台的详细错误信息

### 人脸未检测到
- 检查光线是否充足
- 确保脸部正对摄像头
- 调整 min_face_ratio 和 max_face_ratio

### 检测不准确
- 增加 silent_detect_count 提高准确率
- 调整 min_image_quality 图像质量阈值
- 检查 min_face_frontal 人脸正对度要求

## 许可证
MIT

## 作者
xuyd <sssxyd@gmail.com>

## 支持
如有问题，请在 GitHub 提交 Issue：
https://github.com/sssxyd/face-liveness-detector/issues
`

  fs.writeFileSync(
    path.join(PLUGIN_DIR, 'README.md'),
    readme
  )

  console.log('✅ Documentation created\n')
} catch (error) {
  console.error('❌ Error creating documentation:', error.message)
  process.exit(1)
}

// Step 6: Create package manifest
console.log('📦 Step 6: Creating package manifest...')
try {
  const packageJson = {
    name: '@sssxyd/face-liveness-detector-uniapp',
    version: getPackageVersion(),
    description: 'Face liveness detection SDK for UniApp',
    main: 'js_sdk/face-detection-sdk.js',
    types: 'js_sdk/types/index.d.ts',
    files: [
      'js_sdk',
      'static',
      'plugin.json',
      'README.md',
      'changelog'
    ],
    scripts: {
      test: 'echo "Error: no test specified" && exit 1'
    },
    keywords: [
      'face-detection',
      'liveness-detection',
      'uniapp',
      'face-recognition',
      'anti-spoofing'
    ],
    author: 'xuyd <sssxyd@gmail.com>',
    license: 'MIT',
    peerDependencies: {
      '@vladmandic/human': '^3.3.0',
      '@techstark/opencv-js': '^4.12.0-release.1'
    },
    repository: {
      type: 'git',
      url: 'git+https://github.com/sssxyd/face-liveness-detector.git'
    },
    bugs: {
      url: 'https://github.com/sssxyd/face-liveness-detector/issues'
    },
    homepage: 'https://github.com/sssxyd/face-liveness-detector#readme'
  }

  fs.writeJsonSync(
    path.join(PLUGIN_DIR, 'package.json'),
    packageJson,
    { spaces: 2 }
  )

  console.log('✅ Package manifest created\n')
} catch (error) {
  console.error('❌ Error creating package manifest:', error.message)
  process.exit(1)
}

// Step 7: Create changelog template
console.log('📦 Step 7: Creating changelog...')
try {
  const changelog = `# 更新日志

## v${getPackageVersion()} (${new Date().toISOString().split('T')[0]})

### 新增
- UniApp 插件版本发布
- 支持 App 和 H5 平台
- 自动资源路径配置
- 平台检测和兼容性检查

### 改进
- 优化模型加载性能
- 改进错误提示信息
- 增加详细的调试日志

### 修复
- 修复资源加载路径问题
`

  fs.writeFileSync(
    path.join(PLUGIN_DIR, 'changelog', 'en.md'),
    changelog
  )

  fs.writeFileSync(
    path.join(PLUGIN_DIR, 'changelog', 'zh.md'),
    changelog.replace(/Updated/g, '更新').replace(/Added/g, '新增').replace(/Improved/g, '改进')
  )

  console.log('✅ Changelog created\n')
} catch (error) {
  console.error('❌ Error creating changelog:', error.message)
  process.exit(1)
}

// Step 8: Create install guide
console.log('📦 Step 8: Creating installation guide...')
try {
  const installGuide = `# 安装指南

## 系统要求
- UniApp 项目
- Node.js 14+
- npm 或 yarn

## 安装步骤

### 1. 从 npm 安装（推荐）
npm install @sssxyd/face-liveness-detector
yarn add @sssxyd/face-liveness-detector

### 2. 导入到项目
在你的 Vue 组件中：

import { FaceLivenessDetectorSDK } from '@sssxyd/face-liveness-detector/uniapp'

export default {
  data() {
    return {
      detector: null
    }
  },
  async mounted() {
    this.detector = new FaceLivenessDetectorSDK({
      liveness_action_count: 1
    })
    
    this.detector.on('detector-loaded', () => {
      console.log('检测器已准备')
    })
    
    this.detector.on('detector-finish', (data) => {
      console.log('检测完成', data)
    })
    
    this.detector.on('detector-error', (error) => {
      console.error('检测错误', error)
    })
    
    await this.detector.initialize()
  },
  methods: {
    async startDetection() {
      const video = document.getElementById('face-detection-video')
      await this.detector.startDetection(video)
    }
  }
}

## 配置说明

### 必需配置
无强制配置，所有配置都有默认值

### 推荐配置
const detector = new FaceLivenessDetectorSDK({
  min_face_ratio: 0.3,        // 最小人脸占比
  max_face_ratio: 0.9,        // 最大人脸占比
  silent_detect_count: 5,     // 无动作检测次数
  liveness_action_count: 1,   // 活体动作次数
})

## 依赖管理

本插件依赖以下库：
- @vladmandic/human (^3.3.0)
- @techstark/opencv-js (^4.12.0)

这些依赖会自动安装。

## 常见问题

### Q: 支持小程序吗？
A: 不支持。活体检测需要访问摄像头，小程序出于安全考虑不允许这样的权限。

### Q: 需要服务器吗？
A: 不需要。所有检测都在客户端完成，无需后端支持。

### Q: 如何保证隐私？
A: 所有检测数据都在客户端处理，不会上传到服务器。

### Q: 如何自定义检测参数？
A: 通过 FaceLivenessDetectorSDK 的配置对象进行自定义。

## 获取帮助
如有问题，请：
1. 查看 README.md 文档
2. 查看示例项目 demos/vue-demo
3. 提交 GitHub Issue
`

  fs.writeFileSync(
    path.join(PLUGIN_DIR, 'INSTALL.md'),
    installGuide
  )

  console.log('✅ Installation guide created\n')
} catch (error) {
  console.error('❌ Error creating installation guide:', error.message)
  process.exit(1)
}

console.log('✅ UniApp SDK Plugin build completed!')
console.log(`\n📁 Output directory: ${PLUGIN_DIR}\n`)

console.log('📋 Package contents:')
console.log('  ├── js_sdk/')
console.log('  │   ├── face-detection-sdk.js (UMD bundle - complete & self-contained)')
console.log('  │   └── types/ (TypeScript definitions)')
console.log('  ├── static/')
console.log('  │   ├── models/ (AI models)')
console.log('  │   └── wasm/ (WebAssembly files)')
console.log('  ├── plugin.json (plugin manifest)')
console.log('  ├── package.json (npm package info)')
console.log('  ├── README.md (usage guide)')
console.log('  ├── INSTALL.md (installation guide)')
console.log('  └── changelog/ (update logs)\n')

console.log('🚀 Next steps:')
console.log('  1. Review the generated files')
console.log('  2. Update changelog with release notes')
console.log('  3. Publish to npm: npm publish')
console.log('  4. Submit to DCloud plugin marketplace\n')

/**
 * Get version from package.json
 */
function getPackageVersion() {
  try {
    const pkg = fs.readJsonSync(path.join(ROOT_DIR, 'package.json'))
    return pkg.version || '0.0.0'
  } catch (error) {
    return '0.0.0'
  }
}
