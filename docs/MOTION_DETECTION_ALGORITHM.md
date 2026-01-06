# 运动活体检测算法文档

## 概述

本文档描述运动活体检测器（MotionLivenessDetector）的核心算法，该检测器用于区分真实人脸和照片攻击，基于光学流、关键点追踪和面部特征分析。

---

## 1. 系统架构

### 1.1 输入数据

| 数据 | 来源 | 说明 |
|------|------|------|
| **灰度图像** | OpenCV Mat | 当前视频帧的灰度版本 |
| **面部检测结果** | Human.js | 包含468个面部标志点的Face Mesh |
| **面部边界框** | Face Box | [x, y, width, height] 格式 |

### 1.2 核心模块

```
输入帧 
  ↓
[帧缓冲管理] → 维持滑动窗口的帧历史
  ↓
[关键点提取] → 468个MediaPipe标志点
  ↓
[多维度运动分析]
  ├─ 光流计算 (Optical Flow)
  ├─ 关键点方差 (Keypoint Variance)
  ├─ 眼睛运动 (Eye Aspect Ratio)
  ├─ 嘴巴运动 (Mouth Aspect Ratio)
  ├─ 瞳孔反应 (Pupil Response)
  └─ 面部区域变化 (Face Area Variance)
  ↓
[特征融合] → 加权评分
  ↓
[活体判断] → 6重检查
  ↓
输出结果 (MotionDetectionResult)
```

---

## 2. 数据流处理

### 2.1 帧缓冲管理

**目的**：维持固定大小的帧历史窗口，用于时序分析

```typescript
frameBuffer: Uint8Array[] = []    // 灰度图数据缓冲
frameBufferSize: 5 (默认)         // 窗口大小
frameWidth: number = 0            // 帧宽度
frameHeight: number = 0           // 帧高度

// 添加新帧流程：
1. 存储帧尺寸（首帧时）
2. 转换Mat为Uint8Array并存储
3. 如果超过缓冲区大小，移除最旧的Uint8Array
```

**关键特性**：
- 内存管理：使用Uint8Array轻量级存储，避免Mat对象开销
- 滑动窗口：最多保持5帧历史
- 数据一致性：所有历史记录同步清空(reset)
- 高效存储：仅存储像素数据，重建Mat时使用cached尺寸

### 2.2 关键点提取

**来源**：MediaPipe Face Mesh 468点模型

**提取策略**：
```typescript
// 从468个全局标志点中提取特定区域

左眼 (6个点):
  - 索引: [362, 385, 387, 390, 25, 55]
  - 特征: 眼睛左右角和上下轮廓

右眼 (6个点):
  - 索引: [33, 160, 158, 133, 153, 144]
  - 特征: 眼睛左右角和上下轮廓

嘴巴 (10个点):
  - 索引: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409]
  - 特征: 上下唇轮廓
```

**数据结构**：
```typescript
FaceKeypoints {
  landmarks: any[][]  // 全部468个点
  leftEye: any[][]    // 左眼6个点
  rightEye: any[][]   // 右眼6个点
  mouth: any[][]      // 嘴巴10个点
}
```

---

## 3. 运动指标计算

### 3.1 光流分析 (Optical Flow)

**算法**：Farneback算法（OpenCV实现）

**计算步骤**：
```
1. 获取相邻两帧 (frame[i-1], frame[i])
2. 从Uint8Array创建临时Mat对象
3. 计算光流向量场 (高密度光流)
4. 计算每个像素的运动幅度: mag = sqrt(fx² + fy²)
5. 求平均幅度: avgMag = sum(mag) / 像素总数
6. 归一化: opticalFlow = min(avgMag / 10, 1)
7. 清理临时Mat对象
```

**参数说明**（针对5帧短视频优化）：
- `pyr_scale=0.8`：更陡峭的金字塔，保留细节
- `levels=2`：减少层级数，适合小尺寸视频
- `winsize=7`：更小的窗口，捕捉微小运动
- `iterations=3`：迭代次数
- `poly_n=5`：多项式邻域
- `poly_sigma=1.2`：多项式标准差

