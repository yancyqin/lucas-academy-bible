/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { narrationBuild } from './scripts/narration-build';
import pkg from './package.json';

// Frontend-only static app. Scripture data lives in ../data/verses.json and is
// imported as a JSON module (see src/data/scripture.ts). No backend/analytics.
// Distribution targets (web / itch / ios) are selected by VITE_DIST_TARGET —
// see src/build-config.ts and docs/DISTRIBUTION.md.
export default defineConfig({
  plugins: [react(), narrationBuild()],
  define: {
    // package.json is the single source of the version number.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
