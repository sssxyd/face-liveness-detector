<template>
	<scroll-view class="page">
		<view class="face-liveness-demo">
			<!-- Header -->
			<view class="header">
				<text class="title">人脸活体检测演示</text>
				<text class="subtitle">Face Liveness Detection Demo</text>
				<text class="powered-by">Powered by xuydap-facedetection</text>
			</view>

			<!-- Configuration Panel -->
			<view class="config-panel">
				<text class="section-title">检测配置 Detection Configuration</text>
				
				<view class="config-item">
					<text class="config-label">动作检测次数 (0-3):</text>
					<view class="slider-container">
						<slider 
							:value="actionCount" 
							@change="onActionCountChange"
							:min="0" 
							:max="3" 
							:step="1"
							:disabled="isDetecting"
							activeColor="#42b983"
							backgroundColor="#e0e0e0"
							block-size="20"
						/>
						<text class="slider-value">{{ actionCount }} - {{ getActionCountLabel(actionCount) }}</text>
					</view>
				</view>

				<view class="config-item">
					<text class="config-label">最小图像质量:</text>
					<view class="slider-container">
						<slider 
							:value="minImageQuality * 100" 
							@change="onImageQualityChange"
							:min="30" 
							:max="100" 
							:step="10"
							:disabled="isDetecting"
							activeColor="#42b983"
							backgroundColor="#e0e0e0"
							block-size="20"
						/>
						<text class="slider-value">{{ (minImageQuality * 100).toFixed(0) }}%</text>
					</view>
				</view>
			</view>

			<!-- Control Panel -->
			<view class="control-panel">
				<button 
					v-if="!isDetecting"
					@click="startDetection"
					:disabled="!isEngineReady"
					class="btn-primary"
					:class="{ 'btn-disabled': !isEngineReady }"
				>
					{{ isEngineReady ? '开始检测 Start Detection' : '初始化中 Initializing...' }}
				</button>
				<button 
					v-else
					@click="stopDetection"
					class="btn-danger"
				>
					停止检测 Stop Detection
				</button>
			</view>

			<!-- Video Display Area -->
			<view :class="['video-container', `border-${borderColor}`]">
				<video
					id="faceVideo"
					ref="videoElement"
					class="video-element"
					:style="{ transform: videoMirror ? 'scaleX(-1)' : 'scaleX(1)' }"
					autoplay
					playsinline
					muted
				></video>
				
				<!-- Action Prompt Overlay -->
				<view v-if="isDetecting && currentAction" class="status-overlay">
					<view class="action-prompt">
						<text class="action-icon">{{ getActionIcon(currentAction) }}</text>
						<text class="action-text">{{ getActionText(currentAction) }}</text>
					</view>
				</view>
			</view>

			<!-- Messages Display -->
			<view v-if="isDetecting" class="messages-container">
				<!-- Action Message -->
				<view v-if="actionMessage" class="action-message-panel">
					<text class="action-message">{{ actionMessage }}</text>
				</view>
				
				<!-- Status Message -->
				<view class="status-message-panel">
					<text class="status-message">{{ statusMessage }}</text>
				</view>
			</view>

			<!-- Detection Info Panel -->
			<view v-if="isDetecting" class="info-panel">
				<text class="section-title">检测信息 Detection Information</text>
				<view class="info-grid">
					<view class="info-item">
						<text class="label">静默采集:</text>
						<text class="value">{{ silentPassedCount }} / {{ configSilentCount }}</text>
					</view>
					<view class="info-item">
						<text class="label">动作完成:</text>
						<text class="value">{{ actionPassedCount }} / {{ actionCount }}</text>
					</view>
					<view class="info-item">
						<text class="label">检测通过:</text>
						<text class="value">{{ faceInfo.passed ? '是 Yes' : '否 No' }}</text>
					</view>
					<view class="info-item">
						<text class="label">人脸大小:</text>
						<text class="value">{{ (faceInfo.size * 100).toFixed(1) }}%</text>
					</view>
					<view class="info-item">
						<text class="label">正面度:</text>
						<text class="value">{{ (faceInfo.frontal * 100).toFixed(1) }}%</text>
					</view>
					<view class="info-item">
						<text class="label">图像质量:</text>
						<text class="value">{{ (faceInfo.quality * 100).toFixed(1) }}%</text>
					</view>
					<view class="info-item">
						<text class="label">真实度:</text>
						<text class="value">{{ (faceInfo.real * 100).toFixed(1) }}%</text>
					</view>
					<view class="info-item">
						<text class="label">活体度:</text>
						<text class="value">{{ (faceInfo.live * 100).toFixed(1) }}%</text>
					</view>
				</view>
			</view>

			<!-- Result Display -->
			<view v-if="detectionResult" class="result-panel">
				<text class="result-title">{{ detectionResult.success ? '✅ 检测成功 Success' : '❌ 检测失败 Failed' }}</text>
				<view class="result-info">
					<view class="result-item">
						<text class="label">静默检测通过:</text>
						<text class="value">{{ detectionResult.silentPassedCount }} 次</text>
					</view>
					<view class="result-item">
						<text class="label">动作检测通过:</text>
						<text class="value">{{ detectionResult.actionPassedCount }} 个</text>
					</view>
					<view class="result-item">
						<text class="label">图像质量:</text>
						<text class="value">{{ (detectionResult.bestQualityScore * 100).toFixed(1) }}%</text>
					</view>
					<view class="result-item">
						<text class="label">总耗时:</text>
						<text class="value">{{ (detectionResult.totalTime / 1000).toFixed(2) }}s</text>
					</view>
				</view>
				
				<!-- Result Images -->
				<view class="result-images">
					<view v-if="detectionResult.bestFrameImage" class="image-box">
						<text class="image-title">最佳帧图像</text>
						<image :src="detectionResult.bestFrameImage" class="result-image" mode="aspectFit"></image>
					</view>
					<view v-if="detectionResult.bestFaceImage" class="image-box">
						<text class="image-title">人脸图像</text>
						<image :src="detectionResult.bestFaceImage" class="result-image" mode="aspectFit"></image>
					</view>
				</view>
				
				<button @click="resetDetection" class="btn-primary">再次检测 Detect Again</button>
			</view>

			<!-- Error Alert -->
			<view v-if="errorMessage" class="error-panel">
				<text class="error-text">❌ {{ errorMessage }}</text>
				<button @click="resetDetection" class="btn-primary">重试 Retry</button>
			</view>

			<!-- Debug Info Toggle -->
			<view v-if="debugLogs.length > 0 && !showDebugPanel" class="debug-toggle">
				<button @click="showDebugPanel = true" class="btn-debug">
					显示调试信息 ({{ debugLogs.length }})
				</button>
			</view>

			<!-- Debug Panel -->
			<view v-if="showDebugPanel" class="debug-panel">
				<view class="debug-header">
					<text class="debug-title">调试信息 Debug Logs</text>
					<button @click="showDebugPanel = false" class="btn-close">关闭</button>
				</view>
				<scroll-view class="debug-content" scroll-y>
					<view v-for="(log, index) in debugLogs" :key="index" :class="['log-item', `log-${log.level}`]">
						<view class="log-header">
							<text class="log-time">{{ log.timestamp }}</text>
							<text class="log-stage">{{ log.stage }}</text>
						</view>
						<text class="log-message">{{ log.message }}</text>
						<text v-if="log.details" class="log-details">{{ JSON.stringify(log.details) }}</text>
					</view>
				</scroll-view>
			</view>

			<!-- Back Button -->
			<view class="back-button-container">
				<button @click="goBack" class="btn-back">返回 Back</button>
			</view>
		</view>
	</scroll-view>
