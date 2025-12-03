import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import copy from 'rollup-plugin-copy'
import terser from '@rollup/plugin-terser'

/**
 * UniApp SDK Rollup Configuration
 * 
 * Produces a complete, self-contained UMD bundle that includes:
 * - Core face detection library
 * - @vladmandic/human (face detection engine)
 * - @techstark/opencv-js (image processing)
 * - All AI models references (copied separately)
 * - All WASM files (copied separately)
 * 
 * UniApp plugins expect UMD format only - ESM is not used in plugin distribution.
 * Both bundles are patched after build to fix opencv.js UMD issue.
 */

const isProduction = process.env.NODE_ENV === 'production'

export default [
  // UniApp UMD Bundle - Complete self-contained SDK
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/uniapp/face-detection-sdk.js',
      format: 'umd',
      name: 'FaceLivenessDetector',
      sourcemap: !isProduction,
      exports: 'named',
      globals: {}
    },
    // Bundle everything: human, opencv, models, wasm
    // Users get a completely self-contained module requiring zero external dependencies
    external: [],
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false,
        extensions: ['.mjs', '.js', '.json', '.node']
      }),
      commonjs({
        include: 'node_modules/**'
      }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist/uniapp/types',
        declarationMap: true
      }),
      // Copy model files to dist
      copy({
        targets: [
          { src: 'demos/vue-demo/public/models/*', dest: 'dist/uniapp/models' },
          { src: 'demos/vue-demo/public/wasm/*', dest: 'dist/uniapp/wasm' }
        ]
      }),
      // Minify in production
      isProduction && terser()
    ].filter(Boolean)
  }
]
