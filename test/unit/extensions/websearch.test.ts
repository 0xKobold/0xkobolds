import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock fetch
global.fetch = vi.fn() as any;

describe('Web Search Extension', () => {
  let mockAPI: any;
  let mockCtx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAPI = {
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
      on: vi.fn(),
    };

    mockCtx = {
      ui: {
        notify: vi.fn(),
      },
    };
  });

  describe('Extension Loading', () => {
    it('should load without errors', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      expect(() => webSearchExtension(mockAPI)).not.toThrow();
    });

    it('should register web-search command', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      expect(mockAPI.registerCommand).toHaveBeenCalledWith(
        'web-search',
        expect.any(Object)
      );
    });

    it('should register fetch command', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      expect(mockAPI.registerCommand).toHaveBeenCalledWith(
        'fetch',
        expect.any(Object)
      );
    });

    it('should register 3 tools', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      expect(mockAPI.registerTool).toHaveBeenCalledTimes(3);
      
      const toolNames = mockAPI.registerTool.mock.calls.map((c: any) => c[0].name);
      expect(toolNames).toContain('web_search');
      expect(toolNames).toContain('web_fetch');
      expect(toolNames).toContain('web_qa');
    });
  });

  describe('web_search Tool', () => {
    it('should have correct parameters', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_search'
      );
      
      expect(toolCall[0].description).toContain('Search the web');
      expect(toolCall[0].parameters.required).toContain('query');
    });

    it('should return results when search succeeds', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      // Mock Ollama available
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ version: '1.0' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ response: 'Test Result | http://test.com | Description' }),
        });

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_search'
      );

      const result = await toolCall[0].execute('test-id', { query: 'test' }, undefined, null, {});

      expect(result.content[0].text).toContain('Search results');
    });

    it('should handle empty query', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_search'
      );

      const result = await toolCall[0].execute('test-id', { query: '' }, undefined, null, {});

      expect(result.content[0].text).toContain('Invalid search query');
    });

    it('should handle search failure', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      // Mock Ollama not available
      (global.fetch as any).mockRejectedValue(new Error('Connection refused'));

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_search'
      );

      const result = await toolCall[0].execute('test-id', { query: 'test' }, undefined, null, {});

      expect(result.content[0].text).toContain('No search results');
    });
  });

  describe('web_fetch Tool', () => {
    it('should have correct parameters', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_fetch'
      );
      
      expect(toolCall[0].description).toContain('Fetch and read');
      expect(toolCall[0].parameters.required).toContain('url');
    });

    it('should fetch and return content', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => '<html><title>Test Page</title><body>Content</body></html>',
      });

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_fetch'
      );

      const result = await toolCall[0].execute('test-id', { url: 'http://example.com' }, undefined, null, {});

      expect(result.content[0].text).toContain('Test Page');
      expect(result.content[0].text).toContain('Content');
    });

    it('should reject invalid URLs', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_fetch'
      );

      const result = await toolCall[0].execute('test-id', { url: 'invalid-url' }, undefined, null, {});

      expect(result.content[0].text).toContain('Invalid URL');
    });

    it('should handle fetch failure', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_fetch'
      );

      const result = await toolCall[0].execute('test-id', { url: 'http://example.com' }, undefined, null, {});

      expect(result.content[0].text).toContain('Failed to fetch');
    });
  });

  describe('web_qa Tool', () => {
    it('should have correct parameters', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_qa'
      );
      
      expect(toolCall[0].description).toContain('synthesize');
      expect(toolCall[0].parameters.required).toContain('question');
    });

    it('should handle invalid question', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_qa'
      );

      const result = await toolCall[0].execute('test-id', { question: '' }, undefined, null, {});

      expect(result.content[0].text).toContain('Invalid question');
    });

    it('should return search results and fetch sources', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      // Mock Ollama available
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ version: '1.0' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ response: 'Result1 | http://test1.com | Description\nResult2 | http://test2.com | Description2' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '<html><title>Page 1</title><body>Content 1</body></html>',
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '<html><title>Page 2</title><body>Content 2</body></html>',
        });

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (c: any) => c[0].name === 'web_qa'
      );

      const result = await toolCall[0].execute('test-id', { question: 'test question', sources: 2 }, undefined, null, {});

      expect(result.content[0].text).toContain('Page 1');
      expect(result.content[0].text).toContain('Page 2');
      expect(result.details.sources_fetched).toBe(2);
    });
  });

  describe('Commands', () => {
    it('web-search command should show search results', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      const commandCall = mockAPI.registerCommand.mock.calls.find(
        (c: any) => c[0] === 'web-search'
      );

      // Mock Ollama available
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ version: '1.0' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ response: 'Result | http://test.com | Description' }),
        });

      await commandCall[1].handler('query=test', mockCtx);

      expect(mockCtx.ui.notify).toHaveBeenCalled();
    });

    it('fetch command should show fetched content', async () => {
      const { default: webSearchExtension } = await import('../../../src/extensions/core/websearch-extension.js');
      webSearchExtension(mockAPI);

      const commandCall = mockAPI.registerCommand.mock.calls.find(
        (c: any) => c[0] === 'fetch'
      );

      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => '<html><title>Test</title><body>Content</body></html>',
      });

      await commandCall[1].handler('url=http://example.com', mockCtx);

      expect(mockCtx.ui.notify).toHaveBeenCalled();
    });
  });
});
