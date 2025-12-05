#!/usr/bin/env node

/**
 * UniApp Plugin Installation Script
 * Installs the built plugin into the demo project
 * 
 * Usage: node uniapp/install-plugin.cjs
 */

const fs = require('fs-extra')
const path = require('path')

const ROOT_DIR = path.join(__dirname, '..')

// Read plugin name from uniapp/package.json
const uniappPackageJson = fs.readJsonSync(path.join(__dirname, 'package.json'))
const PLUGIN_ID = uniappPackageJson.name

const SOURCE_DIR = path.join(ROOT_DIR, 'dist-uniapp', PLUGIN_ID)
const TARGET_DIR = path.join(ROOT_DIR, 'demos', 'uniapp-demo', 'uni_modules', PLUGIN_ID)

console.log('📦 Installing UniApp Plugin...\n')

// Step 1: Verify source exists
console.log('📦 Step 1: Verifying plugin build...')
try {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Plugin build not found at ${SOURCE_DIR}. Please run "npm run package:uniapp" first.`)
  }
  console.log(`✅ Plugin build verified: ${PLUGIN_ID}\n`)
} catch (error) {
  console.error('❌ Error verifying plugin build:', error.message)
  process.exit(1)
}

// Step 2: Remove existing plugin from demo
console.log('📦 Step 2: Removing existing plugin from demo...')
try {
  if (fs.existsSync(TARGET_DIR)) {
    fs.removeSync(TARGET_DIR)
    console.log(`✅ Removed old plugin from ${TARGET_DIR}\n`)
  } else {
    console.log(`ℹ️  No existing plugin found at ${TARGET_DIR}\n`)
  }
} catch (error) {
  console.error('❌ Error removing old plugin:', error.message)
  process.exit(1)
}

// Step 3: Ensure parent directory exists
console.log('📦 Step 3: Ensuring uni_modules directory exists...')
try {
  const uniModulesDir = path.join(ROOT_DIR, 'demos', 'uniapp-demo', 'uni_modules')
  fs.ensureDirSync(uniModulesDir)
  console.log(`✅ uni_modules directory ready\n`)
} catch (error) {
  console.error('❌ Error creating uni_modules directory:', error.message)
  process.exit(1)
}

// Step 4: Copy plugin to demo
console.log('📦 Step 4: Installing plugin to demo...')
try {
  fs.copySync(SOURCE_DIR, TARGET_DIR, {
    recursive: true,
    overwrite: true
  })
  console.log(`✅ Plugin installed to ${TARGET_DIR}\n`)
} catch (error) {
  console.error('❌ Error installing plugin:', error.message)
  process.exit(1)
}

// Step 5: Verify installation
console.log('📦 Step 5: Verifying installation...')
try {
  const packageJsonPath = path.join(TARGET_DIR, 'package.json')
  const pluginJsonPath = path.join(TARGET_DIR, 'plugin.json')
  const jsSdkPath = path.join(TARGET_DIR, 'js_sdk', 'face-detection-sdk.js')

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found in installed plugin')
  }
  if (!fs.existsSync(pluginJsonPath)) {
    throw new Error('plugin.json not found in installed plugin')
  }
  if (!fs.existsSync(jsSdkPath)) {
    throw new Error('SDK bundle not found in installed plugin')
  }

  const installedPackage = fs.readJsonSync(packageJsonPath)
  console.log(`✅ Installation verified\n`)
} catch (error) {
  console.error('❌ Installation verification failed:', error.message)
  process.exit(1)
}

console.log('✅ UniApp Plugin installation completed!')
console.log(`\n📁 Plugin ID: ${PLUGIN_ID}`)
console.log(`📁 Installation path: demos/uniapp-demo/uni_modules/${PLUGIN_ID}\n`)

console.log('📋 Installed contents:')
console.log('  ├── js_sdk/')
console.log('  │   ├── face-detection-sdk.js')
console.log('  │   └── types/')
console.log('  ├── static/')
console.log('  │   ├── models/')
console.log('  │   └── wasm/')
console.log('  ├── plugin.json')
console.log('  ├── package.json')
console.log('  ├── README.md')
console.log('  ├── INSTALL.md')
console.log('  └── changelog/\n')

console.log('🚀 Next steps:')
console.log('  1. Open demos/uniapp-demo in HBuilderX')
console.log('  2. The plugin is now available at uni_modules/' + PLUGIN_ID)
console.log('  3. Import and use it in your pages\n')
