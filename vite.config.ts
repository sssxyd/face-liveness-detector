import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
          'opencv': ['@techstark/opencv-js'],
          // 将 Vue 框架单独分块
          'vue': ['vue']
        }
      }
    },
    // 使用 esbuild 进行压缩（Vite 默认压缩器）
    minify: 'esbuild'
  },
  // 配置优化选项
  optimizeDeps: {
    // 排除 Human 库的预构建（很大）
    exclude: ['@vladmandic/human'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  server: {
    port: 3000
  }
})
