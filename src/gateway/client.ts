/**
 * Gateway Client - Remote/VPS Support
 * 
 * Connect to remote or local gateway server for distributed architecture.
 * Based on kod/OpenClaw client architecture - simplified for 0xKobold.
 */

import { EventEmitter } from "events";
import { homedir } from "os";
import { join } from "path";
import * as fs from "node:fs/promises";

export interface GatewayClientConfig {
  // Connection
  url: string;                    // ws://localhost:7777 or wss://vps.example.com:7777
  autoReconnect?: boolean;
  reconnectDelay?: number;        // ms
  reconnectAttempts?: number;
  
  // Authentication
  token?: string;                 // JWT/dynamic token for auth
  deviceToken?: string;           // Persistent device token
  password?: string;              // For simple password auth
  
  // Identity
  clientName?: string;
  clientVersion?: string;
  deviceId?: string;
  
  // Capabilities
  capabilities?: string[];        // ["chat", "files", "docker", "channels"]
  
  // Callbacks
  onConnect?: () => void;
  onDisconnect?: (code: number, reason: string) => void;
  onMessage?: (data: unknown) => void;
  onError?: (err: Error) => void;
}

export interface GatewayMessage {
  id: string;
  type: "request" | "response" | "event" | "ping" | "pong";
  channel?: string;
  payload: unknown;
  timestamp: number;
}

export const GATEWAY_STATE = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
} as const;

type GatewayState = typeof GATEWAY_STATE[keyof typeof GATEWAY_STATE];

/**
 * GatewayClient - WebSocket client for connecting to local or remote gateway
 * 
 * Architecture:
 * - Local mode: Connects to ws://localhost:7777
 * - Remote mode: Connects to wss://your-vps.com:7777
 * - Handles auth tokens (local storage in ~/.0xkobold/)
 * - Auto-reconnect with exponential backoff
 * - Heartbeat/ping-pong for connection health
 */
