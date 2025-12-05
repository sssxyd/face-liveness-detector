#!/usr/bin/env node

/**
 * UniApp SDK Build Script
 * Packages the face detection library as a UniApp plugin
 * 
 * Usage: node uniapp/build.cjs
 */

const fs = require('fs-extra')
const path = require('path')
const { execSync } = require('child_process')

const ROOT_DIR = path.join(__dirname, '..')
const BUILD_DIR = path.join(ROOT_DIR, 'dist-uniapp', 'build')

// Read plugin name from uniapp/package.json
const uniappPackageJson = fs.readJsonSync(path.join(__dirname, 'package.json'))
const PLUGIN_ID = uniappPackageJson.name
const PLUGIN_VERSION = uniappPackageJson.version
const PLUGIN_DIR = path.join(ROOT_DIR, 'dist-uniapp', PLUGIN_ID)

console.log('🚀 Building UniApp SDK Plugin...\n')

// Step 0: Patch opencv.js for ESM compatibility
console.log('📦 Step 0: Patching opencv.js...')
try {
  execSync(`node "${path.join(__dirname, 'patch-opencv.cjs')}"`, { stdio: 'inherit' })
  console.log('✅ OpenCV patch completed\n')
} catch (error) {
  console.error('⚠️  OpenCV patch failed, continuing anyway:', error.message)
  console.log('⚠️  Note: ESM bundle may have compatibility issues\n')
  // Don't exit, patch is optional
}

// Step 1: Clean previous builds
console.log('📦 Step 1: Cleaning previous builds...')
try {
  fs.removeSync(BUILD_DIR)
  fs.removeSync(PLUGIN_DIR)
  console.log('✅ Cleaned previous builds\n')
} catch (error) {
  console.error('❌ Error cleaning builds:', error.message)
  process.exit(1)
}

// Step 2: Build with Rollup (UniApp config)
console.log('📦 Step 2: Building with Rollup...')
try {
  execSync('npm run build:uniapp', { stdio: 'inherit' })
  console.log('✅ Build completed\n')
} catch (error) {
  console.error('❌ Error during build:', error.message)
  process.exit(1)
}

// Step 2.5: Verify build output exists
console.log('📦 Step 2.5: Verifying build output...')
try {
  const umdBundlePath = path.join(BUILD_DIR, 'face-detection-sdk.js')
  const esmBundlePath = path.join(BUILD_DIR, 'face-detection-sdk.esm.js')
  
  if (!fs.existsSync(umdBundlePath)) {
    throw new Error(`UMD Bundle not found at ${umdBundlePath}`)
  }
  if (!fs.existsSync(esmBundlePath)) {
    throw new Error(`ESM Bundle not found at ${esmBundlePath}`)
  }
  
  const umdSize = (fs.statSync(umdBundlePath).size / 1024).toFixed(2)
  const esmSize = (fs.statSync(esmBundlePath).size / 1024).toFixed(2)
  console.log(`✅ UMD Bundle verified (${umdSize} KB)`)
  console.log(`✅ ESM Bundle verified (${esmSize} KB)\n`)
} catch (error) {
  console.error('❌ Bundle verification failed:', error.message)
  process.exit(1)
}

// Step 3: Create plugin package structure
console.log('📦 Step 3: Creating plugin package structure...')
try {
  // Create directories
  fs.ensureDirSync(path.join(PLUGIN_DIR, 'js_sdk'))
  fs.ensureDirSync(path.join(PLUGIN_DIR, 'static', 'models'))
  fs.ensureDirSync(path.join(PLUGIN_DIR, 'static', 'wasm'))
  fs.ensureDirSync(path.join(PLUGIN_DIR, 'changelog'))

  // Copy SDK files (both UMD and ESM)
  fs.copySync(
    path.join(BUILD_DIR, 'face-detection-sdk.js'),
    path.join(PLUGIN_DIR, 'js_sdk', 'face-detection-sdk.js')
  )
  
  fs.copySync(
    path.join(BUILD_DIR, 'face-detection-sdk.esm.js'),
    path.join(PLUGIN_DIR, 'js_sdk', 'face-detection-sdk.esm.js')
  )

  // Copy types if available
  const typesDir = path.join(BUILD_DIR, 'types')
  if (fs.existsSync(typesDir)) {
    fs.copySync(typesDir, path.join(PLUGIN_DIR, 'js_sdk', 'types'))
  }

  console.log('✅ Plugin structure created\n')
} catch (error) {
  console.error('❌ Error creating plugin structure:', error.message)
  process.exit(1)
}