**调试日志**：
```typescript
console.debug('[MotionLivenessDetector] Optical flow stats:', {
  pixelCount: count,
  sumMagnitude: sumMagnitude.toFixed(2),
  avgMagnitude: avgMagnitude.toFixed(4),
  maxMagnitude: maxMagnitude.toFixed(4),
  normalizedResult: normalizedMagnitude.toFixed(4)
})
```

**输出范围**：[0, 1]
- `0` = 没有运动（照片）
- `0.3-0.5` = 中等运动（头部微动、表情）
- `0.8-1.0` = 大幅度运动（快速转头）

**注意**：归一化因子为10（5帧优化），最大预期光流约10像素/帧

### 3.2 关键点方差 (Keypoint Variance)

**目的**：检测关键点在时间维度的位置变化

**计算步骤**：
```
1. 遍历关键点历史: landmarks[i-1] vs landmarks[i]
2. 计算两帧间对应点的距离:
   distance = sqrt((x₁-x₂)² + (y₁-y₂)²)
3. 求所有点的平均距离: avgDist
4. 计算距离序列的标准差: stdDev
5. 归一化: keypointVariance = min(stdDev / 5, 1)
```

**特性**：
- **高方差** (> 0.1) = 自然运动（眼睛、嘴巴、头部）
- **低方差** (< 0.02) = 静止或照片
- **基线值** = 5像素（自然运动的预期变化）

**优势**：
- 捕捉整体面部运动模式
- 不依赖特定特征
- 对遮挡鲁棒

### 3.3 眼睛宽高比 (Eye Aspect Ratio, EAR)

**公式**：
$$\text{EAR} = \frac{\|p_2 - p_6\| + \|p_3 - p_5\|}{2 \times \|p_1 - p_4\|}$$

其中：
- $p_1, p_4$：眼睛左右角（水平）
- $p_2, p_6$；$p_3, p_5$：眼睛上下轮廓点（垂直）

**应用**：
```typescript
// 检测眨眼和眼睛开度变化
let eyeMotionScore = 0
if (variance(EAR历史) > threshold) {
  eyeMotionScore = min(variance / 0.05, 1)
  // 0.05 = 眨眼的预期方差
}
```

### 3.4 嘴巴宽高比 (Mouth Aspect Ratio, MAR)

**计算**：
```typescript
// 上下唇中心线的垂直距离 / 嘴巴宽度
MAR = verticalDistance / mouthWidth

// 应用：检测张嘴、微笑等表情
mouthMotionScore = min(variance(MAR历史) / 0.02, 1)
// 0.02 = 嘴巴运动的预期方差
```

### 3.5 瞳孔反应检测 (Pupil Response)

**简单实现**：计算眼睛边界框大小

```typescript
// 步骤：
1. 获取眼睛关键点的边界框
2. 计算面积: eyeSize = width × height
3. 记录历史: pupilSizeHistory
4. 用于检测瞳孔对光线的适应性
```

**局限**：
- 仅基于关键点，不基于真实瞳孔检测
- 作为补充指标而非主要指标

### 3.6 面部区域变化 (Face Area Variance)

```typescript
faceArea = bbox_width × bbox_height

// 应用：
- 检测面部缩放变化（呼吸、前后摇头）
- 计算方差用于检测呼吸运动
- 预期值：呼吸导致的微小面积变化 (~0.1%)
```

---

## 4. 运动一致性验证

**目的**：防止照片微动攻击，同时允许不同类型真实运动的不同表现

**原理**：
- 真实面部运动：光流和关键点方差应该都有意义（都不为零）
- 照片微动：通常表现为只有光流或只有噪声，或两者都非常低
- 不同运动类型：大幅度头部运动vs微妙表情运动，两者比例关系不同

