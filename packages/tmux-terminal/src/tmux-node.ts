/**
 * Tmux Node - Gateway Integration
 *
 * Connects the terminal to 0xKobold gateway as a "node",
 * making tmux sessions remotely accessible to the agent.
 *
 * The agent can create sessions, send commands, and capture output.
 */

import { WebSocket } from 'ws';
import {
  hasTmux,
  getTmuxVersion,
  listSessions,
  sessionExists,
  createSession,
  sendKeys,
  sendCommand,
  capturePane,
  killSession,
  renameSession,
  ensureSession,
  listWindows,
  selectWindow,
  getSessionPath,
  type TmuxSession,
  type CaptureOptions,
} from './tmux-manager.js';

export interface TmuxNodeConfig {
  name?: string;
  gatewayUrl?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface CommandDefinition {
  description: string;
  params?: Record<string, { type: string; description?: string; required?: boolean }>;
  handler: (args: unknown) => Promise<unknown>;
}

interface GatewayMessage {
  id?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
  event?: string;
  data?: unknown;
}

interface PendingCall {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export type NodeEventHandler = (event: string, data: unknown) => void;

/**
 * Tmux Node Client
 *
 * Connects to gateway and exposes tmux commands.
 */
export class TmuxNode {
  private ws: WebSocket | null = null;
  private nodeId: string | null = null;
  private config: Required<TmuxNodeConfig>;
  private callId = 0;
  private pendingCalls = new Map<string, PendingCall>();
  private reconnectAttempts = 0;
  private isConnected = false;
  private eventHandlers: NodeEventHandler[] = [];
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(config: TmuxNodeConfig = {}) {
    this.config = {
      name: config.name || 'tmux-terminal',
      gatewayUrl: config.gatewayUrl || process.env.GATEWAY_URL || 'ws://localhost:7777',
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
    };
  }

  /**
   * Connect to the gateway and register as a tmux node
   */
  async connect(): Promise<void> {
    // Verify tmux is installed
    const tmuxAvailable = await hasTmux();
    if (!tmuxAvailable) {
      throw new Error('tmux is not installed. Please install tmux to use TmuxNode.');
    }

    const version = await getTmuxVersion();
    console.log(`[TmuxNode] tmux version ${version} detected`);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.gatewayUrl);

      this.ws.on('open', async () => {
        console.log(`[TmuxNode] Connected to gateway at ${this.config.gatewayUrl}`);
        
        // Register as a tmux-terminal node
        try {
          const result = await this.call('node.register', {
            type: 'tmux-terminal',
            name: this.config.name,
            commands: Object.keys(this.commands),
          });
          
          this.nodeId = result.nodeId as string;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          console.log(`[TmuxNode] Registered as node ${this.nodeId}`);
          
          // Start polling for session changes
          this.startSessionPolling();
          
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on('close', () => {
        console.log('[TmuxNode] Disconnected from gateway');
        this.isConnected = false;
        this.stopSessionPolling();
        this.attemptReconnect();
      });

      this.ws.on('error', (error: Error) => {
        console.error('[TmuxNode] WebSocket error:', error.message);
        reject(error);
      });
    });
  }

