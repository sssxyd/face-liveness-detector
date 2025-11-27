/**
 * Face Detection Engine - Library Loader
 * Handles loading of Human.js and OpenCV.js
 */

import Human from '@vladmandic/human'
// 规避OpenCV的无默认导出问题
import * as cvModuleImport from '@techstark/opencv-js'

let cvModule: any = cvModuleImport
// 如果存在 default 导出（ESM/UMD 互操作），则使用 default
if (cvModuleImport && (cvModuleImport as any).default) {
  cvModule = (cvModuleImport as any).default
}

let webglAvailableCache: boolean | null = null
let opencvInitPromise: Promise<any> | null = null

function _isWebGLAvailable(): boolean {
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

function _detectOptimalBackend(): string {
  const userAgent = navigator.userAgent.toLowerCase()

  // Special browsers: prefer WASM
  if (
    (/safari/.test(userAgent) && !/chrome/.test(userAgent)) ||
    /micromessenger/i.test(userAgent) ||
    /alipay/.test(userAgent) ||
    /qq/.test(userAgent) ||
    /(wechat|alipay|qq)webview/i.test(userAgent)
  ) {
    return 'wasm'
  }

  // Desktop: prefer WebGL
  return _isWebGLAvailable() ? 'webgl' : 'wasm'
}

/**
 * OpenCV.js 初始化辅助
 * 确保在浏览器环境中正确初始化 OpenCV
 */
function _setupOpenCVGlobal() {
  // 确保全局对象可用
  if (typeof globalThis === 'undefined') {
    if (typeof window !== 'undefined') {
      (window as any).globalThis = window
    } else if (typeof self !== 'undefined') {
      (self as any).globalThis = self
    } else if (typeof global !== 'undefined') {
      (global as any).globalThis = global;
    }
  }  
}

/**
 * 预加载 OpenCV.js 以确保全局 cv 对象可用
 * 这是一个异步函数，应该在应用启动时调用
 * @param timeout - Maximum wait time in milliseconds (default: 30000)
 */
export async function preloadOpenCV(timeout: number = 30000): Promise<void> {
  // 如果已经在初始化中，返回现有的 Promise
  if (opencvInitPromise) {
    console.log('[OpenCV] Already initializing, reusing existing promise')
    await opencvInitPromise
    return
  }

  _setupOpenCVGlobal()

  // 复用 loadOpenCV 的初始化逻辑
  opencvInitPromise = _initializeOpenCV(timeout)
  
  try {
    await opencvInitPromise
    console.log('[OpenCV] Preload completed successfully')
  } catch (error) {
    console.error('[OpenCV] Preload failed:', error)
    // 失败后清除 Promise，允许重试
    opencvInitPromise = null
    throw error
  }
}

/**
 * Internal helper to initialize OpenCV
 * This is the core initialization logic shared by both preloadOpenCV and loadOpenCV
 */
async function _initializeOpenCV(timeout: number): Promise<any> {
  console.log('[FaceDetectionEngine] Waiting for OpenCV WASM initialization...')
  
  // 确保全局对象被正确设置（OpenCV 会自动初始化它）
  if (typeof globalThis !== 'undefined' && !(globalThis as any).cv) {
    if (cvModule && Object.isExtensible(cvModule)) {
      (globalThis as any).cv = cvModule
    }
  }
  
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      console.error('[FaceDetectionEngine] OpenCV.js initialization timeout')
      reject(new Error('OpenCV.js initialization timeout'))
    }, timeout)
    
    // 检查是否已经初始化
    if ((cvModule as any).Mat) {
      clearTimeout(timeoutId)
      console.log('[FaceDetectionEngine] OpenCV.js already initialized')
      resolve()
      return
    }
    
    if (typeof globalThis !== 'undefined' && (globalThis as any).cv && (globalThis as any).cv.Mat) {
      cvModule = (globalThis as any).cv
      clearTimeout(timeoutId)
      console.log('[FaceDetectionEngine] OpenCV.js already initialized (from global)')
      resolve()
      return
    }
    
    // 尝试设置回调（只有在 cvModule 可扩展时才尝试）
    const canSetCallback = cvModule && Object.isExtensible(cvModule)
    
    if (canSetCallback) {
      try {
        const originalOnRuntimeInitialized = (cvModule as any).onRuntimeInitialized
        
        (cvModule as any).onRuntimeInitialized = () => {
          clearTimeout(timeoutId)
          console.log('[FaceDetectionEngine] OpenCV.js initialized via callback')
          
          // 调用原始回调（如果存在）
          if (originalOnRuntimeInitialized && typeof originalOnRuntimeInitialized === 'function') {
            try {
              originalOnRuntimeInitialized()
            } catch (e) {
              console.warn('[FaceDetectionEngine] Original onRuntimeInitialized callback failed:', e)
            }
          }
          
          resolve()
        }
        
        console.log('[FaceDetectionEngine] onRuntimeInitialized callback set successfully')
      } catch (e) {
        console.warn('[FaceDetectionEngine] Failed to set onRuntimeInitialized callback, will use polling')
      }
    } else {
      console.log('[FaceDetectionEngine] cvModule is not extensible, using polling mode')
    }
    
    // 启动轮询作为备用方案（无论回调是否设置成功）
    const pollInterval = setInterval(() => {
      // Check cvModule
      if ((cvModule as any).Mat) {
        clearInterval(pollInterval)
        clearTimeout(timeoutId)
        console.log('[FaceDetectionEngine] OpenCV.js initialized (detected via polling)')
        resolve()
        return
      }
      
      // Check global cv
      if (typeof globalThis !== 'undefined' && (globalThis as any).cv && (globalThis as any).cv.Mat) {
        cvModule = (globalThis as any).cv
        clearInterval(pollInterval)
        clearTimeout(timeoutId)
        console.log('[FaceDetectionEngine] OpenCV.js initialized from global (detected via polling)')
        resolve()
        return
      }
    }, 100)
  })
  
  // 返回初始化后的 cv 模块
  // 优先返回 globalThis.cv（如果存在且已初始化）
  if (typeof globalThis !== 'undefined' && (globalThis as any).cv && (globalThis as any).cv.Mat) {
    cvModule = (globalThis as any).cv
    return cvModule
  }
  
  return cvModule
}

