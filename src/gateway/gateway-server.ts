/**
 * Gateway Server v2.0 - Koclaw-style Architecture
 *
 * JSON-RPC protocol with method handlers
 * Phase: 1/4 of koclaw migration
 */

import { EventEmitter } from "node:events";
import { PROTOCOL_VERSION, ErrorCodes, errorShape } from "./protocol/index";
import type { RequestFrame, ResponseFrame, EventFrame } from "./protocol/index";
import { gatewayHandlers, getHandler } from "./methods/index";
import type { GatewayContext, GatewayRespond, GatewayClientInfo } from "./methods/types";
import { AgentStore } from "./persistence/AgentStore";
import { loadConfig } from "../config/loader";

const GATEWAY_VERSION = "2";

export interface GatewayConfig {
  port: number;
  host: string;
  cors: boolean;
  heartbeatInterval: number;
  requestTimeoutMs: number;
}

interface WSConnection {
  id: string;
  socket?: WebSocket;
  type: "web" | "discord" | "telegram" | "internal";
  connectedAt: Date;
  lastPing: Date;
  clientInfo?: GatewayClientInfo;
  protocolVersion?: string;
}

// In-memory dedupe store (Phase 3: move to SQLite)
class DedupeStore {
  private store = new Map<string, { ts: number; ok: boolean; payload?: unknown; error?: ReturnType<typeof errorShape> }>();

  get(key: string) {
    return this.store.get(key);
  }

  set(key: string, entry: { ts: number; ok: boolean; payload?: unknown; error?: ReturnType<typeof errorShape> }) {
    this.store.set(key, entry);
    // Auto-cleanup old entries
    if (this.store.size > 10000) {
      this.cleanup(5 * 60 * 1000); // 5 minutes
    }
  }

  cleanup(maxAgeMs: number) {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.ts > maxAgeMs) {
        this.store.delete(key);
      }
    }
  }
}

const DEFAULT_CONFIG: GatewayConfig = {
  port: 7777,
  host: "localhost",
  cors: true,
  heartbeatInterval: 30000,
  requestTimeoutMs: 120000,
};

class RealGatewayServer extends EventEmitter {
  private config: GatewayConfig;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private connections: Map<string, WSConnection> = new Map();
  private running = false;
  private heartbeatTimer: Timer | null = null;
  private dedupe = new DedupeStore();
  private agentStore: AgentStore;
  private context: GatewayContext;

  constructor(config: Partial<GatewayConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Initialize AgentStore with default path
    const dbPath = process.env.HOME 
      ? `${process.env.HOME}/.0xkobold/agents.db`
      : "/tmp/agents.db";
    this.agentStore = new AgentStore(dbPath);

    // Build gateway context (like koclaw's context)
    this.context = {
      deps: {
        getConfig: () => loadConfig(),
        agentStore: {
          list: async () => {
            const agents = await this.agentStore.listActive();
            return agents.map(a => ({ id: a.id, name: a.sessionKey }));
          },
          get: (id: string) => this.agentStore.getAgent(id),
        },
      },
      dedupe: this.dedupe,
      connections: this.connections,
      sessions: new Map(), // Phase 3: persisted sessions
    };
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
          return new Response(null, { status: 204, headers: self.getCORSHeaders() });
        }

        // Health check
        if (url.pathname === "/health") {
          return new Response(JSON.stringify({ ok: true, version: GATEWAY_VERSION }), {
            headers: { "Content-Type": "application/json", ...self.getCORSHeaders() },
          });
        }

        // Protocol info
        if (url.pathname === "/protocol") {
          return new Response(JSON.stringify({ version: PROTOCOL_VERSION, methods: Object.keys(gatewayHandlers) }), {
            headers: { "Content-Type": "application/json", ...self.getCORSHeaders() },
          });
        }

