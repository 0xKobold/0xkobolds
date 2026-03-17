/**
 * Node Client for 0xKobold Gateway
 *
 * Connects as a "node" role and exposes commands to the agent.
 * This enables bidirectional communication: agent → node and node → agent.
 *
 * Usage:
 *   const client = new NodeClient({
 *     name: 'desktop-pet',
 *     type: 'desktop-pet',
 *     gatewayUrl: 'ws://localhost:7777',
 *     commands: {
 *       'pet.show': async () => { ... },
 *       'pet.animate': async (args) => { ... },
 *     }
 *   });
 *   await client.connect();
 */

export interface CommandDefinition {
  description: string;
  params?: JSONSchema;
  handler: (args: unknown) => Promise<unknown>;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface JSONSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

export interface NodeConfig {
  name: string;
  type: string;
  gatewayUrl: string;
  commands: Record<string, CommandDefinition>;
  metadata?: Record<string, unknown>;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface GatewayMessage {
  id?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
  event?: string;
}

interface PendingCall {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export type NodeEventHandler = (event: string, data: unknown) => void;

export class NodeClient {
  private ws: WebSocket | null = null;
  private nodeId: string | null = null;
  private callId = 0;
  private pendingCalls = new Map<string, PendingCall>();
  private reconnectAttempts = 0;
  private isConnected = false;
  private eventHandlers: NodeEventHandler[] = [];

  constructor(private config: NodeConfig) {}

  /**
   * Connect to the gateway and register as a node
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.config.gatewayUrl}/ws?role=node&type=${this.config.type}&name=${this.config.name}`;

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log(`[NodeClient] Connected to gateway at ${url}`);
          this.reconnectAttempts = 0;
          this.isConnected = true;

          // Register commands
          this.registerCommands();

          // Wait for registration confirmation
          const checkConnected = setInterval(() => {
            if (this.nodeId) {
              clearInterval(checkConnected);
              resolve();
            }
          }, 100);

          // Timeout after 10s
          setTimeout(() => {
            clearInterval(checkConnected);
            if (!this.nodeId) {
              reject(new Error('Registration timeout'));
            }
          }, 10000);
        };

        this.ws.onmessage = (event) => {
          try {
            const msg: GatewayMessage = JSON.parse(event.data.toString());
            this.handleMessage(msg);
          } catch (err) {
            console.error('[NodeClient] Failed to parse message:', err);
          }
        };

        this.ws.onclose = (event) => {
          console.log(`[NodeClient] Disconnected: ${event.code} ${event.reason}`);
          this.isConnected = false;
          this.nodeId = null;

          // Auto-reconnect
          if (this.config.reconnectInterval && this.config.maxReconnectAttempts) {
            if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
              this.reconnectAttempts++;
              console.log(`[NodeClient] Reconnecting in ${this.config.reconnectInterval}ms (attempt ${this.reconnectAttempts})`);
              setTimeout(() => this.connect(), this.config.reconnectInterval);
            }
          }
        };

        this.ws.onerror = (err) => {
          console.error('[NodeClient] WebSocket error:', err);
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Register commands with the gateway
   */
  private registerCommands(): void {
    const commands: Record<string, { description: string; params?: JSONSchema }> = {};

    for (const [name, def] of Object.entries(this.config.commands)) {
      commands[name] = {
        description: def.description,
        params: def.params,
      };
    }

    this.send({
      id: 'register',
      method: 'node.register',
      params: {
        name: this.config.name,
        type: this.config.type,
        version: '1.0.0',
        commands,
        metadata: this.config.metadata,
      },
    });
  }

  /**
   * Handle incoming message from gateway
   */
  private handleMessage(msg: GatewayMessage): void {
    // Handle registration response
    if (msg.id === 'register' && msg.result) {
      const result = msg.result as { nodeId?: string; ok?: boolean };
      if (result.nodeId) {
        this.nodeId = result.nodeId;
        console.log(`[NodeClient] Registered as node: ${this.nodeId}`);
      }
      return;
    }

    // Handle welcome message
    if (msg.result && (msg.result as { role?: string }).role === 'node') {
      console.log('[NodeClient] Received node welcome, sending registration...');
      return;
    }

    // Handle responses to our calls
    if (msg.id && this.pendingCalls.has(msg.id)) {
      const { resolve, reject } = this.pendingCalls.get(msg.id)!;
      this.pendingCalls.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message));
      } else {
        resolve(msg.result);
      }
      return;
    }

    // Handle incoming command calls from agent
    if (msg.method && this.config.commands[msg.method]) {
      this.handleCommand(msg.id || 'no-id', msg.method, msg.params);
      return;
    }

    // Handle events from gateway
    if (msg.event) {
      // Broadcast to event handlers
      for (const handler of this.eventHandlers) {
        try {
          handler(msg.event, msg.result);
        } catch (err) {
          console.error('[NodeClient] Event handler error:', err);
        }
      }
    }
  }

  /**
   * Handle an incoming command from the agent
   */
  private async handleCommand(callId: string, command: string, args: unknown): Promise<void> {
    const def = this.config.commands[command];
    if (!def) {
      this.send({
        id: callId,
        error: { code: -32001, message: `Command not found: ${command}` },
      });
      return;
    }

    try {
      const result = await def.handler(args);
      this.send({ id: callId, result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.send({
        id: callId,
        error: { code: -32000, message: error.message },
      });
    }
  }

  /**
   * Send a message to the gateway
   */
  private send(msg: GatewayMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Send an event to the agent (push notification)
   */
  sendEvent(event: string, data: unknown): void {
    this.send({
      event: 'node.event',
      params: {
        nodeId: this.nodeId,
        event,
        data,
        timestamp: Date.now(),
      },
    });
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
    const index = this.eventHandlers.indexOf(handler);
    if (index >= 0) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Get current node ID
   */
  getNodeId(): string | null {
    return this.nodeId;
  }

  /**
   * Check if connected
   */
  isNodeConnected(): boolean {
    return this.isConnected && this.nodeId !== null;
  }

  /**
   * Disconnect from gateway
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Graceful disconnect');
      this.ws = null;
    }
    this.nodeId = null;
    this.isConnected = false;
  }
}

export default NodeClient;