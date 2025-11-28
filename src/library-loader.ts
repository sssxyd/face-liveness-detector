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
let opencvInitPromise: Promise<boolean> | null = null

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

type BrowserEngine = 'chromium' | 'webkit' | 'gecko' | 'other'

function _detectBrowserEngine(userAgent: string): BrowserEngine {
  const ua = userAgent.toLowerCase()
  
  // 检测 Gecko (Firefox)
  if (/firefox/i.test(ua) && !/seamonkey/i.test(ua)) {
    return 'gecko'
  }
  
  // 检测 WebKit (Safari, iOS browsers)
  // Safari 的特征：有 Safari 但没有 Chrome
  if (/safari/i.test(ua) && !/chrome|chromium|crios|edge|edgios|edg|brave|opera|vivaldi|whale|arc|yabrowser|samsung|kiwi|ghostery/i.test(ua)) {
    return 'webkit'
  }
  
  // 检测 Chromium/Blink
  // Chrome-based browsers: Chrome, Chromium, Edge, Brave, Opera, Vivaldi, Whale, Arc, etc.
  if (/chrome|chromium|crios|edge|edgios|edg|brave|opera|vivaldi|whale|arc|yabrowser|samsung|kiwi|ghostery/i.test(ua)) {
    return 'chromium'
  }
  
  // 默认为 other
  return 'other'
}

function _getOptimalBackendForEngine(engine: BrowserEngine): 'webgl' | 'wasm' {
  // 针对不同内核的优化策略
  const backendConfig = {
    chromium: 'webgl' as const,  // Chromium 内核：优先 WebGL
    webkit: 'wasm' as const,     // WebKit（Safari、iOS）：使用 WASM
    gecko: 'webgl' as const,     // Firefox：优先 WebGL
    other: 'wasm' as const       // 未知浏览器：保守使用 WASM
  }
  
  return backendConfig[engine]
}

