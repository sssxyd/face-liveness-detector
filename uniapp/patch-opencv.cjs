#!/usr/bin/env node

/**
 * Patch script: Fix opencv.js UMD issue in ES Module
 * Replace }(this, function() { with }(globalThis, function() {
 * Reference: https://github.com/TechStark/opencv-js/issues/44
 * 
 * This is required for ESM bundle compatibility
 */

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.join(__dirname, '..')
const opencvPath = path.join(PROJECT_ROOT, 'node_modules/@techstark/opencv-js/dist/opencv.js')

console.log('🔧 Patching opencv.js for ESM compatibility...')
console.log(`📁 Project root: ${PROJECT_ROOT}`)
console.log(`📝 OpenCV path: ${opencvPath}`)

try {
  if (fs.existsSync(opencvPath)) {
    let content = fs.readFileSync(opencvPath, 'utf8')
    const originalContent = content

    // Replace 'this' with 'globalThis' in UMD pattern
    content = content.replace(
      /}\s*\(\s*this\s*,\s*function\s*\(\)\s*{/g,
      `}(globalThis, function () {`
    )

    if (content !== originalContent) {
      fs.writeFileSync(opencvPath, content, 'utf8')
      console.log('✅ Successfully patched @techstark/opencv-js for ESM compatibility')
    } else {
      console.log('ℹ️  @techstark/opencv-js is already patched or pattern not found')
    }
  } else {
    console.warn('⚠️  @techstark/opencv-js not found at', opencvPath)
    console.warn('    Make sure dependencies are installed: npm install')
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Error patching opencv.js:', error.message)
  process.exit(1)
}
