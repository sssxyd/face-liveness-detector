#!/usr/bin/env node

/**
 * 发布脚本：将dist目录同步到远程服务器
 * 使用 ssh2-sftp-client 实现 SFTP 上传
 * 功能：
 * - 同名文件覆盖
 * - 目标不存在则新增
 * - dist不存在，目标存在则删除
 * 
 * 支持平台：Windows / Linux / Mac（无需系统 SSH 工具）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import Client from 'ssh2-sftp-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REMOTE_HOST = '146.190.162.140';
const REMOTE_PORT = parseInt(process.env.REMOTE_PORT || '22', 10);
const REMOTE_USER = process.env.REMOTE_USER || 'root';
const REMOTE_PASSWORD = process.env.REMOTE_PASSWORD || null;
const REMOTE_PRIVATE_KEY = process.env.REMOTE_PRIVATE_KEY || 'C:\\Users\\sssxyd\\.ssh\\id_rsa';
const REMOTE_PATH = '/home/js-face-detector';
const LOCAL_DIST = path.join(__dirname, 'dist');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 递归删除远程目录及其内容
 */
async function removeRemoteDir(sftp, remotePath) {
  try {
    const items = await sftp.list(remotePath);
    
    for (const item of items) {
      if (item.name === '.' || item.name === '..') continue;
      
      const fullPath = path.join(remotePath, item.name).replace(/\\/g, '/');
      
      if (item.type === 'd') {
        // 递归删除子目录
        await removeRemoteDir(sftp, fullPath);
      } else {
        // 删除文件
        await sftp.delete(fullPath);
      }
    }
    
    // 删除空目录
    await sftp.rmdir(remotePath);
  } catch (error) {
    if (error.code !== 2) { // 忽略目录不存在的错误
      throw error;
    }
  }
}

/**
 * 获取本地目录中的所有文件
 */
function getAllFiles(dir, prefix = '') {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = prefix ? `${prefix}/${item}` : item;
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath, relativePath));
    } else {
      files.push({ local: fullPath, remote: relativePath });
    }
  }

  return files;
}

/**
 * 获取远程服务器上的所有文件
 */
async function getRemoteFiles(sftp, remotePath, prefix = '') {
  const files = [];
  
  try {
    const items = await sftp.list(remotePath);

    for (const item of items) {
      if (item.name === '.' || item.name === '..') continue;

      const relativePath = prefix ? `${prefix}/${item.name}` : item.name;

      if (item.type === 'd') {
        files.push(...await getRemoteFiles(sftp, path.join(remotePath, item.name), relativePath));
      } else {
        files.push(relativePath);
      }
    }
  } catch (error) {
    if (error.code !== 2) { // 忽略目录不存在的错误
      throw error;
    }
  }

  return files;
}

/**
 * 主发布函数
 */
