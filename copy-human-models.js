#!/usr/bin/env node

/**
 * 从 Human.js 复制模型文件到本地
 * 仅复制需要的模型文件以减小包体积
 * 
 * 使用方法：
 *   npm run copy:human-models
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 配置
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUMAN_MODELS_DIR = path.join(__dirname, 'node_modules', '@vladmandic', 'human', 'models');
const LOCAL_MODELS_DIR = path.join(__dirname, 'public', 'models');

/**
 * 只需要的模型列表
 * 根据 FaceDetector.vue 中的配置：
 * - face.detector: 人脸检测 → blazeface
 * - face.mesh: 面部关键点 → facemesh
 * - face.iris: 虹膜检测 → iris (已禁用)
 * - face.antispoof: 反欺骗检测 → antispoof
 * - face.liveness: 活体检测 → liveness
 * - gesture: 手势检测 → blazeface (用于眨眼检测)
 * - faceres: 人脸特征提取 → faceres (可选，用于精准检测)
 * 
 * 注：每个 JSON 配置文件对应一个或多个 .bin 二进制文件
 */
const REQUIRED_MODELS = [
  'antispoof',           // 反欺骗检测
  'blazeface',           // 人脸检测 + 手势识别
  'facemesh',            // 面部关键点
  'faceres',             // 人脸特征提取
  'liveness'             // 活体检测
];

/**
 * 从 node_modules 中的 Human.js package.json 读取版本信息
 */
