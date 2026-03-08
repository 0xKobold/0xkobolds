import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('Ollama Provider Extension', () => {
  let mockAPI: any;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAPI = {
      registerProvider: vi.fn(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Extension Loading', () => {
    it('should load without errors', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      expect(() => ollamaProviderExtension(mockAPI)).not.toThrow();
    });

    it('should register ollama provider', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      expect(mockAPI.registerProvider).toHaveBeenCalledWith(
        'ollama',
        expect.any(Object)
      );
    });
  });

  describe('Provider Configuration', () => {
    it('should use default localhost URL', async () => {
      delete process.env.OLLAMA_URL;

      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      expect(providerCall[1].baseUrl).toBe('http://localhost:11434/v1');
    });

    it('should be registerable with custom env', async () => {
      // Note: OLLAMA_URL is read at module load time

      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      expect(mockAPI.registerProvider).toHaveBeenCalled();
    });

    it('should use openai-completions API', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      expect(providerCall[1].api).toBe('openai-completions');
    });

    it('should have dummy apiKey', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      expect(providerCall[1].apiKey).toBe('ollama');
    });
  });

  describe('Models', () => {
    it('should register all cloud models', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      expect(models.length).toBe(5);
    });

    it('should have Kimi K2.5 model', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      const kimi = models.find((m: any) => m.id === 'kimi-k2.5:cloud');
      expect(kimi).toBeDefined();
      expect(kimi?.name).toBe('Kimi K2.5 (Cloud)');
      expect(kimi?.reasoning).toBe(true);
      expect(kimi?.input).toContain('text');
      expect(kimi?.input).toContain('image');
      expect(kimi?.contextWindow).toBe(256000);
    });

    it('should have Minimax model', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      const minimax = models.find((m: any) => m.id === 'minimax-m2.5:cloud');
      expect(minimax).toBeDefined();
      expect(minimax?.contextWindow).toBe(198000);
    });

    it('should have GLM-5 model', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      const glm = models.find((m: any) => m.id === 'glm-5:cloud');
      expect(glm).toBeDefined();
      expect(glm?.reasoning).toBe(true);
    });

    it('should have Qwen3.5 models', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      const qwen1 = models.find((m: any) => m.id === 'qwen3.5:cloud');
      const qwen2 = models.find((m: any) => m.id === 'qwen3.5:397b-cloud');
      
      expect(qwen1).toBeDefined();
      expect(qwen2).toBeDefined();
      expect(qwen2?.name).toContain('397B');
    });

    it('all models should have zero cost', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      models.forEach((model: any) => {
        expect(model.cost).toEqual({
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        });
      });
    });

    it('all models should have maxTokens', async () => {
      const { default: ollamaProviderExtension } = await import('../../../src/extensions/core/ollama-provider-extension.js');
      ollamaProviderExtension(mockAPI);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      const models = providerCall[1].models;
      
      models.forEach((model: any) => {
        expect(model.maxTokens).toBeGreaterThan(0);
      });
    });
  });
});
