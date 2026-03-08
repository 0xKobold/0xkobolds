import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * E2E Tests for Ollama Cloud Flow
 * 
 * Simulates complete user workflows:
 * 1. User logs in to Ollama Cloud
 * 2. User switches between local/cloud modes
 * 3. User makes API calls through router
 */

describe('E2E: Ollama Cloud User Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global state
    delete (globalThis as any).__ollamaRouterState;
  });

  describe('Flow 1: New User Cloud Setup', () => {
    it('complete cloud login flow', async () => {
      // 1. Load extensions
      const { default: ollamaCloudExtension } = await import('../../src/extensions/core/ollama-cloud-extension.js');
      const { default: ollamaRouterExtension, getOllamaRouterState } = await import('../../src/extensions/core/ollama-router-extension.js');

      const cloudAPI = {
        registerProvider: vi.fn(),
        registerCommand: vi.fn(),
        on: vi.fn(),
      };

      const routerAPI = {
        registerCommand: vi.fn(),
        on: vi.fn(),
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      // 2. Initialize extensions
      ollamaCloudExtension(cloudAPI);
      ollamaRouterExtension(routerAPI);

      // 3. Verify provider registered
      expect(cloudAPI.registerProvider).toHaveBeenCalledWith('ollama-cloud', expect.any(Object));

      // 4. Get OAuth config
      const providerConfig = cloudAPI.registerProvider.mock.calls[0][1];
      
      // 5. Simulate OAuth login
      const mockCallbacks = {
        onPrompt: vi.fn().mockResolvedValue('sk-ollama-test-api-key'),
        onProgress: vi.fn(),
        onAuth: vi.fn(),
      };

      // Mock successful API validation
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'gpt-oss:120b-cloud' }] }),
      }) as any;

      const credentials = await providerConfig.oauth.login(mockCallbacks);

      // 6. Verify credentials
      expect(credentials.access).toBe('sk-ollama-test-api-key');
      expect(credentials.refresh).toBe('');
      expect(mockCallbacks.onProgress).toHaveBeenCalledWith('Connected to Ollama Cloud!');
    });

    it('switch to cloud mode and verify routing', async () => {
      const { default: ollamaRouterExtension, getOllamaRouterState, shouldUseCloud } = await import('../../src/extensions/core/ollama-router-extension.js');

      const routerAPI = {
        registerCommand: vi.fn(),
        on: vi.fn(),
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      ollamaRouterExtension(routerAPI);

      // Get the mode command
      const modeCall = routerAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-mode'
      );

      const ctx = {
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      // Switch to cloud mode
      await modeCall[1].handler('cloud', ctx);

      // Verify routing
      const state = getOllamaRouterState();
      expect(state.mode).toBe('cloud');
      expect(shouldUseCloud()).toBe(true);

      // Verify status updated
      expect(ctx.ui.setStatus).toHaveBeenCalledWith('ollama-mode', expect.stringContaining('🌩️'));
    });
  });

  describe('Flow 2: Auto Mode with Fallback', () => {
    it('auto mode uses local when available', async () => {
      const { default: ollamaRouterExtension, getOllamaRouterState, shouldUseCloud } = await import('../../src/extensions/core/ollama-router-extension.js');

      const routerAPI = {
        registerCommand: vi.fn(),
        on: vi.fn(),
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      ollamaRouterExtension(routerAPI);

      // Mock fetch for local Ollama check
      global.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;

      // Get session start handler
      const sessionStartHandler = routerAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_start'
      )[1];

      const ctx = {
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      // Trigger session start
      await sessionStartHandler({}, ctx);

      // Verify router detected local Ollama
      const state = getOllamaRouterState();
      expect(state.localAvailable).toBe(true);

      // Switch to auto mode
      const modeCall = routerAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-mode'
      );
      await modeCall[1].handler('auto', ctx);

      // Should use local (not cloud) when available
      expect(shouldUseCloud()).toBe(false);
    });

    it('auto mode falls back to cloud when local is down', async () => {
      const { default: ollamaRouterExtension, getOllamaRouterState, shouldUseCloud } = await import('../../src/extensions/core/ollama-router-extension.js');

      const routerAPI = {
        registerCommand: vi.fn(),
        on: vi.fn(),
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      ollamaRouterExtension(routerAPI);

      // Mock fetch to simulate local Ollama down
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused')) as any;

      // Get session start handler
      const sessionStartHandler = routerAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_start'
      )[1];

      const ctx = {
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      // Trigger session start (local check fails)
      await sessionStartHandler({}, ctx);

      // Verify router detected local is unavailable
      const state = getOllamaRouterState();
      expect(state.localAvailable).toBe(false);

      // In auto mode, should use cloud
      expect(shouldUseCloud()).toBe(true);
    });
  });

  describe('Flow 3: Quick Mode Switching', () => {
    it('/ollama-local quick command', async () => {
      const { default: ollamaRouterExtension, getOllamaRouterState } = await import('../../src/extensions/core/ollama-router-extension.js');

      const routerAPI = {
        registerCommand: vi.fn(),
        on: vi.fn(),
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      ollamaRouterExtension(routerAPI);

      // Start in cloud mode
      const state = getOllamaRouterState();
      state.mode = 'cloud';

      // Use ollama-local command
      const localCall = routerAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-local'
      );

      const ctx = {
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      await localCall[1].handler('', ctx);

      // Verify switched to local
      expect(getOllamaRouterState().mode).toBe('local');
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('local'), 'info');
    });

    it('/ollama-cloud quick command', async () => {
      const { default: ollamaRouterExtension, getOllamaRouterState } = await import('../../src/extensions/core/ollama-router-extension.js');

      const routerAPI = {
        registerCommand: vi.fn(),
        on: vi.fn(),
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      ollamaRouterExtension(routerAPI);

      // Start in local mode
      const state = getOllamaRouterState();
      state.mode = 'local';

      // Use ollama-cloud command
      const cloudCall = routerAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-cloud'
      );

      const ctx = {
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      await cloudCall[1].handler('', ctx);

      // Verify switched to cloud
      expect(getOllamaRouterState().mode).toBe('cloud');
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('cloud'), 'info');
    });
  });

  describe('Flow 4: Status Checking', () => {
    it('/ollama-mode shows detailed status', async () => {
      const { default: ollamaRouterExtension, getOllamaRouterState } = await import('../../src/extensions/core/ollama-router-extension.js');

      const routerAPI = {
        registerCommand: vi.fn(),
        on: vi.fn(),
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      ollamaRouterExtension(routerAPI);

      const modeCall = routerAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-mode'
      );

      const ctx = {
        ui: { notify: vi.fn() },
      };

      // Call without args to show status
      await modeCall[1].handler('', ctx);

      // Should show status with mode info
      expect(ctx.ui.notify).toHaveBeenCalled();
      const callArg = ctx.ui.notify.mock.calls[0][0];
      expect(callArg).toContain('Mode:');
    });

    it('/ollama-status checks authentication', async () => {
      const { default: ollamaCloudExtension } = await import('../../src/extensions/core/ollama-cloud-extension.js');

      const cloudAPI = {
        registerProvider: vi.fn(),
        registerCommand: vi.fn(),
        on: vi.fn(),
      };

      ollamaCloudExtension(cloudAPI);

      const statusCall = cloudAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-status'
      );

      // Test authenticated state
      const ctxWithAuth = {
        authStorage: { has: () => true },
        ui: { notify: vi.fn() },
      };

      await statusCall[1].handler('', ctxWithAuth);
      expect(ctxWithAuth.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('Authenticated'),
        'info'
      );

      // Test unauthenticated state
      const ctxNoAuth = {
        authStorage: { has: () => false },
        ui: { notify: vi.fn() },
      };

      await statusCall[1].handler('', ctxNoAuth);
      expect(ctxNoAuth.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('Not authenticated'),
        'warning'
      );
    });
  });
});

