/**
 * Test Setup - Mocks for Electron and Node.js
 */

import { vi } from 'vitest';

// Mock Electron modules
vi.mock('electron', () => ({
  app: {
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
    getPath: vi.fn(() => '/tmp/test'),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadFile: vi.fn(),
    on: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    setPosition: vi.fn(),
    getPosition: vi.fn(() => [0, 0]),
    setAlwaysOnTop: vi.fn(),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
    },
  })),
  Tray: vi.fn().mockImplementation(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  })),
  Menu: {
    buildFromTemplate: vi.fn(() => ({
      items: [],
    })),
  },
  nativeImage: {
    createFromBuffer: vi.fn(() => ({
      resize: vi.fn(() => ({})),
    })),
  },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workAreaSize: { width: 1920, height: 1080 },
    })),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  ipcRenderer: {
    on: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn(() => Promise.resolve({ status: 'idle' })),
  },
}));

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((err: Error) => void) | null = null;

  constructor(public url: string) {
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }

  send = vi.fn((data: string) => {});
  close = vi.fn((code?: number, reason?: string) => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: code || 1000, reason: reason || '' });
    }
  });
}

// Set up global WebSocket mock
(global as any).WebSocket = MockWebSocket;

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ status: 'idle', task: null }),
  })
) as any;

// Test utilities
export function createMockWindow() {
  return {
    loadFile: vi.fn(),
    on: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    setPosition: vi.fn(),
    getPosition: vi.fn(() => [100, 100]),
    setAlwaysOnTop: vi.fn(),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
    },
  };
}

export function createMockTray() {
  return {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});