
import React from 'react';
import { render, screen } from '@testing-library/react';
import Window from '../Window';
import { vi } from 'vitest';

// Mock storageUtil to have a default export, as it's imported as default in Window.tsx
vi.mock('../../../background/storageUtil', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(JSON.stringify({})), // Mock an empty config
    setItem: vi.fn().mockResolvedValue(null),
  },
}));

// Mock chrome.runtime.getURL to return a simple path, avoiding happy-dom's
// inability to handle 'chrome-extension://' protocols.
const originalGetURL = global.chrome?.runtime?.getURL;
beforeAll(() => {
  if (global.chrome?.runtime) {
    global.chrome.runtime.getURL = (path: string) => `/assets/${path}`;
  } else {
    // Define a mock if chrome API is not present at all
    global.chrome = {
      runtime: { getURL: (path: string) => `/assets/${path}` },
    } as any;
  }
});

afterAll(() => {
  // Restore original getURL if it existed
  if (global.chrome?.runtime && originalGetURL) {
    global.chrome.runtime.getURL = originalGetURL;
  }
});

describe('Window', () => {
  const mockSetSize = vi.fn();
  const initialSize = { width: 400, height: 600 };

  it('should render the resizable window when visible', () => {
    render(
      <Window
        visible={true}
        onClose={() => {}}
        title="Test"
        size={initialSize}
        setSize={mockSetSize}
      />,
    );

    const windowElement = screen.getByTestId('cognito-window');
    expect(windowElement).toBeInTheDocument();

    // Check for the presence of the resize handle, which indicates that
    // the Resizable component has been rendered.
    const resizeHandle = windowElement.querySelector('.react-resizable-handle');
    expect(resizeHandle).toBeInTheDocument();
  });

  it('should not render the window when not visible', () => {
    render(
      <Window
        visible={false}
        onClose={() => {}}
        title="Test"
        size={initialSize}
        setSize={mockSetSize}
      />,
    );
    expect(screen.queryByTestId('cognito-window')).not.toBeInTheDocument();
  });
});
