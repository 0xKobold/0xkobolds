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
  socket: WebSocket;
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

interface ServerType {
  upgrade: (req: Request, data?: unknown) => boolean;
}

const DEFAULT_CONFIG: GatewayConfig = {
  port: 7777,
  host: "localhost",
  cors: true,
  heartbeatInterval: 30000, // 30 seconds
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

  /**
   * Start the gateway server
   * Uses Bun's native HTTP + WebSocket server (faster than Node)
   */
  async start(): Promise<void> {
    if (this.running) return;

    const self = this;

    this.server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,
      
      // HTTP routes
      async fetch(req: Request, server: ServerType) {
        const url = new URL(req.url);
        
        // CORS
        if (self.config.cors) {
          if (req.method === "OPTIONS") {
            return new Response(null, {
              status: 204,
              headers: self.getCORSHeaders(),
            });
          }
        }

        // WebSocket upgrade
        if (url.pathname === "/ws") {
          const upgraded = server.upgrade(req, {
            data: { type: url.searchParams.get("type") || "web" },
          });
          
          if (upgraded) {
            return undefined as unknown as Response;
          }
        }

        // HTTP API routes
        return self.handleHTTPRequest(req);
      },

      // WebSocket handlers
      websocket: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        open(ws: any) {
          const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const conn: WSConnection = {
            id,
            socket: ws,
            type: ws.data?.type || "web",
            connectedAt: new Date(),
            lastPing: new Date(),
          };
          
          self.connections.set(id, conn);
          self.emit("connected", conn);
          
          // Send welcome
          self.sendToConnection(id, {
            type: "status",
            id: `welcome-${Date.now()}`,
            payload: { connected: true, id },
            timestamp: Date.now(),
          });

          console.log(`[Gateway] WebSocket connected: ${id} (${conn.type})`);
        },

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
        message(ws: any, message: string | Buffer) {
          const conn = self.findConnectionByWs(ws);
          if (!conn) return;

          try {
            const data = JSON.parse(message.toString()) as GatewayMessage;
            
            // Update last ping
            conn.lastPing = new Date();
            
            // Handle ping/pong
            if (data.type === "ping") {
              self.sendToConnection(conn.id, {
                type: "pong",
                id: data.id,
                payload: { time: Date.now() },
                timestamp: Date.now(),
              });
              return;
            }

            // Emit for processing
            self.emit("message", { connection: conn, data });
          } catch (err) {
            console.error("[Gateway] Invalid message format:", err);
          }
        },

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
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

  /**
   * Stop the server
   */
  stop(): void {
    if (!this.running) return;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close all connections
    for (const [id, conn] of this.connections) {
      try {
        conn.socket.close();
      } catch {} // eslint-disable-line
      this.connections.delete(id);
    }

    this.server?.stop(true);
    this.server = null;
    this.running = false;
    
    console.log("[Gateway] Server stopped");
    this.emit("stopped");
  }

  /**
   * Handle HTTP requests
   */
  private async handleHTTPRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const headers = this.getCORSHeaders();

    // Health check
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

    // Status endpoint
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

    // Send message endpoint
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

    // Default 404
    return new Response(JSON.stringify({ error: "Not found" }), { 
      status: 404, 
      headers: { ...headers, "Content-Type": "application/json" } 
    });
  }

  /**
   * Get CORS headers
   */
  private getCORSHeaders(): Record<string, string> {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }

  /**
   * Find connection by WebSocket
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private findConnectionByWs(ws: any): WSConnection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.socket === ws) {
        return conn;
      }
    }
    return undefined;
  }

  /**
   * Broadcast to all connections
   */
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

  /**
   * Broadcast to specific channel
   */
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

  /**
   * Send to specific connection
   */
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

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      
      for (const [id, conn] of this.connections) {
        // Check if connection is stale (2 missed heartbeats)
        const lastPing = conn.lastPing.getTime();
        if (now - lastPing > this.config.heartbeatInterval * 2) {
          console.log(`[Gateway] Connection stale, closing: ${id}`);
          try {
            conn.socket.close();
          } catch {} // eslint-disable-line
          this.connections.delete(id);
          continue;
        }

        // Send ping
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

// Singleton
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