```typescript
// 两个指标都非常低 = 照片或静止
if (opticalFlow < 0.01 && keypointVariance < 0.01) {
  return 0
}

const minValue = Math.min(opticalFlow, keypointVariance)
const maxValue = Math.max(opticalFlow, keypointVariance)

// 如果两个都有意义的值（都 > 0.01），认为是真实运动
if (minValue >= 0.01) {
  // 允许最大 5:1 的比例（头部大幅旋转可能导致这样的差异）
  const ratio = minValue / maxValue
  // 高宽容度：比例超过 0.2 就认为一致，如果两者都有意义，至少返回 0.5
  return Math.max(ratio, 0.5)
}

// 其中一个接近零（可能是照片微动，但也可能是特定运动如仅眼睛运动）
return minValue / (maxValue + 0.001)
```

**场景**：
| 光流 | 关键点方差 | 一致性 | 判断 |
|------|-----------|--------|------|
| 0.15 | 0.12 | 0.5+ | ✅ 真实头部运动（两者都有意义）|
| 0.20 | 0.04 | 0.5 | ✅ 微妙表情运动（比例在5:1内）|
| 0.15 | 0.005 | ~0.03 | ❌ 照片微动（一个接近零）|
| 0.005 | 0.005 | 0 | ❌ 静止/照片（两者都极低）|

---

## 5. 运动类型分类

**目的**：识别运动的性质，辅助活体判断

```typescript
enum MotionType {
  'none'              // 静止（照片）
  'rotation'          // 旋转/转头
  'translation'       // 平移/前后摇晃
  'breathing'         // 呼吸/脉搏
  'micro_expression'  // 微表情/眨眼
}
```

**分类规则**：
```typescript
// 1. 检查是否无运动
if (keypointVariance < 0.01 && opticalFlow < 0.1)
  → 'none'  // 无运动

// 2. 关键点变化远大于光流 → 旋转或表情
if (keypointVariance > opticalFlow × 2) {
  // 检查是否有眨眼（眼睛运动）
  if (eyeAspectRatioVariance > eyeAspectRatioThreshold) {
    → 'micro_expression'  // 微表情（眨眼等）
  }
  → 'rotation'  // 旋转/转头
}

// 3. 光流远大于关键点变化 → 平移
if (opticalFlow > keypointVariance × 2)
  → 'translation'  // 整体平移

// 4. 检查呼吸运动
if (faceAreaVariance > 0.001)
  → 'breathing'  // 面积周期性变化：呼吸或脉搏

// 5. 其他情况
→ 'micro_expression'  // 默认微表情
```

---

## 6. 特征融合与评分

### 6.1 权重设计

针对照片防护优化的权重：

```typescript
weights = {
  opticalFlow: 0.45,        // ⭐ 最高权重（照片零光流）
  keypointVariance: 0.35,   // 次高（照片静止）
  motionConsistency: 0.10,  // 一致性检查
  eyeMotion: 0.05,          // 辅助指标
  mouthMotion: 0.05         // 辅助指标
}

严格模式 (strictPhotoDetection=true):
weights = {
  opticalFlow: 0.55,        // ⬆️ 更强调光流
  keypointVariance: 0.30,
  motionConsistency: 0.15,
  eyeMotion: 0.00,          // ❌ 禁用
  mouthMotion: 0.00         // ❌ 禁用
}
```

### 6.2 综合评分

```typescript
motionScore = 
  opticalFlow × 0.45 +
  keypointVariance × 0.35 +
  motionConsistency × 0.10 +
  eyeMotion × 0.05 +
  mouthMotion × 0.05

// 输出范围：[0, 1]
// 0.15 = 最小活体阈值
// 0.50 = 明确活体判断
```

---

## 7. 活体判断（6重独立指标投票制）

### 7.1 设计理念

**从串联AND逻辑改为并联投票制**：
- 旧方式：所有检查必须通过（容易误判不同类型的真实运动）
- 新方式：多数票制（识别不同类型的真实运动）

**6个独立检测指标**（互相独立，针对不同攻击场景）：

