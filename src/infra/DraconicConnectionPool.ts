/**
 * 🌊 Draconic Connection Pool
 *
 * Superior to OpenClaw's connection-per-request:
 * - HTTP/2 multiplexing with keep-alive
 * - Connection health monitoring
 * - Automatic reaping of dead connections
 * - Load balancing across instances
 * - Smart routing based on provider capabilities
 *
 * "Faster than a striking wyrm"
 */

import { ClientHttp2Session, ClientHttp2Stream, connect } from "node:http2";
import { EventEmitter } from "node:events";

// Connection state
export enum ConnectionHealth {
  HEALTHY = "healthy",       // Active and responsive
  DEGRADED = "degraded",     // Sluggish but working
  UNHEALTHY = "unhealthy",   // Likely dead
  DEAD = "dead",             // Confirmed dead
}

// Connection slot in the pool
export interface ConnectionSlot {
  id: string;
  provider: string;
  model: string;
  session: ClientHttp2Session;
  streams: Map<string, ClientHttp2Stream>;
  lastUsed: number;
  createdAt: number;
  health: ConnectionHealth;
  requestCount: number;
  errorCount: number;
  averageLatency: number;
  currentLatency: number;
}

// Connection options
export interface ConnectionOptions {
  provider: string;
  model: string;
  host: string;
  port?: number;
  secure?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
}

// Pool configuration
export interface PoolConfig {
  maxConnections: number;        // Per provider
  maxStreamsPerConnection: number; // HTTP/2 multiplexing
  keepAliveMs: number;           // Keep-alive duration
  healthCheckIntervalMs: number; // Health check frequency
  reapIntervalMs: number;          // Dead connection cleanup
  connectionTimeoutMs: number;   // Connect timeout
  requestTimeoutMs: number;      // Request timeout
  degradedThresholdMs: number;     // Latency threshold for degraded
}

// Pool statistics
export interface PoolStats {
  totalConnections: number;
  byProvider: Record<string, number>;
  byHealth: Record<ConnectionHealth, number>;
  activeStreams: number;
  averageLatency: number;
  requestsPerSecond: number;
  errorRate: number;
}

// Performance metrics
interface PerformanceMetrics {
  requests: number;
  errors: number;
  latencySum: number;
  startTime: number;
}

/**
 * 🌊 Draconic Connection Pool
 *
 * Superior to OpenClaw: Reuses connections, monitors health,
 * intelligently routes based on performance.
 */
export class DraconicConnectionPool extends EventEmitter {
  private connections = new Map<string, ConnectionSlot>();
  private providerConnections = new Map<string, Set<string>>();
  private config: PoolConfig;
  private metrics: PerformanceMetrics;
  private healthCheckTimer?: NodeJS.Timer;
  private reapTimer?: NodeJS.Timer;

  // Default configuration
  private static readonly DEFAULT_CONFIG: PoolConfig = {
    maxConnections: 10,
    maxStreamsPerConnection: 100,    // HTTP/2 multiplexing
    keepAliveMs: 300000,              // 5 minutes
    healthCheckIntervalMs: 30000,     // 30 seconds
    reapIntervalMs: 60000,            // 1 minute
    connectionTimeoutMs: 10000,     // 10 seconds
    requestTimeoutMs: 120000,         // 2 minutes
    degradedThresholdMs: 5000,      // 5 seconds
  };

  private static instance: DraconicConnectionPool | null = null;

  static getInstance(config?: Partial<PoolConfig>): DraconicConnectionPool {
    if (!DraconicConnectionPool.instance) {
      DraconicConnectionPool.instance = new DraconicConnectionPool(config);
    }
    return DraconicConnectionPool.instance;
  }

  constructor(config?: Partial<PoolConfig>) {
    super();
    this.config = { ...DraconicConnectionPool.DEFAULT_CONFIG, ...config };
    this.metrics = { requests: 0, errors: 0, latencySum: 0, startTime: Date.now() };
    this.startMaintenance();
  }

  // ======== Connection Management ========

