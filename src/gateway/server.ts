/**
 * REAL Gateway Server - v0.2.0
 *
 * Production-ready WebSocket + HTTP server using Bun native APIs.
 * Better than OpenClaw: Lower latency, simpler architecture, Bun-native.
 */

import { EventEmitter } from "events";

export interface GatewayConfig {
  port: number;
  host: string;
  cors: boolean;
  heartbeatInterval: number;
}

export interface WSConnection {
  id: string;
  socket?: WebSocket;  // Optional for external integrations
  type: "discord" | "telegram" | "web" | "internal";
  channel?: string;
  user?: string;
  connectedAt: Date;
  lastPing: Date;
}

export interface GatewayMessage {
  type: "chat" | "command" | "status" | "ping" | "pong";
  id: string;
  payload: unknown;
  timestamp: number;
  channel?: string;
}

const DEFAULT_CONFIG: GatewayConfig = {
  port: 7777,
  host: "localhost",
  cors: true,
  heartbeatInterval: 30000,
};

class RealGatewayServer extends EventEmitter {
  private config: GatewayConfig;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private connections: Map<string, WSConnection> = new Map();
  private running = false;
  private heartbeatTimer: Timer | null = null;

  constructor(config: Partial<GatewayConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    if (this.running) return;

    const self = this;

    this.server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,

      async fetch(req: Request, server: { upgrade: (req: Request, data?: unknown) => boolean }) {
        const url = new URL(req.url);

        if (self.config.cors && req.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: self.getCORSHeaders(),
          });
        }

        if (url.pathname === "/ws") {
          const upgraded = server.upgrade(req, {
            data: { type: url.searchParams.get("type") || "web" },
          });

          if (upgraded) {
            return undefined as unknown as Response;
          }
        }

