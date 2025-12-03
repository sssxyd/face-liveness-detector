#!/usr/bin/env node

/**
 * Download TensorFlow.js WASM files to specified directory
 * 
 * Usage:
 *   node scripts/download-wasm.cjs <output-directory>
 *   node scripts/download-wasm.cjs ../uniapp/wasm
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

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

// 配置
// Get __dirname in CommonJS (compatible with "type": "module")
const getScriptDir = () => {
  try {
    // In normal CJS, __filename is global
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
  console.error('Usage: node scripts/download-wasm.cjs <output-directory>');
  console.error('Example: node scripts/download-wasm.cjs ../uniapp/wasm');
  process.exit(1);
}

const LOCAL_DIR = path.isAbsolute(outputDirArg) 
  ? outputDirArg 
  : path.join(PROJECT_ROOT, outputDirArg);

/**
 * Read TensorFlow version from Human.js package.json in node_modules
 */
function getTensorFlowVersion() {
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
    
    // Find TensorFlow version from devDependencies
    const devDeps = humanPackage.devDependencies || {};
    const tfCoreVersion = devDeps['@tensorflow/tfjs-core'];
    const tfWasmVersion = devDeps['@tensorflow/tfjs-backend-wasm'];

    if (!tfCoreVersion || !tfWasmVersion) {
      throw new Error(
        'TensorFlow.js dependencies not found in @vladmandic/human package.json.'
      );
    }

    // Extract version number (remove ^ or ~ and other prefixes)
    const version = tfCoreVersion.replace(/^[\^~>=<]*/, '');

    console.log(`📦 Detected TensorFlow.js version: ${version}`);
    console.log(`   - @tensorflow/tfjs-core: ${tfCoreVersion}`);
    console.log(`   - @tensorflow/tfjs-backend-wasm: ${tfWasmVersion}`);

    return version;
  } catch (error) {
    console.error(`❌ Failed to read TensorFlow.js version: ${error.message}`);
    process.exit(1);
  }
}

const WASM_VERSION = getTensorFlowVersion();

// 多个 CDN 源列表，按优先级排序
const CDN_SOURCES = [
  `https://unpkg.com/@tensorflow/tfjs-backend-wasm@${WASM_VERSION}/dist`,
  `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${WASM_VERSION}/dist`,
  `https://esm.sh/@tensorflow/tfjs-backend-wasm@${WASM_VERSION}/dist`,
  `https://cdn.esm.sh/@tensorflow/tfjs-backend-wasm@${WASM_VERSION}/dist`,
];

let CDN_URL = CDN_SOURCES[0];

// 需要下载的文件列表
const FILES_TO_DOWNLOAD = [
  'tf-backend-wasm.min.js',
  'tfjs-backend-wasm.wasm',
  'tfjs-backend-wasm-simd.wasm',
  'tfjs-backend-wasm-threaded-simd.wasm',
];

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
 * Download file (with CDN fallback)
 */
