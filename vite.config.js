import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' makes the built app work from GitHub Pages project URLs.
export default defineConfig({
  plugins: [react()],
  base: './'
});