function getHumanInfo() {
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
  // 返回所有 JSON 和 BIN 文件
  const modelFiles = files.filter(file => file.endsWith('.json') || file.endsWith('.bin'));
  
  return modelFiles.sort();
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
 * 清理不需要的模型文件
 */
function cleanupUnusedModels(localModelsDir, requiredModels) {
  try {
    const files = fs.readdirSync(localModelsDir);
    let cleanedCount = 0;
    
    files.forEach(file => {
      if ((file.endsWith('.json') || file.endsWith('.bin')) && file !== 'models.json') {
        // 提取模型名称（去掉扩展名和版本后缀）
        const modelName = file.replace(/\.(json|bin)$/, '').split('_')[0];
        
        // 如果不在所需列表中，删除
        if (!requiredModels.includes(modelName)) {
          const filePath = path.join(localModelsDir, file);
          const stats = fs.statSync(filePath);
          const sizeKB = getFileSizeKB(stats.size);
          fs.unlinkSync(filePath);
          console.log(`  🗑️  已删除: ${file} (${sizeKB} KB)`);
          cleanedCount++;
        }
      }
    });
    
    return cleanedCount;
  } catch (error) {
    console.warn(`⚠️  清理文件时出错: ${error.message}`);
    return 0;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Human.js 模型文件复制器 (优化版 - 仅复制必需模型)');
  console.log('='.repeat(60));

  try {
    // 1. 获取 Human.js 信息
    console.log('\n[1/5] 检测 Human.js 信息...\n');
    const humanPackage = getHumanInfo();
    console.log(`   版本: ${humanPackage.version}`);
    console.log(`   源: ${HUMAN_MODELS_DIR}`);

    // 2. 获取所有可用的模型
    console.log('\n[2/5] 扫描可用的模型文件...\n');
    const availableModels = getAvailableModels();
    console.log(`   总共找到 ${availableModels.length} 个模型文件`);

    // 3. 显示所需模型
    console.log('\n[3/5] 所需模型列表...\n');
    console.log(`   将复制以下 ${REQUIRED_MODELS.length} 个模型及其二进制文件：\n`);
    let requiredSize = 0;
    REQUIRED_MODELS.forEach((model, index) => {
      const jsonPath = path.join(HUMAN_MODELS_DIR, model + '.json');
      let modelSizeKB = 0;
      
      if (fs.existsSync(jsonPath)) {
        const stats = fs.statSync(jsonPath);
        modelSizeKB += stats.size;
      }
      
      // 查找该模型对应的所有 .bin 文件
      const binFiles = availableModels.filter(f => f.startsWith(model) && f.endsWith('.bin'));
      binFiles.forEach(bin => {
        const binPath = path.join(HUMAN_MODELS_DIR, bin);
        if (fs.existsSync(binPath)) {
          const stats = fs.statSync(binPath);
          modelSizeKB += stats.size;
        }
      });
      
      const sizeKB = getFileSizeKB(modelSizeKB);
      console.log(`   ${index + 1}. ${model}`);
      console.log(`      ├─ ${model}.json`);
      binFiles.forEach((bin, idx) => {
        const isLast = idx === binFiles.length - 1;
        console.log(`      ${isLast ? '└─' : '├─'} ${bin}`);
      });
      console.log(`      总大小: ${sizeKB} KB\n`);
      requiredSize += modelSizeKB;
    });
    console.log(`   模型总大小: ${getFileSizeKB(requiredSize)} KB`);

    // 显示将被跳过的模型
    const skippedModels = availableModels.filter(m => {
      const modelName = m.replace(/\.(json|bin)$/, '').split('_')[0];
      return !REQUIRED_MODELS.includes(modelName) && (m.endsWith('.json') || m.endsWith('.bin'));
    });
    if (skippedModels.length > 0) {
      console.log(`\n   将跳过 ${skippedModels.length} 个不需要的文件：\n`);
      let skippedSize = 0;
      skippedModels.forEach((model) => {
        const srcPath = path.join(HUMAN_MODELS_DIR, model);
        const stats = fs.statSync(srcPath);
        const sizeKB = getFileSizeKB(stats.size);
        console.log(`   ✗ ${model} (${sizeKB} KB)`);
        skippedSize += stats.size;
      });
      console.log(`\n   节省空间: ${getFileSizeKB(skippedSize)} KB`);
    }

    // 4. 创建目录和复制文件
    console.log('\n[4/5] 复制文件...\n');
    ensureDirectory(LOCAL_MODELS_DIR);

    let totalSize = 0;
    let copiedCount = 0;

    for (const model of REQUIRED_MODELS) {
      const jsonPath = path.join(HUMAN_MODELS_DIR, model + '.json');
      const jsonDestPath = path.join(LOCAL_MODELS_DIR, model + '.json');
      
      // 复制 JSON 文件
      if (fs.existsSync(jsonPath)) {
        try {
          const fileSize = copyFile(jsonPath, jsonDestPath, `${model}.json`);
          totalSize += fileSize;
          copiedCount++;
        } catch (error) {
          console.error(`   复制 ${model}.json 失败: ${error.message}`);
          throw error;
        }
      } else {
        console.warn(`  ⚠️  ${model}.json 在源目录中不存在，跳过`);
        continue;
      }
      
      // 查找并复制对应的 .bin 文件
      const binFiles = availableModels.filter(f => f.startsWith(model) && f.endsWith('.bin'));
      for (const binFile of binFiles) {
        const binSrcPath = path.join(HUMAN_MODELS_DIR, binFile);
        const binDestPath = path.join(LOCAL_MODELS_DIR, binFile);
        
        try {
          const fileSize = copyFile(binSrcPath, binDestPath, `  └─ ${binFile}`);
          totalSize += fileSize;
          copiedCount++;
        } catch (error) {
          console.error(`   复制 ${binFile} 失败: ${error.message}`);
          throw error;
        }
      }
    }

    // 5. 清理不需要的文件
    console.log('\n[5/5] 清理不需要的文件...\n');
    const cleanedCount = cleanupUnusedModels(LOCAL_MODELS_DIR, REQUIRED_MODELS);

    // 6. 处理 README.md
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
    console.log(`✅ 完成！`);
    console.log(`   已复制: ${copiedCount} 个模型文件`);
    console.log(`   已删除: ${cleanedCount} 个不需要的文件`);
    console.log(`   总大小: ${getFileSizeKB(totalSize)} KB`);
    console.log('='.repeat(60));

    console.log('\n📁 模型文件已优化到: ' + LOCAL_MODELS_DIR);
    console.log('\n✨ 已启用的功能：');
    console.log('   • 人脸检测 (blazeface)');
    console.log('   • 面部关键点 (facemesh)');
    console.log('   • 反欺骗检测 (antispoof)');
    console.log('   • 活体检测 (liveness)');
    console.log('   • 人脸特征提取 (faceres)');
    console.log('   • 手势识别 (blazeface)');
    console.log('\n❌ 已禁用的功能：');
    console.log('   • 虹膜检测 (iris) - 普通摄像头无法准确检测');
    console.log('   • 身体检测 (body/movenet)');
    console.log('   • 手部检测 (hand/handtrack)');
    console.log('   • 情绪检测 (emotion)');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
