<template>
  <div id="app">
    <!-- 页面导航栏 -->
    <div class="navbar">
      <div class="navbar-title">
        <a href="https://github.com/sssxyd/js-face-detector" target="_blank" rel="noopener noreferrer" class="github-star-btn" title="Star this project on GitHub">
          <svg class="github-icon" viewBox="0 0 16 16" fill="currentColor" width="24" height="24">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <span>点个⭐呗</span>
        </a>
      </div>
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
    </div>

    <!-- 页面内容 -->
    <div class="page-content">
      <!-- 人脸采集页面 -->
      <FaceCollectorDemo v-if="currentPage === 'collector'" />
      <!-- 活体验证页面 -->
      <ActionLivenessDemo v-if="currentPage === 'action_liveness'" />
      <!-- 静默活体检测页面 -->
      <SilentLivenessDemo v-if="currentPage === 'silent_liveness'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import FaceCollectorDemo from './pages/FaceCollectorDemo.vue'
import ActionLivenessDemo from './pages/ActionLivenessDemo.vue'
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

.navbar-title {
  color: #42b983;
  margin: 0;
  font-size: 28px;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.navbar-title span {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
  font-size: 16px;
  font-weight: 500;
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
  gap: 4px;
  padding: 4px 8px;
  background-color: transparent;
  color: #42b983;
  border: none;
  border-radius: 3px;
  text-decoration: none;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.github-star-btn:hover {
  background-color: rgba(66, 185, 131, 0.1);
  transform: scale(1.1);
}

.github-star-btn:active {
  transform: scale(0.95);
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
  
  .navbar-title {
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
