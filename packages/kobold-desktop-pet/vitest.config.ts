import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['test/', 'node_modules/', 'dist/'],
    },
    setupFiles: ['test/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});