        if (url.pathname === "/ws") {
          const upgraded = server.upgrade(req, {
            data: { type: url.searchParams.get("type") || "web" },
          });
          if (upgraded) return undefined as unknown as Response;
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...self.getCORSHeaders() },
        });
      },

      websocket: {
        open(ws: any) {
          const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const conn: WSConnection = {
            id,
            socket: ws as unknown as WebSocket,
            type: ws.data?.type || "web",
            connectedAt: new Date(),
            lastPing: new Date(),
          };
          self.connections.set(id, conn);
          self.emit("connected", conn);
          console.log(`[Gateway] WebSocket connected: ${id} (${conn.type})`);
        },

        message(ws: any, message: string | Buffer) {
          const conn = self.findConnectionByWs(ws);
          if (!conn) return;
          self.handleMessage(conn, message.toString());
        },

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
    this.emit("started", { port: this.config.port, host: this.config.host });
    console.log(`🐉 Gateway running on ws://${this.config.host}:${this.config.port}/ws`);
  }

  private handleMessage(conn: WSConnection, data: string): void {
    conn.lastPing = new Date();

    try {
      const frame = JSON.parse(data) as RequestFrame | { event: string };

      // Handle ping (special event, not a method)
      if ("event" in frame && frame.event === "ping") {
        this.sendToConnection(conn.id, {
          id: "pong",
          result: { time: Date.now() },
        } as ResponseFrame);
        return;
      }

      // Handle hello/connect
      if ("method" in frame && frame.method === "connect") {
        this.handleConnect(conn, frame as RequestFrame);
        return;
      }

      // Validate request frame
      if (!this.isValidRequestFrame(frame)) {
        this.sendError(conn.id, undefined, ErrorCodes.INVALID_REQUEST, "Invalid request frame");
        return;
      }

      // Route to handler
      this.handleMethod(conn, frame as RequestFrame);
    } catch (err) {
      console.error("[Gateway] Message parse error:", err);
      this.sendError(conn.id, undefined, ErrorCodes.PARSE_ERROR, "JSON parse error");
    }
  }

  private isValidRequestFrame(obj: unknown): obj is RequestFrame {
    if (!obj || typeof obj !== "object") return false;
    const frame = obj as Record<string, unknown>;
    return typeof frame.id === "string" && typeof frame.method === "string" && frame.method.length > 0;
  }

  private handleConnect(conn: WSConnection, frame: RequestFrame): void {
    const params = (frame.params || {}) as { clientName?: string; clientVersion?: string; capabilities?: string[] };

    conn.clientInfo = {
      id: conn.id,
      type: conn.type,
      scopes: ["agent:run", "agent:read"],
      connect: {
        clientName: params.clientName || "unknown",
        clientVersion: params.clientVersion || "0.0.0",
        scopes: ["agent:run", "agent:read"],
        caps: params.capabilities || [],
      },
    };

    this.sendToConnection(conn.id, {
      id: frame.id,
      result: {
        ok: true,
        version: GATEWAY_VERSION,
        protocol: PROTOCOL_VERSION,
        sessionId: conn.id,
        capabilities: Object.keys(gatewayHandlers),
        serverTime: Date.now(),
      },
    });
  }

  private async handleMethod(conn: WSConnection, frame: RequestFrame): Promise<void> {
    const handler = getHandler(frame.method);

    if (!handler) {
      this.sendError(conn.id, frame.id, ErrorCodes.METHOD_NOT_FOUND, `Method not found: ${frame.method}`);
      return;
    }

    // Create respond function
    const respond: GatewayRespond = (ok, result, error, opts) => {
      this.sendToConnection(conn.id, {
        id: frame.id,
        result: ok ? result : undefined,
        error: error,
        expectFinal: opts?.expectFinal ?? true,
      });
    };

    // Execute handler with timeout
    const timeoutMs = this.config.requestTimeoutMs;
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("Request timeout")), timeoutMs);
    });

    try {
      await Promise.race([
        handler({
          params: frame.params,
          respond,
          context: this.context,
          client: conn.clientInfo,
        }),
        timeoutPromise,
      ]);
    } catch (err) {
      console.error(`[Gateway] Handler error for ${frame.method}:`, err);
      this.sendError(conn.id, frame.id, ErrorCodes.INTERNAL_ERROR, String(err));
    }
  }

  private sendToConnection(id: string, frame: ResponseFrame | EventFrame): void {
    const conn = this.connections.get(id);
    if (!conn?.socket) return;

    try {
      conn.socket.send(JSON.stringify(frame));
    } catch (err) {
      console.error("[Gateway] Send error:", err);
    }
  }

  private sendError(connId: string, reqId: string | undefined, code: number, message: string): void {
    this.sendToConnection(connId, {
      id: reqId || "error",
      error: errorShape(code, message),
      expectFinal: true,
    });
  }

  private findConnectionByWs(ws: unknown): WSConnection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.socket === ws) return conn;
    }
    return undefined;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, conn] of this.connections) {
        if (now - conn.lastPing.getTime() > this.config.heartbeatInterval * 3) {
          console.log(`[Gateway] Connection timeout: ${id}`);
          conn.socket?.close();
          this.connections.delete(id);
        }
      }
    }, this.config.heartbeatInterval);
  }

  private getCORSHeaders(): Record<string, string> {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }

  // Public API for channel integrations (backward compatibility)
  registerConnection(
    idOrConfig: string | { type: string; channel?: string; user?: string },
    type?: string,
    socket?: WebSocket
  ): string {
    // Handle object config (legacy API)
    if (typeof idOrConfig === "object") {
      const config = idOrConfig;
      const id = `legacy-${config.type}-${Date.now()}`;
      const conn: WSConnection = {
        id,
        type: config.type as WSConnection["type"],
        connectedAt: new Date(),
        lastPing: new Date(),
      };
      this.connections.set(id, conn);
      this.emit("connection.registered", { id, type: config.type });
      return id;
    }

    // Handle new API (id, type, socket)
    const id = idOrConfig;
    const conn: WSConnection = {
      id,
      socket,
      type: (type || "web") as WSConnection["type"],
      connectedAt: new Date(),
      lastPing: new Date(),
    };
    this.connections.set(id, conn);
    this.emit("connection.registered", { id, type });
    return id;
  }

  removeConnection(id: string): void {
    const conn = this.connections.get(id);
    if (conn?.socket) {
      conn.socket.close();
    }
    this.connections.delete(id);
    this.emit("connection.removed", { id });
  }

  getConnections(): Map<string, WSConnection> {
    return this.connections;
  }

  broadcastToChannel(channelId: string, message: unknown): void {
    for (const [id, conn] of this.connections) {
      if (conn.type === "discord" || conn.type === "telegram") {
        this.sendToConnection(id, {
          id: `broadcast-${Date.now()}`,
          result: message,
          expectFinal: true,
        });
      }
    }
  }

  broadcast(message: unknown): void {
    for (const [id] of this.connections) {
      this.sendToConnection(id, {
        id: `broadcast-${Date.now()}`,
        result: message,
        expectFinal: true,
      });
    }
  }

  stop(): void {
    this.running = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.server?.stop();
    this.emit("stopped");
    console.log("[Gateway] Server stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}

// Singleton instance
let gatewayInstance: RealGatewayServer | null = null;

export function createGateway(config?: Partial<GatewayConfig>): RealGatewayServer {
  return new RealGatewayServer(config);
}

export async function isGatewayRunning(port: number = 7777): Promise<boolean> {
  try {
    // Quick health check to see if gateway is already running
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function startGateway(config?: Partial<GatewayConfig>): RealGatewayServer {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  if (!gatewayInstance) {
    gatewayInstance = new RealGatewayServer(finalConfig);
  }
  gatewayInstance.start();
  return gatewayInstance;
}

export async function startGatewaySafe(config?: Partial<GatewayConfig>): Promise<{ gateway: RealGatewayServer | null; existing: boolean }> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Check if gateway already running on this port
  const isRunning = await isGatewayRunning(finalConfig.port);
  if (isRunning) {
    console.log(`[Gateway] Already running on port ${finalConfig.port}, connecting instead...`);
    return { gateway: null, existing: true };
  }
  
  // Otherwise start new gateway
  return { gateway: startGateway(config), existing: false };
}

export function stopGateway(): void {
  gatewayInstance?.stop();
  gatewayInstance = null;
}

export function getGateway(): RealGatewayServer | null {
  return gatewayInstance;
}

export { RealGatewayServer };
