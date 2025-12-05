module.exports = {
  transpileDependencies: ['xuydap-facedetection'],
  // 优化编译配置
  parallel: false, // 禁用并行编译以减少内存使用
  productionSourceMap: false, // 关闭生产环境的 source map
  configureWebpack: {
    optimization: {
      minimize: true,
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          faceDetectionSDK: {
            name: 'face-detection-sdk',
            test: /[\\/]uni_modules[\\/]xuydap-facedetection[\\/]/,
            priority: 10,
            reuseExistingChunk: true
          }
        }
      }
    }
  },
  chainWebpack: config => {
    // 针对大型 JS 文件优化
    config.module
      .rule('js')
      .exclude.add(/uni_modules[\\/]xuydap-facedetection[\\/]js_sdk[\\/]face-detection-sdk\.js/)
      .end();
  }
}
