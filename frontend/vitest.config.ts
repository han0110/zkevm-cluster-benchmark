import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logArchiveIndex } from './vite/logArchiveIndex';

// Vitest reuses the Vite resolution pipeline, so it handles the @/ alias and the import.meta.glob run
// discovery the source relies on. The React plugin, the alias, and the log-archive index are wired here.
// The index is needed because the block trace overlay imports the virtual module it emits. The app's
// Tailwind and benchmark-serving plugins are left out since no test imports CSS or fetches the data
// directory.
export default defineConfig({
  plugins: [react(), logArchiveIndex()],
  resolve: {
    alias: { '@': path.resolve(fileURLToPath(new URL('./src', import.meta.url))) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
