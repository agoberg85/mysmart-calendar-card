import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/mysmart-calendar-card.js',
  output: {
    file: 'mysmart-calendar-card.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    terser({ format: { comments: false } }),
  ],
};
