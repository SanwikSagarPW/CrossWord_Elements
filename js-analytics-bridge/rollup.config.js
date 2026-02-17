import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default [
  // ES Module
  {
    input: 'src/index.js',
    output: {
      file: 'dist/analytics-bridge.esm.js',
      format: 'es'
    },
    plugins: [resolve()]
  },
  // UMD
  {
    input: 'src/index.js',
    output: {
      file: 'dist/analytics-bridge.js',
      format: 'umd',
      name: 'AnalyticsManager',
      exports: 'default'
    },
    plugins: [resolve()]
  },
  // UMD Minified
  {
    input: 'src/index.js',
    output: {
      file: 'dist/analytics-bridge.min.js',
      format: 'umd',
      name: 'AnalyticsManager',
      exports: 'default'
    },
    plugins: [resolve(), terser()]
  }
];
