/**
 * 0xKobold Telemetry System v2
 * 
 * Unified, extensible telemetry with pluggable trackers.
 * 
 * Design Principles:
 * 1. Single source of truth - all metrics go through Telemetry class
 * 2. Easy to extend - add new trackers without modifying core
 * 3. Type-safe - full TypeScript support
 * 4. Low overhead - async writes, batching optional
 * 5. Local-first - no external dependencies
 * 
 * Usage:
 *   import { telemetry } from './telemetry';
 *   
 *   // Direct recording
 *   telemetry.record('request.count', 1, 'count', { service: 'gateway' });
 *   
 *   // Using trackers
 *   telemetry.gateway.trackRequest({ latency: 50, success: true, method: 'agent.create' });
 *   
 *   // Using decorators
 *   @trackAsync('skill.execution')
 *   async function mySkill() { ... }
 *   
 *   // Timed operations
 *   const timer = telemetry.startTimer('operation.duration');
 *   await doWork();
 *   timer.end({ success: true });
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { TelemetryEvent } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface Metric {
  name: string;
  value: number;
  unit: string;
  tags?: Record<string, string>;
  timestamp?: number;
}

export interface TimedOperation {
  end: (options?: { success?: boolean; tags?: Record<string, string> }) => void;
}

export interface Tracker<T extends Record<string, unknown> = Record<string, unknown>> {
  track: (data: T) => void;
  trackAsync?: (data: T) => Promise<void>;
}

// ============================================================================
// Base Telemetry Class
// ============================================================================

class Telemetry {
  private db: Database;
  private instanceId: string;
  private enabled: boolean = true;
  private timers: Map<string, number> = new Map();

  constructor(dbPath?: string) {
    const path = dbPath || join(homedir(), ".0xkobold", "telemetry.db");
    this.db = new Database(path);
    this.instanceId = this.getOrCreateInstanceId();
    this.initSchema();
  }

  private getOrCreateInstanceId(): string {
    return randomUUID().slice(0, 8);
  }

  private initSchema(): void {
    this.db.exec(`
      -- Metrics table (time-series data)
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT DEFAULT '',
        tags TEXT DEFAULT '{}',
        timestamp INTEGER DEFAULT (unixepoch()),
        instance_id TEXT
      );

      -- Events table (structured events)
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        event_name TEXT NOT NULL,
        properties TEXT DEFAULT '{}',
        duration_ms INTEGER,
        success INTEGER,
        timestamp INTEGER DEFAULT (unixepoch()),
        instance_id TEXT
      );

      -- Daily aggregates (permanent summaries)
      CREATE TABLE IF NOT EXISTS daily_aggregates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        date TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        sum REAL DEFAULT 0,
        min REAL DEFAULT 0,
        max REAL DEFAULT 0,
        p50 REAL DEFAULT 0,
        p95 REAL DEFAULT 0,
        p99 REAL DEFAULT 0,
        tags TEXT DEFAULT '{}',
        instance_id TEXT,
        UNIQUE(metric_name, date, tags, instance_id)
      );

      -- Benchmark submissions
      CREATE TABLE IF NOT EXISTS benchmark_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submitted_at INTEGER DEFAULT (unixepoch()),
        aggregates TEXT NOT NULL,
        instance_id TEXT
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
      CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name);
      CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_aggregates(date);

      -- Cleanup log
      CREATE TABLE IF NOT EXISTS cleanup_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cleaned_at INTEGER DEFAULT (unixepoch()),
        deleted_rows INTEGER
      );
    `);
  }

  // --------------------------------------------------------------------------
  // Core Recording Methods
  // --------------------------------------------------------------------------

  /**
   * Record a metric value
   */
  record(name: string, value: number, unit: string = '', tags?: Record<string, string>): void {
    if (!this.enabled) return;
    try {
      this.db.run(
        `INSERT INTO metrics (name, value, unit, tags, instance_id) VALUES (?, ?, ?, ?, ?)`,
        [name, value, unit, JSON.stringify(tags || {}), this.instanceId]
      );
    } catch (e) {
      console.error('[Telemetry] record failed:', e);
    }
  }

  /**
   * Increment a counter metric
   */
  increment(name: string, delta: number = 1, tags?: Record<string, string>): void {
    this.record(name, delta, 'count', tags);
  }

  /**
   * Record timing in milliseconds
   */
  timing(name: string, duration_ms: number, tags?: Record<string, string>): void {
    this.record(name, duration_ms, 'ms', tags);
  }

  /**
   * Record a gauge value (current state)
   */
  gauge(name: string, value: number, unit: string = '', tags?: Record<string, string>): void {
    this.record(name, value, unit, tags);
  }

  /**
   * Record an event with optional duration and success
   */
  event(
    category: TelemetryEvent['category'],
    name: string,
    options?: {
      duration_ms?: number;
      success?: boolean;
      properties?: Record<string, unknown>;
    }
  ): void {
    if (!this.enabled) return;
    try {
      const success = options?.success !== undefined ? (options.success ? 1 : 0) : 0;
      this.db.run(
        `INSERT INTO events (category, event_name, properties, duration_ms, success, instance_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          category,
          name,
          JSON.stringify(options?.properties || {}),
          options?.duration_ms ?? 0,
          success,
          this.instanceId
        ]
      );
    } catch (e) {
      console.error('[Telemetry] event failed:', e);
    }
  }

  // --------------------------------------------------------------------------
  // Timer Helpers
  // --------------------------------------------------------------------------

  /**
   * Start a timer for measuring duration
   */
  startTimer(name: string, tags?: Record<string, string>): TimedOperation {
    const start = Date.now();
    return {
      end: (options?: { success?: boolean; tags?: Record<string, string> }) => {
        const duration = Date.now() - start;
        this.timing(name, duration, tags);
        if (options?.success !== undefined) {
          this.event('system', 'timer', { duration_ms: duration, success: options.success });
        }
      }
    };
  }

  /**
   * Track a synchronous function's execution
   */
  trackSync<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
    const timer = this.startTimer(name, tags);
    try {
      const result = fn();
      timer.end({ success: true, tags });
      return result;
    } catch (e) {
      timer.end({ success: false, tags });
      throw e;
    }
  }

  /**
   * Track an async function's execution
   */
  async trackAsync<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T> {
    const timer = this.startTimer(name, tags);
    try {
      const result = await fn();
      timer.end({ success: true, tags });
      return result;
    } catch (e) {
      timer.end({ success: false, tags });
      throw e;
    }
  }

  // --------------------------------------------------------------------------
  // Convenience Trackers
  // --------------------------------------------------------------------------

  gateway = {
    request: (data: { latency_ms: number; success: boolean; method?: string; error?: string }) => {
      this.record('gateway.request.latency', data.latency_ms, 'ms', { 
        success: String(data.success),
        method: data.method || 'unknown'
      });
      this.event('gateway', 'request', {
        duration_ms: data.latency_ms,
        success: data.success,
        properties: { method: data.method, error: data.error }
      });
    },
    connect: (data: { client_type: string; node_id?: string }) => {
      this.increment('gateway.connections.total', 1, { type: data.client_type });
      this.event('gateway', 'connect', { properties: data });
    },
    disconnect: (data: { client_type: string; reason?: string }) => {
      this.increment('gateway.disconnections.total', 1, { type: data.client_type });
      this.event('gateway', 'disconnect', { properties: data });
    },
    rateLimit: (data: { client_type: string; endpoint?: string }) => {
      this.increment('gateway.rate_limits.total', 1, { type: data.client_type });
      this.event('gateway', 'rate_limit', { properties: data });
    }
  };

  llm = {
    request: (data: { 
      model: string; 
      latency_ms: number; 
      tokens_used: number;
      success: boolean;
      provider?: string;
      error?: string;
    }) => {
      this.record('llm.request.latency', data.latency_ms, 'ms', { 
        model: data.model,
        provider: data.provider || 'unknown'
      });
      if (data.tokens_used > 0) {
        this.record('llm.tokens.used', data.tokens_used, 'tokens', { model: data.model });
      }
      this.event('llm', 'request', {
        duration_ms: data.latency_ms,
        success: data.success,
        properties: { 
          model: data.model, 
          tokens_used: data.tokens_used,
          provider: data.provider,
          error: data.error
        }
      });
    },
    fallback: (data: { from_model: string; to_model: string; reason: string }) => {
      this.increment('llm.fallbacks.total', 1, { 
        from_model: data.from_model,
        to_model: data.to_model 
      });
      this.event('llm', 'fallback', { properties: data });
    },
    retry: (data: { model: string; attempt: number; error?: string }) => {
      this.increment('llm.retries.total', 1, { model: data.model });
      this.event('llm', 'retry', { properties: { ...data, attempt: data.attempt } });
    }
  };

  session = {
    create: (data: { session_id: string; type: string }) => {
      this.increment('session.created.total', 1, { type: data.type });
      this.event('session', 'create', { properties: data });
    },
    resume: (data: { session_id: string; age_hours?: number }) => {
      this.increment('session.resumed.total', 1);
      this.event('session', 'resume', { properties: data });
    },
    fork: (data: { parent_id: string; child_id: string }) => {
      this.increment('session.forked.total', 1);
      this.event('session', 'fork', { properties: data });
    },
    abandon: (data: { session_id: string; reason?: string }) => {
      this.increment('session.abandoned.total', 1);
      this.event('session', 'abandon', { properties: data });
    },
    message: (data: { session_id: string; message_count: number }) => {
      this.increment('session.messages.total', data.message_count);
    }
  };

  skill = {
    execute: (data: { name: string; latency_ms: number; success: boolean; error?: string }) => {
      this.record('skill.execution.latency', data.latency_ms, 'ms', { name: data.name });
      this.event('skill', 'execution', {
        duration_ms: data.latency_ms,
        success: data.success,
        properties: { name: data.name, error: data.error }
      });
    },
    invoke: (data: { name: string }) => {
      this.increment('skill.invocations.total', 1, { name: data.name });
    }
  };

  agent = {
    spawn: (data: { agent_id: string; type: string }) => {
      this.increment('agent.spawned.total', 1, { type: data.type });
      this.event('agent', 'spawn', { properties: data });
    },
    complete: (data: { agent_id: string; duration_ms: number; success: boolean }) => {
      this.record('agent.completion.latency', data.duration_ms, 'ms', { 
        agent_id: data.agent_id 
      });
      this.event('agent', 'complete', {
        duration_ms: data.duration_ms,
        success: data.success,
        properties: { agent_id: data.agent_id }
      });
    },
    timeout: (data: { agent_id: string; max_duration_ms: number }) => {
      this.increment('agent.timeouts.total', 1);
      this.event('agent', 'timeout', { properties: data });
    },
    message: (data: { agent_id: string; sent: number; received: number }) => {
      this.increment('agent.messages.sent', data.sent, { agent_id: data.agent_id });
      this.increment('agent.messages.received', data.received, { agent_id: data.agent_id });
    }
  };

  storage = {
    read: (data: { operation: string; latency_ms: number; records?: number }) => {
      this.record('storage.read.latency', data.latency_ms, 'ms', { operation: data.operation });
      if (data.records !== undefined) {
        this.increment('storage.read.records', data.records);
      }
    },
    write: (data: { operation: string; latency_ms: number; records?: number }) => {
      this.record('storage.write.latency', data.latency_ms, 'ms', { operation: data.operation });
      if (data.records !== undefined) {
        this.increment('storage.write.records', data.records);
      }
    },
    query: (data: { operation: string; latency_ms: number }) => {
      this.record('storage.query.latency', data.latency_ms, 'ms', { operation: data.operation });
    }
  };

  websocket = {
    connect: (data: { url: string; protocol?: string }) => {
      this.increment('websocket.connections.total', 1);
      this.event('websocket', 'connect', { properties: data });
    },
    disconnect: (data: { url: string; reason?: string }) => {
      this.increment('websocket.disconnections.total', 1);
      this.event('websocket', 'disconnect', { properties: data });
    },
    reconnect: (data: { url: string; attempt: number }) => {
      this.increment('websocket.reconnects.total', 1);
      this.event('websocket', 'reconnect', { properties: data });
    },
    latency: (data: { latency_ms: number; url: string }) => {
      this.record('websocket.latency', data.latency_ms, 'ms', { url: data.url });
    }
  };

  channel = {
    message: (data: { platform: string; direction: 'in' | 'out'; message_count: number }) => {
      this.increment('channel.messages.total', data.message_count, { 
        platform: data.platform,
        direction: data.direction 
      });
    },
    command: (data: { platform: string; command: string }) => {
      this.increment('channel.commands.total', 1, { 
        platform: data.platform,
        command: data.command 
      });
    },
    error: (data: { platform: string; error: string }) => {
      this.increment('channel.errors.total', 1, { platform: data.platform });
      this.event('channel', 'error', { properties: data });
    }
  };

  cron = {
    job: (data: { name: string; latency_ms: number; success: boolean; error?: string }) => {
      this.record('cron.job.latency', data.latency_ms, 'ms', { job: data.name });
      this.event('cron', 'job', {
        duration_ms: data.latency_ms,
        success: data.success,
        properties: { job: data.name, error: data.error }
      });
    },
    skipped: (data: { name: string; reason: string }) => {
      this.increment('cron.skipped.total', 1, { job: data.name });
      this.event('cron', 'skipped', { properties: data });
    }
  };

  system = {
    startup: () => {
      this.increment('system.startups.total', 1);
      this.event('system', 'startup', { properties: { uptime: process.uptime() } });
    },
    shutdown: () => {
      this.event('system', 'shutdown', { properties: { uptime: process.uptime() } });
    },
    memory: (data: { heap_used_mb: number; heap_total_mb: number }) => {
      this.gauge('system.memory.heap_used', data.heap_used_mb, 'mb');
      this.gauge('system.memory.heap_total', data.heap_total_mb, 'mb');
    },
    cpu: (data: { usage_percent: number }) => {
      this.gauge('system.cpu.usage', data.usage_percent, 'percent');
    },
    error: (data: { error_type: string; message: string }) => {
      this.increment('system.errors.total', 1, { type: data.error_type });
      this.event('system', 'error', { success: false, properties: data });
    }
  };

  // --------------------------------------------------------------------------
  // Analytics
  // --------------------------------------------------------------------------

  getStats(metric: string, days: number = 7) {
    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
    const values = this.db.query(
      `SELECT value FROM metrics WHERE name = ? AND timestamp > ?`
    ).all(metric, since) as { value: number }[];

    if (values.length === 0) return null;

    const sorted = values.map(v => v.value).sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      metric,
      count,
      sum,
      avg: sum / count,
      min: sorted[0],
      max: sorted[count - 1],
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)] || sorted[count - 1],
      p99: sorted[Math.floor(count * 0.99)] || sorted[count - 1]
    };
  }

  getDashboardSummary(days: number = 7) {
    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    const query = (category: string) => 
      this.db.query(
        `SELECT * FROM events WHERE category = ? AND timestamp > ?`
      ).all(category, since) as any[];

    const gateway = query('gateway');
    const llm = query('llm');
    const skill = query('skill');
    const cron = query('cron');
    const session = query('session');
    const agent = query('agent');

    return {
      gateway: this.summarize(gateway, 'request'),
      llm: this.summarize(llm, 'request'),
      skill: this.summarize(skill, 'execution'),
      cron: this.summarize(cron, 'job'),
      session: {
        created: session.filter(e => e.event_name === 'create').length,
        resumed: session.filter(e => e.event_name === 'resume').length,
        forked: session.filter(e => e.event_name === 'fork').length,
        abandoned: session.filter(e => e.event_name === 'abandon').length
      },
      agent: {
        spawned: agent.filter(e => e.event_name === 'spawn').length,
        completed: agent.filter(e => e.event_name === 'complete').length,
        timeouts: agent.filter(e => e.event_name === 'timeout').length
      }
    };
  }

  private summarize(events: any[], eventName: string) {
    const filtered = events.filter(e => e.event_name === eventName);
    const successCount = filtered.filter(e => e.success === 1).length;
    const totalDuration = filtered.reduce((sum, e) => sum + (e.duration_ms || 0), 0);
    
    return {
      count: filtered.length,
      success_rate: filtered.length > 0 ? (successCount / filtered.length) * 100 : 0,
      avg_latency: filtered.length > 0 ? totalDuration / filtered.length : 0
    };
  }

  /**
   * Generate anonymized benchmark payload for sharing
   */
  generateBenchmarkPayload(days: number = 7): string {
    const summary = this.getDashboardSummary(days);
    
    return JSON.stringify({
      instance_id: this.instanceId,
      period_days: days,
      submitted_at: Date.now(),
      aggregates: {
        gateway_success_rate: summary.gateway.success_rate,
        gateway_avg_latency_ms: summary.gateway.avg_latency,
        llm_avg_latency_ms: summary.llm.avg_latency,
        skill_success_rate: summary.skill.success_rate,
        cron_success_rate: summary.cron.success_rate,
        total_requests: summary.gateway.count,
        total_llm_requests: summary.llm.count,
        total_skills: summary.skill.count,
        total_cron_jobs: summary.cron.count,
        session_created: summary.session.created,
        session_resumed: summary.session.resumed,
        agents_spawned: summary.agent.spawned,
        agents_completed: summary.agent.completed
      }
    });
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  cleanup(retention_days: number = 30): number {
    const cutoff = Math.floor(Date.now() / 1000) - (retention_days * 24 * 60 * 60);
    const result = this.db.run(`DELETE FROM metrics WHERE timestamp < ?`, [cutoff]);
    this.db.run(`INSERT INTO cleanup_log (deleted_rows) VALUES (?)`, [result.changes]);
    return result.changes;
  }

  /**
   * Query raw events (for CLI reporting)
   */
  queryEvents(category?: string, limit = 100): any[] {
    let sql = `SELECT * FROM events`;
    const params: any[] = [];
    
    if (category) {
      sql += ` WHERE category = ?`;
      params.push(category);
    }
    
    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);
    
    return this.db.query(sql).all(...params) as any[];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  close(): void {
    this.db.close();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let instance: Telemetry | null = null;

export const telemetry = (): Telemetry => {
  if (!instance) {
    instance = new Telemetry();
  }
  return instance;
};

// Also export the class for testing
export { Telemetry };
export type { TelemetryEvent };

// Re-export collector
export { collector, TelemetryCollector, showCollectorStatus, type CollectorConfig, type SystemMetrics } from './collector.js';
