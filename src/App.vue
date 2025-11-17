<template>
  <div id="app">
    <h1>人脸检测 Demo</h1>
    <FaceDetector />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import FaceDetector from './components/FaceDetector.vue'

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
  text-align: center;
  color: #2c3e50;
  margin-top: 15px;
  padding: 0 10px;
  box-sizing: border-box;
}

h1 {
  color: #42b983;
  margin: 10px 0;
  font-size: 28px;
}

@media (max-width: 768px) {
  #app {
    margin-top: 10px;
    padding: 0 5px;
  }
  
  h1 {
    font-size: 22px;
    margin: 8px 0;
  }
}

@media (max-width: 480px) {
  #app {
    margin-top: 5px;
  }
  
  h1 {
    font-size: 18px;
    margin: 5px 0;
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
