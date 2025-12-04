/**
 * Face Detection Engine - UniApp Resource Manager
 * Handles loading of models and WASM files in UniApp environment
 */

/**
 * 获取资源路径（考虑 static 目录）
 * 支持 UniApp App、H5、小程序等多个平台
 * @param relativePath - 相对路径（相对于插件的 static 目录）
 * @returns 完整的资源路径
 */
export function getResourcePath(relativePath: string): string {
  // 优先使用 UniApp 官方方式判断平台
  try {
    const uni = (globalThis as any).uni
    const systemInfo = uni?.getSystemInfoSync?.()
    
    if (systemInfo?.uniPlatform) {
      // 小程序环境
      if (systemInfo.uniPlatform.startsWith('mp-')) {
        return `plugin://face-liveness-detector/static/${relativePath}`
      }
      
      // App 环境（Android/iOS）
      if (systemInfo.uniPlatform === 'app' || systemInfo.uniPlatform === 'app-plus') {
        // App 环境下使用相对路径或 plus:// 协议
        return `/uni_modules/face-liveness-detector/static/${relativePath}`
      }
      
      // H5/Web 环境
      if (systemInfo.uniPlatform === 'h5' || systemInfo.uniPlatform === 'web') {
        return `/uni_modules/face-liveness-detector/static/${relativePath}`
      }
    }
  } catch (error) {
    // 如果 uni API 不可用，继续使用 fallback
  }
  
  // Fallback：使用 userAgent 判断（备选方案）
  const userAgent = navigator.userAgent.toLowerCase()
  
  // 检测是否在小程序环境中
  // 小程序的 userAgent 通常包含特定的标识
  if (/micromessenger|alipay|swan|toutiao|qq|kuaishou/i.test(userAgent)) {
    return `plugin://face-liveness-detector/static/${relativePath}`
  }
  
  // 默认使用 H5/Web 路径
  return `/uni_modules/face-liveness-detector/static/${relativePath}`
}

/**
 * 获取模型文件基础路径
 * @returns 模型文件所在目录的路径
 */
export function getModelBasePath(): string {
  return getResourcePath('models/')
}

/**
 * 获取 WASM 文件路径
 * @returns WASM 文件所在目录的路径
 */
export function getWasmPath(): string {
  return getResourcePath('wasm/')
}

/**
 * 检查资源是否存在（H5 环境）
 * @param url - 资源 URL
 * @returns Promise<boolean>
 */
export async function checkResourceExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' })
    return response.status === 200
  } catch (error) {
    return false
  }
}

/**
 * UniApp 环境检测
 */
export function detectUniAppEnvironment(): {
  isUniApp: boolean
  platform: string
  modelPath: string
  wasmPath: string
} {
  // 检查是否在 UniApp 环境中（安全的全局对象检查）
  const isUniApp = typeof globalThis !== 'undefined' && (globalThis as any).uni !== undefined
  
  let platform = 'unknown'
  let modelPath = ''
  let wasmPath = ''
  
  if (isUniApp) {
    try {
      // 获取当前运行平台
      const uni = (globalThis as any).uni
      const systemInfo = uni?.getSystemInfoSync?.()
      platform = systemInfo?.platform || 'unknown'
      
      // 根据平台设置路径
      if (systemInfo?.uniPlatform) {
        switch (systemInfo.uniPlatform) {
          case 'app':
          case 'app-plus':
            // 原生 App 环境
            modelPath = getModelBasePath()
            wasmPath = getWasmPath()
            break
          case 'h5':
          case 'web':
            // H5 环境
            modelPath = getModelBasePath()
            wasmPath = getWasmPath()
            break
          case 'mp-wechat':
          case 'mp-alipay':
          case 'mp-baidu':
          case 'mp-toutiao':
          case 'mp-qq':
          case 'mp-kuaishou':
            // 小程序环境 - 需要特殊处理
            console.warn('[FaceDetectionEngine] Models are not supported in mini-program environment')
            break
          default:
            modelPath = getModelBasePath()
            wasmPath = getWasmPath()
        }
      }
    } catch (error) {
      console.warn('[FaceDetectionEngine] Error detecting UniApp environment:', error)
      return {
        isUniApp: false,
        platform: 'unknown',
        modelPath: '',
        wasmPath: ''
      }
    }
  }
  
  return {
    isUniApp,
    platform,
    modelPath,
    wasmPath
  }
}

/**
 * 在 UniApp 中初始化资源路径
 * 应该在应用启动时调用
 */
export function initializeUniAppResources(): void {
  const env = detectUniAppEnvironment()
  
  if (!env.isUniApp) {
    console.warn('[FaceDetectionEngine] Not running in UniApp environment')
    return
  }
  
  console.log('[FaceDetectionEngine] Initialized in UniApp environment:', {
    platform: env.platform,
    modelPath: env.modelPath,
    wasmPath: env.wasmPath
  })
  
  // 如果在小程序环境中，记录警告
  if (env.platform.includes('mp-')) {
    console.error('[FaceDetectionEngine] Face detection is not supported in mini-program environments')
    console.error('[FaceDetectionEngine] Supported platforms: App, H5, Web')
  }
}

