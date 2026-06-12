import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const rendererRoot = path.resolve(__dirname, 'src/renderer');

// The renderer is loaded by Electron over file:// (see src/main/index.ts), so
// assets must be referenced relatively (base: './') and emitted as external,
// hash-named files to satisfy the strict CSP (script-src 'self').
export default defineConfig({
  root: rendererRoot,
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rendererRoot, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        index: path.resolve(rendererRoot, 'index.html'),
        log: path.resolve(rendererRoot, 'log.html'),
      },
    },
  },
});
