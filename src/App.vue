<template>
  <div id="app">
    <!-- 页面导航栏 -->
    <div class="navbar">
      <h1>人脸检测 Demo</h1>
      <div class="nav-buttons">
        <button 
          class="nav-btn" 
          :class="{ active: currentPage === 'collector' }"
          @click="currentPage = 'collector'"
        >
          人脸采集
        </button>
        <button 
          class="nav-btn" 
          :class="{ active: currentPage === 'liveness' }"
          @click="currentPage = 'liveness'"
        >
          活体验证
        </button>
        <button 
          class="nav-btn" 
          :class="{ active: currentPage === 'silent_liveness' }"
          @click="currentPage = 'silent_liveness'"
        >
          静默活体
        </button>
      </div>
      <a href="https://github.com/sssxyd/js-face-detector" target="_blank" rel="noopener noreferrer" class="github-star-btn" title="Star this project on GitHub">
        <svg class="github-icon" viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
          <path d="M8 .25a.75.75 0 00-.75.75v5.69L2.28 2.28a.75.75 0 00-1.06 1.06L6.19 8l-4.97 4.97a.75.75 0 101.06 1.06l5.44-5.44V15a.75.75 0 001.5 0V.75A.75.75 0 008 .25z"/>
        </svg>
        <span>👍</span>
      </a>
    </div>

    <!-- 页面内容 -->
    <div class="page-content">
      <!-- 人脸采集页面 -->
      <FaceCollectorDemo v-if="currentPage === 'collector'" />
      <!-- 活体验证页面 -->
      <AliveCheckerDemo v-if="currentPage === 'liveness'" />
      <!-- 静默活体检测页面 -->
      <SilentLivenessDemo v-if="currentPage === 'silent_liveness'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import FaceCollectorDemo from './pages/FaceCollectorDemo.vue'
import AliveCheckerDemo from './pages/AliveCheckerDemo.vue'
import SilentLivenessDemo from './pages/SilentLivenessDemo.vue'

// 当前活动页面
const currentPage = ref<string>('collector')

// Prevent pinch zoom on mobile
onMounted(() => {
  // Prevent zoom on double tap
  let lastTouchEnd = 0
  document.addEventListener('touchend', (event) => {
    const now = Date.now()
    if (now - lastTouchEnd <= 300) {
      event.preventDefault()
    }
    lastTouchEnd = now
  }, false)
  
  // Prevent zoom on pinch
  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1) {
      event.preventDefault()
    }
  }, false)
})
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* 导航栏样式 */
.navbar {
  background-color: #ffffff;
  border-bottom: 2px solid #42b983;
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.navbar h1 {
  color: #42b983;
  margin: 0;
  font-size: 28px;
  flex: 1;
}

.nav-buttons {
  display: flex;
  gap: 10px;
}

.nav-btn {
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;
  border: 2px solid #ddd;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.nav-btn:hover {
  border-color: #42b983;
  color: #42b983;
}

.nav-btn.active {
  background-color: #42b983;
  color: white;
  border-color: #42b983;
}

/* GitHub Star按钮样式 */
.github-star-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background-color: #f0f0f0;
  color: #333;
  border: 2px solid #ddd;
  border-radius: 5px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.github-star-btn:hover {
  background-color: #ffd700;
  border-color: #ffb700;
  color: #333;
  transform: scale(1.05);
}

.github-star-btn:active {
  transform: scale(0.98);
}

.github-icon {
  display: inline-block;
  flex-shrink: 0;
}

/* 页面内容区域 */
.page-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .navbar {
    flex-direction: column;
    gap: 12px;
    padding: 12px 15px;
  }
  
  .navbar h1 {
    font-size: 22px;
    width: 100%;
    text-align: center;
  }
  
  .nav-buttons {
    width: 100%;
    justify-content: center;
  }
  
  .nav-btn {
    flex: 1;
    max-width: 150px;
    padding: 10px 12px;
    font-size: 13px;
  }

  .github-star-btn {
    padding: 8px 12px;
    font-size: 13px;
  }
  
  .page-content {
    padding: 15px;
  }
}

@media (max-width: 480px) {
  .navbar {
    padding: 10px 10px;
    gap: 8px;
  }
  
  .navbar h1 {
    font-size: 18px;
  }
  
  .nav-btn {
    padding: 8px 10px;
    font-size: 12px;
  }

  .github-star-btn {
    padding: 6px 10px;
    font-size: 12px;
  }
  
  .page-content {
    padding: 10px;
  }
}

/* Prevent text selection on mobile */
@media (max-width: 768px) {
  body {
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  
  button {
    user-select: none;
    -webkit-user-select: none;
  }
}
</style>