```
指标1: 关键点变化 + 光流一致性
  ├─ 防御：照片旋转也会改变关键点，但光流极低
  ├─ 条件：keypointVariance > 0.01 && opticalFlow > 0.02
  └─ 票数：+1

指标2: 光流幅度（照片的明显弱点）
  ├─ 防御：照片几乎无法产生光流
  ├─ 条件：opticalFlow > 0.03
  └─ 票数：+1

指标3: 运动类型 + 光流双重确认
  ├─ 防御：照片旋转会被检测为'rotation'，但光流极低
  ├─ 条件：motionType ≠ 'none' && opticalFlow > 0.02
  └─ 票数：+1

指标4: 眼睛运动（眨眼）
  ├─ 防御：照片的眼睛无法眨动
  ├─ 条件：eyeMotionScore > 0.5
  └─ 票数：+1

指标5: 嘴巴运动
  ├─ 防御：说话、微笑等动作改变嘴巴宽高比
  ├─ 条件：mouthMotionScore > 0.5
  └─ 票数：+1

指标6: 面部区域变化
  ├─ 防御：呼吸导致面部整体面积变化
  ├─ 条件：faceAreaChangeRate > 0.005
  └─ 票数：+1
```

### 7.2 判决规则

```typescript
// 基本规则
const isDataSufficient = frameBuffer.length >= frameBufferSize  // 默认5帧
const requiredVotes = isDataSufficient ? 2 : 3  // 数据充足需2票，不足需3票

if (livelyVotes >= requiredVotes) {
  return true  // ✅ 活体
}

// 额外严格检查：所有指标都强烈指向照片
if (opticalFlow < 0.02 && 
    motionType === 'none' && 
    keypointVariance < 0.005 && 
    eyeMotionScore < 0.25 && 
    mouthMotionScore < 0.25) {
  return false  // ❌ 绝对确定是照片
}

// 单一强指标补偿：投票数=1但指标非常强劲
if (livelyVotes === 1) {
  if (keypointVariance > 0.05) return true      // 关键点变化明显
  if (eyeMotionScore > 1.0) return true         // 明显眨眼
  if (mouthMotionScore > 1.0) return true       // 嘴巴运动明显
  if (opticalFlow > 0.08) return true           // 光流明显
}

// 默认
return false  // ❌ 非活体
```

### 7.3 不同运动类型的识别

| 运动类型 | 支持指标 | 示例 |
|---------|---------|------|
| **头部旋转** | 指标1, 2, 3 | 关键点变化明显 + 中等光流 |
| **说话/微笑** | 指标3, 5 | 嘴巴运动明显 |
| **眨眼** | 指标4 | 眼睛运动明显 |
| **呼吸** | 指标6 | 面部区域规律变化 |
| **组合动作** | 多个指标 | 眨眼+头动 等 |

### 7.4 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `minMotionThreshold` | 0.15 | 最小运动评分（用于getMessage）|
| `minKeypointVariance` | 0.02 | 最小关键点变化（用于指标1）|
| `minOpticalFlowThreshold` | 0.08 | 最小光流（用于指标2，已废弃）|
| `motionConsistencyThreshold` | 0.5 | 运动一致性下限（用于权重计算）|
| `frameBufferSize` | 5 | 帧历史窗口 |
| `eyeAspectRatioThreshold` | 0.15 | 眼睛运动触发值 |
| `strictPhotoDetection` | false | 严格模式开关 |

**注意**：新版本中，单个参数不再作为硬性拒绝条件，而是作为投票指标的一部分。

---

## 8. 输出结果

### 8.1 MotionDetectionResult

```typescript
{
  // 主要指标
  motionScore: number              // [0, 1] 综合评分
  opticalFlowMagnitude: number     // [0, 1] 光流幅度
  keypointVariance: number         // [0, 1] 关键点方差
  eyeMotionScore: number           // [0, 1] 眼睛运动
  mouthMotionScore: number         // [0, 1] 嘴巴运动
  
  // 结果
  motionType: MotionType           // 运动类型分类
  isLively: boolean                // 活体判断结果
  
  // 调试信息
  details: {
    frameCount: number             // 缓冲帧数
    avgKeypointDistance: number    // 平均关键点距离
    maxKeypointDistance: number    // 最大关键点距离
    faceAreaVariance: number       // 面部面积变化
    eyeAspectRatioVariance: number // EAR方差
    mouthAspectRatioVariance: number // MAR方差
  }
}
```

### 8.2 诊断消息