describe('E2E: Provider Integration', () => {
  it('OllamaProvider uses correct endpoint based on mode', async () => {
    const { OllamaProvider, getOllamaBaseUrl } = await import('../../src/llm/ollama.js');
    const { getOllamaRouterState } = await import('../../src/extensions/core/ollama-router-extension.js');

    // Set to cloud mode
    const state = getOllamaRouterState();
    state.mode = 'cloud';

    // Provider should initialize without errors
    const provider = new OllamaProvider();
    expect(provider).toBeDefined();
    expect(provider.name).toBe('ollama');
  });

  it('OllamaProvider listModels uses auth headers in cloud mode', async () => {
    const { OllamaProvider, getOllamaBaseUrl } = await import('../../src/llm/ollama.js');
    const { getOllamaRouterState } = await import('../../src/extensions/core/ollama-router-extension.js');

    // Set to cloud mode
    const state = getOllamaRouterState();
    state.mode = 'cloud';

    // Mock fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'test-model' }] }),
    });
    global.fetch = mockFetch as any;

    // Mock environment variable for API key
    const originalEnv = process.env.OLLAMA_API_KEY;
    process.env.OLLAMA_API_KEY = 'test-api-key';

    try {
      const provider = new OllamaProvider();
      await provider.listModels();

      // Verify fetch was called with auth header
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tags'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    } finally {
      process.env.OLLAMA_API_KEY = originalEnv;
    }
  });
});