  /**
   * Disconnect from gateway
   */
  async disconnect(): Promise<void> {
    this.stopSessionPolling();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    console.log('[TmuxNode] Disconnected');
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Register an event handler
   */
  onEvent(handler: NodeEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove an event handler
   */
  offEvent(handler: NodeEventHandler): void {
    this.eventHandlers = this.eventHandlers.filter(h => h !== handler);
  }

  /**
   * Command definitions exposed to the agent
   */
  get commands(): Record<string, CommandDefinition> {
    return {
      /**
       * Check if tmux is available
       */
      'tmux.check': {
        description: 'Check if tmux is available and get version',
        handler: async () => {
          const available = await hasTmux();
          const version = available ? await getTmuxVersion() : null;
          return { available, version };
        },
      },

      /**
       * List all tmux sessions
       */
      'tmux.list': {
        description: 'List all tmux sessions',
        handler: async () => {
          const sessions = await listSessions();
          return { sessions };
        },
      },

      /**
       * Create a new tmux session
       */
      'tmux.create': {
        description: 'Create a new tmux session',
        params: {
          name: { type: 'string', required: true, description: 'Session name' },
          command: { type: 'string', required: false, description: 'Initial command to run' },
        },
        handler: async (args: unknown) => {
          const { name, command } = args as { name: string; command?: string };
          const session = await createSession(name, command);
          this.emitEvent('tmux.session', { type: 'created', session });
          return { success: true, session };
        },
      },

      /**
       * Send keys to a session
       */
      'tmux.send': {
        description: 'Send keys/commands to a tmux session',
        params: {
          session: { type: 'string', required: true, description: 'Session name' },
          keys: { type: 'string', required: true, description: 'Keys to send' },
          enter: { type: 'boolean', required: false, description: 'Press Enter after keys' },
        },
        handler: async (args: unknown) => {
          const { session, keys, enter = true } = args as { session: string; keys: string; enter?: boolean };
          await sendKeys(session, keys, { enter });
          return { success: true };
        },
      },

      /**
       * Capture pane output
       */
      'tmux.capture': {
        description: 'Capture output from a tmux session',
        params: {
          session: { type: 'string', required: true, description: 'Session name' },
          lines: { type: 'number', required: false, description: 'Number of lines to capture' },
        },
        handler: async (args: unknown) => {
          const { session, lines = 100 } = args as { session: string; lines?: number };
          const output = await capturePane({ session, lines });
          return { output };
        },
      },

      /**
       * Kill a session
       */
      'tmux.kill': {
        description: 'Kill a tmux session',
        params: {
          session: { type: 'string', required: true, description: 'Session name' },
        },
        handler: async (args: unknown) => {
          const { session } = args as { session: string };
          await killSession(session);
          this.emitEvent('tmux.session', { type: 'killed', session });
          return { success: true };
        },
      },

      /**
       * Rename a session
       */
      'tmux.rename': {
        description: 'Rename a tmux session',
        params: {
          session: { type: 'string', required: true, description: 'Current session name' },
          newName: { type: 'string', required: true, description: 'New session name' },
        },
        handler: async (args: unknown) => {
          const { session, newName } = args as { session: string; newName: string };
          await renameSession(session, newName);
          return { success: true };
        },
      },

      /**
       * Check if session exists
       */
      'tmux.exists': {
        description: 'Check if a tmux session exists',
        params: {
          session: { type: 'string', required: true, description: 'Session name' },
        },
        handler: async (args: unknown) => {
          const { session } = args as { session: string };
          const exists = await sessionExists(session);
          return { exists };
        },
      },

      /**
       * Get session info
       */
      'tmux.info': {
        description: 'Get detailed info about a session',
        params: {
          session: { type: 'string', required: true, description: 'Session name' },
        },
        handler: async (args: unknown) => {
          const { session } = args as { session: string };
          const exists = await sessionExists(session);
          if (!exists) {
            return { exists: false };
          }
          const sessions = await listSessions();
          const info = sessions.find(s => s.name === session);
          const path = await getSessionPath(session);
          const windows = await listWindows(session);
          return { exists: true, info, path, windows };
        },
      },

      /**
       * Ensure session exists (create if not)
       */
      'tmux.ensure': {
        description: 'Ensure a tmux session exists, create if not',
        params: {
          session: { type: 'string', required: true, description: 'Session name' },
          command: { type: 'string', required: false, description: 'Initial command' },
        },
        handler: async (args: unknown) => {
          const { session, command } = args as { session: string; command?: string };
          const result = await ensureSession(session, command);
          return { success: true, session: result };
        },
      },
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Handle incoming message from gateway
   */
  private handleMessage(data: Buffer): void {
    try {
      const message: GatewayMessage = JSON.parse(data.toString());

      // Handle command calls from gateway
      if (message.method && message.id) {
        this.handleCall(message).catch(error => {
          this.sendResponse(message.id, null, {
            code: -1,
            message: error.message,
          });
        });
      }

      // Handle responses to our calls
      if (message.id && (message.result !== undefined || message.error)) {
        const pending = this.pendingCalls.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingCalls.delete(message.id);

          if (message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        }
      }
    } catch (error) {
      console.error('[TmuxNode] Failed to parse message:', error);
    }
  }

  /**
   * Handle a command call from the gateway
   */
  private async handleCall(message: GatewayMessage): Promise<void> {
    const { method, params, id } = message;
    
    if (!method || !id) return;

    const command = this.commands[method];
    if (!command) {
      this.sendResponse(id, null, { code: -1, message: `Unknown method: ${method}` });
      return;
    }

    try {
      const result = await command.handler(params);
      this.sendResponse(id, result, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendResponse(id, null, { code: -1, message });
    }
  }

  /**
   * Send response to gateway
   */
  private sendResponse(id: string, result: unknown, error: { code: number; message: string } | null): void {
    if (!this.ws) return;

    const response: GatewayMessage = { id, result, error };
    this.ws.send(JSON.stringify(response));
  }

  /**
   * Call a method on the gateway
   */
  private call(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to gateway'));
        return;
      }

      const id = `call-${++this.callId}`;
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new Error('Call timeout'));
      }, 30000);

      this.pendingCalls.set(id, { resolve, reject, timeout });

      const message: GatewayMessage = { id, method, params };
      this.ws.send(JSON.stringify(message));
    });
  }

  /**
   * Emit event to all handlers
   */
  private emitEvent(event: string, data: unknown): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, data);
      } catch (error) {
        console.error('[TmuxNode] Event handler error:', error);
      }
    }

    // Also send to gateway
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    }
  }

  /**
   * Start polling for session changes
   */
  private startSessionPolling(): void {
    let lastSessionList: string | null = null;

    this.pollInterval = setInterval(async () => {
      try {
        const sessions = await listSessions();
        const sessionList = JSON.stringify(sessions.map(s => s.name));

        if (sessionList !== lastSessionList) {
          lastSessionList = sessionList;
          this.emitEvent('tmux.sessions', { sessions });
        }
      } catch (error) {
        console.error('[TmuxNode] Polling error:', error);
      }
    }, 5000);
  }

  /**
   * Stop polling
   */
  private stopSessionPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[TmuxNode] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[TmuxNode] Reconnecting (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('[TmuxNode] Reconnect failed:', error.message);
      });
    }, this.config.reconnectInterval);
  }
}

export default TmuxNode;