function downloadFile(url, destPath, retries = 3, cdnIndex = 0) {
  return new Promise((resolve, reject) => {
    const attemptDownload = (retryCount) => {
      const file = fs.createWriteStream(destPath);
      const timeout = setTimeout(() => {
        file.destroy();
        fs.unlink(destPath, () => {});
        if (retryCount > 0) {
          console.log(`  ⏱️  Timeout, retrying (${3 - retryCount + 1}/3)...`);
          attemptDownload(retryCount - 1);
        } else {
          // Try next CDN
          if (cdnIndex < CDN_SOURCES.length - 1) {
            console.log(`  🔄 Switching to backup CDN source...`);
            const newCdnIndex = cdnIndex + 1;
            const newUrl = url.replace(CDN_SOURCES[cdnIndex], CDN_SOURCES[newCdnIndex]);
            downloadFile(newUrl, destPath, 3, newCdnIndex)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error(`Timeout: ${url}`));
          }
        }
      }, 30000); // 30 seconds timeout
      
      https.get(url, (response) => {
        clearTimeout(timeout);
        
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.destroy();
          fs.unlink(destPath, () => {});
          downloadFile(response.headers.location, destPath, retryCount, cdnIndex)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.destroy();
          fs.unlink(destPath, () => {});
          
          // If 404 or other error, try next CDN
          if (response.statusCode === 404 && cdnIndex < CDN_SOURCES.length - 1) {
            console.log(`  🔄 Current CDN does not have this file, switching to backup CDN source...`);
            const newCdnIndex = cdnIndex + 1;
            const newUrl = url.replace(CDN_SOURCES[cdnIndex], CDN_SOURCES[newCdnIndex]);
            downloadFile(newUrl, destPath, 3, newCdnIndex)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error(`HTTP ${response.statusCode}: ${url}`));
          }
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r  Download progress: ${percent}%`);
        });

        response.pipe(file);

        file.on('finish', () => {
          clearTimeout(timeout);
          file.close();
          console.log(`\r✓ Download completed: ${path.basename(destPath)}`);
          resolve();
        });

        file.on('error', (err) => {
          clearTimeout(timeout);
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        clearTimeout(timeout);
        fs.unlink(destPath, () => {});
        if (retryCount > 0) {
          console.log(`  ⚠️  Connection error, retrying (${3 - retryCount + 1}/3)...`);
          attemptDownload(retryCount - 1);
        } else {
          // Try next CDN
          if (cdnIndex < CDN_SOURCES.length - 1) {
            console.log(`  🔄 CDN connection failed, switching to backup source...`);
            const newCdnIndex = cdnIndex + 1;
            const newUrl = url.replace(CDN_SOURCES[cdnIndex], CDN_SOURCES[newCdnIndex]);
            downloadFile(newUrl, destPath, 3, newCdnIndex)
              .then(resolve)
              .catch(reject);
          } else {
            reject(err);
          }
        }
      });
    };
    
    attemptDownload(retries);
  });
}

/**
 * Get file size in KB
 */
function getFileSizeKB(bytes) {
  return (bytes / 1024).toFixed(2);
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('TensorFlow.js WASM Downloader');
  console.log('='.repeat(60));
  
  // Auto-detect version
  console.log('\n[0/3] Detecting dependency versions...\n');
  
  console.log(`\n📍 Source CDN: Multi-source fallback (${CDN_SOURCES.length} sources)`);
  console.log(`🔗 Primary CDN URL: ${CDN_SOURCES[0]}`);
  console.log(`🔄 Backup CDN: ${CDN_SOURCES.slice(1).join(', ')}`);
  console.log(`📁 Target directory: ${LOCAL_DIR}`);
  console.log(`\nFiles to download:`);
  FILES_TO_DOWNLOAD.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file}`);
  });

  try {
    // 1. Create directory
    console.log('\n[1/3] Preparing directory...');
    ensureDirectory(LOCAL_DIR);

    // 2. Download files (sequentially with retries)
    console.log('\n[2/3] Downloading files...\n');
    const failedFiles = [];
    for (const filename of FILES_TO_DOWNLOAD) {
      const url = `${CDN_URL}/${filename}`;
      const destPath = path.join(LOCAL_DIR, filename);
      
      console.log(`\n  Downloading: ${filename}`);
      try {
        await downloadFile(url, destPath);
      } catch (err) {
        console.error(`  ✗ Download failed: ${err.message}`);
        failedFiles.push(filename);
      }
    }

    // 3. Verify files
    console.log('\n\n[3/3] Verifying files...\n');
    let totalSize = 0;
    let successCount = 0;
    FILES_TO_DOWNLOAD.forEach((filename) => {
      const filePath = path.join(LOCAL_DIR, filename);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`  ✓ ${filename} (${getFileSizeKB(stats.size)} KB)`);
        totalSize += stats.size;
        successCount++;
      } else {
        console.log(`  ✗ ${filename} - Not found`);
      }
    });

    console.log('\n' + '='.repeat(60));
    
    if (failedFiles.length === 0) {
      console.log(`✅ Download complete! Total size: ${getFileSizeKB(totalSize)} KB`);
      console.log('='.repeat(60));
      console.log('\n📝 Now you can use local WASM files in your config:\n');
      console.log('```typescript');
      console.log('const config = {');
      console.log('  human_model_path: "/models",');
      console.log('  tensorflow_wasm_path: "/wasm"  // ← Use local files');
      console.log('}');
      console.log('```\n');
    } else {
      console.log(`⚠️  Partially complete (${successCount}/${FILES_TO_DOWNLOAD.length})`);
      console.log(`Total size: ${getFileSizeKB(totalSize)} KB`);
      console.log('='.repeat(60));
      console.log(`\n❌ Failed to download ${failedFiles.length} file(s):`);
      failedFiles.forEach((file) => {
        console.log(`  - ${file}`);
      });
      console.log('\n💡 Suggestions:');
      console.log('  1. Check your network connection');
      console.log('  2. Try using VPN or proxy');
      console.log('  3. Retry later: npm run download-wasm <output-dir>');
      console.log('  4. Or manually download files to specified directory');
      console.log('\n📌 You can still use the project without local TensorFlow WASM,');
      console.log('it will just use online CDN resources.\n');
      
      // If at least some files were downloaded, don't exit
      if (successCount > 0) {
        console.log(`✅ Successfully downloaded ${successCount} file(s), project can continue.\n`);
      } else {
        process.exit(1);
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n💡 If it continues to fail, you can skip this step.\n');
    process.exit(1);
  }
}

main();
