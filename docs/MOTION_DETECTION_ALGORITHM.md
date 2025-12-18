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
frameBuffer: any[] = []           // 灰度图缓冲
frameBufferSize: 5 (默认)         // 窗口大小

// 添加新帧流程：
1. Clone灰度图 (避免修改原始数据)
2. 压入缓冲区
3. 如果超过缓冲区大小，移除最旧帧并释放OpenCV Mat对象
```

**关键特性**：
- 内存管理：自动释放OpenCV Mat对象
- 滑动窗口：最多保持5帧历史
- 数据一致性：所有历史记录同步清空(reset)

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
2. 计算光流向量场 (高密度光流)
3. 计算每个像素的运动幅度: mag = sqrt(fx² + fy²)
4. 求平均幅度: avgMag = sum(mag) / 像素总数
5. 归一化: opticalFlow = min(avgMag / 20, 1)
```

**参数说明**：
- `pyr_scale=0.5`：金字塔缩放因子
- `levels=3`：金字塔层级
- `winsize=15`：平均窗口大小
- `iterations=3`：迭代次数
- `poly_n=5`：多项式邻域
- `poly_sigma=1.2`：多项式标准差

**输出范围**：[0, 1]
- `0` = 没有运动（照片）
- `0.5` = 中等运动（头部微动）
- `1.0` = 大幅度运动（快速转头）

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

**目的**：防止单一维度的虚假运动（如背景运动）

**逻辑**：真实面部运动应在多个维度同时表现

```typescript
// 计算光流和关键点方差的一致性
ratio = min(opticalFlow, keypointVariance) / 
        max(opticalFlow, keypointVariance, 0.01)

// 一致性分数
motionConsistency = ratio  // [0, 1]

// 解释：
// 1.0 = 两者完全匹配（真实运动）
// 0.5 = 部分匹配（可疑）
// 0.1 = 严重不匹配（可能是假运动）
```

**场景**：
| 光流 | 关键点方差 | 一致性 | 判断 |
|------|-----------|--------|------|
| 高 | 高 | 1.0 | ✅ 真实头部运动 |
| 高 | 低 | 0.2 | ❌ 背景运动/照片 |
| 低 | 高 | 0.2 | ❌ 特征点噪声 |
| 低 | 低 | 0 | ❌ 静止/照片 |

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
if (keypointVariance < 0.01 && opticalFlow < 0.1)
  → 'none'  // 无运动

if (keypointVariance > opticalFlow × 2)
  → 'rotation' 或 'micro_expression'
  // 关键点变化多于光流：面部旋转或表情变化

if (opticalFlow > keypointVariance × 2)
  → 'translation'
  // 光流多于关键点变化：整体平移

if (faceAreaVariance > 0.001)
  → 'breathing'
  // 面积周期性变化：呼吸或脉搏
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

## 7. 活体判断（6重检查）

### 7.1 检查流程

```
输入：motionScore, keypointVariance, motionType, opticalFlow, motionConsistency

检查1: opticalFlow ≥ minOpticalFlowThreshold (0.08)
├─ 目的：照片最明显特征是零光流
└─ 失败 → return false

检查2: motionScore ≥ minMotionThreshold (0.15)
├─ 目的：综合评分足够
└─ 失败 → return false

检查3: keypointVariance ≥ minKeypointVariance (0.02)
├─ 目的：关键点有明显变化
└─ 失败 → return false

检查4: motionType ≠ 'none'
├─ 目的：排除完全静止
└─ 失败 → return false

检查5: motionConsistency ≥ motionConsistencyThreshold (0.5)
├─ 目的：运动维度一致性
└─ 失败 → return false

检查6: validatePhysicalConstraints()
├─ 目的：加速度平滑性（防止突跳）
├─ 计算：二阶差分 = |(flow[i+1]-flow[i]) - (flow[i]-flow[i-1])|
├─ 检查：加速度变化系数 < 3.0 (严格模式: < 2.0)
└─ 失败 → return false

严格模式额外检查:
  if (opticalFlow < minOpticalFlowThreshold × 1.5)
    → return false

✅ 全部通过 → return true (活体)
```

