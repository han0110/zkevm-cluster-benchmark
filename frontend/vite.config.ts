import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Resolve the sibling benchmarks directory (../benchmarks) once at config load.
const benchmarksDir = fileURLToPath(new URL('../benchmarks', import.meta.url));

// Serve ../benchmarks/*.json read-only under the /benchmarks/ URL prefix during dev and preview.
// This keeps all project files inside ./frontend while reading data from ../benchmarks.
function serveBenchmarks(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = req.url ?? '';
    if (!url.startsWith('/benchmarks/')) return next();
    const rel = decodeURIComponent(url.slice('/benchmarks/'.length).split('?')[0]);
    const file = path.join(benchmarksDir, rel);
    if (!file.startsWith(benchmarksDir) || !file.endsWith('.json') || !fs.existsSync(file)) return next();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: 'serve-benchmarks',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// Copy ../benchmarks into dist/benchmarks at build time so a static host (GitHub Pages) can serve
// the data the dev middleware provides locally. Skips with a warning if the source is absent.
function copyBenchmarks(): Plugin {
  return {
    name: 'copy-benchmarks',
    apply: 'build',
    closeBundle() {
      const dest = fileURLToPath(new URL('./dist/benchmarks', import.meta.url));
      if (!fs.existsSync(benchmarksDir)) {
        this.warn(`benchmarks source missing at ${benchmarksDir}; dist will have no data`);
        return;
      }
      fs.cpSync(benchmarksDir, dest, {
        recursive: true,
        filter: src => fs.statSync(src).isDirectory() || src.endsWith('.json'),
      });
    },
  };
}

// Copy dist/index.html to dist/404.html so a static host without history-API rewrite, such as GitHub
// Pages, serves the SPA for a deep link instead of a not-found page, where the router then resolves it.
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    apply: 'build',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist', import.meta.url));
      const index = path.join(dist, 'index.html');
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, path.join(dist, '404.html'));
      }
    },
  };
}

export default defineConfig({
  // Absolute base, required for clean path routing where the router basename tracks this value. The
  // default serves the app at the domain root. A project deployed under a subpath sets this to that
  // subpath, for example /viewer/, and both the asset URLs and the router basename follow.
  base: '/',
  plugins: [tailwindcss(), react(), serveBenchmarks(), copyBenchmarks(), spaFallback()],
  resolve: {
    alias: { '@': path.resolve(fileURLToPath(new URL('./src', import.meta.url))) },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: { manualChunks: { echarts: ['echarts', 'echarts-for-react'] } },
    },
  },
});
