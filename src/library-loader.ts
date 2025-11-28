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
 * 预加载 OpenCV.js 以确保全局 cv 对象可用
 * 这是一个异步函数，应该在应用启动时调用
 * @param timeout - Maximum wait time in milliseconds (default: 30000)
 */
export async function preloadOpenCV(timeout: number = 30000): Promise<void> {
  // 如果已经初始化完成，直接返回
  if (opencvInitialized) {
    console.log('[OpenCV] Already initialized, skipping preload')
    return
  }

  // 如果已经在初始化中，返回现有的 Promise
  if (opencvInitPromise) {
    console.log('[OpenCV] Already initializing, reusing existing promise')
    await opencvInitPromise
    return
  }

  // 复用 loadOpenCV 的初始化逻辑
  opencvInitPromise = _initializeOpenCV(timeout)
  
  try {
    const initTime = await opencvInitPromise
    console.log('[OpenCV] Preload completed successfully ', {
      initTime: `${initTime.toFixed(2)}ms`,
      version: getOpenCVVersion()
    })
  } catch (error) {
    console.error('[OpenCV] Preload failed:', error)
    opencvInitPromise = null  // 失败时清除 Promise，允许重试
    throw error
  }
}

/**
 * Internal helper to initialize OpenCV
 * This is the core initialization logic shared by both preloadOpenCV and loadOpenCV
 */
