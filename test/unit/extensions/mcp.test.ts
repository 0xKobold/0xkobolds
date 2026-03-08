import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('MCP Extension', () => {
  let mockAPI: any;
  let mockCtx: any;

  beforeEach(async () => {
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

    const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs');
    (existsSync as any).mockReturnValue(false);
    (readFileSync as any).mockReturnValue('[]');
    (mkdirSync as any).mockImplementation(() => {});
    (writeFileSync as any).mockImplementation(() => {});
  });

  describe('Extension Loading', () => {
    it('should load without errors', async () => {
      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      expect(() => mcpExtension(mockAPI)).not.toThrow();
    });

    it('should register MCP commands', async () => {
      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      mcpExtension(mockAPI);

      const commandNames = mockAPI.registerCommand.mock.calls.map((c: any) => c[0]);
      expect(commandNames).toContain('mcp-list');
      expect(commandNames).toContain('mcp-enable');
      expect(commandNames).toContain('mcp-disable');
      expect(commandNames).toContain('mcp-add');
    });

    it('should register mcp_discover tool', async () => {
      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      mcpExtension(mockAPI);

      expect(mockAPI.registerTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'mcp_discover',
        })
      );
    });
  });

  describe('Configuration', () => {
    it('should create default config if not exists', async () => {
      const { existsSync } = await import('fs');
      (existsSync as any).mockReturnValue(false);

      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      mcpExtension(mockAPI);

      const { mkdirSync, writeFileSync } = await import('fs');
      expect(mkdirSync).toHaveBeenCalled();
      
      const writtenConfig = (writeFileSync as any).mock.calls[0]?.[1];
      expect(writtenConfig).toContain('filesystem');
      expect(writtenConfig).toContain('github');
    });
  });

  describe('mcp-list Command', () => {
    it('should list MCP servers', async () => {
      const { existsSync, readFileSync } = await import('fs');
      (existsSync as any).mockReturnValue(true);
      (readFileSync as any).mockReturnValue(JSON.stringify([
        { name: 'test-server', command: 'test', enabled: true },
      ]));

      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      mcpExtension(mockAPI);

      const listCall = mockAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'mcp-list'
      );

      await listCall[1].handler('', mockCtx);

      expect(mockCtx.ui.notify).toHaveBeenCalled();
      const message = mockCtx.ui.notify.mock.calls[0][0];
      expect(message).toContain('MCP Servers');
    });
  });

  describe('mcp-add Command', () => {
    it('should add new MCP server', async () => {
      const { existsSync, readFileSync } = await import('fs');
      (existsSync as any).mockReturnValue(true);
      (readFileSync as any).mockReturnValue(JSON.stringify([]));

      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      mcpExtension(mockAPI);

      const addCall = mockAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'mcp-add'
      );

      await addCall[1].handler(
        { name: 'new-server', command: 'mycommand', args: 'arg1,arg2' },
        mockCtx
      );

      expect(mockCtx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('Added MCP server: new-server'),
        'success'
      );
    });

    it('should reject duplicate server names', async () => {
      const { existsSync, readFileSync } = await import('fs');
      (existsSync as any).mockReturnValue(true);
      (readFileSync as any).mockReturnValue(JSON.stringify([
        { name: 'existing', command: 'test', enabled: false },
      ]));

      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      mcpExtension(mockAPI);

      const addCall = mockAPI.registerCommand.mock.calls.find(
        (call: any) => call[0] === 'mcp-add'
      );

      await addCall[1].handler(
        { name: 'existing', command: 'mycommand' },
        mockCtx
      );

      expect(mockCtx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("already exists"),
        'error'
      );
    });
  });

  describe('mcp_discover Tool', () => {
    it('should return empty when no servers connected', async () => {
      const { existsSync, readFileSync } = await import('fs');
      (existsSync as any).mockReturnValue(true);
      (readFileSync as any).mockReturnValue(JSON.stringify([
        { name: 'test', enabled: false },
      ]));

      const { default: mcpExtension } = await import('../../../src/extensions/core/mcp-extension.js');
      mcpExtension(mockAPI);

      const toolCall = mockAPI.registerTool.mock.calls.find(
        (call: any) => call[0].name === 'mcp_discover'
      );

      const result = await toolCall[0].execute({});

      expect(result.content[0].text).toContain('No MCP servers connected');
    });
  });
});
