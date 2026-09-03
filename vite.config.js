import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve('frontend'),
  plugins: [react()],
  publicDir: resolve('frontend/public'),
  build: {
    outDir: resolve('public'),
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4173'
    }
  }
});
