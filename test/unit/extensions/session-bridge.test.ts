import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('Session Bridge Extension', () => {
  let mockAPI: any;
  let mockCtx: any;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.KOBOLD_SESSION_ID;
    delete process.env.KOBOLD_WORKING_DIR;

    mockAPI = {
      on: vi.fn(),
      registerTool: vi.fn(),
    };

    mockCtx = {
      sessionManager: {
        getSessionId: vi.fn().mockReturnValue('/test/session-123'),
        getCwd: vi.fn().mockReturnValue('/test/workdir'),
      },
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Extension Loading', () => {
    it('should load without errors', async () => {
      const { default: sessionBridgeExtension } = await import('../../../src/extensions/core/session-bridge-extension.js');
      expect(() => sessionBridgeExtension(mockAPI)).not.toThrow();
    });

    it('should register session event listeners', async () => {
      const { default: sessionBridgeExtension } = await import('../../../src/extensions/core/session-bridge-extension.js');
      sessionBridgeExtension(mockAPI);

      expect(mockAPI.on).toHaveBeenCalledWith('session_start', expect.any(Function));
      expect(mockAPI.on).toHaveBeenCalledWith('session_switch', expect.any(Function));
      expect(mockAPI.on).toHaveBeenCalledWith('session_fork', expect.any(Function));
    });

    it('should register get_session_info tool', async () => {
      const { default: sessionBridgeExtension } = await import('../../../src/extensions/core/session-bridge-extension.js');
      sessionBridgeExtension(mockAPI);

      expect(mockAPI.registerTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'get_session_info',
          description: expect.stringContaining('session'),
        })
      );
    });
  });

  describe('Session ID Generation', () => {
    it('should generate kobold session ID on session_start', async () => {
      const { default: sessionBridgeExtension } = await import('../../../src/extensions/core/session-bridge-extension.js');
      sessionBridgeExtension(mockAPI);

      const sessionStartHandler = mockAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_start'
      )[1];

      await sessionStartHandler({}, mockCtx);

      expect(process.env.KOBOLD_SESSION_ID).toBeDefined();
      expect(process.env.KOBOLD_SESSION_ID).toMatch(/^kobold-/);
    });

    it('should set environment variables', async () => {
      const { default: sessionBridgeExtension } = await import('../../../src/extensions/core/session-bridge-extension.js');
      sessionBridgeExtension(mockAPI);

      const sessionStartHandler = mockAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_start'
      )[1];

      await sessionStartHandler({}, mockCtx);

      expect(process.env.KOBOLD_WORKING_DIR).toBe('/test/workdir');
    });

    it('should generate unique session IDs', async () => {
      const { default: sessionBridgeExtension } = await import('../../../src/extensions/core/session-bridge-extension.js');
      sessionBridgeExtension(mockAPI);

      const sessionStartHandler = mockAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_start'
      )[1];

      // First session
      await sessionStartHandler({}, mockCtx);
      const firstId = process.env.KOBOLD_SESSION_ID;

      // Second session with different ID
      mockCtx.sessionManager.getSessionId.mockReturnValue('/test/session-456');
      await sessionStartHandler({}, mockCtx);
      const secondId = process.env.KOBOLD_SESSION_ID;

      expect(firstId).not.toBe(secondId);
    });
  });

  describe('Session Events', () => {
    it('should handle session_switch', async () => {
      const { default: sessionBridgeExtension } = await import('../../../src/extensions/core/session-bridge-extension.js');
      sessionBridgeExtension(mockAPI);

      const sessionSwitchHandler = mockAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_switch'
      )[1];

      const event = { reason: 'resume', sessionId: '/test/new-session' };
      await sessionSwitchHandler(event, mockCtx);

      expect(process.env.KOBOLD_SESSION_ID).toBeDefined();
      expect(process.env.KOBOLD_SESSION_ID).toMatch(/^kobold-/);
    });

    it('should handle session_fork', async () => {
      const { default: sessionBridgeExtension } = await import('../../../src/extensions/core/session-bridge-extension.js');
      sessionBridgeExtension(mockAPI);

      const sessionForkHandler = mockAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_fork'
      )[1];

      const event = { parentSessionId: '/test/parent' };
      await sessionForkHandler(event, mockCtx);

      expect(process.env.KOBOLD_SESSION_ID).toBeDefined();
      expect(process.env.KOBOLD_SESSION_ID).toMatch(/^kobold-/);
    });
  });

  describe('get_session_info Tool', () => {
    it('should return session information', async () => {
      const { default: sessionBridgeExtension } = await import('../../../src/extensions/core/session-bridge-extension.js');
      sessionBridgeExtension(mockAPI);

      // Trigger session start first
      const sessionStartHandler = mockAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_start'
      )[1];
      await sessionStartHandler({}, mockCtx);

      // Get tool
      const toolCall = mockAPI.registerTool.mock.calls[0];
      const tool = toolCall[0];

      const result = await tool.execute({});

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Session ID:');
      expect(result.content[0].text).toContain('Working Dir:');
      expect(result.details.sessionId).toBeDefined();
      expect(result.details.workingDir).toBe('/test/workdir');
    });

    it('should include session details', async () => {
      const { default: sessionBridgeExtension } = await import('../../../src/extensions/core/session-bridge-extension.js');
      sessionBridgeExtension(mockAPI);

      const sessionStartHandler = mockAPI.on.mock.calls.find(
        (call: any) => call[0] === 'session_start'
      )[1];
      await sessionStartHandler({}, mockCtx);

      const toolCall = mockAPI.registerTool.mock.calls[0];
      const tool = toolCall[0];

      const result = await tool.execute({});

      expect(result.details).toHaveProperty('sessionId');
      expect(result.details).toHaveProperty('workingDir');
    });
  });
});