/**
 * 预加载资源文件（可选，用于提前缓存）
 * 加载所有必需的模型文件和 WASM 后端
 */
export async function preloadResources(): Promise<boolean> {
  const env = detectUniAppEnvironment()
  
  if (!env.isUniApp || !env.modelPath || !env.wasmPath) {
    console.warn('[FaceDetectionEngine] Cannot preload: UniApp environment not detected or paths not available')
    return false
  }
  
  try {
    console.log('[FaceDetectionEngine] Starting resource preload...')
    
    // 需要预加载的关键资源列表
    const resourcesLoads = [
      // 1. 模型索引文件
      fetch(`${env.modelPath}models.json`).then(r => {
        if (!r.ok) throw new Error(`Failed to load models.json: ${r.statusText}`)
        return r.json()
      }),
      
      // 2. 人脸检测模型（必需）
      fetch(`${env.modelPath}blazeface.json`).then(r => r.json()),
      fetch(`${env.modelPath}blazeface.bin`).then(r => {
        if (!r.ok) throw new Error(`Failed to load blazeface.bin: ${r.statusText}`)
        return r.arrayBuffer()
      }),
      
      // 3. 人脸网格模型（必需）
      fetch(`${env.modelPath}facemesh.json`).then(r => r.json()),
      fetch(`${env.modelPath}facemesh.bin`).then(r => {
        if (!r.ok) throw new Error(`Failed to load facemesh.bin: ${r.statusText}`)
        return r.arrayBuffer()
      }),
      
      // 4. 虹膜检测模型（可选但推荐）
      fetch(`${env.modelPath}iris_landmark.json`).catch(() => null),
      fetch(`${env.modelPath}iris_landmark.bin`).catch(() => null),
      
      // 5. 活体检测模型（推荐）
      fetch(`${env.modelPath}liveness.json`).then(r => r.json()),
      fetch(`${env.modelPath}liveness.bin`).then(r => {
        if (!r.ok) throw new Error(`Failed to load liveness.bin: ${r.statusText}`)
        return r.arrayBuffer()
      }),
      
      // 6. 防欺骗检测模型（推荐）
      fetch(`${env.modelPath}antispoof.json`).then(r => r.json()),
      fetch(`${env.modelPath}antispoof.bin`).then(r => {
        if (!r.ok) throw new Error(`Failed to load antispoof.bin: ${r.statusText}`)
        return r.arrayBuffer()
      }),
      
      // 7. WASM 后端 JavaScript
      fetch(`${env.wasmPath}tf-backend-wasm.min.js`).then(r => {
        if (!r.ok) throw new Error(`Failed to load tf-backend-wasm.min.js: ${r.statusText}`)
        return r.text()
      }),
      
      // 8. WASM 二进制文件
      fetch(`${env.wasmPath}tfjs-backend-wasm.wasm`).then(r => {
        if (!r.ok) throw new Error(`Failed to load tfjs-backend-wasm.wasm: ${r.statusText}`)
        return r.arrayBuffer()
      }),
      
      // 9. WASM SIMD 版本（性能优化）
      fetch(`${env.wasmPath}tfjs-backend-wasm-simd.wasm`).catch(() => null),
      
      // 10. WASM 多线程版本（性能优化）
      fetch(`${env.wasmPath}tfjs-backend-wasm-threaded-simd.wasm`).catch(() => null)
    ]
    
    const results = await Promise.allSettled(resourcesLoads)
    
    // 统计加载结果
    const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null)).length
    
    console.log(`[FaceDetectionEngine] Resource preload completed: ${successful} succeeded, ${failed} failed/optional`)
    
    // 记录失败的资源
    if (failed > 0) {
      results.forEach((r, index) => {
        if (r.status === 'rejected') {
          console.warn(`[FaceDetectionEngine] Failed to preload resource ${index}:`, r.reason)
        }
      })
    }
    
    // 只要关键资源加载成功就返回 true
    // 关键资源：models.json, blazeface, facemesh, liveness, antispoof, wasm
    const criticalLoads = results.slice(0, 12)
    const criticalSuccessful = criticalLoads.filter(r => r.status === 'fulfilled' && r.value !== null).length
    const allCriticalLoaded = criticalSuccessful >= 10 // 至少加载主要的模型和 WASM
    
    if (allCriticalLoaded) {
      console.log('[FaceDetectionEngine] All critical resources preloaded successfully')
      return true
    } else {
      console.error('[FaceDetectionEngine] Some critical resources failed to preload')
      return false
    }
  } catch (error) {
    console.error('[FaceDetectionEngine] Error preloading resources:', error)
    return false
  }
}

export default {
  getResourcePath,
  getModelBasePath,
  getWasmPath,
  checkResourceExists,
  detectUniAppEnvironment,
  initializeUniAppResources,
  preloadResources
}
