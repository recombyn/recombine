import path from 'path';
import { defineConfig } from 'vitest/config';

/**
 * Frontend unit tests — Vitest + React Testing Library (Vite-native).
 * Same RTL patterns as Dify’s current web stack (migrated from Jest).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      // Only files imported by tests — avoids instrumenting the whole app tree.
      all: false,
      reporter: ['text', 'lcov'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    __GOOGLE_CLIENT_ID__: JSON.stringify(''),
  },
});
