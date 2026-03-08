import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock the global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock ExtensionAPI
const createMockAPI = () => ({
  registerProvider: vi.fn(),
  registerCommand: vi.fn(),
  on: vi.fn(),
  registerTool: vi.fn(),
  registerFlag: vi.fn(),
  sendMessage: vi.fn(),
  setStatus: vi.fn(),
  ui: {
    notify: vi.fn(),
    setStatus: vi.fn(),
  },
});

describe('Ollama Cloud Extension', () => {
  let mockAPI: ReturnType<typeof createMockAPI>;

  beforeEach(() => {
    mockAPI = createMockAPI();
    mockFetch.mockClear();
  });

  describe('Provider Registration', () => {
    it('should register ollama-cloud provider with correct baseUrl', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      
      // Extension should not throw
      expect(() => ollamaCloudExtension(mockAPI as any)).not.toThrow();
      
      // Verify provider was registered
      expect(mockAPI.registerProvider).toHaveBeenCalled();
      
      const providerCall = mockAPI.registerProvider.mock.calls[0];
      expect(providerCall[0]).toBe('ollama-cloud');
      expect(providerCall[1].baseUrl).toBe('https://ollama.com');
      expect(providerCall[1].api).toBe('openai-chat');
    });

    it('should register oauth with name Ollama Cloud', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      expect(providerCall[1].oauth.name).toBe('Ollama Cloud');
      expect(providerCall[1].oauth.login).toBeDefined();
      expect(providerCall[1].oauth.refreshToken).toBeDefined();
      expect(providerCall[1].oauth.getApiKey).toBeDefined();
    });

    it('should register /ollama-status command', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      expect(mockAPI.registerCommand).toHaveBeenCalledWith('ollama-status', expect.any(Object));
      
      const commandCall = mockAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-status'
      );
      expect(commandCall?.[1].description).toBe('Check Ollama Cloud connection status');
    });
  });

  describe('OAuth Login Flow', () => {
    it('should prompt for API key during login', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const oauth = providerCall[1].oauth;
      
      const mockCallbacks = {
        onPrompt: vi.fn().mockResolvedValue('sk-ollama-test123'),
        onProgress: vi.fn(),
        onAuth: vi.fn(),
      };
      
      // Mock successful validation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'test-model' }] }),
      });

      const credentials = await oauth.login(mockCallbacks);
      
      expect(mockCallbacks.onPrompt).toHaveBeenCalled();
      expect(credentials.access).toBe('sk-ollama-test123');
      expect(credentials.refresh).toBe('');
    });

    it('should throw on invalid API key', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const oauth = providerCall[1].oauth;
      
      const mockCallbacks = {
        onPrompt: vi.fn().mockResolvedValue('invalid-key'),
        onProgress: vi.fn(),
        onAuth: vi.fn(),
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(oauth.login(mockCallbacks)).rejects.toThrow();
    });

    it('should throw on empty API key', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const oauth = providerCall[1].oauth;
      
      const mockCallbacks = {
        onPrompt: vi.fn().mockResolvedValue(''),
        onProgress: vi.fn(),
        onAuth: vi.fn(),
      };

      await expect(oauth.login(mockCallbacks)).rejects.toThrow('API key is required');
    });
  });

  describe('OAuth Utilities', () => {
    it('refreshToken should return credentials unchanged', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const oauth = providerCall[1].oauth;
      
      const creds = { access: 'test-key', refresh: 'refresh-token', expires: 123456 };
      const result = await oauth.refreshToken(creds);
      
      expect(result).toEqual(creds);
    });

    it('getApiKey should return access token', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const oauth = providerCall[1].oauth;
      
      const creds = { access: 'my-api-key', refresh: '', expires: null };
      const result = oauth.getApiKey(creds);
      
      expect(result).toBe('my-api-key');
    });
  });

  describe('Cloud Models', () => {
    it('should register all cloud models', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      expect(models.length).toBeGreaterThanOrEqual(4);
      
      const modelIds = models.map((m: any) => m.id);
      expect(modelIds).toContain('ollama/gpt-oss:120b-cloud');
      expect(modelIds).toContain('ollama/qwen2.5:72b');
      expect(modelIds).toContain('ollama/llama3.2:latest');
    });

    it('all models should have required fields', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      models.forEach((model: any) => {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.input).toBeDefined();
        expect(model.cost).toBeDefined();
        expect(model.contextWindow).toBeDefined();
        expect(model.maxTokens).toBeDefined();
      });
    });

    it('deepseek-r1 should have reasoning=true', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      const deepseek = models.find((m: any) => m.id === 'ollama/deepseek-r1:671b');
      expect(deepseek?.reasoning).toBe(true);
    });

    it('non-reasoning models should have reasoning=false', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      const llama = models.find((m: any) => m.id === 'ollama/llama3.2:latest');
      expect(llama?.reasoning).toBe(false);
    });
  });

  describe('/ollama-status command handler', () => {
    it('should show authenticated status when has auth', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const commandCall = mockAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-status'
      );
      
      const ctx = {
        authStorage: { has: () => true },
        ui: { notify: vi.fn() },
      };
      
      await commandCall?.[1].handler('', ctx);
      
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('Authenticated'),
        'info'
      );
    });

    it('should show not authenticated status', async () => {
      const { default: ollamaCloudExtension } = await import('../../../src/extensions/core/ollama-cloud-extension.js');
      ollamaCloudExtension(mockAPI as any);

      const commandCall = mockAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-status'
      );
      
      const ctx = {
        authStorage: { has: () => false },
        ui: { notify: vi.fn() },
      };
      
      await commandCall?.[1].handler('', ctx);
      
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('Not authenticated'),
        'warning'
      );
    });
  });
});
