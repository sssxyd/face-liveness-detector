/**
 * 人脸检测 - 工具函数
 * 包含浏览器检测、WebGL 检查等辅助函数
 */

import type { BrowserInfo, WebGLStatus } from './types'

/**
 * 检测浏览器信息
 * @returns {BrowserInfo} 浏览器信息对象
 */
export function detectBrowserInfo(): BrowserInfo {
  const userAgent = navigator.userAgent.toLowerCase()
  
  return {
    isSafari: /safari/.test(userAgent) && !/chrome/.test(userAgent),
    isWeChat: /micromessenger/i.test(userAgent),
    isAlipay: /alipay/.test(userAgent),
    isQQ: /qq/.test(userAgent),
    isWebView: /(wechat|alipay|qq)webview/i.test(userAgent),
    isMobile: /android|iphone|ipad|ipod/.test(userAgent) || window.innerWidth < 768
  }
}

/**
 * 检查 WebGL 是否可用（缓存结果以避免重复检测）
 */
let webglAvailableCache: boolean | null = null

export function isWebGLAvailable(): boolean {
  // 如果已经检测过，直接返回缓存结果
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

/**
 * 获取 WebGL 详细信息
 */
export function getWebGLInfo(): WebGLStatus {
  if (!isWebGLAvailable()) {
    return { available: false }
  }

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl') || canvas.getContext('webgl2')
    
    if (!context) {
      return { available: false }
    }

    const debugInfo = context.getExtension('WEBGL_debug_renderer_info')
    if (debugInfo) {
      return {
        available: true,
        vendor: context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
        version: context.getParameter(context.VERSION)
      }
    }

    return { available: true }
  } catch (e) {
    return { available: false }
  }
}
