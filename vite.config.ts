import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const rendererRoot = path.resolve(__dirname, 'src/renderer');

// App version baked in at build time so the renderer can show it (e.g. Settings)
// without an extra IPC round-trip. `npm start` rebuilds, so this stays current.
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string };

// The renderer is loaded by Electron over file:// (see src/main/index.ts), so
// assets must be referenced relatively (base: './') and emitted as external,
// hash-named files to satisfy the strict CSP (script-src 'self').
export default defineConfig({
  root: rendererRoot,
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
    // globe.gl (a WebGL globe used only on the dashboard) is ~1.8 MB and is
    // already isolated into its own chunk below — it can't go under 500 KB, and
    // since the renderer loads from local disk over file:// there's no network
    // cost to a large chunk. Raise the limit so the honest split doesn't warn.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        index: path.resolve(rendererRoot, 'index.html'),
        log: path.resolve(rendererRoot, 'log.html'),
      },
      // Manual vendor grouping (rolldown codeSplitting): keep the heavy globe and
      // the React runtime in stable, separate chunks from app code. `codeSplitting`
      // is a rolldown-only output option not yet in vite's classic OutputOptions
      // types, so the cast is expected.
      output: {
        codeSplitting: {
          groups: [
            { name: 'globe', test: /node_modules[\\/](globe\.gl|three)/ },
            { name: 'aurora', test: /node_modules[\\/]ogl|components[\\/]Aurora/ },
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
} as UserConfig);
