import { defineConfig } from 'vite';
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/sboard/',
  optimizeDeps: {
    include: ['canvaskit-wasm'], // заранее обрабатываем npm-версию CanvasKit, которая используется как запасной вариант при отсутствии кастомной сборки
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900, // увеличиваем только порог предупреждения, потому что графические библиотеки создают крупный итоговый js-файл
  },
}));