```typescript
// 获取不活体的具体原因
message = result.getMessage(
  minMotionScore: 0.15,
  minKeypointVariance: 0.02
)

// 输出示例：
// "检测到的运动不足 (运动评分: 8.5%); 关键点方差低 (1.2%)，表示面孔静止或类似照片"
```

---

## 9. 性能特性

### 9.1 计算复杂度

| 操作 | 复杂度 | 说明 |
|------|--------|------|
| 光流计算 | O(W×H) | 高，仅在相邻帧 |
| 关键点距离 | O(468×F) | 中，468个点×帧数 |
| 方差计算 | O(N) | 低，简单统计 |
| 总体分析 | ~O(W×H) | 光流为瓶颈 |

### 9.2 内存占用

```
frameBuffer:            ~1.2 MB (5个Uint8Array，640×480)
keypointHistory:        ~50 KB  (468点×5帧)
faceAreaHistory:        ~40 bytes (5个number)
eyeAspectRatioHistory:  ~40 bytes (5个number)
mouthAspectRatioHistory: ~40 bytes (5个number)
opticalFlowHistory:     ~40 bytes (5个number)
pupilSizeHistory:       ~40 bytes (5个number)
total:                 ~1.3 MB (典型配置640×480)

注：使用Uint8Array轻量级存储，比Mat对象节省内存
```

### 9.3 时序要求

```
帧处理延迟:  ~50-100ms (取决于光流计算)
活体判断准备: 5-10帧 (~170-330ms @30fps)
完整判断时间: 需要足够帧积累
```

---

## 10. 使用示例

```typescript
// 初始化
const detector = new MotionLivenessDetector(
  strictPhotoDetection: false  // 标准模式（true=严格模式）
)

// 获取配置
const options = detector.getOptions()
console.log(options)  // 查看所有参数

// 修改配置（如需要）
// options中包含：
// - minMotionThreshold: 0.15
// - minKeypointVariance: 0.02
// - frameBufferSize: 5
// - eyeAspectRatioThreshold: 0.15
// - strictPhotoDetection: false

// 设置OpenCV实例
detector.setCVInstance(cv)

// 检查是否准备好（缓冲区是否已满）
if (!detector.isReady()) {
  console.log('需要至少5帧才能开始检测')
}

// 逐帧处理
for (let frame of videoFrames) {
  const result = detector.analyzeMotion(grayMat, faceResult, faceBox)
  
  if (result.isLively) {
    console.log('✅ 活体检测通过')
  } else {
    console.log('❌ ' + result.getMessage(0.15, 0.02))
  }
}

// 获取统计信息
const stats = detector.getStatistics()
console.log(stats)  // 当前缓冲状态

// 重置
detector.reset()
```

---

## 11. 局限性与改进方向

### 11.1 当前局限

- ❌ 不检测视频重放（有屏幕检测模块单独处理）
- ❌ 光流计算CPU密集
- ❌ 瞳孔反应检测简化
- ❌ 不考虑光照变化
- ❌ 不考虑背景运动影响

### 11.2 改进方向

- ✨ 集成深度信息（3D活体检测）
- ✨ 融合RGB-D多模态
- ✨ 皮肤纹理分析
- ✨ 心跳/脉搏检测
- ✨ 自适应阈值学习

---

## 12. 总结

该算法通过**6重独立指标投票制**和**多维度运动分析**，实现对照片攻击的有效防护：

| 维度 | 防护强度 |
|------|---------|
| 投票制设计 | ⭐⭐⭐⭐⭐ |
| 光流检测 | ⭐⭐⭐⭐⭐ |
| 关键点追踪 | ⭐⭐⭐⭐ |
| 运动一致性 | ⭐⭐⭐⭐ |
| 物理约束 | ⭐⭐⭐ |
| 综合防护 | ⭐⭐⭐⭐⭐ |

**适用场景**：
- ✅ 日常用户验证
- ✅ 中等安全应用
- ✅ 实时人脸验证系统

**不适用场景**：
- ❌ 高安全金融交易（需多因素验证）
- ❌ 司法身份认证（需硬件级防护）
