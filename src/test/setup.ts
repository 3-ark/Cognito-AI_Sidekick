import "@testing-library/jest-dom";
import { vi } from "vitest";

// Polyfill for DOMMatrix to prevent pdfjs-dist errors in happy-dom
if (typeof window !== 'undefined' && !window.DOMMatrix) {
  // @ts-ignore
  window.DOMMatrix = class {
    // A basic mock for DOMMatrix. Add methods as needed if tests fail.
    constructor() {}
    translateSelf() {}
    scaleSelf() {}
  };
}

const chrome = {
  runtime: {
    sendMessage: vi.fn(),
    lastError: null,
    getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
    onMessage: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
  },
  downloads: {
    download: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    onActivated: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() },
    create: vi.fn(),
  },
  commands: {
    onCommand: {
      addListener: vi.fn(),
    },
  },
};

global.chrome = chrome as any;
