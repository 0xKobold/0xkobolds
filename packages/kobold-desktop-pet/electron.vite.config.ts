import { defineConfig } from 'electron-vite';
import { join } from 'path';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: join(__dirname, 'src/main.ts'),
        },
        output: {
          entryFileNames: 'main.js',
        },
      },
    },
  },
  renderer: {
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          index: join(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
});