</template>

<script>
export default {
	data() {
		return {
			// Declare at module level
			UniAppFaceDetectionEngine: null,
			LivenessAction: null,
			DetectionCode: null,
			// Configuration
			actionCount: 1,
			minImageQuality: 0.5,
			configSilentCount: 3,
			videoMirror: true,
			
			// Engine
			engine: null,
			
			// State
			isEngineReady: false,
			isDetecting: false,
			statusMessage: '等待开始检测...',
			actionMessage: '',
			errorMessage: '',
			borderColor: 'idle',
			
			// Current action
			currentAction: null,
			
			// Detection info
			silentPassedCount: 0,
			actionPassedCount: 0,
			faceInfo: {
				passed: false,
				size: 0,
				frontal: 0,
				quality: 0,
				real: 0,
				live: 0
			},
			
			// Detection result
			detectionResult: null,
			
			// Debug logs
			debugLogs: [],
			showDebugPanel: false,
			maxDebugLogs: 100,
			
			// Video element reference
			videoElement: null
		}
	},
	
	onLoad() {
		this.loadSDK().then(() => {
			this.initEngine()
		})
	},
	
	onUnload() {
		if (this.engine) {
			this.engine.stopDetection(false)
		}
	},
	
	methods: {
		async loadSDK() {
			return new Promise((resolve, reject) => {
				if (window.FaceLivenessDetector) {
					this.UniAppFaceDetectionEngine = window.FaceLivenessDetector.UniAppFaceDetectionEngine
					this.LivenessAction = window.FaceLivenessDetector.LivenessAction
					this.DetectionCode = window.FaceLivenessDetector.DetectionCode
					resolve()
					return
				}
				
				// Dynamically load the SDK script
				const script = document.createElement('script')
				script.src = '/uni_modules/xuydap-facedetection/js_sdk/face-detection-sdk.js'
				script.onload = () => {
					if (window.FaceLivenessDetector) {
						this.UniAppFaceDetectionEngine = window.FaceLivenessDetector.UniAppFaceDetectionEngine
						this.LivenessAction = window.FaceLivenessDetector.LivenessAction
						this.DetectionCode = window.FaceLivenessDetector.DetectionCode
						resolve()
					} else {
						reject(new Error('SDK loaded but global not found'))
					}
				}
				script.onerror = () => reject(new Error('Failed to load SDK'))
				document.head.appendChild(script)
			})
		},
		async initEngine() {
			try {
				// Create engine instance with configuration
				this.engine = new this.UniAppFaceDetectionEngine({
					video_width: 640,
					video_height: 640,
					video_mirror: this.videoMirror,
					min_image_quality: this.minImageQuality,
					min_face_frontal: 0.9,
					liveness_action_count: this.actionCount,
					liveness_action_list: [
						this.LivenessAction.BLINK, 
						this.LivenessAction.MOUTH_OPEN, 
						this.LivenessAction.NOD
					],
					silent_detect_count: this.configSilentCount,
					min_real_score: 0.5,
					min_live_score: 0.5
				})
				
				// Listen to events
				this.engine.on('detector-loaded', this.handleEngineReady)
				this.engine.on('detector-info', this.handleDetectorInfo)
				this.engine.on('detector-action', this.handleDetectorAction)
				this.engine.on('detector-finish', this.handleDetectionFinish)
				this.engine.on('detector-error', this.handleDetectionError)
				this.engine.on('detector-debug', this.handleDebugLog)
				
				// Initialize
				await this.engine.initialize()
			} catch (error) {
				console.error('Engine initialization failed:', error)
				this.errorMessage = `引擎初始化失败: ${error.message}`
			}
		},
		
		// Event handlers
		handleEngineReady(data) {
			this.isEngineReady = data.success
			if (!data.success) {
				this.errorMessage = '引擎加载失败: ' + (data.error || 'Unknown error')
				console.error('❌ Engine loading failed')
				return
			}
			this.statusMessage = `引擎就绪 Engine Ready - OpenCV: ${data.opencv_version}, Human: ${data.human_version}`
			console.log('✅ Engine is ready')
		},
		
		handleDetectorInfo(data) {
			if (data.passed) {
				this.silentPassedCount++
			}
			
			switch(data.code) {
				case this.DetectionCode.FACE_CHECK_PASS:
					this.borderColor = 'yes'
					this.statusMessage = '人脸检测成功'
					break
				case this.DetectionCode.VIDEO_NO_FACE:
				case this.DetectionCode.MULTIPLE_FACE:
					this.borderColor = 'failed'
					this.statusMessage = this.getPromptMessage(data.code)
					break
				default:
					this.borderColor = 'warn'
					this.statusMessage = this.getPromptMessage(data.code)
					break
			}
			
			this.faceInfo = {
				passed: data.passed,
				size: data.size,
				frontal: data.frontal,
				quality: data.quality,
				real: data.real,
				live: data.live
			}
		},
		
		handleDetectorAction(data) {
			if (data.status === 'started') {
				this.currentAction = data.action
				this.actionMessage = `请执行动作: ${this.getActionText(data.action)}`
			} else if (data.status === 'completed') {
				this.actionPassedCount++
				this.currentAction = null
				this.actionMessage = '动作识别成功！'
			} else if (data.status === 'timeout') {
				this.actionMessage = '动作识别超时'
			}
		},
		
		handleDetectionFinish(data) {
			this.isDetecting = false
			this.detectionResult = data
			this.currentAction = null
			
			if (data.success) {
				this.statusMessage = '检测完成！Detection completed successfully!'
				this.borderColor = 'success'
			} else {
				this.statusMessage = '检测失败 Detection failed'
				this.borderColor = 'failed'
			}
		},
		
		handleDetectionError(error) {
			this.isDetecting = false
			this.errorMessage = `${error.code}: ${error.message}`
			console.error('Detection error:', error)
		},
		
		handleDebugLog(debug) {
			const timestamp = new Date().toLocaleTimeString()
			this.debugLogs.push({
				timestamp,
				stage: debug.stage,
				level: debug.level || 'info',
				message: debug.message,
				details: debug.details
			})
			
			// Limit log quantity
			if (this.debugLogs.length > this.maxDebugLogs) {
				this.debugLogs.shift()
			}
		},
		
		// Operations
		async startDetection() {
			if (!this.engine || !this.$refs.videoElement) {
				return
			}
			
			try {
				// Reset state
				this.silentPassedCount = 0
				this.actionPassedCount = 0
				this.currentAction = null
				this.detectionResult = null
				this.errorMessage = ''
				this.faceInfo = { 
					passed: false, 
					size: 0, 
					frontal: 0, 
					quality: 0, 
					real: 0, 
					live: 0 
				}
				
				// Update configuration
				this.engine.updateConfig({
					min_image_quality: this.minImageQuality,
					liveness_action_count: this.actionCount
				})
				
				// Start detection
				this.isDetecting = true
				this.statusMessage = '正在检测人脸...'
				
				await this.engine.startDetection(this.$refs.videoElement)
			} catch (error) {
				console.error('Failed to start detection:', error)
				this.errorMessage = `启动检测失败: ${error.message}`
			}
		},
		
		stopDetection() {
			if (this.engine) {
				this.engine.stopDetection(false)
				this.isDetecting = false
				this.currentAction = null
				this.statusMessage = '检测已停止'
				this.actionMessage = ''
				this.borderColor = 'idle'
			}
		},
		
		resetDetection() {
			this.detectionResult = null
			this.errorMessage = ''
			this.silentPassedCount = 0
			this.actionPassedCount = 0
			this.faceInfo = { 
				passed: false, 
				size: 0, 
				frontal: 0, 
				quality: 0, 
				real: 0, 
				live: 0 
			}
			this.statusMessage = '等待开始检测...'
			this.actionMessage = ''
			this.borderColor = 'idle'
		},
		
		goBack() {
			this.$router.back()
		},
		
		// Config change handlers
		onActionCountChange(e) {
			this.actionCount = e.detail.value
		},
		
		onImageQualityChange(e) {
			this.minImageQuality = e.detail.value / 100
		},
		
		// Helper functions
		getPromptMessage(code) {
			const messages = {
				[this.DetectionCode.VIDEO_NO_FACE]: '未检测到人脸，请面向摄像头',
				[this.DetectionCode.MULTIPLE_FACE]: '检测到多张人脸，请确保只有一人',
				[this.DetectionCode.FACE_TOO_SMALL]: '人脸太小，请靠近摄像头',
				[this.DetectionCode.FACE_TOO_LARGE]: '人脸太大，请远离摄像头',
				[this.DetectionCode.FACE_NOT_FRONTAL]: '请正面面向摄像头',
				[this.DetectionCode.FACE_LOW_QUALITY]: '图像质量太低，请改善光线或摄像头焦距',
				[this.DetectionCode.FACE_CHECK_PASS]: '人脸检测成功'
			}
			return messages[code] || '检测中...'
		},
		
		getActionText(action) {
			const texts = {
				[this.LivenessAction.BLINK]: '请眨眼 Blink',
				[this.LivenessAction.MOUTH_OPEN]: '请张嘴 Open Mouth',
				[this.LivenessAction.NOD]: '请点头 Nod'
			}
			return texts[action] || action
		},
		
		getActionIcon(action) {
			const icons = {
				[this.LivenessAction.BLINK]: '👁️',
				[this.LivenessAction.MOUTH_OPEN]: '👄',
				[this.LivenessAction.NOD]: '👆'
			}
			return icons[action] || '🔄'
		},
		
		getActionCountLabel(count) {
			const labels = {
				0: '仅静默检测',
				1: '随机1个动作',
				2: '随机2个动作',
				3: '随机3个动作'
			}
			return labels[count] || '未知'
		}
	}
}
</script>

