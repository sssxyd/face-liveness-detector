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
let preloadPromise: Promise<void> | null = null

// 确保 OpenCV 能访问全局对象
// OpenCV.js 的 WASM 初始化会尝试设置全局的 cv 对象
if (typeof globalThis !== 'undefined' && !globalThis.cv) {
  if (cvModuleImport && (cvModuleImport as any).Mat) {
    (globalThis as any).cv = cvModuleImport
  }
}

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
  // 如果已经在预加载中，返回现有的 Promise
  if (preloadPromise) {
    return preloadPromise
  }

  _setupOpenCVGlobal()

  preloadPromise = (async () => {
    // 等待 cv 全局对象可用
    return new Promise<void>((resolve) => {
      const maxWaitTime = timeout
      const startTime = performance.now()
      
      const checkCv = () => {
        // 检查全局 cv 对象
        if ((globalThis as any).cv && (globalThis as any).cv.Mat) {
          console.log('[OpenCV] Global cv object is available')
          resolve()
          return
        }
        
        // 检查是否超时
        if (performance.now() - startTime > maxWaitTime) {
          console.warn('[OpenCV] Timeout waiting for cv global object, continuing anyway...')
          resolve() // 继续，不中断初始化流程
          return
        }
        
        // 继续检查
        setTimeout(checkCv, 100)
      }
      
      checkCv()
    })
  })()

  return preloadPromise
}

/**
 * Internal helper to wait for OpenCV initialization
 */
async function _waitForOpenCVInitialization(): Promise<void> {
  console.log('[FaceDetectionEngine] Waiting for OpenCV WASM initialization...')
  
  // 确保全局对象被正确设置
  if (typeof globalThis !== 'undefined' && !(globalThis as any).cv) {
    (globalThis as any).cv = cvModule
  }
  
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error('[FaceDetectionEngine] OpenCV.js initialization timeout')
      reject(new Error('OpenCV.js initialization timeout'))
    }, 30000) // 30 second timeout
    
    try {
      // WASM 初始化时会调用此回调
      let originalOnRuntimeInitialized: any = null
      try {
        originalOnRuntimeInitialized = (cvModule as any).onRuntimeInitialized
      } catch (e) {
        // 忽略读取错误
      }
      
      try {
        (cvModule as any).onRuntimeInitialized = () => {
          clearTimeout(timeout)
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
      } catch (e) {
        console.warn('[FaceDetectionEngine] Failed to set onRuntimeInitialized callback, falling back to polling:', e)
        // 如果无法设置回调（例如 cvModule 是只读的），启动轮询
        const pollInterval = setInterval(() => {
          if ((cvModule as any).Mat) {
            clearInterval(pollInterval)
            clearTimeout(timeout)
            resolve()
          }
        }, 100)
      }
      
      // 如果已经初始化，立即调用
      if ((cvModule as any).Mat) {
        clearTimeout(timeout)
        resolve()
      }
    } catch (e) {
      clearTimeout(timeout)
      reject(e)
    }
  })
}

/**
 * Load OpenCV.js
 * 如果已经通过 preloadOpenCV 在加载中或加载完成，会复用其结果
 * @returns Promise that resolves with cv module
 */
export async function loadOpenCV() {

  _setupOpenCVGlobal()

  let cv: any
  console.log('[FaceDetectionEngine] Loading OpenCV.js...')

  try {
    // 首先检查是否已有预加载的 Promise
    if (preloadPromise) {
      console.log('[FaceDetectionEngine] Waiting for preload OpenCV Promise...')
      await preloadPromise
    }

    // 检查 cvModule 是否已经是一个 Promise（WASM 加载中）
    if (cvModule instanceof Promise) {
      console.log('[FaceDetectionEngine] Waiting for cvModule Promise...')
      cv = await cvModule
    } else {
      // 检查 cvModule 是否已经初始化
      if ((cvModule as any).Mat) {
        console.log('[FaceDetectionEngine] OpenCV.js already initialized')
        cv = cvModule
      } else {
        // cvModule 可能是一个对象，但 WASM 还未初始化
        await _waitForOpenCVInitialization()
        cv = cvModule
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
