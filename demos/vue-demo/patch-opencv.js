#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openvPath = path.join(__dirname, 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js');

try {
  if (fs.existsSync(openvPath)) {
    let content = fs.readFileSync(openvPath, 'utf8');
    const originalContent = content;
    
    // 替换 UMD 模式中的 this 为 globalThis
    content = content.replace(
      /}\s*\(\s*this\s*,\s*function\s*\(\)\s*{/g,
      `}(globalThis, function () {`
    );
    
    if (content !== originalContent) {
      fs.writeFileSync(openvPath, content, 'utf8');
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
