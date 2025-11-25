/**
 * Face Detection Engine - Library Loader
 * Handles loading of Human.js and OpenCV.js
 */

import Human from '@vladmandic/human'
import cvModule from '@techstark/opencv-js'

let webglAvailableCache: boolean | null = null

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
 * Load OpenCV.js
 * @returns Promise that resolves with cv module
 */
export async function loadOpenCV() {
  let cv: any
  console.log('[FaceDetectionEngine] Loading OpenCV.js...')

  if (cvModule instanceof Promise) {
    console.log('[FaceDetectionEngine] Waiting for cvModule Promise...')
    cv = await cvModule
  } else {
    if ((cvModule as any).Mat) {
      console.log('[FaceDetectionEngine] OpenCV.js already initialized')
      cv = cvModule
    } else {
      console.log('[FaceDetectionEngine] Waiting for onRuntimeInitialized...')
      await new Promise<void>(resolve => {
        cvModule.onRuntimeInitialized = () => {
          console.log('[FaceDetectionEngine] OpenCV.js initialized via callback')
          resolve()
        }
      })
      cv = cvModule
    }
  }

  return { cv }
}

/**
 * Get OpenCV module synchronously (if already loaded)
 * @returns cv module or null
 */
export function getCvSync() {
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
