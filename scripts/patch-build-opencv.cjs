#!/usr/bin/env node

/**
 * Patch OpenCV.js in built bundles
 * Fixes the UMD issue where `this` should be `globalThis` in ES Module environments
 */

const fs = require('fs')
const path = require('path')

function patchOpencvInBundle(bundlePath) {
  if (!fs.existsSync(bundlePath)) {
    console.warn(`⚠ Bundle not found: ${bundlePath}`)
    return false
  }

  try {
    let content = fs.readFileSync(bundlePath, 'utf8')
    const originalContent = content

    // Replace 'this' with 'globalThis' in UMD pattern
    // This handles cases where opencv.js is bundled inside the UMD
    content = content.replace(
      /}\s*\(\s*this\s*,\s*function\s*\(\s*\)\s*\{/g,
      `}(globalThis, function () {`
    )

    if (content !== originalContent) {
      fs.writeFileSync(bundlePath, content, 'utf8')
      console.log(`✓ Patched: ${path.basename(bundlePath)}`)
      return true
    } else {
      console.log(`ℹ Already patched: ${path.basename(bundlePath)}`)
      return false
    }
  } catch (error) {
    console.error(`✗ Error patching ${bundlePath}:`, error.message)
    return false
  }
}

// Patch both UMD and ESM bundles
const bundleDir = path.join(process.cwd(), 'dist', 'uniapp')
const umdBundle = path.join(bundleDir, 'face-detection-sdk.js')
const esmBundle = path.join(bundleDir, 'face-detection-sdk.esm.js')

console.log('🔧 Patching OpenCV.js in bundles...\n')

let patched = false
patched |= patchOpencvInBundle(umdBundle)
patched |= patchOpencvInBundle(esmBundle)

if (patched) {
  console.log('\n✓ Bundle patching completed')
} else {
  console.log('\n✓ Bundles already patched or pattern not found')
}
