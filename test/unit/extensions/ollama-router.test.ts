import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock fetch
global.fetch = vi.fn() as any;

describe('Ollama Router Extension', () => {
  let mockAPI: any;
  let mockCtx: any;

  beforeEach(() => {
    mockAPI = {
      registerCommand: vi.fn(),
      on: vi.fn(),
      ui: {
        notify: vi.fn(),
        setStatus: vi.fn(),
      },
    };
    mockCtx = {
      ui: {
        notify: vi.fn(),
        setStatus: vi.fn(),
      },
      setStatus: vi.fn(),
    };
    // Clear global state
    delete (globalThis as any).__ollamaRouterState;
    vi.clearAllMocks();
  });

  describe('Extension Loading', () => {
    it('should load without errors', async () => {
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      expect(() => ollamaRouterExtension(mockAPI)).not.toThrow();
    });

    it('should register session_start event', async () => {
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);
      
      expect(mockAPI.on).toHaveBeenCalledWith('session_start', expect.any(Function));
    });

    it('should register ollama-mode command', async () => {
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);

      const calls = mockAPI.registerCommand.mock.calls;
      const ollamaModeCall = calls.find((call: any) => call[0] === 'ollama-mode');
      expect(ollamaModeCall).toBeDefined();
      expect(ollamaModeCall[1].description).toContain('Switch Ollama mode');
    });

    it('should register ollama-local command', async () => {
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);

      const calls = mockAPI.registerCommand.mock.calls;
      const localCall = calls.find((call: any) => call[0] === 'ollama-local');
      expect(localCall).toBeDefined();
      expect(localCall[1].description).toContain('local');
    });

    it('should register ollama-cloud command', async () => {
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);

      const calls = mockAPI.registerCommand.mock.calls;
      const cloudCall = calls.find((call: any) => call[0] === 'ollama-cloud');
      expect(cloudCall).toBeDefined();
      expect(cloudCall[1].description).toContain('cloud');
    });
  });

  describe('Mode Switching', () => {
    it('should switch to cloud mode', async () => {
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);

      const calls = mockAPI.registerCommand.mock.calls;
      const modeCall = calls.find((call: any) => call[0] === 'ollama-mode');
      
      await modeCall[1].handler('cloud', mockCtx);
      
      expect(mockCtx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('cloud'),
        'info'
      );
    });

    it('should switch to local mode', async () => {
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);

      const calls = mockAPI.registerCommand.mock.calls;
      const modeCall = calls.find((call: any) => call[0] === 'ollama-mode');
      
      await modeCall[1].handler('local', mockCtx);
      
      expect(mockCtx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('local'),
        'info'
      );
    });

    it('should switch to auto mode', async () => {
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);

      const calls = mockAPI.registerCommand.mock.calls;
      const modeCall = calls.find((call: any) => call[0] === 'ollama-mode');
      
      await modeCall[1].handler('auto', mockCtx);
      
      expect(mockCtx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('auto'),
        'info'
      );
    });

    it('should show error for invalid mode', async () => {
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);

      const calls = mockAPI.registerCommand.mock.calls;
      const modeCall = calls.find((call: any) => call[0] === 'ollama-mode');
      
      await modeCall[1].handler('invalid', mockCtx);
      
      expect(mockCtx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('Invalid'),
        'error'
      );
    });

    it('should show current status when no args', async () => {
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);

      const calls = mockAPI.registerCommand.mock.calls;
      const modeCall = calls.find((call: any) => call[0] === 'ollama-mode');
      
      await modeCall[1].handler('', mockCtx);
      
      expect(mockCtx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('Mode:'),
        'info'
      );
    });
  });

  describe('Session Start', () => {
    it('should check local Ollama on session start', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: true });
      
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);

      const sessionStartHandler = mockAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_start'
      )[1];

      await sessionStartHandler({}, mockCtx);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/version',
        expect.any(Object)
      );
    });

    it('should set footer status on session start', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: true });
      
      const { default: ollamaRouterExtension } = await import('../../../src/extensions/core/ollama-router-extension.js');
      ollamaRouterExtension(mockAPI);

      const sessionStartHandler = mockAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_start'
      )[1];

      await sessionStartHandler({}, mockCtx);

      expect(mockCtx.ui.setStatus).toHaveBeenCalledWith(
        'ollama-mode',
        expect.any(String)
      );
    });
  });

  describe('Exported Functions', () => {
    it('getOllamaRouterState should return current state', async () => {
      const { getOllamaRouterState } = await import('../../../src/extensions/core/ollama-router-extension.js');
      
      const state = getOllamaRouterState();
      
      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('localAvailable');
      expect(['local', 'cloud', 'auto']).toContain(state.mode);
    });

    it('shouldUseCloud should return true in cloud mode', async () => {
      const { getOllamaRouterState, shouldUseCloud } = await import('../../../src/extensions/core/ollama-router-extension.js');
      
      // Set to cloud mode
      const state = getOllamaRouterState();
      state.mode = 'cloud';
      
      expect(shouldUseCloud()).toBe(true);
    });

    it('shouldUseCloud should return false in local mode', async () => {
      const { getOllamaRouterState, shouldUseCloud } = await import('../../../src/extensions/core/ollama-router-extension.js');
      
      // Set to local mode
      const state = getOllamaRouterState();
      state.mode = 'local';
      
      expect(shouldUseCloud()).toBe(false);
    });

    it('shouldUseCloud should auto-detect based on local availability', async () => {
      const { getOllamaRouterState, shouldUseCloud } = await import('../../../src/extensions/core/ollama-router-extension.js');
      
      // Set to auto mode
      const state = getOllamaRouterState();
      state.mode = 'auto';
      
      // When local is available, should NOT use cloud
      state.localAvailable = true;
      expect(shouldUseCloud()).toBe(false);
      
      // When local is NOT available, should use cloud
      state.localAvailable = false;
      expect(shouldUseCloud()).toBe(true);
    });
  });
});
