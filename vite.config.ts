import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
    }
  },
  server: {
    port: 3000
  }
})