/**
 * Load OpenCV.js
 * 如果已经通过 preloadOpenCV 在加载中或加载完成，会复用其结果
 * @returns Promise that resolves with cv module
 */
export async function loadOpenCV(timeout: number = 30000): Promise<{ cv: any }> {

  _setupOpenCVGlobal()

  let cv: any
  console.log('[FaceDetectionEngine] Loading OpenCV.js...')

  try {
    // 如果已经在初始化中，复用现有的 Promise
    if (opencvInitPromise) {
      console.log('[FaceDetectionEngine] OpenCV initialization in progress, waiting...')
      cv = await opencvInitPromise
    } else if ((cvModule as any).Mat) {
      // 检查 cvModule 是否已经初始化
      console.log('[FaceDetectionEngine] OpenCV.js already initialized')
      cv = cvModule
    } else if (typeof globalThis !== 'undefined' && (globalThis as any).cv && (globalThis as any).cv.Mat) {
      // 检查全局 cv 是否已经初始化
      console.log('[FaceDetectionEngine] OpenCV.js already initialized (global)')
      cvModule = (globalThis as any).cv
      cv = cvModule
    } else {
      // 开始新的初始化
      console.log('[FaceDetectionEngine] Starting OpenCV initialization...')
      opencvInitPromise = _initializeOpenCV(timeout)
      try {
        cv = await opencvInitPromise
      } catch (error) {
        // 失败后清除 Promise，允许重试
        opencvInitPromise = null
        throw error
      }
    }

    // 最终验证
    if (!cv || !(cv as any).Mat) {
      console.error('[FaceDetectionEngine] OpenCV module is invalid:', {
        hasMat: cv && (cv as any).Mat,
        type: typeof cv,
        keys: cv ? Object.keys(cv).slice(0, 10) : 'N/A'
      })
      throw new Error('OpenCV.js loaded but module is invalid (no Mat class found)')
    }

    console.log('[FaceDetectionEngine] OpenCV.js loaded successfully')
    return { cv }
  } catch (error) {
    console.error('[FaceDetectionEngine] Failed to load OpenCV.js:', error)
    throw error
  }
}

/**
 * Get OpenCV module synchronously (if already loaded)
 * @returns cv module or null
 */
export function getCvSync() {
  // 首先检查全局 cv 对象
  if (typeof globalThis !== 'undefined' && (globalThis as any).cv && (globalThis as any).cv.Mat) {
    return (globalThis as any).cv
  }
  
  // 然后检查 cvModule
  if ((cvModule as any).Mat) {
    return cvModule
  }
  
  return null
}

/**
 * Load Human.js
 * @param modelPath - Path to model files (optional)
 * @param wasmPath - Path to WASM files (optional)
 * @returns Promise that resolves with Human instance
 */
export async function loadHuman(modelPath?: string, wasmPath?: string): Promise<Human> {
  const config = {
    backend: _detectOptimalBackend(),
    modelBasePath: modelPath,
    wasmPath: wasmPath,
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

  console.log('[FaceDetectionEngine] Human.js config:', {
    backend: config.backend,
    modelBasePath: config.modelBasePath,
    wasmPath: config.wasmPath
  })

  const human = new Human(config as any)

  console.log('[FaceDetectionEngine] Loading Human.js models...')
  const startTime = performance.now()
  await human.load()
  const loadTime = performance.now() - startTime

  console.log('[FaceDetectionEngine] Human.js loaded successfully', {
    loadTime: `${loadTime.toFixed(2)}ms`,
    version: human.version
  })

  return human
}
