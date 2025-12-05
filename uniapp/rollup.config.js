import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'

/**
 * UniApp SDK Rollup Configuration
 * 
 * Produces two bundle formats:
 * 1. UMD - Complete self-contained bundle for traditional script loading
 * 2. ESM - Modern ES6 modules with external dependencies (requires opencv patch)
 * 
 * Includes:
 * - Core face detection library
 * - @vladmandic/human (face detection engine)
 * - @techstark/opencv-js (image processing)
 * 
 * Note: AI models and WASM files are copied separately by uniapp/build.cjs
 * using copy-models.cjs and download-wasm.cjs scripts
 */

const isProduction = process.env.NODE_ENV === 'production'

export default [
  // UniApp UMD Bundle - Complete self-contained SDK
  {
    input: 'src/index.ts',
    output: {
      file: 'dist-uniapp/build/face-detection-sdk.js',
      format: 'umd',
      name: 'FaceLivenessDetector',
      sourcemap: !isProduction,
      exports: 'named',
      globals: {}
    },
    // Bundle everything: human, opencv
    // Models and WASM are handled separately by build.cjs
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
        tsconfig: './uniapp/tsconfig.json',
        declaration: true,
        declarationDir: './dist-uniapp/build/types',
        declarationMap: true
      }),
      // Minify in production
      isProduction && terser()
    ].filter(Boolean)
  }
]
