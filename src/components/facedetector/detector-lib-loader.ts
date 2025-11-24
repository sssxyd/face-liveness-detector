/**
 * 人脸检测库加载器
 * 负责异步加载 OpenCV.js 和 Human.js 两个库
 * 当两个库都加载完成后，触发 ready 事件
 */

import Human from '@vladmandic/human'
import cvModule, { CV } from '@techstark/opencv-js'

export interface LoaderConfig {
  humanConfig?: Record<string, any>
}

export interface LoaderResult {
  cv: CV
  human: Human
}

export class DetectorLibLoader {
  private cv: any = null
  private human: Human | null = null
  private loadingPromise: Promise<LoaderResult> | null = null
  private cvLoadingPromise: Promise<any> | null = null
  private readyCallbacks: ((result: LoaderResult) => void)[] = []
  private errorCallbacks: ((error: Error) => void)[] = []

  /**
   * 异步加载 OpenCV 和 Human.js
   * @param {LoaderConfig} config - 配置选项
   * @returns {Promise<LoaderResult>} 加载结果
   */
  async load(config: LoaderConfig = {}): Promise<LoaderResult> {
    // 如果已经加载完成，直接返回
    if (this.cv && this.human) {
      console.log('[DetectorLibLoader] 库已加载，返回缓存实例')
      return { cv: this.cv, human: this.human }
    }

    // 如果正在加载，返回现有的 Promise
    if (this.loadingPromise) {
      console.log('[DetectorLibLoader] 库正在加载中，等待...')
      return this.loadingPromise
    }

    // 开始加载
    this.loadingPromise = this._performLoad(config)
    return this.loadingPromise
  }

  /**
   * 执行加载逻辑
   * @private
   */
  private async _performLoad(config: LoaderConfig): Promise<LoaderResult> {
    try {
      console.log('[DetectorLibLoader] 开始加载 OpenCV 和 Human.js')

      // 并行加载两个库
      const [cv, human] = await Promise.all([
        this._loadOpenCV(),
        this._loadHuman(config.humanConfig)
      ])

      this.cv = cv
      this.human = human

      console.log('[DetectorLibLoader] 库加载完成')

      // 触发 ready 回调
      this._triggerReady({ cv, human })

      return { cv, human }
    } catch (error) {
      console.error('[DetectorLibLoader] 库加载失败:', error)
      this.loadingPromise = null
      this._triggerError(error as Error)
      throw error
    }
  }

  /**
   * 加载 OpenCV.js
   * 基于官方示例: https://github.com/TechStark/opencv-js-examples
   * @private
   */
  private async _loadOpenCV(): Promise<any> {
    try {
      console.log('[DetectorLibLoader] 开始加载 OpenCV.js')

      // 如果已经加载完成，直接返回
      if (this.cvLoadingPromise) {
        console.log('[DetectorLibLoader] OpenCV 正在加载中，等待...')
        return this.cvLoadingPromise
      }

      this.cvLoadingPromise = this._performOpenCVLoad()
      return this.cvLoadingPromise
    } catch (error) {
      console.error('[DetectorLibLoader] OpenCV.js 加载失败:', error)
      // OpenCV 是可选的，加载失败不中断流程
      console.warn('[DetectorLibLoader] 将继续加载 Human.js（OpenCV 为可选）')
      return null
    }
  }

  /**
   * 执行 OpenCV 加载逻辑
   * @private
   */
  private async _performOpenCVLoad(): Promise<any> {
    try {
      console.log('[DetectorLibLoader] 开始初始化 OpenCV')
      console.log('[DetectorLibLoader] cvModule 类型:', typeof cvModule, 'instanceof Promise:', cvModule instanceof Promise)

      let cv: CV

      if (cvModule instanceof Promise) {
        console.log('[DetectorLibLoader] cvModule 是 Promise，等待...')
        cv = await cvModule
      } else {
        console.log('[DetectorLibLoader] cvModule 已加载为对象')

        if (cvModule.Mat) {
          console.log('[DetectorLibLoader] Mat 已存在，库已初始化')
          cv = cvModule
        } else {
          console.log('[DetectorLibLoader] 等待 onRuntimeInitialized 回调...')

          // 关键：使用 timeout 防止死等
          cv = await Promise.race([
            new Promise<any>((resolve) => {
              const originalCallback = cvModule.onRuntimeInitialized
              cvModule.onRuntimeInitialized = () => {
                console.log('[DetectorLibLoader] onRuntimeInitialized 回调触发')
                // 保留原有回调
                if (typeof originalCallback === 'function') {
                  originalCallback()
                }
                resolve(cvModule)
              }
            }),
            new Promise<any>((_, reject) => {
              setTimeout(() => {
                reject(new Error('[DetectorLibLoader] onRuntimeInitialized 超时（10秒）'))
              }, 10000)
            })
          ])
        }
      }

      // 最终检查
      if (!cv || !cv.Mat) {
        throw new Error('OpenCV 初始化失败：Mat 类不可用')
      }

      console.log('[DetectorLibLoader] OpenCV.js 加载成功')
      return cv
    } catch (error) {
      console.error('[DetectorLibLoader] OpenCV 加载失败:', error)
      this.cvLoadingPromise = null
      throw error
    }
  }