### 7.2 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `minMotionThreshold` | 0.15 | 最小运动评分 |
| `minKeypointVariance` | 0.02 | 最小关键点变化 |
| `minOpticalFlowThreshold` | 0.08 | 最小光流（0-1） |
| `motionConsistencyThreshold` | 0.5 | 运动一致性下限 |
| `frameBufferSize` | 5 | 帧历史窗口 |
| `eyeAspectRatioThreshold` | 0.15 | 眼睛运动触发值 |
| `strictPhotoDetection` | false | 严格模式开关 |

---

## 8. 物理约束验证

**原理**：真实面部运动的加速度应该平滑连贯，而照片微动会产生突跳

**算法**：
```typescript
// 1. 收集光流历史（至少3帧）
opticalFlowHistory: [0.05, 0.12, 0.10, 0.15, 0.08]

// 2. 计算加速度（二阶差分）
accel[0] = |(0.10 - 0.12) - (0.12 - 0.05)| = 0.05
accel[1] = |(0.15 - 0.10) - (0.10 - 0.12)| = 0.07
accel[2] = |(0.08 - 0.15) - (0.15 - 0.10)| = 0.12

// 3. 计算加速度的方差
variance(accel) = std([0.05, 0.07, 0.12])

// 4. 计算比值
accelRatio = variance / (mean + 0.01)

// 5. 判断
if (accelRatio < 3.0)  ✅ 合理
else                   ❌ 不自然（可能是微动）
```

**参数**：
- **标准模式**：maxAccelRatio = 3.0
- **严格模式**：maxAccelRatio = 2.0

---

## 9. 输出结果

### 9.1 MotionDetectionResult

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

### 9.2 诊断消息

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

## 10. 性能特性

### 10.1 计算复杂度

| 操作 | 复杂度 | 说明 |
|------|--------|------|
| 光流计算 | O(W×H) | 高，仅在相邻帧 |
| 关键点距离 | O(468×F) | 中，468个点×帧数 |
| 方差计算 | O(N) | 低，简单统计 |
| 总体分析 | ~O(W×H) | 光流为瓶颈 |

### 10.2 内存占用

```
frameBuffer:            ~1-2 MB (5个灰度图，480p)
keypointHistory:        ~50 KB  (468点×5帧)
其他历史记录:          ~10 KB
total:                 ~2 MB (典型配置)
```

### 10.3 时序要求

```
帧处理延迟:  ~50-100ms (取决于光流计算)
活体判断准备: 5-10帧 (~170-330ms @30fps)
完整判断时间: 需要足够帧积累
```

---

## 11. 使用示例

```typescript
// 初始化
const detector = new MotionLivenessDetector({
  minMotionThreshold: 0.15,
  minKeypointVariance: 0.02,
  frameBufferSize: 5,
  eyeAspectRatioThreshold: 0.15,
  strictPhotoDetection: false  // 标准模式
})

// 设置OpenCV实例
detector.setCVInstance(cv)

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

## 12. 局限性与改进方向

### 12.1 当前局限

- ❌ 不检测视频重放（有屏幕检测模块单独处理）
- ❌ 光流计算CPU密集
- ❌ 瞳孔反应检测简化
- ❌ 不考虑光照变化
- ❌ 不考虑背景运动影响

### 12.2 改进方向

- ✨ 集成深度信息（3D活体检测）
- ✨ 融合RGB-D多模态
- ✨ 皮肤纹理分析
- ✨ 心跳/脉搏检测
- ✨ 自适应阈值学习

---

## 13. 总结

该算法通过**多维度运动分析**和**多重检查**的组合，实现对照片攻击的有效防护：

| 维度 | 防护强度 |
|------|---------|
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
