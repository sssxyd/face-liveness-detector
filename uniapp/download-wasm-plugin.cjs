#!/usr/bin/env node

/**
 * UniApp Plugin WASM Downloader
 * Downloads TensorFlow.js WASM files for the plugin
 * 
 * Usage: node uniapp/download-wasm-plugin.cjs <output-directory>
 *        or: npm run download-wasm:plugin
 */

const path = require('path')
const { execSync } = require('child_process')
const fs = require('fs')

// Get output directory from command line or use default
let outputDir = process.argv[2]

if (!outputDir) {
  // Default to plugin's wasm directory
  const ROOT_DIR = path.join(__dirname, '..')
  const pluginId = 'xuydap-facedetection' // Read from package.json
  try {
    const pkgPath = path.join(__dirname, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      const id = pkg.name || 'xuydap-facedetection'
      outputDir = path.join(ROOT_DIR, 'dist-uniapp', id, 'static', 'wasm')
    } else {
      outputDir = path.join(ROOT_DIR, 'dist-uniapp', pluginId, 'static', 'wasm')
    }
  } catch (e) {
    outputDir = path.join(__dirname, '..', 'dist-uniapp', pluginId, 'static', 'wasm')
  }
}

// Ensure output directory is absolute
if (!path.isAbsolute(outputDir)) {
  outputDir = path.resolve(outputDir)
}

console.log('📦 Downloading TensorFlow.js WASM files...\n')
console.log(`📁 Output directory: ${outputDir}\n`)

try {
  const ROOT_DIR = path.join(__dirname, '..')
  const downloadScript = path.join(ROOT_DIR, 'scripts', 'download-wasm.cjs')
  
  // Pass absolute path to download script
  execSync(`node "${downloadScript}" "${outputDir}"`, {
    stdio: 'inherit',
    cwd: ROOT_DIR
  })
  
  console.log('\n✅ WASM files downloaded successfully\n')
  process.exit(0)
} catch (error) {
  console.error('\n❌ Error downloading WASM:', error.message)
  console.log('\n💡 Tips:')
  console.log('  1. Check your network connection')
  console.log('  2. Try using VPN or proxy')
  console.log('  3. Retry the command: npm run download-wasm:plugin')
  console.log('  4. Or manually download files to: ' + outputDir)
  console.log('\n📌 Note: The project can still work without local WASM files')
  console.log('   It will use online CDN resources instead.\n')
  process.exit(1)
}
