import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
  external: ['playwright-core'],
  banner: { js: '#!/usr/bin/env node' },
});
