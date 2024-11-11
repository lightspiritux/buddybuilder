/// <reference types="../types/testing-library__jest-dom.d.ts" />
import '@testing-library/jest-dom';
import { expect, vi } from 'vitest';

// Mock URL.createObjectURL and URL.revokeObjectURL globally
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document.createElement for download functionality
const mockAnchor = {
  href: '',
  download: '',
  click: vi.fn(),
};

global.document.createElement = vi.fn((tag: string) => {
  if (tag === 'a') return mockAnchor as any;
  return document.createElement(tag);
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.scrollTo
window.scrollTo = vi.fn();

// Mock window.getComputedStyle
window.getComputedStyle = vi.fn().mockReturnValue({
  getPropertyValue: vi.fn(),
});

// Add custom matchers
expect.extend({
  toHaveAttribute(received: Element, attr: string, value?: string) {
    const hasAttr = received.hasAttribute(attr);
    if (value === undefined) {
      return {
        pass: hasAttr,
        message: () =>
          `Expected element ${hasAttr ? 'not ' : ''}to have attribute "${attr}"`,
      };
    }
    const actualValue = received.getAttribute(attr);
    return {
      pass: hasAttr && actualValue === value,
      message: () =>
        `Expected element to have attribute "${attr}" with value "${value}", but got "${actualValue}"`,
    };
  },
  toHaveFocus(received: Element) {
    const hasFocus = document.activeElement === received;
    return {
      pass: hasFocus,
      message: () =>
        `Expected element ${hasFocus ? 'not ' : ''}to have focus`,
    };
  },
});
