/**
 * OpenCV.js 加载器
 * 基于官方示例: https://github.com/TechStark/opencv-js-examples
 */

import cvModule from '@techstark/opencv-js'

let cvInstance: any = null
let cvLoadingPromise: Promise<any> | null = null

/**
 * 获取 OpenCV 实例（单例 + 异步）
 * 官方实现，处理三种情况：
 * 1. cvModule 是 Promise - await 等待
 * 2. cvModule 已初始化（有 Mat）- 直接使用
 * 3. cvModule 需要等待 onRuntimeInitialized 回调
 */
export async function getCv(): Promise<any> {
  if (cvInstance) {
    console.log('[CVLoader] 返回已缓存实例')
    return cvInstance
  }

  if (cvLoadingPromise) {
    console.log('[CVLoader] 等待加载中...')
    return cvLoadingPromise
  }

  cvLoadingPromise = (async () => {
    try {
      console.log('[CVLoader] 开始加载 OpenCV')
      
      let cv: any
      
      if (cvModule instanceof Promise) {
        console.log('[CVLoader] cvModule 是 Promise，等待...')
        cv = await cvModule
      } else {
        console.log('[CVLoader] cvModule 已加载为对象')
        if (cvModule.Mat) {
          console.log('[CVLoader] Mat 已存在，库已初始化')
          cv = cvModule
        } else {
          console.log('[CVLoader] 等待 onRuntimeInitialized 回调...')
          await new Promise((resolve) => {
            cvModule.onRuntimeInitialized = () => {
              console.log('[CVLoader] onRuntimeInitialized 完成')
              resolve(null)
            }
          })
          cv = cvModule
        }
      }
      
      cvInstance = cv
      console.log('[CVLoader] 加载成功，cv.Mat =', !!cv.Mat)
      return cv
    } catch (error) {
      console.error('[CVLoader] 加载失败:', error)
      cvLoadingPromise = null
      throw error
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


