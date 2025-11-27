import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    // 分开编译打包大型库
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // 优先级1: 最大型的库先分离（避免被其他库包含）
          if (id.includes('@vladmandic/human')) {
            return 'human'
          }
          
          if (id.includes('@techstark/opencv-js')) {
            return 'opencv'
          }
          
          // 优先级2: Vue 框架单独打包
          if (id.includes('vue')) {
            return 'vue'
          }
          
          // 优先级3: 人脸检测引擎单独打包
          if (id.includes('@sssxyd/face-liveness-detector')) {
            return 'face-liveness'
          }
        }
      },
      external: ['fs', 'path', 'crypto'],
    },
    // 优化构建
    minify: 'terser',
    // 分析输出
    reportCompressedSize: true,
    chunkSizeWarningLimit: 5000, // 5MB 警告阈值（大型库）
    sourcemap: false,
  },
  resolve: {
    alias: {
      // 避免 opencv-js 引入 Node.js 模块
      fs: 'fs',
      path: 'path',
      crypto: 'crypto',
    },
  },
  optimizeDeps: {
    // 在预构建时排除大型库以加快开发
    exclude: ['@techstark/opencv-js', '@vladmandic/human', '@sssxyd/face-liveness-detector'],
    // 预构建 Vue
    include: ['vue'],
    // 为 opencv-js 添加 esbuild 选项来处理全局对象
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  ssr: {
    //opencv-js是一个浏览器专用库，避免在SSR中打包它
    noExternal: ['@techstark/opencv-js']
  },
  server: {
    port: 3000,
    sourcemapIgnoreList: (sourcePath) => {
      // 忽略 node_modules 中的 sourcemap 警告
      return sourcePath.includes('node_modules')
    },
    middlewareMode: false
  }
})