function _detectOptimalBackend(preferredBackend?: 'auto' | 'webgl' | 'wasm'): string {
  // If user explicitly specified a backend, honor it (unless it's 'auto')
  if (preferredBackend && preferredBackend !== 'auto') {
    console.log('[Backend Detection] Using user-specified backend:', {
      backend: preferredBackend,
      userAgent: navigator.userAgent
    })
    return preferredBackend
  }

  const userAgent = navigator.userAgent.toLowerCase()
  const engine = _detectBrowserEngine(userAgent)
  
  console.log('[Backend Detection] Detected browser engine:', {
    engine,
    userAgent: navigator.userAgent
  })
  
  // 获取该内核的推荐后端
  let preferredBackendForEngine = _getOptimalBackendForEngine(engine)
  
  // 对于 Chromium 和 Gecko，检查 WebGL 是否可用
  if (preferredBackendForEngine === 'webgl') {
    const hasWebGL = _isWebGLAvailable()
    console.log('[Backend Detection] WebGL availability check:', {
      engine,
      hasWebGL,
      selectedBackend: hasWebGL ? 'webgl' : 'wasm'
    })
    
    return hasWebGL ? 'webgl' : 'wasm'
  }
  
  // 对于 WebKit 和 other，直接使用 WASM
  console.log('[Backend Detection] Using backend for engine:', {
    engine,
    backend: preferredBackendForEngine
  })
  
  return preferredBackendForEngine
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
async function _initializeOpenCV(timeout: number): Promise<boolean> {
  const initStartTime = performance.now()
  console.log('[FaceDetectionEngine] Waiting for OpenCV WASM initialization...')
  
  // 快速路径：检查是否已经初始化
  if ((cvModule as any).Mat) {
    const initTime = performance.now() - initStartTime
    console.log(`[FaceDetectionEngine] OpenCV.js already initialized, took ${initTime.toFixed(2)}ms`)
    return true
  }
  
  if (typeof globalThis !== 'undefined' && (globalThis as any).cv && (globalThis as any).cv.Mat) {
    const initTime = performance.now() - initStartTime
    console.log(`[FaceDetectionEngine] OpenCV.js already initialized (from global), took ${initTime.toFixed(2)}ms`)
    cvModule = (globalThis as any).cv
    return cvModule
  }
  
  // 确保 cvModule 在全局可用（OpenCV 会尝试访问它）
  if (typeof globalThis !== 'undefined' && !(globalThis as any).cv) {
    if (cvModule && Object.isExtensible(cvModule)) {
      (globalThis as any).cv = cvModule
      console.log('[FaceDetectionEngine] cvModule assigned to globalThis.cv')
    } else {
      console.log('[FaceDetectionEngine] cvModule is not extensible or globalThis already has cv')
    }
  }
  
  return new Promise<any>((resolve, reject) => {
    let pollInterval: NodeJS.Timeout | null = null
    
    const timeoutId = setTimeout(() => {
      console.error('[FaceDetectionEngine] OpenCV.js initialization timeout after ' + timeout + 'ms')
      if (pollInterval) {
        clearInterval(pollInterval)
      }
      reject(new Error('OpenCV.js initialization timeout'))
    }, timeout)
    
    let resolved = false
    
    const resolveOnce = (source: string) => {
      if (resolved) return
      resolved = true
      clearTimeout(timeoutId)
      if (pollInterval) {
        clearInterval(pollInterval)
      }
      const initTime = performance.now() - initStartTime
      console.log(`[FaceDetectionEngine] OpenCV.js initialized (${source}), took ${initTime.toFixed(2)}ms`)
      resolve(true)
    }
    
    // 尝试设置回调（只有在 cvModule 可扩展时才尝试）
    const canSetCallback = cvModule && Object.isExtensible(cvModule)
    
    if (canSetCallback) {
      try {
        const originalOnRuntimeInitialized = (cvModule as any).onRuntimeInitialized
        
        (cvModule as any).onRuntimeInitialized = () => {
          console.log('[FaceDetectionEngine] onRuntimeInitialized callback triggered')
          
          // 调用原始回调（如果存在）
          if (originalOnRuntimeInitialized && typeof originalOnRuntimeInitialized === 'function') {
            try {
              originalOnRuntimeInitialized()
            } catch (e) {
              console.warn('[FaceDetectionEngine] Original onRuntimeInitialized callback failed:', e)
            }
          }
          
          resolveOnce('callback')
        }
        
        console.log('[FaceDetectionEngine] onRuntimeInitialized callback set successfully')
      } catch (e) {
        console.warn('[FaceDetectionEngine] Failed to set onRuntimeInitialized callback, will use polling:', e)
      }
    } else {
      console.log('[FaceDetectionEngine] cvModule is not extensible, using polling mode')
    }
    
    // 启动轮询作为备用方案或主要方案
    pollInterval = setInterval(() => {
      // 优先检查 cvModule 中是否有 Mat
      if ((cvModule as any).Mat) {
        resolveOnce('cvModule polling')
        return
      }
      
      // 其次检查 globalThis.cv 中是否有 Mat
      if (typeof globalThis !== 'undefined' && (globalThis as any).cv && (globalThis as any).cv.Mat) {
        cvModule = (globalThis as any).cv
        resolveOnce('globalThis.cv polling')
        return
      }
    }, 100)
  })
}

/**
 * Load OpenCV.js
 * 如果已经通过 preloadOpenCV 在加载中或加载完成，会复用其结果
 * @returns Promise that resolves with cv module
 */
export async function loadOpenCV(timeout: number = 30000): Promise<{ cv: any }> {
  let cv: any
  console.log('[FaceDetectionEngine] Loading OpenCV.js...')

  try {
    // 如果已经在初始化中，复用现有的 Promise
    if (opencvInitPromise) {
      console.log('[FaceDetectionEngine] OpenCV initialization in progress, waiting...')
      try {
        await opencvInitPromise
        cv = getCvSync()
      } catch (error) {
        // 失败后清除 Promise，允许重试
        opencvInitPromise = null
        throw error
      }
    } else {
      cv = getCvSync()
      if(cv && cv.Mat) {
        console.log('[FaceDetectionEngine] OpenCV.js already initialized')
        return { cv }
      }
      // 开始新的初始化
      console.log('[FaceDetectionEngine] Starting OpenCV initialization...')
      opencvInitPromise = _initializeOpenCV(timeout)
      try {
        await opencvInitPromise
        cv = getCvSync()
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
 * @param preferredBackend - Preferred TensorFlow backend: 'auto' | 'webgl' | 'wasm' (default: 'auto')
 * @returns Promise that resolves with Human instance
 */
export async function loadHuman(modelPath?: string, wasmPath?: string, preferredBackend?: 'auto' | 'webgl' | 'wasm'): Promise<Human> {
  const config: any = {
    backend: _detectOptimalBackend(preferredBackend),
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

  // 只在提供了路径时才设置，否则让 Human.js 使用默认加载策略
  if (modelPath) {
    config.modelBasePath = modelPath
  }
  if (wasmPath) {
    config.wasmPath = wasmPath
  }

  console.log('[FaceDetectionEngine] Human.js config:', {
    backend: config.backend,
    modelBasePath: config.modelBasePath || '(using default)',
    wasmPath: config.wasmPath || '(using default)',
    userAgent: navigator.userAgent,
    platform: navigator.platform
  })

  const initStartTime = performance.now()
  console.log('[FaceDetectionEngine] Creating Human instance...')
  
  let human: Human
  try {
    human = new Human(config)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error during Human instantiation'
    console.error('[FaceDetectionEngine] Failed to create Human instance:', errorMsg)
    throw new Error(`Human instantiation failed: ${errorMsg}`)
  }
  
  const instanceCreateTime = performance.now() - initStartTime
  console.log(`[FaceDetectionEngine] Human instance created, took ${instanceCreateTime.toFixed(2)}ms`)

  // 验证 Human 实例
  if (!human) {
    throw new Error('Human instance is null after creation')
  }

  console.log('[FaceDetectionEngine] Loading Human.js models...')
  const modelLoadStartTime = performance.now()
  
  try {
    // 添加超时机制防止无限等待
    const loadTimeout = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Human.js load() timeout after 60 seconds - possible issue with model loading on mobile'))
      }, 60000)
    })

    // 竞速：哪个先完成就用哪个
    await Promise.race([
      human.load(),
      loadTimeout
    ])

    const loadTime = performance.now() - modelLoadStartTime
    const totalTime = performance.now() - initStartTime

    console.log('[FaceDetectionEngine] Human.js loaded successfully', {
      modelLoadTime: `${loadTime.toFixed(2)}ms`,
      totalInitTime: `${totalTime.toFixed(2)}ms`,
      version: human.version,
      config: human.config
    })

    // 验证加载后的 Human 实例有必要的方法和属性
    if (typeof human.detect !== 'function') {
      throw new Error('Human.detect method not available after loading')
    }

    if (!human.version) {
      console.warn('[FaceDetectionEngine] Human.js loaded but version is missing')
    }

    // 打印加载的模型信息
    if (human.models) {
      const loadedModels = Object.entries(human.models).map(([name, model]: [string, any]) => ({
        name,
        loaded: model?.loaded || model?.state === 'loaded',
        type: typeof model
      }))
      console.log('[FaceDetectionEngine] Loaded models:', {
        totalModels: Object.keys(human.models).length,
        models: loadedModels,
        allModels: Object.keys(human.models)
      })
    } else {
      console.warn('[FaceDetectionEngine] human.models is not available')
    }

    // 额外验证：检查模型是否加载成功
    if (!human.models || Object.keys(human.models).length === 0) {
      console.warn('[FaceDetectionEngine] Warning: human.models appears to be empty after loading')
    }

    return human
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    const stack = error instanceof Error ? error.stack : 'N/A'
    
    console.error('[FaceDetectionEngine] Human.js load failed:', {
      errorMsg,
      stack,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      humanVersion: human?.version,
      humanConfig: human?.config
    })
    
    throw new Error(`Human.js loading failed: ${errorMsg}`)
  }
}

/**
 * Extract OpenCV version from getBuildInformation
 * @returns version string like "4.12.0"
 */
export function getOpenCVVersion() {
    try {
        const cv = getCvSync();
        if (!cv || !cv.getBuildInformation) {
            return 'unknown';
        }
        const buildInfo = cv.getBuildInformation();
        // 查找 "Version control:" 或 "OpenCV" 开头的行
        // 格式: "Version control:               4.12.0"
        const versionMatch = buildInfo.match(/Version\s+control:\s+(\d+\.\d+\.\d+)/i);
        if (versionMatch && versionMatch[1]) {
            return versionMatch[1];
        }
        // 备用方案：查找 "OpenCV X.X.X" 格式
        const opencvMatch = buildInfo.match(/OpenCV\s+(\d+\.\d+\.\d+)/i);
        if (opencvMatch && opencvMatch[1]) {
            return opencvMatch[1];
        }
        return 'unknown';
    }
    catch (error) {
        console.error('[getOpenCVVersion] Failed to get version:', error);
        return 'unknown';
    }
}