/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { narrationBuild } from './scripts/narration-build';

// Frontend-only static app. Scripture data lives in ../data/verses.json and is
// imported as a JSON module (see src/data/scripture.ts). No backend/analytics.
export default defineConfig({
  plugins: [react(), narrationBuild()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
