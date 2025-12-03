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
 */
export async function preloadResources(): Promise<boolean> {
  const env = detectUniAppEnvironment()
  
  if (!env.isUniApp || !env.modelPath || !env.wasmPath) {
    return false
  }
  
  try {
    // 尝试预加载关键资源
    const criticalFiles = [
      'models.json',
      'tf-backend-wasm.min.js'
    ]
    
    const results = await Promise.allSettled(
      criticalFiles.map(file => 
        checkResourceExists(
          file.includes('.json') 
            ? `${env.modelPath}${file}`
            : `${env.wasmPath}${file}`
        )
      )
    )
    
    const allExist = results.every(r => r.status === 'fulfilled' && r.value)
    
    if (allExist) {
      console.log('[FaceDetectionEngine] All critical resources are available')
      return true
    } else {
      console.warn('[FaceDetectionEngine] Some resources are missing')
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
