/**
 * Build configuration. Besides React, it makes the PDF renderer's on-demand data
 * (character maps, fallback fonts, image decoders) available under /pdfjs/ so the
 * site never needs a third-party server to display a document.
 */
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

function pdfjsAssets(): Plugin {
  const source = resolve(__dirname, 'node_modules/pdfjs-dist');
  let outDir = 'dist';
  return {
    name: 'pdfjs-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const file = resolve(source, `.${decodeURIComponent((req.url ?? '').split('?')[0])}`);
        const allowed = ASSET_DIRS.some((dir) => file.startsWith(resolve(source, dir) + '/'));
        if (!allowed || !existsSync(file) || !statSync(file).isFile()) return next();
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      for (const dir of ASSET_DIRS) cpSync(resolve(source, dir), resolve(outDir, 'pdfjs', dir), { recursive: true });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), pdfjsAssets()],
  test: { include: ['tests/**/*.test.ts'] },
});