export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<GatewayClientConfig>;
  private state: GatewayState = GATEWAY_STATE.DISCONNECTED;
  private reconnectTimer?: Timer;
  private pingTimer?: Timer;
  private reconnectCount = 0;
  private pendingMessages: GatewayMessage[] = [];
  private messageId = 0;

  constructor(config: GatewayClientConfig) {
    super();
    
    this.config = {
      url: config.url,
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? 1000,
      reconnectAttempts: config.reconnectAttempts ?? 10,
      token: config.token,
      deviceToken: config.deviceToken,
      password: config.password,
      clientName: config.clientName ?? "0xKobold-Client",
      clientVersion: config.clientVersion ?? "0.3.0",
      deviceId: config.deviceId ?? "unknown",
      capabilities: config.capabilities ?? ["chat", "files", "heartbeat"],
      onConnect: config.onConnect,
      onDisconnect: config.onDisconnect,
      onMessage: config.onMessage,
      onError: config.onError,
    };
  }

  /**
   * Connect to gateway
   */
  async connect(): Promise<boolean> {
    if (this.state === GATEWAY_STATE.CONNECTED) {
      return true;
    }

    this.state = GATEWAY_STATE.CONNECTING;
    this.emit("stateChange", this.state);

    try {
      // Determine protocol (ws:// vs wss://)
      const isSecure = this.config.url.startsWith("wss://");
      const wsUrl = this.config.url;

      console.log(`[GatewayClient] Connecting to ${isSecure ? "secure" : "insecure"} WebSocket...`);
      console.log(`[GatewayClient] URL: ${wsUrl}`);

      // Create WebSocket
      this.ws = new WebSocket(wsUrl);

      // Setup handlers
      this.ws.onopen = () => this.handleOpen();
      this.ws.onclose = (event) => this.handleClose(event.code, event.reason);
      this.ws.onerror = (err) => this.handleError(new Error(String(err)));
      this.ws.onmessage = (msg) => this.handleMessage(msg.data);

      // Wait for connection
      await this.waitForConnection();
      return true;
    } catch (err) {
      this.handleError(err as Error);
      return false;
    }
  }

  /**
   * Disconnect from gateway
   */
  disconnect(): void {
    this.clearTimers();
    
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    
    this.state = GATEWAY_STATE.DISCONNECTED;
    this.emit("stateChange", this.state);
  }

  /**
   * Send message to gateway
   */
  send(message: Omit<GatewayMessage, "id" | "timestamp">): string {
    const fullMessage: GatewayMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: Date.now(),
    };

    if (this.state === GATEWAY_STATE.CONNECTED && this.ws) {
      this.ws.send(JSON.stringify(fullMessage));
    } else {
      // Queue for later
      this.pendingMessages.push(fullMessage);
    }

    return fullMessage.id;
  }

  /**
   * Send chat request
   */
  chat(message: string, context?: Record<string, unknown>): string {
    return this.send({
      type: "request",
      channel: "chat",
      payload: {
        message,
        context,
        capabilities: this.config.capabilities,
      },
    });
  }

  /**
   * Send ping to check connection
   */
  ping(): void {
    this.send({
      type: "ping",
      payload: { timestamp: Date.now() },
    });
  }

  /**
   * Get current state
   */
  getState(): GatewayState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === GATEWAY_STATE.CONNECTED;
  }

  /**
   * Load cached device token from disk
   */
  static async loadDeviceToken(): Promise<string | null> {
    const tokenPath = join(homedir(), ".0xkobold", ".device-token");
    try {
      const token = await fs.readFile(tokenPath, "utf-8");
      return token.trim();
    } catch {
      return null;
    }
  }

  /**
   * Save device token to disk
   */
  static async saveDeviceToken(token: string): Promise<void> {
    const tokenPath = join(homedir(), ".0xkobold", ".device-token");
    await fs.mkdir(join(homedir(), ".0xkobold"), { recursive: true });
    await fs.writeFile(tokenPath, token, "utf-8");
    await fs.chmod(tokenPath, 0o600); // Secure permissions
  }

  /**
   * Clear saved device token
   */
  static async clearDeviceToken(): Promise<void> {
    const tokenPath = join(homedir(), ".0xkobold", ".device-token");
    try {
      await fs.unlink(tokenPath);
    } catch {
      // Ignore if doesn't exist
    }
  }

  // Private methods

  private handleOpen(): void {
    console.log("[GatewayClient] Connected successfully");
    this.state = GATEWAY_STATE.CONNECTED;
    this.reconnectCount = 0;
    
    // Send authentication
    this.sendAuth();
    
    // Process queued messages
    this.processPendingMessages();
    
    // Start heartbeat
    this.startHeartbeat();
    
    this.emit("connected");
    this.config.onConnect?.();
  }

  private handleClose(code: number, reason: string): void {
    console.log(`[GatewayClient] Disconnected: ${code} - ${reason}`);
    this.state = GATEWAY_STATE.DISCONNECTED;
    this.emit("disconnected", code, reason);
    this.config.onDisconnect?.(code, reason);
    
    this.clearTimers();
    
    // Attempt reconnect if enabled
    if (this.config.autoReconnect && this.reconnectCount < this.config.reconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private handleError(err: Error): void {
    console.error("[GatewayClient] Error:", err.message);
    this.emit("error", err);
    this.config.onError?.(err);
  }

  private handleMessage(data: string | ArrayBuffer): void {
    try {
      const message: GatewayMessage = JSON.parse(data.toString());
      
      // Handle ping/pong
      if (message.type === "pong") {
        this.emit("pong", message);
        return;
      }
      
      this.emit("message", message);
      this.config.onMessage?.(message);
    } catch (err) {
      console.error("[GatewayClient] Failed to parse message:", err);
    }
  }

  private sendAuth(): void {
    const authPayload: Record<string, unknown> = {
      client: this.config.clientName,
      version: this.config.clientVersion,
      deviceId: this.config.deviceId,
      capabilities: this.config.capabilities,
    };

    if (this.config.token) {
      authPayload.token = this.config.token;
    }
    if (this.config.deviceToken) {
      authPayload.deviceToken = this.config.deviceToken;
    }
    if (this.config.password) {
      authPayload.password = this.config.password;
    }

    this.send({
      type: "request",
      channel: "auth",
      payload: authPayload,
    });
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 10000);

      const onConnect = () => {
        clearTimeout(timeout);
        this.off("error", onError);
        resolve();
      };

      const onError = (err: Error) => {
        clearTimeout(timeout);
        this.off("connected", onConnect);
        reject(err);
      };

      this.once("connected", onConnect);
      this.once("error", onError);
    });
  }

  private scheduleReconnect(): void {
    this.reconnectCount++;
    const delay = this.config.reconnectDelay * Math.min(this.reconnectCount, 5);
    
    console.log(`[GatewayClient] Reconnecting in ${delay}ms (attempt ${this.reconnectCount})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.pingTimer = setInterval(() => {
      if (this.isConnected()) {
        this.ping();
      }
    }, 30000); // Ping every 30s
  }

  private processPendingMessages(): void {
    while (this.pendingMessages.length > 0) {
      const msg = this.pendingMessages.shift();
      if (msg && this.ws) {
        this.ws.send(JSON.stringify(msg));
      }
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${++this.messageId}`;
  }
}

// Factory for creating client with auto-loaded token
export async function createGatewayClient(
  url: string,
  options?: Partial<GatewayClientConfig>
): Promise<GatewayClient> {
  const deviceToken = await GatewayClient.loadDeviceToken();
  
  return new GatewayClient({
    url,
    deviceToken: deviceToken ?? undefined,
    ...options,
  });
}

export default GatewayClient;