  /**
   * Acquire a connection slot
   * Superior to OpenClaw: Reuses healthy connections
   */
  async acquire(options: ConnectionOptions): Promise<ConnectionSlot> {
    const providerKey = `${options.provider}:${options.model}`;

    // 1. Try to find existing healthy connection
    const existing = this.findHealthyConnection(providerKey);
    if (existing) {
      existing.lastUsed = Date.now();
      existing.requestCount++;
      this.emit("connection.reused", { slot: existing });
      return existing;
    }

    // 2. Check connection limit
    const providerConns = this.providerConnections.get(providerKey) ?? new Set();
    if (providerConns.size >= this.config.maxConnections) {
      // Reap oldest and create new
      await this.reapOldest(providerKey);
    }

    // 3. Create new connection
    const slot = await this.createConnection(options);
    this.connections.set(slot.id, slot);

    if (!this.providerConnections.has(providerKey)) {
      this.providerConnections.set(providerKey, new Set());
    }
    this.providerConnections.get(providerKey)!.add(slot.id);

    this.emit("connection.created", { slot });
    return slot;
  }

  /**
   * Release a connection back to the pool
   */
  release(slot: ConnectionSlot): void {
    slot.lastUsed = Date.now();
    this.emit("connection.released", { slot: slot.id });
  }

