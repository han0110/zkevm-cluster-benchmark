import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Vitest reuses the Vite resolution pipeline, so it handles the @/ alias and the import.meta.glob run
// discovery the source relies on. Only the React plugin and the alias are wired here. The app's Tailwind
// and benchmark-serving plugins are left out since no test imports CSS or fetches the data directory.
export default defineConfig({
  plugins: [react()],
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
