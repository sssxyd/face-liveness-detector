#!/usr/bin/env node

/**
 * Copy model files from Human.js to local directory
 * 
 * Usage:
 *   npm run copy-models
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

// Config
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = findProjectRoot(__dirname);
const HUMAN_MODELS_DIR = path.join(PROJECT_ROOT, 'node_modules', '@vladmandic', 'human', 'models');
const LOCAL_MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models');

/**
 * Read enabled models from Human.js package.json in node_modules
 */
function getEnabledModels() {
  try {
    const humanPackagePath = path.join(
      PROJECT_ROOT,
      'node_modules',
      '@vladmandic',
      'human',
      'package.json'
    );

    if (!fs.existsSync(humanPackagePath)) {
      throw new Error(
        '@vladmandic/human not found. Please run npm install to install dependencies.'
      );
    }

    const humanPackage = JSON.parse(fs.readFileSync(humanPackagePath, 'utf-8'));
    
    console.log(`📦 Human.js version: ${humanPackage.version}`);
    
    return humanPackage;
  } catch (error) {
    console.error(`❌ Failed to read Human.js information: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Get required model files (whitelist only necessary models)
 */
function getAvailableModels() {
  if (!fs.existsSync(HUMAN_MODELS_DIR)) {
    throw new Error(
      `Human.js model directory not found: ${HUMAN_MODELS_DIR}\nPlease ensure @vladmandic/human is correctly installed.`
    );
  }

  // Only copy essential model files
  const requiredModels = [
    // Face detection
    'blazeface.json',
    'blazeface.bin',
    
    // Face mesh
    'facemesh.json',
    'facemesh.bin',
    
    // Model manifest (required)
    'models.json',
  ];

  // Verify that all required files exist
  const missingFiles = [];
  requiredModels.forEach(model => {
    if (!fs.existsSync(path.join(HUMAN_MODELS_DIR, model))) {
      missingFiles.push(model);
    }
  });

  if (missingFiles.length > 0) {
    throw new Error(
      `Missing required model files: ${missingFiles.join(', ')}\nPlease ensure @vladmandic/human is correctly installed.`
    );
  }

  return requiredModels;
}

/**
 * Create directory
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✓ Created directory: ${dirPath}`);
  }
}

/**
 * Get file size in KB
 */
function getFileSizeKB(bytes) {
  return (bytes / 1024).toFixed(2);
}

/**
 * Copy single file
 */
function copyFile(srcPath, destPath, fileName) {
  try {
    fs.copyFileSync(srcPath, destPath);
    const stats = fs.statSync(destPath);
    const sizeKB = getFileSizeKB(stats.size);
    console.log(`  ✓ ${fileName} (${sizeKB} KB)`);
    return stats.size;
  } catch (error) {
    console.error(`  ✗ Copy failed: ${fileName} - ${error.message}`);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Human.js Model Files Copier');
  console.log('='.repeat(60));

  try {
    // 1. Get Human.js information
    console.log('\n[1/4] Detecting Human.js information...\n');
    const humanPackage = getEnabledModels();
    console.log(`   Version: ${humanPackage.version}`);
    console.log(`   Source: ${HUMAN_MODELS_DIR}`);

    // 2. Get available models
    console.log('\n[2/4] Scanning available model files...\n');
    const availableModels = getAvailableModels();
    console.log(`   Found ${availableModels.length} model files:\n`);
    availableModels.forEach((model, index) => {
      const srcPath = path.join(HUMAN_MODELS_DIR, model);
      const stats = fs.statSync(srcPath);
      const sizeKB = getFileSizeKB(stats.size);
      console.log(`   ${index + 1}. ${model} (${sizeKB} KB)`);
    });

    // 3. Prepare directory
    console.log('\n[3/4] Preparing directory...');
    ensureDirectory(LOCAL_MODELS_DIR);

    // 4. Copy files
    console.log('\n[4/4] Copying files...\n');
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
        console.error(`   Failed to copy ${model}: ${error.message}`);
        throw error;
      }
    }

    // 5. Handle README.md
    const readmeSrcPath = path.join(HUMAN_MODELS_DIR, 'README.md');
    const readmeDestPath = path.join(LOCAL_MODELS_DIR, 'README.md');
    
    if (fs.existsSync(readmeSrcPath)) {
      try {
        copyFile(readmeSrcPath, readmeDestPath, 'README.md');
      } catch (error) {
        console.warn(`⚠️  README.md copy failed (optional), continuing...`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Copy complete!`);
    console.log(`   Total: ${copiedCount} model files`);
    console.log(`   Total size: ${getFileSizeKB(totalSize)} KB`);
    console.log('='.repeat(60));

    console.log('\n📝 Model files have been copied to: ' + LOCAL_MODELS_DIR);
    console.log('\nConfiguration example:\n');
    console.log('```typescript');
    console.log('const config = {');
    console.log('  human_model_path: "/models",  // ← Use local files');
    console.log('  tensorflow_wasm_path: "/wasm",  // ← Use local files');
    console.log('};');
    console.log('```\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
