#!/usr/bin/env node
/**
 * 验证所有类型声明文件都存在并可导入
 */

const fs = require('fs');
const path = require('path');

const typesDir = path.join(__dirname, 'dist', 'types');

const requiredFiles = [
  'index.d.ts',
  'config.d.ts',
  'enums.d.ts',
  'types.d.ts',
  'event-emitter.d.ts',
  'face-frontal-checker.d.ts',
  'image-quality-checker.d.ts',
  'library-loader.d.ts',
];

console.log('🔍 检查类型声明文件...\n');

let allExist = true;

for (const file of requiredFiles) {
  const filePath = path.join(typesDir, file);
  const exists = fs.existsSync(filePath);
  
  if (exists) {
    // 检查文件大小
    const stats = fs.statSync(filePath);
    console.log(`✅ ${file} (${stats.size} bytes)`);
  } else {
    console.log(`❌ ${file} - 文件不存在`);
    allExist = false;
  }
}

console.log('\n🔍 检查 package.json 配置...\n');

const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

console.log(`📦 Main: ${packageJson.main}`);
console.log(`📦 Module: ${packageJson.module}`);
console.log(`📦 Types: ${packageJson.types}`);

// 检查 types 字段是否指向正确的位置
if (packageJson.types === 'dist/types/index.d.ts') {
  console.log('✅ types 字段配置正确');
} else {
  console.log(`❌ types 字段指向错误的位置: ${packageJson.types}`);
  allExist = false;
}

console.log('\n🔍 检查 exports 配置...\n');

const exportsConfig = packageJson.exports;
if (exportsConfig['.'].types === './dist/types/index.d.ts') {
  console.log('✅ exports["."].types 配置正确');
} else {
  console.log(`❌ exports["."].types 配置错误: ${exportsConfig['.'].types}`);
  allExist = false;
}

console.log('\n' + (allExist ? '✅ 所有检查通过！' : '❌ 某些检查失败，请检查配置'));
process.exit(allExist ? 0 : 1);
