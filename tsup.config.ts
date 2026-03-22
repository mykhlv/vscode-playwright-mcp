import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
  external: ['playwright', '@playwright/mcp', '@modelcontextprotocol/sdk'],
  banner: { js: '#!/usr/bin/env node' },
});
