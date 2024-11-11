/// <reference types="vitest" />
/// <reference types="vite/client" />

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare global {
  namespace Vi {
    interface Assertion<T = any> extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
    interface AsymmetricMatchersContaining extends TestingLibraryMatchers<typeof expect.stringContaining, any> {}
  }

  interface Window {
    ResizeObserver: ResizeObserver;
  }

  // Declare test functions globally
  const describe: typeof import('vitest')['describe']
  const test: typeof import('vitest')['test']
  const it: typeof import('vitest')['it']
  const expect: typeof import('vitest')['expect']
  const vi: typeof import('vitest')['vi']
  const beforeEach: typeof import('vitest')['beforeEach']
  const afterEach: typeof import('vitest')['afterEach']
  const beforeAll: typeof import('vitest')['beforeAll']
  const afterAll: typeof import('vitest')['afterAll']
}

// Extend Vitest's expect
interface CustomMatchers<R = unknown> {
  toHaveAttribute(attr: string, value?: string): R;
  toHaveFocus(): R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
