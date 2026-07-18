import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

function shortCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

// base: './' makes the built app work from GitHub Pages project URLs.
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    // Fixed at build time (this machine's clock when `vite build`/`vite dev` starts),
    // not the visitor's browser clock — used for the header build stamp only.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(shortCommit()),
  },
});
