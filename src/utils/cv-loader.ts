/**
 * OpenCV.js 加载器
 * 
 * @techstark/opencv-js 需要异步初始化
 * 可能是 Promise，也可能需要等待 onRuntimeInitialized 回调
 */

import cvModule from '@techstark/opencv-js'

let cvInstance: any = null
let cvLoadingPromise: Promise<any> | null = null

/**
 * 获取 OpenCV 实例（单例 + 异步）
 * 正确处理 Promise 和 onRuntimeInitialized 两种初始化方式
 */
export async function getCv(): Promise<any> {
  if (cvInstance) {
    return cvInstance
  }

  // 如果正在加载，等待现有的加载完成
  if (cvLoadingPromise) {
    return cvLoadingPromise
  }

  cvLoadingPromise = (async () => {
    try {
      let cv: any

      // 检查是否是 Promise
      if (cvModule instanceof Promise) {
        cv = await cvModule
      } else {
        // 检查是否已经初始化
        if (cvModule.Mat) {
          cv = cvModule
        } else {
          // 等待 onRuntimeInitialized 回调
          await new Promise((resolve) => {
            cvModule.onRuntimeInitialized = () => resolve(null)
          })
          cv = cvModule
        }
      }

      cvInstance = cv
      console.log('[CVLoader] OpenCV 加载成功')
      return cv
    } catch (error) {
      console.error('[CVLoader] OpenCV 加载失败:', error)
      // 返回一个空代理对象，防止后续代码崩溃
      return new Proxy({}, {
        get: () => {
          console.warn('[CVLoader] OpenCV 未加载')
          return undefined
        }
      })
    } finally {
      cvLoadingPromise = null
    }
  })()

  return cvLoadingPromise
}

/**
 * 检查 OpenCV 是否已加载
 */
export function isCvLoaded(): boolean {
  return cvInstance !== null
}

/**
 * 同步获取 OpenCV（仅在已加载的情况下）
 * 在异步加载完成后使用
 */
export function getCvSync(): any {
  if (!cvInstance) {
    console.warn('[CVLoader] OpenCV 未加载或未完成初始化，请先调用 getCv()')
  }
  return cvInstance
}


