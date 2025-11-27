#!/usr/bin/env node

/**
 * 修补脚本：修复 opencv.js 在 ES Module 中的 UMD 问题
 * 将 }(this, function() { 替换为 }(globalThis, function() {
 * 参考：https://github.com/TechStark/opencv-js/issues/44
 */

const fs = require('fs');
const path = require('path');

const opencvPath = path.join(__dirname, '../node_modules/@techstark/opencv-js/dist/opencv.js');

try {
  if (!fs.existsSync(opencvPath)) {
    console.warn(`[patch-opencv] opencv.js 文件不存在: ${opencvPath}`);
    process.exit(0);
  }

  let content = fs.readFileSync(opencvPath, 'utf-8');
  const originalContent = content;

  // 替换 UMD 模式中的 this 为 globalThis
  content = content.replace(
    /}\(this, function\(\)/g,
    '}(globalThis, function()'
  );

  // 检查是否进行了替换
  if (content === originalContent) {
    console.warn('[patch-opencv] 没有找到需要替换的模式，文件可能已经被修补');
  } else {
    fs.writeFileSync(opencvPath, content, 'utf-8');
    console.log('[patch-opencv] ✓ 成功修补 opencv.js');
  }
} catch (error) {
  console.error('[patch-opencv] ✗ 修补失败:', error.message);
  process.exit(1);
}
