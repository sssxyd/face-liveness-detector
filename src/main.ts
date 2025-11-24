import { createApp } from 'vue'
import App from './App.vue'

// 第一步：初始化 OpenCV WASM 配置（必须在导入 opencv-wasm 之前）
import './utils/opencv-init'

createApp(App).mount('#app')
