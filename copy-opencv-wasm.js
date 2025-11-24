/**
 * 复制 OpenCV WASM 文件到 public 目录
 * 
 * 这个脚本确保 WASM 文件在构建前被复制到 public/wasm/ 目录
 * 这样可以从本地加载，避免 CORS 问题和 CDN 依赖
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = path.join(__dirname, 'node_modules/@dalongrong/opencv-wasm/opencv.wasm');
const dest = path.join(__dirname, 'public/wasm/opencv.wasm');

// 创建目标目录
const dir = path.dirname(dest);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
  console.log(`✓ Created directory: ${dir}`);
}

// 检查源文件是否存在
if (!fs.existsSync(source)) {
  console.error(`✗ Source file not found: ${source}`);
  console.error('Please run: npm install opencv-wasm');
  process.exit(1);
}

// 复制文件
try {
  fs.copyFileSync(source, dest);
  const stats = fs.statSync(dest);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`✓ Successfully copied opencv.wasm (${sizeMB}MB)`);
  console.log(`  From: ${source}`);
  console.log(`  To:   ${dest}`);
} catch (error) {
  console.error(`✗ Failed to copy file: ${error.message}`);
  process.exit(1);
}
