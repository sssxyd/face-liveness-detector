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
const PLUGIN_DIR = path.join(ROOT_DIR, 'dist-uniapp', 'sssxyd-facedetection')

console.log('🚀 Building UniApp SDK Plugin...\n')

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
  const bundlePath = path.join(BUILD_DIR, 'face-detection-sdk.js')
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Bundle not found at ${bundlePath}`)
  }
  console.log(`✅ Bundle verified (${(fs.statSync(bundlePath).size / 1024).toFixed(2)} KB)\n`)
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

  // Copy SDK files
  fs.copySync(
    path.join(BUILD_DIR, 'face-detection-sdk.js'),
    path.join(PLUGIN_DIR, 'js_sdk', 'face-detection-sdk.js')
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

// Step 3.6: Download WASM using download-wasm.cjs
console.log('📦 Step 3.6: Downloading TensorFlow.js WASM files...')
try {
  const wasmOutputDir = path.join(PLUGIN_DIR, 'static', 'wasm')
  execSync(`node "${path.join(ROOT_DIR, 'scripts', 'download-wasm.cjs')}" "${wasmOutputDir}"`, {
    stdio: 'inherit',
    cwd: ROOT_DIR
  })
  console.log('✅ WASM files downloaded\n')
} catch (error) {
  console.error('❌ Error downloading WASM:', error.message)
  console.log('⚠️  Continuing build without WASM files...\n')
  // Don't exit, WASM is optional - can use CDN fallback
}

// Step 4: Create plugin.json (DCloud format)
console.log('📦 Step 4: Creating plugin configuration...')
try {
  const packageJson = fs.readJsonSync(path.join(ROOT_DIR, 'package.json'))
  
  const pluginConfig = {
    name: 'sssxyd-facedetection',
    version: packageJson.version,
    description: packageJson.description,
    author: packageJson.author,
    license: packageJson.license,
    permissions: [
      {
        'name': 'CAMERA',
        'reason': 'Used for face detection and liveness verification'
      }
    ]
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

// Step 6: Create package manifest
console.log('📦 Step 6: Creating package manifest...')
try {
  const mainPkg = fs.readJsonSync(path.join(ROOT_DIR, 'package.json'))
  
  const packageJson = {
    name: 'sssxyd-facedetection',
    version: mainPkg.version,
    description: mainPkg.description,
    main: 'js_sdk/face-detection-sdk.js',
    types: 'js_sdk/types/index.d.ts',
    files: [
      'js_sdk',
      'static',
      'plugin.json',
      'README.md',
      'changelog'
    ],
    keywords: mainPkg.keywords || [
      'face-detection',
      'liveness-detection',
      'uniapp',
      'anti-spoofing'
    ],
    author: mainPkg.author,
    license: mainPkg.license,
    peerDependencies: mainPkg.peerDependencies || {
      '@vladmandic/human': '^3.3.0',
      '@techstark/opencv-js': '^4.12.0-release.1'
    },
    repository: mainPkg.repository,
    bugs: mainPkg.bugs,
    homepage: mainPkg.homepage
  }

  fs.writeJsonSync(
    path.join(PLUGIN_DIR, 'package.json'),
    packageJson,
    { spaces: 2 }
  )

  console.log('✅ Package manifest created\n')
} catch (error) {
  console.error('❌ Error creating package manifest:', error.message)
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
console.log(`\n📁 Plugin ID: sssxyd-facedetection`)
console.log(`📁 Output directory: ${PLUGIN_DIR}\n`)

console.log('📋 Package contents:')
console.log('  ├── js_sdk/')
console.log('  │   ├── face-detection-sdk.js (UMD bundle - complete & self-contained)')
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
console.log('  1. Review the generated plugin in dist-uniapp/sssxyd-facedetection')
console.log('  2. Update changelog with release notes')
console.log('  3. Compress the folder and upload to DCloud plugin marketplace')
console.log('  4. Plugin marketplace: https://ext.dcloud.net.cn/')
console.log('  5. Plugin ID: sssxyd-facedetection\n')

/**
 * Get version from package.json
 */
function getPackageVersion() {
  try {
    const pkg = fs.readJsonSync(path.join(ROOT_DIR, 'package.json'))
    return pkg.version || '0.0.0'
  } catch (error) {
    return '0.0.0'
  }
}
