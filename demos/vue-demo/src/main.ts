import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
// import { preloadOpenCV } from '@sssxyd/face-liveness-detector'

// 在后台预加载 OpenCV（不阻塞应用启动）
// 这样可以在用户还在操作时就完成 OpenCV 的加载
// preloadOpenCV(60000)
//   .then(() => {
//     console.log('[Main] OpenCV pre-initialization completed')
//   })
//   .catch((error: any) => {
//     console.error('[Main] OpenCV pre-initialization failed:', error)
//   })

// 立即启动应用
createApp(App).mount('#app')

