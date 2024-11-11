/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

const defaultExclude = ['node_modules', 'dist', 'build', '.git', '.cache'];

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./app/test/vitest-setup.ts'],
    include: ['app/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: [...defaultExclude, 'e2e/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        ...defaultExclude,
        'e2e/*',
        '**/*.d.ts',
        'test/**',
        '**/__mocks__/**',
        '**/__tests__/setup.ts'
      ]
    },
    deps: {
      optimizer: {
        web: {
          include: [
            '@testing-library/react',
            '@testing-library/jest-dom',
            '@testing-library/user-event'
          ]
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': '/app'
    }
  }
});