async function publishViaSFTP() {
  const sftp = new Client();

  try {
    // 检查本地 dist 目录
    if (!fs.existsSync(LOCAL_DIST)) {
      log('\n✗ 错误：dist 目录不存在，请先执行 npm run build', 'red');
      process.exit(1);
    }

    log('\n========================================', 'blue');
    log('开始发布到服务器...', 'blue');
    log('========================================', 'blue');
    log(`服务器: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PORT}`, 'yellow');
    log(`远程路径: ${REMOTE_PATH}`, 'yellow');
    log(`本地: ${LOCAL_DIST}`, 'yellow');

    // 准备 SSH 连接配置
    const sshConfig = {
      host: REMOTE_HOST,
      port: REMOTE_PORT,
      username: REMOTE_USER,
      tryKeyboard: true,
      debug: false
    };

    // 优先使用私钥认证
    if (REMOTE_PRIVATE_KEY) {
      try {
        sshConfig.privateKey = fs.readFileSync(REMOTE_PRIVATE_KEY);
      } catch (error) {
        log(`⚠️  无法读取私钥文件: ${REMOTE_PRIVATE_KEY}`, 'yellow');
      }
    } else {
      // 尝试默认的 SSH 密钥位置
      const defaultKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa');
      if (fs.existsSync(defaultKeyPath)) {
        sshConfig.privateKey = fs.readFileSync(defaultKeyPath);
      }
    }

    // 如果没有私钥，尝试使用密码
    if (!sshConfig.privateKey && REMOTE_PASSWORD) {
      sshConfig.password = REMOTE_PASSWORD;
    }

    // 连接到服务器
    log(`\n⏳ 连接到服务器...`, 'blue');
    await sftp.connect(sshConfig);
    log(`✓ 连接到服务器 成功`, 'green');

    // 创建远程目录
    log(`\n⏳ 创建/检查远程目录...`, 'blue');
    try {
      await sftp.mkdir(REMOTE_PATH, true);
      log(`✓ 创建/检查远程目录 成功`, 'green');
    } catch (error) {
      if (error.code !== 2) { // 2 = 目录已存在
        throw error;
      }
    }

    // 清理 assets 目录中的旧文件
    log(`\n⏳ 清理旧版本的 assets 目录...`, 'blue');
    const remoteAssetsPath = path.join(REMOTE_PATH, 'assets').replace(/\\/g, '/');
    try {
      await removeRemoteDir(sftp, remoteAssetsPath);
      log(`✓ 清理 assets 目录 完成`, 'green');
    } catch (error) {
      if (error.code === 2) {
        log(`✓ assets 目录不存在，无需清理`, 'green');
      } else {
        log(`⚠️  清理 assets 目录失败: ${error.message}`, 'yellow');
      }
    }

    // 获取本地和远程文件列表
    log(`\n⏳ 扫描本地文件...`, 'blue');
    const localFiles = getAllFiles(LOCAL_DIST);
    log(`✓ 扫描本地文件 完成 (${localFiles.length} 个文件)`, 'green');

    log(`\n⏳ 扫描远程文件...`, 'blue');
    const remoteFiles = await getRemoteFiles(sftp, REMOTE_PATH);
    log(`✓ 扫描远程文件 完成 (${remoteFiles.length} 个文件)`, 'green');

    // 上传本地文件
    log(`\n⏳ 上传文件...`, 'blue');
    let uploadCount = 0;
    
    for (const file of localFiles) {
      const remoteFilePath = path.join(REMOTE_PATH, file.remote).replace(/\\/g, '/');
      const remoteDir = path.dirname(remoteFilePath).replace(/\\/g, '/');

      try {
        // 确保远程目录存在
        await sftp.mkdir(remoteDir, true);
        
        // 上传文件
        await sftp.fastPut(file.local, remoteFilePath);
        uploadCount++;
        log(`  ✓ ${file.remote}`, 'cyan');
      } catch (error) {
        log(`  ✗ 上传失败: ${file.remote} - ${error.message}`, 'red');
        throw error;
      }
    }
    log(`✓ 上传文件 完成 (${uploadCount} 个文件)`, 'green');

    // 删除远程不存在的文件
    log(`\n⏳ 清理远程不存在的文件...`, 'blue');
    let deleteCount = 0;
    const localFileSet = new Set(localFiles.map(f => f.remote));

    for (const remoteFile of remoteFiles) {
      if (!localFileSet.has(remoteFile)) {
        try {
          const remoteFilePath = path.join(REMOTE_PATH, remoteFile).replace(/\\/g, '/');
          await sftp.delete(remoteFilePath);
          deleteCount++;
          log(`  🗑️  ${remoteFile}`, 'cyan');
        } catch (error) {
          log(`  ⚠️  删除失败: ${remoteFile} - ${error.message}`, 'yellow');
        }
      }
    }
    log(`✓ 清理远程文件 完成 (删除 ${deleteCount} 个文件)`, 'green');

    // 关闭连接
    await sftp.end();

    log('\n========================================', 'green');
    log('✓ 发布成功！', 'green');
    log('========================================', 'green');
    log(`\n统计：`, 'cyan');
    log(`  上传: ${uploadCount} 个文件`, 'cyan');
    log(`  删除: ${deleteCount} 个文件`, 'cyan');
    log(`  总计: ${localFiles.length} 个文件在服务器上`, 'cyan');

  } catch (error) {
    log('\n========================================', 'red');
    log('✗ 发布失败！', 'red');
    log('========================================', 'red');
    log(`\n错误信息: ${error.message}`, 'red');
    
    if (error.code === 'ENOTFOUND') {
      log('\n排查建议：', 'yellow');
      log('1. 检查服务器地址是否正确', 'yellow');
      log('2. 检查网络连接', 'yellow');
    } else if (error.code === 'ECONNREFUSED') {
      log('\n排查建议：', 'yellow');
      log('1. 检查服务器是否在线', 'yellow');
      log('2. 检查 SSH 端口是否正确 (默认: 22)', 'yellow');
    } else if (error.message.includes('All configured authentication methods failed')) {
      log('\n排查建议：', 'yellow');
      log('1. 检查 SSH 密钥是否正确配置', 'yellow');
      log('2. 检查远程用户是否正确', 'yellow');
      log('3. 设置环境变量 REMOTE_PASSWORD 使用密码认证', 'yellow');
    }
    
    process.exit(1);
  }
}

async function main() {
  try {
    await publishViaSFTP();
  } catch (error) {
    log(`\n✗ 未捕获的错误: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();

