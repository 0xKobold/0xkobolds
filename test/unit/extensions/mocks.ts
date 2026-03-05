/**
 * Extension API Mocks
 * 
 * Mock implementations of @mariozechner/pi-coding-agent ExtensionAPI
 * for testing extensions in isolation.
 */

export interface MockMessage {
  content: Array<{ type: string; text?: string }>;
  customType?: string;
  display?: { type: string; text: string };
  details?: Record<string, unknown>;
}

export interface MockTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text?: string }>;
    details?: Record<string, unknown>;
  }>;
}

export interface MockCommand {
  name: string;
  description: string;
  handler?: (args?: Record<string, unknown>, ctx?: MockContext) => Promise<void>;
  execute?: () => Promise<void>;
}

export interface MockContext {
  ui?: {
    notify?: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
  };
  sessionManager?: {
    getSystemPrompt?: () => string;
    setSystemPrompt?: (prompt: string) => void;
  };
}

export interface MockExtensionAPI {
  registerTool: (tool: MockTool) => void;
  registerCommand: (name: string, command: Omit<MockCommand, 'name'>) => void;
  registerFlag: (name: string, config: {
    description: string;
    type: 'string' | 'boolean' | 'number';
    default: unknown;
  }) => void;
  registerStatusBarItem: (name: string, config: { render: () => string }) => void;
  sendMessage: (message: MockMessage) => void;
  getFlag: (name: string) => unknown;
  setFlag: (name: string, value: unknown) => void;
  on: (event: string, handler: (event?: unknown, ctx?: MockContext) => void | Promise<void>) => void;
  emit: (event: string, payload?: unknown) => Promise<void>;
}

export interface MockExtensionState {
  tools: Map<string, MockTool>;
  commands: Map<string, MockCommand>;
  flags: Map<string, { config: { default: unknown }; value: unknown }>;
  statusBarItems: Map<string, { render: () => string }>;
  messages: MockMessage[];
  eventHandlers: Map<string, Array<(event?: unknown, ctx?: MockContext) => void | Promise<void>>>;
}

/**
 * Create a mock ExtensionAPI for testing
 */
export function createMockExtensionAPI(): MockExtensionAPI & { state: MockExtensionState } {
  const state: MockExtensionState = {
    tools: new Map(),
    commands: new Map(),
    flags: new Map(),
    statusBarItems: new Map(),
    messages: [],
    eventHandlers: new Map(),
  };

  const api: MockExtensionAPI = {
    registerTool: (tool: MockTool) => {
      state.tools.set(tool.name, tool);
    },

    registerCommand: (name: string, command: Omit<MockCommand, 'name'>) => {
      state.commands.set(name, { name, ...command });
    },

    registerFlag: (name: string, config: { description: string; type: string; default: unknown }) => {
      state.flags.set(name, { config, value: config.default });
    },

    registerStatusBarItem: (name: string, config: { render: () => string }) => {
      state.statusBarItems.set(name, config);
    },

    sendMessage: (message: MockMessage) => {
      state.messages.push(message);
    },

    getFlag: (name: string): unknown => {
      const flag = state.flags.get(name);
      return flag?.value ?? flag?.config?.default;
    },

    setFlag: (name: string, value: unknown) => {
      const flag = state.flags.get(name);
      if (flag) {
        flag.value = value;
      }
    },

    on: (event: string, handler: (event?: unknown, ctx?: MockContext) => void | Promise<void>) => {
      if (!state.eventHandlers.has(event)) {
        state.eventHandlers.set(event, []);
      }
      state.eventHandlers.get(event)!.push(handler);
    },

    emit: async (event: string, payload?: unknown) => {
      const handlers = state.eventHandlers.get(event) || [];
      const mockCtx: MockContext = {
        ui: {
          notify: (msg: string) => {
            // Mock notify implementation
          },
        },
        sessionManager: {
          getSystemPrompt: () => '',
          setSystemPrompt: () => {},
        },
      };
      for (const handler of handlers) {
        await handler(payload, mockCtx);
      }
    },
  };

  return Object.assign(api, { state });
}

/**
 * Create a mock context for testing commands
 */
export function createMockContext(overrides?: Partial<MockContext>): MockContext {
  const notified: Array<{ message: string; type: string }> = [];
  let systemPrompt = '';

  return {
    ui: {
      notify: (message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
        notified.push({ message, type });
      },
    },
    sessionManager: {
      getSystemPrompt: () => systemPrompt,
      setSystemPrompt: (prompt: string) => { systemPrompt = prompt; },
    },
    ...overrides,
  };
}

/**
 * Helper to trigger an event
 */
export async function triggerEvent(
  api: MockExtensionAPI & { state: MockExtensionState },
  event: string,
  payload?: unknown
): Promise<void> {
  await api.emit(event, payload);
}

/**
 * Helper to get all captured messages
 */
export function getMessages(api: MockExtensionAPI & { state: MockExtensionState }): MockMessage[] {
  return [...api.state.messages];
}

/**
 * Helper to find message by type
 */
export function findMessageByType(
  api: MockExtensionAPI & { state: MockExtensionState },
  customType: string
): MockMessage | undefined {
  return api.state.messages.find(m => m.customType === customType);
}
