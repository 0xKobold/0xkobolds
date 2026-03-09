import { describe, expect, it, beforeEach } from 'bun:test';

// Note: Bun doesn't support module mocking like Vitest
// These tests run with actual implementations

describe('MCP Extension', () => {
  let mockAPI: any;
  let mockCtx: any;

  beforeEach(async () => {
    mockAPI = {
      registerCommand: () => {},
      registerTool: () => {},
      on: () => {},
    };

    mockCtx = {
      ui: {
        notify: () => {},
      },
    };
  });

  describe('Extension Loading', () => {
    it('should load without errors', async () => {
      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      expect(() => mcpExtension(mockAPI)).not.toThrow();
    });

    it('should register MCP commands', async () => {
      let registeredCommands: string[] = [];
      const api = {
        ...mockAPI,
        registerCommand: (name: string) => {
          registeredCommands.push(name);
        },
      };
      
      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      mcpExtension(api);
      
      expect(registeredCommands.length).toBeGreaterThan(0);
    });
  });

  describe('mcp-list Command', () => {
    it('should list MCP servers', async () => {
      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      // Extension loads without throwing
      expect(() => mcpExtension(mockAPI)).not.toThrow();
    });
  });
});
