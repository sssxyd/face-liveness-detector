# 活体检测实现细节（Implementation Details）

## 目录

1. [代码结构](#代码结构)
2. [数据结构](#数据结构)
3. [核心方法说明](#核心方法说明)
4. [参数配置](#参数配置)
5. [调试和优化](#调试和优化)

---

## 代码结构

### 文件层次

```
motion-liveness-detector.ts
├── MotionDetectionResult (结果类)
├── MotionLivenessDetectorOptions (配置接口)
├── FaceKeypoints (关键点接口)
└── MotionLivenessDetector (主检测器类)
    ├── 初始化 & 重置
    ├── 公开 API
    │   └── analyzeMotion()
    ├── 正向检测
    │   ├── detectEyeFluctuation()
    │   ├── detectEyeSymmetry()
    │   ├── detectBlinkTiming()
    │   ├── detectMouthFluctuation()
    │   └── detectMuscleMovement()
    ├── 逆向检测
    │   ├── detectPhotoGeometry()
    │   ├── detectHomographyConstraint()
    │   ├── detectCrossRatioInvariance()
    │   ├── detectPerspectiveTransformPattern()
    │   ├── detectDepthConsistency()
    │   └── detectPhotoPlanarity()
    ├── 综合决策
    │   └── makeLivenessDecision()
    ├── 工具方法
    │   ├── normalizeLandmarks()
    │   ├── extractKeypoints()
    │   ├── estimateAffineTransform()
    │   └── 其他数学工具
    └── 调试
        └── getStatistics()
```

---

## 数据结构

### MotionDetectionResult

```typescript
class MotionDetectionResult {
  eyeActivityScore: number       // 0-1, 眼睛活动度
  mouthActivityScore: number     // 0-1, 嘴巴活动度
  muscleActivityScore: number    // 0-1, 肌肉活动度
  isLively: boolean              // 最终判决：是否活体
  
  details: {
    frameCount: number
    eyeAspectRatioStdDev: number
    mouthAspectRatioStdDev: number
    eyeFluctuation: number       // 眼睛开度波动幅度
    mouthFluctuation: number     // 嘴巴开度波动幅度
    muscleVariation: number      // 肌肉位置变化幅度
    hasEyeMovement: boolean
    hasMouthMovement: boolean
    hasMuscleMovement: boolean
  }
}
```

### 内部状态管理

```typescript
class MotionLivenessDetector {
  // 生物特征历史
  private eyeAspectRatioHistory: number[] = []     // EAR 历史
  private leftEyeEARHistory: number[] = []         // 左眼 EAR
  private rightEyeEARHistory: number[] = []        // 右眼 EAR
  private mouthAspectRatioHistory: number[] = []   // MAR 历史
  
  // 坐标历史
  private faceLandmarksHistory: any[][][] = []     // 原始坐标（用于 Z 分析）
  private normalizedLandmarksHistory: any[][][] = [] // 归一化坐标（用于几何检测）
  
  // 运动分析
  private frameTimestamps: number[] = []           // 帧时间戳
  private rigidMotionHistory: number[] = []        // 刚性运动得分
  
  // 逆向检测历史
  private homographyErrors: number[] = []          // 单应性误差
  private depthConsistencyScores: number[] = []    // 深度一致性
  private planarityScores: number[] = []           // 平面性得分
}
```

---

## 核心方法说明

### 1. 入口方法：analyzeMotion()

```typescript
public analyzeMotion(faceResult: FaceResult, faceBox: Box): MotionDetectionResult
```

**流程**：
1. 提取关键点 → `extractKeypoints()`
2. 保存原始坐标 → `faceLandmarksHistory`
3. 归一化坐标 → `normalizeLandmarks()`
4. 保存归一化坐标 → `normalizedLandmarksHistory`
5. 正向检测
   - 眼睛：`detectEyeFluctuation()`
   - 嘴巴：`detectMouthFluctuation()`
   - 肌肉：`detectMuscleMovement()`
6. 逆向检测 → `detectPhotoGeometry()`
7. 综合判定 → `makeLivenessDecision()`

**输入**：
- `faceResult`：MediaPipe 的人脸检测结果（包含 468 个 3D 关键点）
- `faceBox`：人脸边界框 `[x, y, width, height]`

**输出**：
- `MotionDetectionResult`：包含活动度分数和最终判决

**示例**：

```typescript
const detector = new MotionLivenessDetector();

// 处理每一帧
for (const frame of videoFrames) {
  const faceResult = getFaceResult(frame);  // 使用 @vladmandic/human
  const faceBox = faceResult.box;
  
  const result = detector.analyzeMotion(faceResult, faceBox);
  
  if (result.isLively) {
    console.log('✓ 活体');
  } else {
    console.log('✗ 欺骗 -', result.getMessage());
  }
}
```

### 2. 眼睛检测：detectEyeFluctuation()

**四层防护**：

#### 层1：EAR 波动检测
```
计算 EAR = (||P2-P6|| + ||P3-P5||) / (2×||P1-P4||)
维护 EAR 历史数组
检测 EAR 标准差 > eyeMinFluctuation
```

#### 层2：眼睛对称性检测
```
计算左眼 EAR 和右眼 EAR 的皮尔逊相关系数
真人：相关系数 > 0.7  (双眼同步)
照片：相关系数 ≈ 0    (无法同步)
```

#### 层3：眨眼时间检测
```
检测 EAR 快速下降和上升的周期
真人眨眼：100-400ms (从睁眼→闭眼→睁眼)
照片：无法产生任何眨眼
```

#### 层4：运动-形变相关性
```
计算刚性运动得分和 EAR 变化的相关系数
真人：低相关 (<0.3) - 头动和眨眼独立
照片：高相关 (>0.7) - 平移导致的"形变"
```

**返回值**：
```typescript
{
  score: number,           // 活动度 0-1
  stdDev: number,          // EAR 标准差
  fluctuation: number,     // EAR 波动幅度
  hasMovement: boolean     // 是否有眼睛运动
}
```

### 3. 肌肉检测：detectMuscleMovement()

**两步过程**：

1. **刚性运动检测**
   ```
   计算采样点的运动向量
   Δp_i = p_i(帧t) - p_i(帧t-1)
   ```

2. **刚性性评分**
   ```
   方向一致性 = 1 - 方向变异系数
   幅度一致性 = 1 - 幅度变异系数
   刚性得分 = 方向一致性 × 幅度一致性
   
   真人：< 0.5  (复杂运动)
   照片：> 0.8  (纯平移)
   ```

**注意**：
- 使用**归一化坐标**计算位移（消除人脸移动影响）
- 不直接拒绝高刚性运动（真人摇头也会有刚性分量）
- 结合眼睛/嘴巴特征作为综合判断

### 4. 单应性约束：detectHomographyConstraint()

**三步算法**：

#### 步骤1：选择基准点和检验点
```
基准点（4个）：额头(10)、下巴(152)、左脸颊(234)、右脸颊(454)
检验点（6个）：眼角(33,263)、嘴角(61,291)、鼻尖(1)、鼻梁(168)
```

#### 步骤2：拟合仿射变换
```
使用最小二乘法从 4 对基准点拟合变换：
[x']   [a b c]   [x]
[y'] = [d e f] × [y]
[1 ]   [0 0 1]   [1]
```

#### 步骤3：验证和评分
```
for each 检验点 p:
  预测位置 = 变换(p在帧1)
  实际位置 = p在帧2
  误差 = ||预测 - 实际||

相对误差 = 平均误差 / 人脸尺寸

平面得分 = max(0, 1 - 相对误差/0.05)
```

**解释**：
- 照片：所有点都在一个平面，单应性变换拟合很好 → 低误差 → 高得分
- 真人：点不共面，单应性变换拟合很差 → 高误差 → 低得分

### 5. 交叉比率检测：detectCrossRatioInvariance()

**五步算法**：

```
步骤1：选择中线上的共线点
      额头(10) → 鼻梁(168) → 鼻尖(1) → 嘴(0) → 下巴(152)

步骤2：对每帧计算交叉比率
      CR = (|AC| × |BD|) / (|BC| × |AD|)
      其中 A,B,C,D 是 y 坐标排序后的 4 个点

步骤3：计算交叉比率的变异系数
      cv = σ(CR) / μ(CR)

步骤4：判断不变性
      cv < 0.05  → 非常稳定（照片）
      cv > 0.15  → 变化明显（真人）

步骤5：计算得分
      不变性得分 = max(0, 1 - cv/0.1)
```

**物理意义**：
- 照片无论怎么倾转，共线点的相对位置关系（交叉比率）保持不变
- 真人头部转动时，各点不共面，交叉比率会变化

### 6. 坐标归一化：normalizeLandmarks()

```typescript
private normalizeLandmarks(landmarks: any[][], faceBox: Box): any[][]
```

**过程**：
```
对每个关键点 P = [x, y, z]:
  
  归一化的 x = (x - box.x) / box.width
  归一化的 y = (y - box.y) / box.height
  归一化的 z = z  (保持原值，相对于人脸中心)
  
  返回 [x_norm, y_norm, z]
```

**优势**：
- 消除人脸在画面中的位置影响
- 消除人脸走近/走远的尺寸影响
- 使所有几何约束检测都基于相对坐标

**例子**：
```
帧1：人脸在左边 (100,100)-(200,200)
     鼻尖绝对坐标 = (130, 130)
     鼻尖归一化坐标 = ((130-100)/100, (130-100)/100) = (0.3, 0.3)

帧2：人脸在右边 (400,100)-(500,200)
     鼻尖绝对坐标 = (430, 130)
     鼻尖归一化坐标 = ((430-400)/100, (130-100)/100) = (0.3, 0.3)

归一化后坐标一致！
```

### 7. 综合决策：makeLivenessDecision()

```typescript
private makeLivenessDecision(
  eyeActivity: any,
  mouthActivity: any,
  muscleActivity: any,
  photoGeometryResult: any
): boolean
```

**决策矩阵**：

| 正向得分 | 逆向得分 | 推荐 | 说明 |
|---------|---------|-----|------|
| > 0.3 | > 0.6 | 活体✓ | 双重确认 |
| > 0.3 | 0.4-0.6 | 活体✓ | 正向强+逆向中 |
| > 0.2 | > 0.5 | 活体✓ | 满足最低阈值 |
| < 0.2 | < 0.4 | 欺骗✗ | 双重低分 |
| 0.2-0.3 | 0.4-0.5 | 不确定 | 需要更多帧 |

**时间稳定性**：
```
维护最近 15 帧的决策结果
if 连续 8 帧以上判定为活体:
    返回 true (高置信度)
elif 50% 以上帧判定为活体:
    返回 true (中等置信度)
else:
    返回 false
```

---

## 参数配置

### 默认参数

```typescript
const DEFAULT_OPTIONS = {
  frameBufferSize: 15,            // 缓冲帧数 (0.5秒@30fps)
  eyeMinFluctuation: 0.008,       // 眼睛最小波动
  mouthMinFluctuation: 0.005,     // 嘴巴最小波动
  muscleMinVariation: 0.002,      // 肌肉最小变化
  activityThreshold: 0.2          // 活动度判定阈值
}
```

### 参数调整指南

#### 提高灵敏度（检出更多活体，降低误拒）

```typescript
detector.config = {
  frameBufferSize: 10,            // 更快的决策
  eyeMinFluctuation: 0.004,       // 更低的眼睛阈值
  mouthMinFluctuation: 0.002,     // 更低的嘴巴阈值
  muscleMinVariation: 0.0008,     // 更低的肌肉阈值
  activityThreshold: 0.15         // 更低的活动度要求
}
```

**场景**：直播、视频会议等宽松应用

#### 降低灵敏度（拒绝欺骗，降低虚假接受）

```typescript
detector.config = {
  frameBufferSize: 20,            // 更多帧确认
  eyeMinFluctuation: 0.015,       // 更高的眼睛阈值
  mouthMinFluctuation: 0.010,     // 更高的嘴巴阈值
  muscleMinVariation: 0.003,      // 更高的肌肉阈值
  activityThreshold: 0.3          // 更高的活动度要求
}
```

**场景**：支付、身份验证等严格应用

---

## 调试和优化

### 调试输出

代码中有大量 `console.debug()` 输出，显示详细的中间结果：

```javascript
[Eye]         // 眼睛检测
[Mouth]       // 嘴巴检测
[Muscle]      // 肌肉检测
[Rigid]       // 刚性运动
[PhotoGeometry] // 照片几何
[Homography]  // 单应性约束
[CrossRatio]  // 交叉比率
[Perspective] // 透视变换
[Depth]       // 深度分析
[Planarity]   // 平面性
[Decision]    // 最终决策
```

### 性能监测

```typescript
const stats = detector.getStatistics();
console.log('Frames buffered:', stats.eyeHistorySize);
console.log('Eye values:', stats.eyeValues);
console.log('Mouth values:', stats.mouthValues);
```

### 常见问题排查

#### 问题1：总是判定为欺骗

**可能原因**：
- 光线不足（< 200 lux）→ 检查环境光
- 人脸过小（占画面 < 30%）→ 靠近摄像头
- 保持完全静止 → 需要微妙的自然运动
- 阈值设置过高 → 降低参数

**解决**：
```typescript
detector.config.activityThreshold = 0.15;
detector.config.eyeMinFluctuation = 0.006;
```

#### 问题2：总是判定为活体（虚假接受）

**可能原因**：
- 照片放在摇摇棒上 → 需要增加几何检测权重
- 3D 面具 → 需要更多帧确认
- 高质量 AI 生成图像 → 增加逆向检测权重

**解决**：
```typescript
// 在 makeLivenessDecision 中增加逆向权重
finalScore = forwardScore * 0.4 + reverseScore * 0.6;
```

#### 问题3：延迟高

**可能原因**：
- frameBufferSize 过大 → 减少缓冲帧数
- 单应性拟合计算量大 → 优化算法

**解决**：
```typescript
detector.config.frameBufferSize = 10;  // 从 15 减到 10
```

### 性能优化建议

#### 1. 跳帧处理

```typescript
let frameCount = 0;
const PROCESS_EVERY_N_FRAMES = 2;  // 每 2 帧处理一次

if (frameCount % PROCESS_EVERY_N_FRAMES === 0) {
  result = detector.analyzeMotion(faceResult, faceBox);
}
frameCount++;
```

#### 2. 异步处理

```typescript
// 异步处理检测，避免阻塞 UI
const result = await asyncAnalyzeMotion(faceResult, faceBox);
```

#### 3. 关键帧采样

```typescript
// 只在关键帧（眨眼、张嘴）进行详细检测
if (isKeyFrame(currentEAR, prevEAR)) {
  result = detector.analyzeMotion(faceResult, faceBox);
}
```

### 单元测试

```typescript
// 测试已知的活体视频
const liveVideoFrames = loadTestVideo('live_person.mp4');
for (const frame of liveVideoFrames) {
  const result = detector.analyzeMotion(frame.face, frame.box);
  assert(result.isLively === true, 'Should detect as lively');
}

// 测试已知的欺骗（照片）
const spoofedFrames = loadTestVideo('photo_attack.mp4');
for (const frame of spoofedFrames) {
  const result = detector.analyzeMotion(frame.face, frame.box);
  assert(result.isLively === false, 'Should detect as spoofed');
}
```

---

## 扩展和改进

### 可能的增强方向

1. **屏幕攻击检测**
   ```typescript
   // 检测 Moiré 纹理和像素网格
   detectScreenReplayAttack(): number
   ```

2. **3D 面具检测**
   ```typescript
   // 检测多视图下的不一致
   detectMaskAttack(): number
   ```

3. **光线反射检测**
   ```typescript
   // 检测眼睛高光的真实性
   detectSpecularReflection(): number
   ```

4. **微表情检测**
   ```typescript
   // 检测难以伪造的微表情
   detectMicroExpressions(): number
   ```

5. **多模态融合**
   ```typescript
   // 融合音频（唇语同步）
   // 融合 IMU 传感器（头部运动）
   // 融合红外图像（活体热力特征）
   ```

---

## 参考实现

### 最小化示例

```typescript
import { MotionLivenessDetector } from './motion-liveness-detector';

// 初始化
const detector = new MotionLivenessDetector();

// 处理视频帧
function processVideoFrame(faceResult, faceBox) {
  const result = detector.analyzeMotion(faceResult, faceBox);
  
  return {
    isLive: result.isLively,
    confidence: (
      result.eyeActivityScore * 0.3 +
      result.mouthActivityScore * 0.2 +
      result.muscleActivityScore * 0.5
    ),
    details: result.details
  };
}

// 重置状态（新用户）
detector.reset();
```

### 完整集成示例

见同目录的 `INTEGRATION_GUIDE.md`

---

**更新于**：2026-01-16
