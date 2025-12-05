<template>
	<view class="page">
		<!-- Header -->
		<view class="header">
			<text class="title">插件演示</text>
			<text class="subtitle">Demo Application</text>
		</view>

		<!-- Demo List -->
		<view class="demo-list">
			<!-- Face Detection Demo -->
			<view class="demo-card">
				<view class="demo-icon">👁️</view>
				<text class="demo-title">人脸活体检测</text>
				<text class="demo-description">Face Liveness Detection Demo</text>
				<text class="demo-detail">完整的人脸检测、活体验证和动作识别功能</text>
				<button 
					@click="navigateToFaceDetection"
					class="demo-button"
				>
					进入演示 Enter Demo →
				</button>
			</view>
		</view>

		<!-- Footer -->
		<view class="footer">
			<text class="footer-text">Powered by xuydap-facedetection</text>
		</view>
	</view>
</template>

<script>
export default {
	data() {
		return {
		}
	},
	
	onLoad() {
		console.log('Main page loaded')
	},
	
	methods: {
		navigateToFaceDetection() {
			uni.navigateTo({
				url: '/pages/face-detection/index'
			})
		}
	}
}
</script>

<style>
.page {
	height: 100%;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	padding: 20px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

/* Header */
.header {
	text-align: center;
	margin-bottom: 40px;
}

.title {
	font-size: 36px;
	font-weight: 700;
	color: #ffffff;
	margin-bottom: 12px;
	text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
}

.subtitle {
	font-size: 18px;
	color: rgba(255, 255, 255, 0.9);
	font-weight: 400;
	letter-spacing: 1px;
}

/* Demo List */
.demo-list {
	width: 100%;
	max-width: 500px;
	display: flex;
	flex-direction: column;
}

/* Demo Card */
.demo-card {
	background-color: #ffffff;
	border-radius: 16px;
	padding: 30px;
	box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	margin-bottom: 20px;
}

.demo-card:active {
	transform: translateY(-4px);
	box-shadow: 0 15px 50px rgba(0, 0, 0, 0.25);
}

.demo-icon {
	font-size: 48px;
	text-align: center;
	margin-bottom: 16px;
}

.demo-title {
	font-size: 24px;
	font-weight: 700;
	color: #2c3e50;
	margin-bottom: 8px;
	text-align: center;
}

.demo-description {
	font-size: 14px;
	color: #7f8c8d;
	text-align: center;
	margin-bottom: 12px;
}

.demo-detail {
	font-size: 13px;
	color: #95a5a6;
	text-align: center;
	margin-bottom: 20px;
	line-height: 1.5;
}

.demo-button {
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: #ffffff;
	padding: 14px 24px;
	border-radius: 8px;
	font-size: 16px;
	font-weight: 700;
	border: none;
	width: 100%;
	transition: all 0.3s ease;
	box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.demo-button:active {
	opacity: 0.9;
	transform: scale(0.98);
}

/* Footer */
.footer {
	margin-top: 60px;
	text-align: center;
}

.footer-text {
	font-size: 13px;
	color: rgba(255, 255, 255, 0.7);
	font-weight: 400;
	letter-spacing: 0.5px;
}
</style>
