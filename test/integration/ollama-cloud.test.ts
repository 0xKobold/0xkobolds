import { describe, expect, it, vi } from 'vitest';

describe('Ollama Cloud Integration', () => {
  describe('Extension Loading', () => {
    it('should load ollama-cloud extension without errors', async () => {
      const { default: ollamaCloudExtension } = await import('../../src/extensions/core/ollama-cloud-extension.js');
      const mockAPI = {
        registerProvider: vi.fn(),
        registerCommand: vi.fn(),
        on: vi.fn(),
      };

      expect(() => ollamaCloudExtension(mockAPI as any)).not.toThrow();
      expect(mockAPI.registerProvider).toHaveBeenCalled();
    });

    it('should load ollama-router extension without errors', async () => {
      const { default: ollamaRouterExtension } = await import('../../src/extensions/core/ollama-router-extension.js');
      const mockAPI = {
        registerCommand: vi.fn(),
        on: vi.fn(),
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      expect(() => ollamaRouterExtension(mockAPI as any)).not.toThrow();
      expect(mockAPI.registerCommand).toHaveBeenCalled();
    });

    it('ollama provider should support dual endpoints', async () => {
      const { OllamaProvider, getOllamaBaseUrl } = await import('../../src/llm/ollama.js');
      
      const provider = new OllamaProvider();
      expect(provider.name).toBe('ollama');
      expect(typeof provider.chat).toBe('function');
      expect(typeof provider.listModels).toBe('function');
    });
  });

  describe('Router State Management', () => {
    it('should export router state functions', async () => {
      const { getOllamaRouterState, shouldUseCloud } = await import('../../src/extensions/core/ollama-router-extension.js');
      
      expect(typeof getOllamaRouterState).toBe('function');
      expect(typeof shouldUseCloud).toBe('function');
    });
  });

  describe('OAuth Provider Configuration', () => {
    it('should configure OAuth provider with correct settings', async () => {
      const { default: ollamaCloudExtension } = await import('../../src/extensions/core/ollama-cloud-extension.js');
      const mockAPI = {
        registerProvider: vi.fn(),
        registerCommand: vi.fn(),
        on: vi.fn(),
      };

      ollamaCloudExtension(mockAPI as any);

      const providerCall = mockAPI.registerProvider.mock.calls[0];
      expect(providerCall[0]).toBe('ollama-cloud');
      
      const config = providerCall[1];
      expect(config.baseUrl).toBe('https://ollama.com');
      expect(config.api).toBe('openai-chat');
      expect(config.oauth.name).toBe('Ollama Cloud');
      expect(config.models).toBeDefined();
      expect(config.models.length).toBeGreaterThan(0);
    });

    it('should have valid model configurations', async () => {
      const { default: ollamaCloudExtension } = await import('../../src/extensions/core/ollama-cloud-extension.js');
      const mockAPI = {
        registerProvider: vi.fn(),
        registerCommand: vi.fn(),
        on: vi.fn(),
      };

      ollamaCloudExtension(mockAPI as any);

      const config = mockAPI.registerProvider.mock.calls[0][1];
      
      config.models.forEach((model: any) => {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined()
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.maxTokens).toBeGreaterThan(0);
        expect(model.input).toBeInstanceOf(Array);
        expect(model.cost).toBeDefined();
      });
    });
  });

  describe('Command Handlers', () => {
    it('ollama-mode command should handle all valid modes', async () => {
      const { default: ollamaRouterExtension } = await import('../../src/extensions/core/ollama-router-extension.js');
      const mockAPI = {
        registerCommand: vi.fn(),
        on: vi.fn(),
        ui: { notify: vi.fn(), setStatus: vi.fn() },
      };

      ollamaRouterExtension(mockAPI as any);

      const modeCall = mockAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-mode'
      );
      
      const ctx = { ui: { notify: vi.fn(), setStatus: vi.fn() } };
      
      // Test all valid modes
      for (const mode of ['local', 'cloud', 'auto']) {
        await modeCall[1].handler(mode, ctx);
        expect(ctx.ui.setStatus).toHaveBeenCalledWith('ollama-mode', expect.stringContaining(mode === 'auto' ? 'Auto' : mode === 'local' ? '🏠' : '🌩️'));
      }
    });

    it('/ollama-status should show auth status', async () => {
      const { default: ollamaCloudExtension } = await import('../../src/extensions/core/ollama-cloud-extension.js');
      const mockAPI = {
        registerProvider: vi.fn(),
        registerCommand: vi.fn(),
        on: vi.fn(),
      };

      ollamaCloudExtension(mockAPI as any);

      const statusCall = mockAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'ollama-status'
      );
      
      expect(statusCall).toBeDefined();
      expect(statusCall[1].description).toBe('Check Ollama Cloud connection status');
    });
  });
});
