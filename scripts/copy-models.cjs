#!/usr/bin/env node

/**
 * Copy model files from Human.js to specified directory
 * 
 * Usage:
 *   node scripts/copy-models.cjs <output-directory>
 *   node scripts/copy-models.cjs ../uniapp/models
 */

const fs = require('fs');
const path = require('path');

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
// Get __dirname and __filename in CommonJS (compatible with "type": "module")
const getScriptDir = () => {
  try {
    // In normal CJS, these are global
    return path.dirname(__filename);
  } catch {
    // Fallback for ESM context
    return path.dirname(require.main.filename);
  }
};
const SCRIPT_DIR = getScriptDir();
const PROJECT_ROOT = findProjectRoot(SCRIPT_DIR);

// Get output directory from command line argument
const outputDirArg = process.argv[2];
if (!outputDirArg) {
  console.error('❌ Error: Output directory argument is required');
  console.error('Usage: node scripts/copy-models.cjs <output-directory>');
  console.error('Example: node scripts/copy-models.cjs ../uniapp/models');
  process.exit(1);
}

const LOCAL_MODELS_DIR = path.isAbsolute(outputDirArg) 
  ? outputDirArg 
  : path.join(PROJECT_ROOT, outputDirArg);

const HUMAN_MODELS_DIR = path.join(PROJECT_ROOT, 'node_modules', '@vladmandic', 'human', 'models');

/**
 * Based on library-loader.ts configuration, only these models are enabled:
 * - face: detector, mesh, antispoof, liveness
 * - gesture: hand landmark for gesture recognition
 * 
 * Disabled modules (not needed): body, hand, iris, object, emotion, face recognition
 * 
 * Each model includes both .json config and .bin weights
 */
const REQUIRED_MODELS = [
  // Face detection
  'blazeface.json',
  'blazeface.bin',
  
  // Face mesh
  'facemesh.json',
  'facemesh.bin',
  
  // Model manifest (required)
  'models.json',
];

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
 * Get all available model files
 */
function getAvailableModels() {
  if (!fs.existsSync(HUMAN_MODELS_DIR)) {
    throw new Error(
      `Human.js model directory not found: ${HUMAN_MODELS_DIR}\nPlease ensure @vladmandic/human is correctly installed.`
    );
  }

  const files = fs.readdirSync(HUMAN_MODELS_DIR);
  const modelFiles = files.filter(file => 
    file.endsWith('.json') || file.endsWith('.bin')
  );
  
  return modelFiles.sort();
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
function main() {
  console.log('='.repeat(60));
  console.log('Human.js Model Files Copier');
  console.log('='.repeat(60));

  try {
    // 1. Get Human.js information
    console.log('\n[1/4] Detecting Human.js information...\n');
    const humanPackage = getEnabledModels();
    console.log(`   Version: ${humanPackage.version}`);
    console.log(`   Source: ${HUMAN_MODELS_DIR}`);
    console.log(`   Destination: ${LOCAL_MODELS_DIR}`);

    // 2. Get available models
    console.log('\n[2/4] Filtering required model files...\n');
    const availableModels = getAvailableModels();
    const requiredModels = availableModels.filter(model => REQUIRED_MODELS.includes(model));
    const skippedModels = availableModels.filter(model => !REQUIRED_MODELS.includes(model));
    
    console.log(`   Found ${availableModels.length} total model files`);
    console.log(`   Will copy ${requiredModels.length} required models:\n`);
    requiredModels.forEach((model, index) => {
      const srcPath = path.join(HUMAN_MODELS_DIR, model);
      const stats = fs.statSync(srcPath);
      const sizeKB = getFileSizeKB(stats.size);
      console.log(`   ${index + 1}. ${model} (${sizeKB} KB)`);
    });
    
    if (skippedModels.length > 0) {
      console.log(`\n   ⏭️  Skipped ${skippedModels.length} unnecessary models:`);
      skippedModels.slice(0, 5).forEach((model, index) => {
        console.log(`      ${index + 1}. ${model}`);
      });
      if (skippedModels.length > 5) {
        console.log(`      ... and ${skippedModels.length - 5} more`);
      }
    }

    // 3. Prepare directory
    console.log('\n[3/4] Preparing directory...');
    ensureDirectory(LOCAL_MODELS_DIR);

    // 4. Copy files
    console.log('\n[4/4] Copying required models...\n');
    let totalSize = 0;
    let copiedCount = 0;

    for (const model of requiredModels) {
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
    console.log(`   Copied: ${copiedCount} required models`);
    console.log(`   Skipped: ${skippedModels.length} unnecessary models`);
    console.log(`   Total size: ${getFileSizeKB(totalSize)} KB`);
    console.log('='.repeat(60));

    console.log('\n📝 Only required models have been copied to: ' + LOCAL_MODELS_DIR);
    console.log('\n📌 Enabled modules (from library-loader.ts):');
    console.log('   ✅ face (detector, mesh, antispoof, liveness)');
    console.log('   ✅ gesture (hand landmark)');
    console.log('\n📌 Disabled modules (not copied):');
    console.log('   ❌ body, hand, iris, object, emotion, face recognition');
    console.log('\nConfiguration example:\n');
    console.log('```typescript');
    console.log('const config = {');
    console.log(`  human_model_path: "${path.relative(PROJECT_ROOT, LOCAL_MODELS_DIR)}",`);
    console.log('  tensorflow_wasm_path: "/wasm",');
    console.log('};');
    console.log('```\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
