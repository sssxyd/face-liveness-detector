import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'

/**
 * UniApp SDK Rollup Configuration
 * 
 * Produces a complete, self-contained UMD bundle that includes:
 * - Core face detection library
 * - @vladmandic/human (face detection engine)
 * - @techstark/opencv-js (image processing)
 * 
 * Note: AI models and WASM files are copied separately by uniapp/build.cjs
 * using copy-models.cjs and download-wasm.cjs scripts
 * 
 * UniApp plugins expect UMD format only - ESM is not used in plugin distribution.
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
