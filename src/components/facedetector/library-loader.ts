/**
 * 人脸检测 - 工具函数
 * 包含浏览器检测、WebGL 检查等辅助函数
 */

import Human from '@vladmandic/human';
import cvModule from "@techstark/opencv-js";

/**
 * 检查 WebGL 是否可用（缓存结果以避免重复检测）
 */
let webglAvailableCache: boolean | null = null

function _isWebGLAvailable(): boolean {
  // 如果已经检测过，直接返回缓存结果
  if (webglAvailableCache !== null) {
    return webglAvailableCache
  }

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl') || canvas.getContext('webgl2')
    webglAvailableCache = !!context
    return webglAvailableCache
  } catch (e) {
    webglAvailableCache = false
    return false
  }
}

export async function loadOpenCV() {
  let cv: any
  console.log('开始加载 OpenCV.js...')
  if (cvModule instanceof Promise) { // 如果是 Promise，等待其解析
    console.log('等待 cvModule Promise 解析...')
    cv = await cvModule
  } else { 
    if ((cvModule as any).Mat) { // 如果已初始化，直接使用
      console.log('OpenCV.js 已初始化，直接使用')
      cv = cvModule
    } else { // 如果未初始化，等待 onRuntimeInitialized 回调，添加超时保护和原有回调保留
      // 等待 onRuntimeInitialized 回调，添加超时保护和原有回调保留
      const startTime = performance.now()
      await new Promise<void>((resolve) => {
        cvModule.onRuntimeInitialized = () => resolve();
        console.log('OpenCV.js 初始化完成，回调触发')
      });
      cv = cvModule;
      const initTime = performance.now() - startTime
      console.log(`OpenCV 初始化完成，耗时: ${initTime.toFixed(2)}ms`)
    }
  }
  return { cv }
}

export function getCvSync() {
  if ((cvModule as any).Mat) { // 如果已初始化，直接使用
    return cvModule
  }
  return null
}


/**
 * 检测最优的推理后端
 * @private
 */
function _detectOptimalBackend(): string {
  // 检测浏览器类型
  const userAgent = navigator.userAgent.toLowerCase()

  // 特殊浏览器：优先使用 WASM
  if (
    /safari/.test(userAgent) && !/chrome/.test(userAgent) ||
    /micromessenger/i.test(userAgent) ||
    /alipay/.test(userAgent) ||
    /qq/.test(userAgent) ||
    /(wechat|alipay|qq)webview/i.test(userAgent)
  ) {
    return 'wasm'
  }

  // 移动设备
  const isMobile = /android|iphone|ipad|ipod/.test(userAgent) || window.innerWidth < 768

  if (isMobile) {
    return _isWebGLAvailable() ? 'webgl' : 'wasm'
  }

  // 桌面设备：优先 WebGL
  return _isWebGLAvailable() ? 'webgl' : 'wasm'
}

export async function loadHuman(modelPath?: string, wasmPath?: string): Promise<Human> {
  const config = {
    // 自动检测最优后端
    backend: _detectOptimalBackend(),
    // 模型文件本地路径
    modelBasePath: modelPath,
    // WASM 文件本地路径
    wasmPath: wasmPath,
    // 人脸检测配置
    face: {
      enabled: true,
      detector: { rotation: false, return: true },
      mesh: { enabled: true },
      iris: { enabled: false },
      antispoof: { enabled: true },
      liveness: { enabled: true }
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: true }
  }

  console.log('Human.js 配置:', {
    backend: config.backend,
    modelBasePath: config.modelBasePath,
    wasmPath: config.wasmPath
  })  

  // 创建 Human 实例
  const human = new Human(config as any)

  // 加载模型
  const loadStartTime = performance.now()
  console.log('等待 human.load()...')
  await human.load()
  const loadTime = performance.now() - loadStartTime

  console.log('Human.js 加载成功', {
    loadTime: `${loadTime.toFixed(2)}ms`,
    modelsCount: human.models ? Object.keys(human.models).length : 0
  })

  return human  
}