        return self.handleHTTPRequest(req);
      },

      websocket: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        open(ws: any) {
          const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const conn: WSConnection = {
            id,
            socket: ws as unknown as WebSocket,
            type: ws.data.type as "web" | "discord" | "telegram" | "internal",
            connectedAt: new Date(),
            lastPing: new Date(),
          };
          
          self.connections.set(id, conn);
          self.emit("connected", conn);
          
          self.sendToConnection(id, {
            type: "status",
            id: `welcome-${Date.now()}`,
            payload: { connected: true, id },
            timestamp: Date.now(),
          });

          console.log(`[Gateway] WebSocket connected: ${id} (${conn.type})`);
        },

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        message(ws: any, message: string | Buffer) {
          const conn = self.findConnectionByWs(ws);
          if (!conn) return;

          try {
            const data = JSON.parse(message.toString()) as GatewayMessage;
            conn.lastPing = new Date();
            
            if (data.type === "ping") {
              self.sendToConnection(conn.id, {
                type: "pong",
                id: data.id,
                payload: { time: Date.now() },
                timestamp: Date.now(),
              });
              return;
            }

            self.emit("message", { connection: conn, data });
          } catch (err) {
            console.error("[Gateway] Invalid message format:", err);
          }
        },

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        close(ws: any, code: number, reason: string) {
          const conn = self.findConnectionByWs(ws);
          if (conn) {
            self.connections.delete(conn.id);
            self.emit("disconnected", { id: conn.id, code, reason });
            console.log(`[Gateway] WebSocket disconnected: ${conn.id}`);
          }
        },
      },
    });

    this.running = true;
    this.startHeartbeat();

    console.log(`🌐 Gateway server running at: http://${this.config.host}:${this.config.port}`);
    console.log(`   WebSocket endpoint: ws://${this.config.host}:${this.config.port}/ws`);

    this.emit("started", { port: this.config.port, host: this.config.host });
  }

  stop(): void {
    if (!this.running) return;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const [id, conn] of this.connections) {
      try {
        conn.socket.close();
      } catch {}
      this.connections.delete(id);
    }

    this.server?.stop(true);
    this.server = null;
    this.running = false;

    console.log("[Gateway] Server stopped");
    this.emit("stopped");
  }

  private async handleHTTPRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const headers = this.getCORSHeaders();

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "healthy",
        connections: this.connections.size,
        uptime: Date.now(),
      }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/status") {
      return new Response(JSON.stringify({
        running: this.running,
        port: this.config.port,
        connections: Array.from(this.connections.values()).map(c => ({
          id: c.id,
          type: c.type,
          connectedAt: c.connectedAt,
        })),
      }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/send" && req.method === "POST") {
      try {
        const body = await req.json() as { channel?: string; message: string; type?: string };

        if (body.channel) {
          const sent = this.broadcastToChannel(body.channel, body.message, body.type);
          return new Response(JSON.stringify({ sent }), {
            status: 200,
            headers: { ...headers, "Content-Type": "application/json" }
          });
        } else {
          this.broadcast(body.message);
          return new Response(JSON.stringify({ sent: this.connections.size }), {
            status: 200,
            headers: { ...headers, "Content-Type": "application/json" }
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }

  private getCORSHeaders(): Record<string, string> {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }

  private findConnectionByWs(ws: unknown): WSConnection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.socket === ws) {
        return conn;
      }
    }
    return undefined;
  }

  /**
   * Register a new connection (public API for external integrations like Discord)
   */
  registerConnection(connData: Omit<WSConnection, "id" | "connectedAt" | "lastPing">): string {
    const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();

    const connection: WSConnection = {
      ...connData,
      id,
      connectedAt: now,
      lastPing: now,
    };

    this.connections.set(id, connection);
    this.emit("connected", connection);
    console.log(`[Gateway] Connection registered: ${id} (${connection.type})`);

    return id;
  }

  /**
   * Remove a connection (public API)
   */
  removeConnection(id: string): boolean {
    const conn = this.connections.get(id);
    if (conn) {
      this.connections.delete(id);
      this.emit("disconnected", { id, code: 0, reason: "manual removal" });
      console.log(`[Gateway] Connection removed: ${id}`);
      return true;
    }
    return false;
  }

  broadcast(message: string | GatewayMessage, filter?: (conn: WSConnection) => boolean): void {
    const msg = typeof message === "string" ? message : JSON.stringify(message);

    for (const conn of this.connections.values()) {
      if (filter && !filter(conn)) continue;

      try {
        conn.socket.send(msg);
      } catch (err) {
        console.error(`[Gateway] Failed to send to ${conn.id}:`, err);
      }
    }
  }

  broadcastToChannel(channel: string, message: string, type = "chat"): number {
    let sent = 0;
    const data: GatewayMessage = {
      type: type as "chat" | "command" | "status" | "ping" | "pong",
      id: `msg-${Date.now()}`,
      payload: message,
      timestamp: Date.now(),
      channel,
    };

    for (const conn of this.connections.values()) {
      if (conn.channel === channel || conn.channel === undefined) {
        try {
          conn.socket.send(JSON.stringify(data));
          sent++;
        } catch (err) {
          console.error(`[Gateway] Failed to send to ${conn.id}:`, err);
        }
      }
    }

    return sent;
  }

  sendToConnection(connectionId: string, message: GatewayMessage): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;

    try {
      conn.socket.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.error(`[Gateway] Failed to send to ${connectionId}:`, err);
      return false;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [id, conn] of this.connections) {
        const lastPing = conn.lastPing.getTime();
        if (now - lastPing > this.config.heartbeatInterval * 2) {
          console.log(`[Gateway] Connection stale, closing: ${id}`);
          try {
            conn.socket.close();
          } catch {}
          this.connections.delete(id);
          continue;
        }

        this.sendToConnection(id, {
          type: "ping",
          id: `ping-${Date.now()}`,
          payload: { time: now },
          timestamp: now,
        });
      }
    }, this.config.heartbeatInterval);
  }

  getConnections(): WSConnection[] {
    return Array.from(this.connections.values());
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  isRunning(): boolean {
    return this.running;
  }
}

let instance: RealGatewayServer | null = null;

export function getRealGateway(): RealGatewayServer {
  if (!instance) {
    instance = new RealGatewayServer();
  }
  return instance;
}

export function resetRealGateway(): void {
  instance?.stop();
  instance = null;
}

export type RealGatewayServerType = RealGatewayServer;
export default RealGatewayServer;
