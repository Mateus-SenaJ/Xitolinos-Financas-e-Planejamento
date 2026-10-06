import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  publicDir: path.resolve(rootDir, '../público'),
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173 },
  build: { outDir: mode === 'android' ? 'dist-android' : 'dist' },
  test: { environment: 'jsdom', setupFiles: './src/test-setup.js' }
}));
