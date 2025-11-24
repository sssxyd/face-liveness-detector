#!/usr/bin/env node

/**
 * 从 Human.js 复制模型文件到本地
 * 
 * 使用方法：
 *   npm run copy:models
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 配置
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUMAN_MODELS_DIR = path.join(__dirname, 'node_modules', '@vladmandic', 'human', 'models');
const LOCAL_MODELS_DIR = path.join(__dirname, 'public', 'models');

/**
 * 从 node_modules 中的 Human.js package.json 读取使用的模型
 */
function getEnabledModels() {
  try {
    const humanPackagePath = path.join(
      __dirname,
      'node_modules',
      '@vladmandic',
      'human',
      'package.json'
    );

    if (!fs.existsSync(humanPackagePath)) {
      throw new Error(
        '@vladmandic/human 未找到。请运行 npm install 安装依赖。'
      );
    }

    const humanPackage = JSON.parse(fs.readFileSync(humanPackagePath, 'utf-8'));
    
    console.log(`📦 Human.js 版本: ${humanPackage.version}`);
    
    return humanPackage;
  } catch (error) {
    console.error(`❌ 读取 Human.js 信息失败: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 获取所有可用的模型文件
 */
function getAvailableModels() {
  if (!fs.existsSync(HUMAN_MODELS_DIR)) {
    throw new Error(
      `Human.js 模型目录不存在: ${HUMAN_MODELS_DIR}\n请确保 @vladmandic/human 已正确安装。`
    );
  }

  const files = fs.readdirSync(HUMAN_MODELS_DIR);
  const jsonFiles = files.filter(file => file.endsWith('.json'));
  
  return jsonFiles.sort();
}

/**
 * 创建目录
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✓ 创建目录: ${dirPath}`);
  }
}

/**
 * 获取文件大小
 */
function getFileSizeKB(bytes) {
  return (bytes / 1024).toFixed(2);
}

/**
 * 复制单个文件
 */
function copyFile(srcPath, destPath, fileName) {
  try {
    fs.copyFileSync(srcPath, destPath);
    const stats = fs.statSync(destPath);
    const sizeKB = getFileSizeKB(stats.size);
    console.log(`  ✓ ${fileName} (${sizeKB} KB)`);
    return stats.size;
  } catch (error) {
    console.error(`  ✗ 复制失败: ${fileName} - ${error.message}`);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Human.js 模型文件复制器');
  console.log('='.repeat(60));

  try {
    // 1. 获取 Human.js 信息
    console.log('\n[1/4] 检测 Human.js 信息...\n');
    const humanPackage = getEnabledModels();
    console.log(`   版本: ${humanPackage.version}`);
    console.log(`   源: ${HUMAN_MODELS_DIR}`);

    // 2. 获取可用的模型
    console.log('\n[2/4] 扫描可用的模型文件...\n');
    const availableModels = getAvailableModels();
    console.log(`   找到 ${availableModels.length} 个模型文件：\n`);
    availableModels.forEach((model, index) => {
      const srcPath = path.join(HUMAN_MODELS_DIR, model);
      const stats = fs.statSync(srcPath);
      const sizeKB = getFileSizeKB(stats.size);
      console.log(`   ${index + 1}. ${model} (${sizeKB} KB)`);
    });

    // 3. 创建目录
    console.log('\n[3/4] 准备目录...');
    ensureDirectory(LOCAL_MODELS_DIR);

    // 4. 复制文件
    console.log('\n[4/4] 复制文件...\n');
    let totalSize = 0;
    let copiedCount = 0;

    for (const model of availableModels) {
      const srcPath = path.join(HUMAN_MODELS_DIR, model);
      const destPath = path.join(LOCAL_MODELS_DIR, model);
      
      try {
        const fileSize = copyFile(srcPath, destPath, model);
        totalSize += fileSize;
        copiedCount++;
      } catch (error) {
        console.error(`   复制 ${model} 失败: ${error.message}`);
        throw error;
      }
    }

    // 5. 处理 README.md
    const readmeSrcPath = path.join(HUMAN_MODELS_DIR, 'README.md');
    const readmeDestPath = path.join(LOCAL_MODELS_DIR, 'README.md');
    
    if (fs.existsSync(readmeSrcPath)) {
      try {
        copyFile(readmeSrcPath, readmeDestPath, 'README.md');
      } catch (error) {
        console.warn(`⚠️  README.md 复制失败（可选），继续...`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ 复制完成！`);
    console.log(`   总计: ${copiedCount} 个模型文件`);
    console.log(`   总大小: ${getFileSizeKB(totalSize)} KB`);
    console.log('='.repeat(60));

    console.log('\n📝 模型文件已复制到: ' + LOCAL_MODELS_DIR);
    console.log('\n配置示例：\n');
    console.log('```typescript');
    console.log('const config = {');
    console.log('  modelBasePath: "/models",  // ← 使用本地文件');
    console.log('  wasmPath: "/wasm/",');
    console.log('  face: { enabled: true, ... },');
    console.log('};');
    console.log('```\n');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