  /**
   * Create new HTTP/2 connection
   */
  private async createConnection(options: ConnectionOptions): Promise<ConnectionSlot> {
    const protocol = options.secure !== false ? "https" : "http";
    const port = options.port ?? (options.secure !== false ? 443 : 80);
    const authority = `${protocol}://${options.host}:${port}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout to ${authority}`));
      }, this.config.connectionTimeoutMs);

      try {
        const session = connect(authority, {
          rejectUnauthorized: false, // For local dev
        });

        session.on("connect", () => {
          clearTimeout(timeout);

          const slot: ConnectionSlot = {
            id: `conn_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            provider: options.provider,
            model: options.model,
            session,
            streams: new Map(),
            lastUsed: Date.now(),
            createdAt: Date.now(),
            health: ConnectionHealth.HEALTHY,
            requestCount: 0,
            errorCount: 0,
            averageLatency: 0,
            currentLatency: 0,
          };

          // Monitor session health
          session.on("error", (err) => {
            console.error(`[ConnectionPool] Session error: ${err.message}`);
            slot.health = ConnectionHealth.UNHEALTHY;
            slot.errorCount++;
            this.emit("connection.error", { slot: slot.id, error: err });
          });

          session.on("goaway", () => {
            console.log(`[ConnectionPool] GOAWAY received: ${slot.id}`);
            slot.health = ConnectionHealth.DEAD;
          });

          session.on("close", () => {
            slot.health = ConnectionHealth.DEAD;
            this.connections.delete(slot.id);
            this.providerConnections.get(`${options.provider}:${options.model}`)?.delete(slot.id);
          });

          resolve(slot);
        });

        session.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /**
   * Find healthy connection for provider
   */
  private findHealthyConnection(providerKey: string): ConnectionSlot | null {
    const ids = this.providerConnections.get(providerKey);
    if (!ids) return null;

    // Score connections by health and load
    let best: ConnectionSlot | null = null;
    let bestScore = -Infinity;

    for (const id of ids) {
      const slot = this.connections.get(id);
      if (!slot) continue;
      if (slot.health === ConnectionHealth.DEAD) continue;

      // Skip if too many streams
      if (slot.streams.size >= this.config.maxStreamsPerConnection) continue;

      // Calculate score (higher = better)
      const healthScore = {
        [ConnectionHealth.HEALTHY]: 100,
        [ConnectionHealth.DEGRADED]: 50,
        [ConnectionHealth.UNHEALTHY]: 10,
        [ConnectionHealth.DEAD]: 0,
      }[slot.health];

      const loadScore = 100 - (slot.streams.size / this.config.maxStreamsPerConnection) * 100;
      const recencyScore = Math.max(0, 100 - (Date.now() - slot.lastUsed) / 1000);

      const score = healthScore * 0.4 + loadScore * 0.4 + recencyScore * 0.2;

      if (score > bestScore) {
        best = slot;
        bestScore = score;
      }
    }

    return best;
  }

  /**
   * Reap oldest connection for provider
   */
  private async reapOldest(providerKey: string): Promise<void> {
    const ids = this.providerConnections.get(providerKey);
    if (!ids || ids.size === 0) return;

    let oldest: ConnectionSlot | null = null;

    for (const id of ids) {
      const slot = this.connections.get(id);
      if (!slot) continue;
      if (!oldest || slot.lastUsed < oldest.lastUsed) {
        oldest = slot;
      }
    }

    if (oldest) {
      await this.destroyConnection(oldest.id);
    }
  }

  /**
   * Destroy a connection
   */
  async destroyConnection(id: string): Promise<void> {
    const slot = this.connections.get(id);
    if (!slot) return;

    // Close all streams
    for (const [streamId, stream] of slot.streams) {
      stream.destroy();
      slot.streams.delete(streamId);
    }

    // Close session
    slot.session.close();

    // Remove from tracking
    this.connections.delete(id);
    const providerKey = `${slot.provider}:${slot.model}`;
    this.providerConnections.get(providerKey)?.delete(id);

    this.emit("connection.destroyed", { slot: id });
  }

  // ======== HTTP/2 Request ========

  /**
   * Make HTTP/2 request through pool
   * Superior to OpenClaw: Multiplexed streams
   */
  async request(
    slot: ConnectionSlot,
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string | string[]>;
      body?: string | Buffer;
      timeout?: number;
    } = {}
  ): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
    const startTime = Date.now();
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        stream.destroy();
        reject(new Error(`Request timeout after ${options.timeout ?? this.config.requestTimeoutMs}ms`));
      }, options.timeout ?? this.config.requestTimeoutMs);

      const headers: Record<string, string | string[]> = {
        ":method": options.method ?? "GET",
        ":path": path,
        ":scheme": "https",
        ":authority": (slot.session as any).authority ?? "api.openai.com",
        ...options.headers,
      };

      const stream = slot.session.request(headers);
      slot.streams.set(streamId, stream);

      const chunks: Buffer[] = [];
      let responseHeaders: Record<string, string> = {};
      let status = 0;

      stream.on("response", (header) => {
        responseHeaders = header as Record<string, string>;
        status = Number(header[":status"] ?? 0);
      });

      stream.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      stream.on("end", () => {
        clearTimeout(timeout);
        slot.streams.delete(streamId);

        const latency = Date.now() - startTime;
        this.updateLatency(slot, latency);
        this.metrics.requests++;
        this.metrics.latencySum += latency;

        resolve({
          status,
          headers: responseHeaders,
          body: Buffer.concat(chunks),
        });
      });

      stream.on("error", (err) => {
        clearTimeout(timeout);
        slot.streams.delete(streamId);
        slot.errorCount++;
        this.metrics.errors++;

        this.emit("request.error", { slot: slot.id, error: err });
        reject(err);
      });

      if (options.body) {
        stream.write(options.body);
      }
      stream.end();
    });
  }

  // ======== Smart Routing (Superior to OpenClaw) ========

  /**
   * Route to best available instance
   * OpenClaw doesn't have intelligent routing
   */
  async routeToBestInstance(provider: string, model: string): Promise<ConnectionSlot> {
    const providerKey = `${provider}:${model}`;
    const candidates: ConnectionSlot[] = [];

    const ids = this.providerConnections.get(providerKey);
    if (ids) {
      for (const id of ids) {
        const slot = this.connections.get(id);
        if (slot && slot.health !== ConnectionHealth.DEAD) {
          candidates.push(slot);
        }
      }
    }

    if (candidates.length === 0) {
      // No existing connections, create one
      return this.acquire({ provider, model, host: this.getProviderHost(provider) });
    }

    // Score each candidate
    let best = candidates[0];
    let bestScore = this.calculateInstanceScore(best);

    for (let i = 1; i < candidates.length; i++) {
      const score = this.calculateInstanceScore(candidates[i]);
      if (score > bestScore) {
        best = candidates[i];
        bestScore = score;
      }
    }

    return best;
  }

  /**
   * Calculate instance quality score
   * Higher = better
   */
  private calculateInstanceScore(slot: ConnectionSlot): number {
    const latencyScore = Math.max(0, 100 - slot.averageLatency / 10);
    const healthScore = {
      [ConnectionHealth.HEALTHY]: 100,
      [ConnectionHealth.DEGRADED]: 50,
      [ConnectionHealth.UNHEALTHY]: 10,
      [ConnectionHealth.DEAD]: 0,
    }[slot.health];

    const errorRate = slot.requestCount > 0 ? slot.errorCount / slot.requestCount : 0;
    const reliabilityScore = (1 - errorRate) * 100;

    const loadScore = 100 - (slot.streams.size / this.config.maxStreamsPerConnection) * 100;

    return latencyScore * 0.3 + healthScore * 0.3 + reliabilityScore * 0.2 + loadScore * 0.2;
  }

  /**
   * Get provider host from name
   */
  private getProviderHost(provider: string): string {
    const hosts: Record<string, string> = {
      anthropic: "api.anthropic.com",
      openai: "api.openai.com",
      ollama: "localhost",
    };

    return hosts[provider.toLowerCase()] ?? "localhost";
  }

  // ======== Health Management ========

  /**
   * Update connection latency and health
   */
  private updateLatency(slot: ConnectionSlot, latency: number): void {
    slot.currentLatency = latency;

    // Exponential moving average
    const alpha = 0.3;
    if (slot.averageLatency === 0) {
      slot.averageLatency = latency;
    } else {
      slot.averageLatency = alpha * latency + (1 - alpha) * slot.averageLatency;
    }

    // Update health based on latency
    if (slot.averageLatency > this.config.degradedThresholdMs * 2) {
      slot.health = ConnectionHealth.UNHEALTHY;
    } else if (slot.averageLatency > this.config.degradedThresholdMs) {
      slot.health = ConnectionHealth.DEGRADED;
    } else {
      slot.health = ConnectionHealth.HEALTHY;
    }
  }

  /**
   * Start maintenance timers
   */
  private startMaintenance(): void {
    // Health check
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth();
    }, this.config.healthCheckIntervalMs);

    // Reap dead connections
    this.reapTimer = setInterval(() => {
      this.reapDeadConnections();
    }, this.config.reapIntervalMs);
  }

  /**
   * Check health of all connections
   */
  private checkHealth(): void {
    for (const [id, slot] of this.connections) {
      // Ping with settings frame or check state
      if (slot.session.destroyed || slot.session.closed) {
        slot.health = ConnectionHealth.DEAD;
        continue;
      }

      // Check if idle too long
      const idleTime = Date.now() - slot.lastUsed;
      if (idleTime > this.config.keepAliveMs) {
        this.destroyConnection(id).catch(console.error);
      }
    }

    this.emit("health.checked", { connections: this.connections.size });
  }

  /**
   * Destroy all dead connections
   */
  async reapDeadConnections(): Promise<void> {
    const toReap: string[] = [];

    for (const [id, slot] of this.connections) {
      if (slot.health === ConnectionHealth.DEAD) {
        toReap.push(id);
      }
    }

    for (const id of toReap) {
      await this.destroyConnection(id);
    }

    if (toReap.length > 0) {
      console.log(`[ConnectionPool] Reaped ${toReap.length} dead connections`);
      this.emit("connections.reaped", { count: toReap.length });
    }
  }

  // ======== Statistics ========

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const byProvider: Record<string, number> = {};
    const byHealth: Record<ConnectionHealth, number> = {
      [ConnectionHealth.HEALTHY]: 0,
      [ConnectionHealth.DEGRADED]: 0,
      [ConnectionHealth.UNHEALTHY]: 0,
      [ConnectionHealth.DEAD]: 0,
    };

    for (const slot of this.connections.values()) {
      const key = `${slot.provider}:${slot.model}`;
      byProvider[key] = (byProvider[key] || 0) + 1;
      byHealth[slot.health]++;
    }

    const activeStreams = Array.from(this.connections.values()).reduce(
      (sum, slot) => sum + slot.streams.size,
      0
    );

    const elapsed = (Date.now() - this.metrics.startTime) / 1000;
    const rps = elapsed > 0 ? this.metrics.requests / elapsed : 0;

    return {
      totalConnections: this.connections.size,
      byProvider,
      byHealth,
      activeStreams,
      averageLatency:
        this.metrics.requests > 0 ? this.metrics.latencySum / this.metrics.requests : 0,
      requestsPerSecond: rps,
      errorRate: this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0,
    };
  }

  /**
   * Get detailed connection info
   */
  getConnections(): Array<{
    id: string;
    provider: string;
    model: string;
    health: ConnectionHealth;
    streams: number;
    latency: number;
    age: number;
  }> {
    return Array.from(this.connections.values()).map((slot) => ({
      id: slot.id,
      provider: slot.provider,
      model: slot.model,
      health: slot.health,
      streams: slot.streams.size,
      latency: slot.averageLatency,
      age: Date.now() - slot.createdAt,
    }));
  }

  /**
   * Destroy pool and all connections
   */
  async destroy(): Promise<void> {
    // Stop timers
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.reapTimer) clearInterval(this.reapTimer);

    // Destroy all connections
    const promises: Promise<void>[] = [];
    for (const [id] of this.connections) {
      promises.push(this.destroyConnection(id));
    }
    await Promise.all(promises);

    this.emit("pool.destroyed", { stats: this.getStats() });
  }
}

// Export singleton accessor
export const getDraconicConnectionPool = DraconicConnectionPool.getInstance;