// Step 3.5: Copy models using copy-models.cjs
console.log('📦 Step 3.5: Copying required AI models...')
try {
  const modelOutputDir = path.join(PLUGIN_DIR, 'static', 'models')
  execSync(`node "${path.join(ROOT_DIR, 'scripts', 'copy-models.cjs')}" "${modelOutputDir}"`, { 
    stdio: 'inherit',
    cwd: ROOT_DIR
  })
  console.log('✅ Models copied\n')
} catch (error) {
  console.error('❌ Error copying models:', error.message)
  process.exit(1)
}

// Step 3.6: Download WASM using download-wasm-plugin.cjs
console.log('📦 Step 3.6: Downloading TensorFlow.js WASM files...')
console.log('   (This step can be retried later if it fails)\n')
try {
  const wasmOutputDir = path.join(PLUGIN_DIR, 'static', 'wasm')
  execSync(`node "${path.join(__dirname, 'download-wasm-plugin.cjs')}" "${wasmOutputDir}"`, {
    stdio: 'inherit',
    cwd: ROOT_DIR
  })
  console.log('✅ WASM files downloaded\n')
} catch (error) {
  console.error('⚠️  Error downloading WASM:', error.message)
  console.log('⚠️  You can retry later with: npm run download-wasm:plugin\n')
  console.log('ℹ️  Continuing build without WASM files...')
  console.log('    The plugin will use online CDN resources instead.\n')
  // Don't exit, WASM is optional - can use CDN fallback
}

// Step 4: Create plugin.json (DCloud format)
console.log('📦 Step 4: Creating plugin configuration...')
try {
  const uniappPackageJson = fs.readJsonSync(path.join(ROOT_DIR, 'uniapp', 'package.json'))
  
  const pluginConfig = {
    name: PLUGIN_ID,
    version: PLUGIN_VERSION,
    description: uniappPackageJson.description,
    author: uniappPackageJson.author,
    license: uniappPackageJson.license,
    ...uniappPackageJson.plugin
  }

  fs.writeJsonSync(
    path.join(PLUGIN_DIR, 'plugin.json'),
    pluginConfig,
    { spaces: 2 }
  )

  console.log('✅ Plugin configuration created\n')
} catch (error) {
  console.error('❌ Error creating plugin config:', error.message)
  process.exit(1)
}

// Step 5: Create README for UniApp plugin
console.log('📦 Step 5: Copying documentation...')
try {
  const readmeSourcPath = path.join(ROOT_DIR, 'uniapp', 'README.md')
  const readmeDestPath = path.join(PLUGIN_DIR, 'README.md')
  
  if (!fs.existsSync(readmeSourcPath)) {
    throw new Error(`uniapp/README.md not found at ${readmeSourcPath}`)
  }
  
  fs.copyFileSync(readmeSourcPath, readmeDestPath)
  console.log('✅ Documentation copied\n')
} catch (error) {
  console.error('❌ Error copying documentation:', error.message)
  process.exit(1)
}