<style scoped>
.page {
	height: 100vh;
	background-color: #f5f5f5;
}

.face-liveness-demo {
	max-width: 1200px;
	margin: 0 auto;
	padding: 20px;
}

/* Header */
.header {
	text-align: center;
	margin-bottom: 30px;
}

.title {
	font-size: 28px;
	font-weight: bold;
	color: #2c3e50;
	margin-bottom: 10px;
	display: block;
}

.subtitle {
	font-size: 16px;
	color: #7f8c8d;
	margin-bottom: 5px;
	display: block;
}

.powered-by {
	font-size: 14px;
	color: #3498db;
	display: block;
}

/* Configuration Panel */
.config-panel {
	background-color: #f8f9fa;
	padding: 20px;
	border-radius: 8px;
	margin-bottom: 20px;
}

.section-title {
	font-size: 18px;
	font-weight: 600;
	color: #2c3e50;
	margin-bottom: 15px;
	display: block;
}

.config-item {
	margin-bottom: 20px;
}

.config-label {
	font-size: 14px;
	color: #555;
	margin-bottom: 8px;
	display: block;
}

.slider-container {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.slider-value {
	font-size: 14px;
	color: #42b983;
	font-weight: 600;
}

/* Control Panel */
.control-panel {
	margin-bottom: 20px;
	text-align: center;
	gap: 10px;
}

.btn-primary {
	background-color: #42b983;
	color: #ffffff;
	padding: 12px 32px;
	border-radius: 6px;
	font-size: 16px;
	font-weight: 600;
	border: none;
}

.btn-danger {
	background-color: #e74c3c;
	color: #ffffff;
	padding: 12px 32px;
	border-radius: 6px;
	font-size: 16px;
	font-weight: 600;
	border: none;
}

.btn-disabled {
	background-color: #95a5a6;
	opacity: 0.6;
}

/* Video Container */
.video-container {
	position: relative;
	width: 100%;
	max-width: 640px;
	height: 480px;
	margin: 0 auto 20px;
	border-radius: 16px;
	overflow: hidden;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	border: 8px solid #95a5a6;
	transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.border-idle {
	border-color: #95a5a6;
}

.border-warn {
	border-color: #f39c12;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 20px rgba(243, 156, 18, 0.5);
}

.border-yes {
	border-color: #3498db;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 20px rgba(52, 152, 219, 0.5);
}

.border-success {
	border-color: #2ecc71;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 20px rgba(46, 204, 113, 0.8);
}

.border-failed {
	border-color: #e74c3c;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 20px rgba(231, 76, 60, 0.8);
}

.video-element {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.status-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: transparent;
	display: flex;
	align-items: center;
	justify-content: center;
}

.action-prompt {
	background: rgba(66, 185, 131, 0.95);
	padding: 30px 50px;
	border-radius: 12px;
	text-align: center;
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.action-icon {
	font-size: 48px;
	display: block;
	margin-bottom: 10px;
}

.action-text {
	font-size: 20px;
	font-weight: bold;
	color: #ffffff;
	display: block;
}

/* Messages Container */
.messages-container {
	width: 100%;
	max-width: 640px;
	margin: 0 auto 20px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.action-message-panel,
.status-message-panel {
	text-align: center;
}

.action-message {
	font-size: 16px;
	font-weight: 600;
	color: #ffffff;
	padding: 12px 20px;
	background: rgba(66, 185, 131, 0.95);
	border-radius: 6px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	display: inline-block;
}

.status-message {
	font-size: 16px;
	font-weight: 600;
	color: #2c3e50;
	padding: 12px 20px;
	background: #f8f9fa;
	border-radius: 6px;
	border-left: 4px solid #42b983;
	display: inline-block;
}

/* Info Panel */
.info-panel {
	background-color: #f8f9fa;
	padding: 20px;
	border-radius: 8px;
	margin-bottom: 20px;
}

.info-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 15px;
}

.info-item {
	display: flex;
	justify-content: space-between;
	padding: 10px;
	background-color: #ffffff;
	border-radius: 6px;
	border-left: 3px solid #42b983;
}

.label {
	font-weight: 500;
	color: #555;
	font-size: 13px;
}

.value {
	font-weight: 700;
	color: #2c3e50;
	font-size: 13px;
}

/* Result Panel */
.result-panel {
	background-color: #f8f9fa;
	padding: 25px;
	border-radius: 8px;
	margin-bottom: 20px;
	text-align: center;
}

.result-title {
	font-size: 24px;
	font-weight: bold;
	color: #2c3e50;
	margin-bottom: 20px;
	display: block;
}

.result-info {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 15px;
	margin-bottom: 20px;
}

.result-item {
	display: flex;
	justify-content: space-between;
	padding: 12px;
	background-color: #ffffff;
	border-radius: 6px;
}

.result-images {
	display: flex;
	flex-direction: column;
	gap: 20px;
	margin: 20px 0;
}

.image-box {
	text-align: center;
}

.image-title {
	font-size: 16px;
	font-weight: 600;
	color: #2c3e50;
	margin-bottom: 10px;
	display: block;
}

.result-image {
	width: 100%;
	max-width: 300px;
	height: 300px;
	border-radius: 8px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Error Panel */
.error-panel {
	background-color: #fee;
	border: 2px solid #e74c3c;
	padding: 20px;
	border-radius: 8px;
	margin-bottom: 20px;
	text-align: center;
}

.error-text {
	color: #c0392b;
	font-weight: 600;
	margin-bottom: 15px;
	display: block;
}

/* Debug Panel */
.debug-toggle {
	margin-bottom: 20px;
	text-align: center;
}

.btn-debug {
	background-color: #3498db;
	color: #ffffff;
	padding: 10px 20px;
	border-radius: 6px;
	font-size: 14px;
	font-weight: 600;
	border: none;
}

.debug-panel {
	position: fixed;
	bottom: 80px;
	right: 20px;
	width: 500px;
	max-height: 400px;
	background-color: #ffffff;
	border-radius: 8px;
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
	z-index: 999;
}

.debug-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 15px;
	border-bottom: 1px solid #e0e0e0;
}

.debug-title {
	font-size: 16px;
	font-weight: 600;
	color: #2c3e50;
}

.btn-close {
	padding: 5px 12px;
	background-color: #e74c3c;
	color: #ffffff;
	border: none;
	border-radius: 4px;
	font-size: 12px;
}

.debug-content {
	max-height: 340px;
	padding: 10px;
	overflow-y: auto;
}

.log-item {
	margin-bottom: 10px;
	padding: 10px;
	border-radius: 6px;
	font-size: 12px;
	background-color: #f8f9fa;
}

.log-error {
	background-color: #fee;
}

.log-warn {
	background-color: #fffbf0;
}

.log-header {
	display: flex;
	justify-content: space-between;
	margin-bottom: 5px;
}

.log-time {
	color: #7f8c8d;
	font-size: 11px;
}

.log-stage {
	color: #3498db;
	font-size: 11px;
	font-weight: 600;
}

.log-message {
	color: #2c3e50;
	margin-bottom: 5px;
	display: block;
}

.log-details {
	color: #7f8c8d;
	font-size: 10px;
	font-family: monospace;
	white-space: pre-wrap;
	word-break: break-all;
	display: block;
}

/* Back Button */
.back-button-container {
	text-align: center;
	margin-top: 30px;
	margin-bottom: 20px;
}

.btn-back {
	background-color: #95a5a6;
	color: #ffffff;
	padding: 12px 32px;
	border-radius: 6px;
	font-size: 16px;
	font-weight: 600;
	border: none;
}
</style>
