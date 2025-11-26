# 常用测试命令参考

## 基础命令

```bash
# 运行所有测试
npm test

# 监视模式（自动重新运行）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 高级命令

```bash
# 运行特定测试文件
npx jest src/__tests__/config.test.ts

# 运行名称匹配的测试
npx jest -t "Configuration"

# 运行名称匹配的测试套件（更宽泛）
npx jest -t "should merge"

# 详细输出
npx jest --verbose

# 仅显示失败的测试
npx jest --verbose --testNamePattern="fail"

# 跳过某些测试（使用 xit 或 skip）
npx jest --testNamePattern="^(?!.*skip)"

# 运行特定行号的测试
npx jest src/__tests__/config.test.ts:30
```

## 调试命令

```bash
# 使用 Node 调试器
node --inspect-brk node_modules/.bin/jest --runInBand

# 在 Chrome 中调试（需要 node --inspect）
# 打开 chrome://inspect

# 显示内存使用
npx jest --detectOpenHandles

# 显示哪些测试最慢
npx jest --verbose --testTimeout=10000
```

## 覆盖率命令

```bash
# 生成覆盖率报告
npm run test:coverage

# 查看覆盖率阈值
npx jest --coverage --coverageReporters=text

# 生成 HTML 报告（位于 coverage/index.html）
npx jest --coverage

# 显示未覆盖的行
npx jest --coverage --coverageReporters=text-summary
```

## CI/CD 命令

```bash
# 运行一次后退出（CI 环境）
npx jest --ci --coverage

# 不显示覆盖率（更快）
npx jest --ci --no-coverage

# 设置工作进程数
npx jest --maxWorkers=4

# 运行失败的测试优先
npx jest --onlyChanged

# 从 Git 改变的文件运行测试
npx jest --onlyChanged --bail
```

## 开发工作流

```bash
# 1. 开发时使用监视模式
npm run test:watch

# 2. 提交前检查覆盖率
npm run test:coverage

# 3. 快速检查（无覆盖率）
npm test

# 4. 调试失败的测试
npx jest --verbose --testNamePattern="failing test name"
```

## 输出解释

### 通过的测试
```
PASS  src/__tests__/config.test.ts
  ✓ should merge partial config (5ms)
  ✓ should not mutate default config (2ms)
```

### 失败的测试
```
FAIL  src/__tests__/config.test.ts
  ✕ should handle errors (50ms)
    → ReferenceError: x is not defined
```

### 跳过的测试
```
⊕ should test something (skipped)
```

## 常见场景

### 快速验证代码
```bash
npm test -- --testPathPattern="config"
```

### 在提交前运行所有测试
```bash
npm test && npm run type-check
```

### 仅运行新增/修改的测试
```bash
npm test -- --onlyChanged
```

### 调试特定测试
```bash
# 添加 debugger; 语句到测试，然后：
node --inspect-brk node_modules/.bin/jest --runInBand
```

## npm 脚本

在 `package.json` 中定义：

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage"
}
```

使用：
```bash
npm test              # 运行测试
npm run test:watch   # 监视模式
npm run test:coverage # 覆盖率
```

## 配置文件

- `jest.config.js` - Jest 配置
- `jest.setup.js` - 全局 setup
- `tsconfig.json` - TypeScript 配置

## 更多信息

详见 `TESTING.md` 获取完整文档
