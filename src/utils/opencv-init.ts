/**
 * OpenCV WASM 初始化配置
 * 
 * 使用本地 public/wasm 路径加载 WASM 文件，避免 CORS 问题和 CDN 依赖
 * 
 * 加载流程：
 * 1. 配置 Module.locateFile 回调函数
 * 2. 设置 WASM 文件的加载路径为 /wasm/opencv.wasm
 * 3. 其他 OpenCV.js 脚本加载时会使用此配置
 */

declare global {
  interface Window {
    Module?: Record<string, any>
  }
}

/**
 * 初始化 OpenCV WASM 加载器
 * 必须在导入 opencv-wasm 之前调用
 */
export function initOpenCVWasm() {
  if (typeof window === 'undefined') {
    console.warn('[OpenCV] Not in browser environment, skipping WASM init')
    return
  }

  // 配置 OpenCV 的 Module 对象
  window.Module = {
    /**
     * locateFile 回调：决定 WASM 文件的加载位置
     * 
     * @param path - 文件相对路径（通常是 'opencv.wasm'）
     * @param scriptDirectory - 脚本所在目录
     * @returns 文件的完整加载路径
     */
    locateFile: (path: string, scriptDirectory: string) => {
      // 只处理 WASM 文件
      if (path.endsWith('.wasm')) {
        // 从本地 public/wasm 目录加载
        // 这是 Vite 中 public 文件夹的标准访问路径
        const wasmPath = '/wasm/opencv.wasm'
        console.debug(`[OpenCV] Loading WASM from: ${wasmPath}`)
        return wasmPath
      }
      
      // 其他文件使用默认路径
      return scriptDirectory + path
    }
  }

  console.log('[OpenCV] WASM loader configured successfully')
}

// 在模块加载时自动初始化
if (typeof window !== 'undefined') {
  initOpenCVWasm()
}
