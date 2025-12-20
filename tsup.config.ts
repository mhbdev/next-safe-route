import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts', 'src/valibot.ts', 'src/yup.ts'],
  dts: true,
  sourcemap: true,
  format: ['cjs', 'esm'],
  minify: !options.watch,
  external: ['valibot', 'yup', '@sinclair/typebox'],
}));
