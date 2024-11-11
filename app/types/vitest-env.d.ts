/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare global {
  namespace Vi {
    interface Assertion<T = any> extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
  }

  // Declare global test functions
  const describe: typeof import('vitest')['describe']
  const it: typeof import('vitest')['it']
  const expect: typeof import('vitest')['expect']
  const vi: typeof import('vitest')['vi']
  const beforeEach: typeof import('vitest')['beforeEach']
  const afterEach: typeof import('vitest')['afterEach']
  const beforeAll: typeof import('vitest')['beforeAll']
  const afterAll: typeof import('vitest')['afterAll']
  const test: typeof import('vitest')['test']
  const suite: typeof import('vitest')['suite']

  interface Window {
    ResizeObserver: ResizeObserver;
  }
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'vitest' {
  interface TestContext {
    // add any custom test context properties here
  }
}
