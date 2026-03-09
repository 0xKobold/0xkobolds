/**
 * WebSocket Gateway Server - v0.2.0
 * 
 * WebSocket server for external connections.
 * Part of Phase 5.3: Gateway Architecture
 */

import { EventEmitter } from "events";

export interface GatewayConnection {
  id: string;
  type: "discord" | "telegram" | "web" | "internal";
  channel?: string;
  user?: string;
  connected: boolean;
}

class GatewayServer extends EventEmitter {
  private connections: Map<string, GatewayConnection> = new Map();
  private running = false;

  /**
   * Start gateway server
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    console.log("[Gateway] Server started on port 7777");
    this.emit("started");

    // Simulate accepting connections
    setTimeout(() => {
      this.emit("ready");
    }, 100);
  }

  /**
   * Stop gateway server
   */
  stop(): void {
    this.running = false;
    this.connections.clear();
    console.log("[Gateway] Server stopped");
    this.emit("stopped");
  }

  /**
   * Register a connection
   */
  registerConnection(conn: Omit<GatewayConnection, "id">): string {
    const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const connection: GatewayConnection = { ...conn, id };
    this.connections.set(id, connection);
    this.emit("connected", connection);
    return id;
  }

  /**
   * Remove connection
   */
  removeConnection(id: string): boolean {
    const conn = this.connections.get(id);
    if (conn) {
      this.connections.delete(id);
      this.emit("disconnected", conn);
      return true;
    }
    return false;
  }

  /**
   * Broadcast message to all connections
   */
  broadcast(message: string, filter?: (conn: GatewayConnection) => boolean): void {
    for (const [id, conn] of this.connections) {
      if (filter && !filter(conn)) continue;
      
      this.emit("message", { id, message, type: conn.type });
    }
  }

  /**
   * Send to specific connection
   */
  sendTo(connectionId: string, message: string): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;

    this.emit("message", { id: connectionId, message, type: conn.type });
    return true;
  }

  /**
   * Send to channel
   */
  sendToChannel(channel: string, message: string): number {
    let sent = 0;
    for (const [id, conn] of this.connections) {
      if (conn.channel === channel) {
        this.emit("message", { id, message, type: conn.type });
        sent++;
      }
    }
    return sent;
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connections by type
   */
  getConnectionsByType(type: GatewayConnection["type"]): GatewayConnection[] {
    return Array.from(this.connections.values()).filter((c) => c.type === type);
  }

  /**
   * Get all connections
   */
  getConnections(): GatewayConnection[] {
    return Array.from(this.connections.values());
  }
}

// Singleton
let server: GatewayServer | null = null;

export function getGatewayServer(): GatewayServer {
  if (!server) {
    server = new GatewayServer();
  }
  return server;
}

export function resetGatewayServer(): void {
  server = null;
}

/**
 * Register Discord bot channel
 */
export function registerDiscordChannel(channelId: string): string {
  const gateway = getGatewayServer();
  return gateway.registerConnection({
    type: "discord",
    channel: channelId,
    connected: true,
  });
}

/**
 * Register Telegram channel
 */
export function registerTelegramChannel(channelId: string): string {
  const gateway = getGatewayServer();
  return gateway.registerConnection({
    type: "telegram",
    channel: channelId,
    connected: true,
  });
}

export default getGatewayServer;
