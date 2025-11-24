import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'

// 自定义插件：移除 crossorigin 属性和 modulepreload 以支持 file:// 协议
function removeCrossoriginPlugin(): Plugin {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      // 移除所有 crossorigin 属性
      html = html.replace(/\s+crossorigin/g, '')
      // 移除所有 modulepreload 链接（避免 CORS 问题）
      html = html.replace(/<link\s+rel="modulepreload"[^>]*>/g, '')
      return html
    }
  }
}

export default defineConfig({
  plugins: [vue(), removeCrossoriginPlugin()],
  base: './',
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  build: {
    // 提高分块大小警告的阈值（因为 Human.js 库很大）
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // 手动配置分块策略
        manualChunks: {
          // 将 Human.js 单独分块
          'human': ['@vladmandic/human'],
          // 将 OpenCV.js 单独分块
          'opencv': ['@dalongrong/opencv-wasm'],
          // 将 Vue 框架单独分块
          'vue': ['vue']
        },
        // 不生成 modulepreload 链接
        minifyInternalExports: false
      }
    },
    // 完全禁用 modulePreload 以避免 CORS 问题
    modulePreload: false
  },
  server: {
    port: 3000,
    middlewareMode: false,
    // CORS 设置
    cors: {
      origin: '*',
      credentials: true
    }
  }
})
