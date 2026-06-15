import { defineConfig } from 'vite';
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : './',
  optimizeDeps: {
    include: ['canvaskit-wasm'],
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
}));