// Step 6: Copy package manifest
console.log('📦 Step 6: Copying package manifest...')
try {
  const pkgSourcePath = path.join(ROOT_DIR, 'uniapp', 'package.json')
  const pkgDestPath = path.join(PLUGIN_DIR, 'package.json')
  
  if (!fs.existsSync(pkgSourcePath)) {
    throw new Error(`uniapp/package.json not found at ${pkgSourcePath}`)
  }
  
  fs.copyFileSync(pkgSourcePath, pkgDestPath)
  console.log('✅ Package manifest copied\n')
} catch (error) {
  console.error('❌ Error copying package manifest:', error.message)
  process.exit(1)
}

// Step 7: Copy changelog files
console.log('📦 Step 7: Copying changelog files...')
try {
  const changelogSourceZh = path.join(ROOT_DIR, 'uniapp', 'CHANGELOG.md')
  const changelogSourceEn = path.join(ROOT_DIR, 'uniapp', 'CHANGELOG.en.md')
  const changelogDestZh = path.join(PLUGIN_DIR, 'changelog', 'zh.md')
  const changelogDestEn = path.join(PLUGIN_DIR, 'changelog', 'en.md')
  
  if (!fs.existsSync(changelogSourceZh)) {
    throw new Error(`uniapp/CHANGELOG.md not found at ${changelogSourceZh}`)
  }
  if (!fs.existsSync(changelogSourceEn)) {
    throw new Error(`uniapp/CHANGELOG.en.md not found at ${changelogSourceEn}`)
  }
  
  fs.copyFileSync(changelogSourceZh, changelogDestZh)
  fs.copyFileSync(changelogSourceEn, changelogDestEn)
  
  console.log('✅ Changelog files copied\n')
} catch (error) {
  console.error('❌ Error copying changelog:', error.message)
  process.exit(1)
}

// Step 8: Copy installation guide
console.log('📦 Step 8: Copying installation guide...')
try {
  const installSourcePath = path.join(ROOT_DIR, 'uniapp', 'INSTALL.md')
  const installDestPath = path.join(PLUGIN_DIR, 'INSTALL.md')
  
  if (!fs.existsSync(installSourcePath)) {
    throw new Error(`uniapp/INSTALL.md not found at ${installSourcePath}`)
  }
  
  fs.copyFileSync(installSourcePath, installDestPath)
  console.log('✅ Installation guide copied\n')
} catch (error) {
  console.error('❌ Error copying installation guide:', error.message)
  process.exit(1)
}

console.log('✅ UniApp SDK Plugin build completed!')

try {
  const uniappPackageJson = fs.readJsonSync(path.join(ROOT_DIR, 'uniapp', 'package.json'))
  const pluginName = uniappPackageJson.name
  
  console.log(`\n📁 Plugin ID: ${pluginName}`)
  console.log(`📁 Output directory: ${PLUGIN_DIR}\n`)
} catch (error) {
  console.error('⚠️  Could not read plugin ID from uniapp/package.json')
  console.log(`📁 Output directory: ${PLUGIN_DIR}\n`)
}


console.log('📋 Package contents:')
console.log('  ├── js_sdk/')
console.log('  │   ├── face-detection-sdk.js (UMD bundle - complete & self-contained)')
console.log('  │   ├── face-detection-sdk.esm.js (ESM bundle - modern module format)')
console.log('  │   └── types/ (TypeScript definitions)')
console.log('  ├── static/')
console.log('  │   ├── models/ (AI models)')
console.log('  │   └── wasm/ (WebAssembly files)')
console.log('  ├── plugin.json (DCloud plugin manifest)')
console.log('  ├── package.json (npm package info)')
console.log('  ├── README.md (usage guide)')
console.log('  ├── INSTALL.md (installation guide)')
console.log('  └── changelog/ (update logs)\n')

console.log('🚀 Next steps:')
console.log(`  1. Review the generated plugin in dist-uniapp/${PLUGIN_ID}`)
console.log('  2. Update changelog with release notes')
console.log('  3. Compress the folder and upload to DCloud plugin marketplace')
console.log('  4. Plugin marketplace: https://ext.dcloud.net.cn/')
console.log(`  5. Plugin ID: ${PLUGIN_ID}\n`)
