import { defineConfig } from 'tsup';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
  async onSuccess() {
    // Copy compiled helper extension to dist/helper-extension/
    const srcOut = path.resolve('src/helper-extension/out');
    const srcPkg = path.resolve('src/helper-extension/package.json');

    if (!fs.existsSync(srcOut)) {
      console.error(
        'ERROR: src/helper-extension/out/ not found. Run "npm run build:extension" first.',
      );
      process.exit(1);
    }

    const dest = path.resolve('dist/helper-extension');
    await fs.promises.cp(srcOut, path.join(dest, 'out'), { recursive: true });
    await fs.promises.copyFile(srcPkg, path.join(dest, 'package.json'));
  },
});
