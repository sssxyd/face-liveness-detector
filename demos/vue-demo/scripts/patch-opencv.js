#!/usr/bin/env node

/**
 * Patch script: Fix opencv.js UMD issue in ES Module
 * Replace }(this, function() { with }(globalThis, function() {
 * Reference: https://github.com/TechStark/opencv-js/issues/44
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Find project root directory (directory containing package.json)
 */
function findProjectRoot(startPath) {
  let currentPath = startPath;
  
  // Search upward until finding package.json or reaching filesystem root
  while (currentPath !== path.dirname(currentPath)) {
    const packageJsonPath = path.join(currentPath, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      return currentPath;
    }
    
    // Go up one directory level
    currentPath = path.dirname(currentPath);
  }
  
  // If not found, return the starting directory
  return startPath;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = findProjectRoot(__dirname);
const opencvPath = path.join(PROJECT_ROOT, 'node_modules/@techstark/opencv-js/dist/opencv.js');

try {
  if (fs.existsSync(opencvPath)) {
    let content = fs.readFileSync(opencvPath, 'utf8');
    const originalContent = content;
    
    // Replace 'this' with 'globalThis' in UMD pattern
    content = content.replace(
      /}\s*\(\s*this\s*,\s*function\s*\(\)\s*{/g,
      `}(globalThis, function () {`
    );
    
    if (content !== originalContent) {
      fs.writeFileSync(opencvPath, content, 'utf8');
      console.log('✓ Successfully patched @techstark/opencv-js for ESM compatibility');
    } else {
      console.log('ℹ @techstark/opencv-js is already patched or pattern not found');
    }
  } else {
    console.warn('⚠ @techstark/opencv-js not found, skipping patch');
  }
} catch (error) {
  console.error('✗ Error patching opencv.js:', error.message);
  process.exit(1);
}