async function _initializeOpenCV(timeout: number): Promise<boolean> {
  const initStartTime = performance.now()
  console.log('Waiting for OpenCV WASM initialization...')
  
  // 快速路径：检查是否已经初始化
  if ((cvModule as any).Mat) {
    const initTime = performance.now() - initStartTime
    console.log(`[FaceDetectionEngine] OpenCV.js already initialized, took ${initTime.toFixed(2)}ms`)
    return true
  }
  
  if (typeof globalThis !== 'undefined' && (globalThis as any).cv && (globalThis as any).cv.Mat) {
    const initTime = performance.now() - initStartTime
    console.log(`OpenCV.js already initialized (from global), took ${initTime.toFixed(2)}ms`)
    cvModule = (globalThis as any).cv
    return cvModule
  }
  
  // 确保 cvModule 在全局可用（OpenCV 会尝试访问它）
  if (typeof globalThis !== 'undefined' && !(globalThis as any).cv) {
    if (cvModule && Object.isExtensible(cvModule)) {
      (globalThis as any).cv = cvModule
      console.log('cvModule assigned to globalThis.cv')
    } else {
      console.log('cvModule is not extensible or globalThis already has cv')
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
    
    const resolveOnce = (source: string) => {
      if (finished) {
        console.log('[resolveOnce] Already finished, ignoring call from:', source)
        return
      }
      finished = true
      console.log('[resolveOnce] Marking as finished')
      
      // 立即停止所有定时器和轮询
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
          console.log('[onRuntimeInitialized] callback triggered')
          
          // 调用原始回调（如果存在）
          if (originalOnRuntimeInitialized && typeof originalOnRuntimeInitialized === 'function') {
            try {
              originalOnRuntimeInitialized()
            } catch (e) {
              console.warn('[onRuntimeInitialized] callback failed:', e)
            }
          }
          
          resolveOnce('callback')
        }
        
        console.log('[onRuntimeInitialized] callback set successfully')
      } catch (e) {
        console.warn('[onRuntimeInitialized] Failed to set callback, will use polling:', e)
      }
    } else {
      console.log('[polling] cvModule is not extensible, using polling mode')
    }
    
    // 启动轮询作为备用方案或主要方案
    pollInterval = setInterval(() => {
      // 优先检查 cvModule 中是否有 Mat
      if ((cvModule as any).Mat) {
        console.log('[polling] Found Mat in cvModule')
        resolveOnce('cvModule polling')
        return
      }
      
      // 其次检查 globalThis.cv 中是否有 Mat
      if (typeof globalThis !== 'undefined' && (globalThis as any).cv && (globalThis as any).cv.Mat) {
        console.log('[polling] Found Mat in globalThis.cv')
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
export async function loadOpenCV(timeout: number = 30000): Promise<any> { 
  try {
    // 如果已经在初始化中，复用现有的 Promise
    if (opencvInitPromise) {
      console.log('[FaceDetectionEngine] OpenCV initialization in progress, waiting...')
      try {
        await opencvInitPromise
        cv = getCvSync()
        if (cv && (cv as any).Mat) {
          console.log('[FaceDetectionEngine] OpenCV.js loaded successfully')
          return { cv }
        }
      } catch (error) {
        // 失败后清除 Promise，允许重试
        opencvInitPromise = null
        throw error
      }
    } else {
      cv = getCvSync()
      if (cv && (cv as any).Mat) {
        console.log('[FaceDetectionEngine] OpenCV.js already initialized')
        return { cv }
      }
      // 开始新的初始化
      console.log('[FaceDetectionEngine] Starting OpenCV initialization...')
      opencvInitPromise = _initializeOpenCV(timeout)
      try {
        await opencvInitPromise
        cv = getCvSync()
        if (cv && (cv as any).Mat) {
          console.log('[FaceDetectionEngine] OpenCV.js loaded successfully')
          return { cv }
        }
      } catch (error) {
        // 失败后清除 Promise，允许重试
        opencvInitPromise = null
        throw error
      }
    }

    // 如果到这里还没有返回，说明加载失败
    console.error('[FaceDetectionEngine] OpenCV module is invalid:', {
      hasMat: cv && (cv as any).Mat,
      type: typeof cv,
      keys: cv ? Object.keys(cv).slice(0, 10) : 'N/A'
    })
    throw new Error('OpenCV.js loaded but module is invalid (no Mat class found)')
  } catch (error) {
    console.error('[loadOpenCV] OpenCV.js load failed', error)
    opencvInitPromise = null  // 失败时清除 Promise，允许重试
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
 * Extract OpenCV version from getBuildInformation
 * @returns version string like "4.12.0"
 */
export function getOpenCVVersion(): string {
  try {
    const cv = getCvSync()
    if (!cv || !cv.getBuildInformation) {
      return 'unknown'
    }
    
    const buildInfo = cv.getBuildInformation()
    // 查找 "Version control:" 或 "OpenCV" 开头的行
    // 格式: "Version control:               4.12.0"
    const versionMatch = buildInfo.match(/Version\s+control:\s+(\d+\.\d+\.\d+)/i)
    if (versionMatch && versionMatch[1]) {
      return versionMatch[1]
    }
    
    // 备用方案：查找 "OpenCV X.X.X" 格式
    const opencvMatch = buildInfo.match(/OpenCV\s+(\d+\.\d+\.\d+)/i)
    if (opencvMatch && opencvMatch[1]) {
      return opencvMatch[1]
    }
    
    return 'unknown'
  } catch (error) {
    console.error('[getOpenCVVersion] Failed to get version:', error)
    return 'unknown'
  }
}

/**
 * Load Human.js
 * @param modelPath - Path to model files (optional)
 * @param wasmPath - Path to WASM files (optional)
 * @returns Promise that resolves with Human instance
 */
export async function loadHuman(modelPath?: string, wasmPath?: string): Promise<Human> {
  console.log('[loadHuman] START - creating config')
  const initStartTime = performance.now()
  const config: any = {
    backend: _detectOptimalBackend(),
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

  console.log('[loadHuman] Config:', {
    backend: config.backend,
    modelBasePath: config.modelBasePath || '(using default)',
    wasmPath: config.wasmPath || '(using default)'
  })

  console.log('[loadHuman] Creating Human instance...')
  const human = new Human(config)
  console.log('[loadHuman] Human instance created, starting load...')

  try {
    console.log('[loadHuman] Calling human.load()...')
    await human.load()
    console.log('[loadHuman] human.load() completed')
    const totalTime = performance.now() - initStartTime

    console.log('[loadHuman] Loaded successfully', {
      totalInitTime: `${totalTime.toFixed(2)}ms`,
      version: human.version
    })

    return human
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[loadHuman] Load failed:', errorMsg)
    console.error('[loadHuman] Error stack:', error instanceof Error ? error.stack : 'N/A')
    throw error
  }
}

export async function loadLibraries(
  modelPath?: string,
  wasmPath?: string,
  timeout: number = 30000
): Promise<{ cv: any; human: Human }> {
  console.log('[loadLibraries] Starting parallel load of OpenCV and Human...')
  const startTime = performance.now()

  try {
    console.log('[loadLibraries] Launching Promise.all with OpenCV and Human...')
    const [cv, human] = await Promise.all([
      loadOpenCV(timeout),
      loadHuman(modelPath, wasmPath)
    ])

    console.log('[loadLibraries] Both promises resolved')

    const totalTime = performance.now() - startTime
    console.log('[loadLibraries] libraries loaded successfully', {
      totalInitTime: `${totalTime.toFixed(2)}ms`,
      opencvVersion: getOpenCVVersion(),
      humanVersion: human.version
    })

    return { cv, human }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[loadLibraries] Failed to load libraries:', errorMsg)
    throw error
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