  /**
   * 加载 Human.js
   * @private
   */
  private async _loadHuman(humanConfig?: Record<string, any>): Promise<Human> {
    try {
      console.log('[DetectorLibLoader] 开始加载 Human.js')

      // 合并配置
      const config = this._mergeHumanConfig(humanConfig)
      console.log('[DetectorLibLoader] Human.js 配置:', {
        backend: config.backend,
        modelBasePath: config.modelBasePath,
        wasmPath: config.wasmPath
      })

      // 创建 Human 实例
      const human = new Human(config as any)

      // 加载模型
      const loadStartTime = performance.now()
      console.log('[DetectorLibLoader] 等待 human.load()...')
      await human.load()
      const loadTime = performance.now() - loadStartTime

      console.log('[DetectorLibLoader] Human.js 加载成功', {
        loadTime: `${loadTime.toFixed(2)}ms`,
        modelsCount: human.models ? Object.keys(human.models).length : 0
      })

      return human
    } catch (error) {
      console.error('[DetectorLibLoader] Human.js 加载失败:', error)
      throw error
    }
  }

  /**
   * 合并 Human.js 配置
   * @private
   */
  private _mergeHumanConfig(userConfig?: Record<string, any>): Record<string, any> {
    const defaultConfig = {
      // 自动检测最优后端
      backend: this._detectOptimalBackend(),
      // 模型文件本地路径
      modelBasePath: './models',
      // WASM 文件本地路径
      wasmPath: './wasm',
      // 人脸检测配置
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

    // 如果用户没有提供自定义配置，直接返回默认配置
    if (!userConfig || Object.keys(userConfig).length === 0) {
      return defaultConfig
    }

    // 深度合并用户配置和默认配置
    return {
      ...defaultConfig,
      ...userConfig,
      face: {
        ...defaultConfig.face,
        ...(userConfig?.face || {})
      }
    }
  }

  /**
   * 检测最优的推理后端
   * @private
   */
  private _detectOptimalBackend(): string {
    // 检测浏览器类型
    const userAgent = navigator.userAgent.toLowerCase()

    // 特殊浏览器：优先使用 WASM
    if (
      /safari/.test(userAgent) && !/chrome/.test(userAgent) ||
      /micromessenger/i.test(userAgent) ||
      /alipay/.test(userAgent) ||
      /qq/.test(userAgent) ||
      /(wechat|alipay|qq)webview/i.test(userAgent)
    ) {
      return 'wasm'
    }

    // 移动设备
    const isMobile = /android|iphone|ipad|ipod/.test(userAgent) || window.innerWidth < 768

    if (isMobile) {
      return this._isWebGLAvailable() ? 'webgl' : 'wasm'
    }

    // 桌面设备：优先 WebGL
    return this._isWebGLAvailable() ? 'webgl' : 'wasm'
  }

  /**
   * 检查 WebGL 是否可用
   * @private
   */
  private _isWebGLAvailable(): boolean {
    try {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('webgl') || canvas.getContext('webgl2')
      return !!context
    } catch (e) {
      return false
    }
  }

  /**
   * 注册 ready 事件回调
   */
  onReady(callback: (result: LoaderResult) => void): void {
    this.readyCallbacks.push(callback)
  }

  /**
   * 注册错误事件回调
   */
  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback)
  }

  /**
   * 触发 ready 回调
   * @private
   */
  private _triggerReady(result: LoaderResult): void {
    this.readyCallbacks.forEach(callback => {
      try {
        callback(result)
      } catch (error) {
        console.error('[DetectorLibLoader] ready 回调执行出错:', error)
      }
    })
  }

  /**
   * 触发错误回调
   * @private
   */
  private _triggerError(error: Error): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error)
      } catch (err) {
        console.error('[DetectorLibLoader] error 回调执行出错:', err)
      }
    })
  }

  /**
   * 检查是否已加载
   */
  isLoaded(): boolean {
    return this.cv !== null && this.human !== null
  }

  /**
   * 检查是否正在加载
   */
  isLoading(): boolean {
    return this.loadingPromise !== null
  }

  /**
   * 获取加载的库实例
   */
  getLibraries(): LoaderResult | null {
    if (this.cv && this.human) {
      return { cv: this.cv, human: this.human }
    }
    return null
  }

  /**
   * 重置加载器状态（用于测试或重新加载）
   */
  reset(): void {
    this.cv = null
    this.human = null
    this.loadingPromise = null
    this.cvLoadingPromise = null
    this.readyCallbacks = []
    this.errorCallbacks = []
    console.log('[DetectorLibLoader] 加载器已重置')
  }
}

// 导出单例实例
export const libLoader = new DetectorLibLoader()

export function getCvSync(): CV | null {
  return libLoader.getLibraries()?.cv || null
}