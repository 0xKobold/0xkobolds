/**
 * Telemetry DAO
 * 
 * Typed access to telemetry.db
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { DB_PATHS } from '../index.js';

// ============================================================================
// Types
// ============================================================================

export interface TelemetryEvent {
  id?: number;
  category: string;
  event_name: string;
  properties?: Record<string, any>;
  duration_ms?: number;
  success?: boolean;
  timestamp?: number;
  instance_id?: string;
}

export interface CronJobEvent extends TelemetryEvent {
  properties: {
    name: string;
    job_id?: string;
    cron_expression?: string;
    triggered_by?: 'schedule' | 'manual';
  };
}

export interface DashboardSummary {
  gateway: { count: number; success_rate: number; avg_latency: number };
  llm: { count: number; avg_latency: number };
  skill: { count: number; success_rate: number };
  cron: { count: number; success_rate: number };
  session: { created: number; resumed: number; forked: number; abandoned: number };
  agent: { spawned: number; completed: number; timeouts: number };
}

// ============================================================================
// Telemetry DAO
// ============================================================================

export class TelemetryDAO {
  private db: Database;
  private instanceId: string;

  constructor(dbPath?: string) {
    const path = dbPath || DB_PATHS.telemetry;
    this.db = new Database(path);
    this.instanceId = this.getOrCreateInstanceId();
    this.initSchema();
  }

  private getOrCreateInstanceId(): string {
    const row = this.db.query(
      `SELECT value FROM metrics WHERE key = 'instance_id' LIMIT 1`
    ).get() as { value: string } | undefined;
    
    if (row) return row.value;
    
    const id = `instance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.db.run(
      `INSERT INTO metrics (key, value, timestamp) VALUES (?, ?, ?)`,
      ['instance_id', id, Math.floor(Date.now() / 1000)]
    );
    return id;
  }

  private initSchema(): void {
    this.db.exec(`
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
      
      CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
      CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
      
      CREATE TABLE IF NOT EXISTS metrics (
        key TEXT PRIMARY KEY,
        value TEXT,
        timestamp INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS daily_aggregates (
        date TEXT PRIMARY KEY,
        category TEXT,
        event_name TEXT,
        count INTEGER DEFAULT 0,
        total_duration_ms INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS cleanup_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cleaned_at INTEGER,
        deleted_rows INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS benchmark_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submitted_at INTEGER,
        payload TEXT,
        instance_id TEXT
      );
    `);
  }

  // ============================================================================
  // Event Tracking
  // ============================================================================

  /**
   * Track a telemetry event
   */
  track(category: string, event: string, props: Record<string, any> = {}): void {
    this.db.run(
      `INSERT INTO events (category, event_name, properties, instance_id) VALUES (?, ?, ?, ?)`,
      [category, event, JSON.stringify(props), this.instanceId]
    );
  }

  /**
   * Track cron job with full metadata
   */
  trackCronJob(data: {
    name: string;
    duration_ms: number;
    success: boolean;
    error?: string;
    job_id?: string;
    cron_expression?: string;
    triggered_by?: 'schedule' | 'manual';
  }): void {
    this.db.run(
      `INSERT INTO events (category, event_name, properties, duration_ms, success, instance_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'cron',
        data.name,
        JSON.stringify({
          job_id: data.job_id,
          cron_expression: data.cron_expression,
          triggered_by: data.triggered_by || 'schedule',
          error: data.error,
        }),
        data.duration_ms,
        data.success ? 1 : 0,
        this.instanceId,
      ]
    );
  }

  /**
   * Track LLM request
   */
  trackLLMRequest(data: {
    model: string;
    duration_ms: number;
    tokens?: number;
    success: boolean;
    provider?: string;
    error?: string;
  }): void {
    this.db.run(
      `INSERT INTO events (category, event_name, properties, duration_ms, success, instance_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'llm',
        'request',
        JSON.stringify({
          model: data.model,
          tokens: data.tokens,
          provider: data.provider,
          error: data.error,
        }),
        data.duration_ms,
        data.success ? 1 : 0,
        this.instanceId,
      ]
    );
  }

  /**
   * Track gateway request
   */
  trackGatewayRequest(data: {
    method: string;
    duration_ms: number;
    success: boolean;
    client_type?: string;
  }): void {
    this.db.run(
      `INSERT INTO events (category, event_name, properties, duration_ms, success, instance_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'gateway',
        'request',
        JSON.stringify({
          method: data.method,
          client_type: data.client_type,
        }),
        data.duration_ms,
        data.success ? 1 : 0,
        this.instanceId,
      ]
    );
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * Get events with optional filters
   */
  getEvents(filters: {
    category?: string;
    event_name?: string;
    since?: number; // Unix timestamp
    limit?: number;
  } = {}): TelemetryEvent[] {
    let sql = `SELECT * FROM events WHERE 1=1`;
    const params: any[] = [];

    if (filters.category) {
      sql += ` AND category = ?`;
      params.push(filters.category);
    }
    if (filters.event_name) {
      sql += ` AND event_name = ?`;
      params.push(filters.event_name);
    }
    if (filters.since) {
      sql += ` AND timestamp > ?`;
      params.push(filters.since);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(filters.limit || 100);

    return this.db.query(sql).all(...params) as TelemetryEvent[];
  }

  /**
   * Get cron job events with parsed metadata
   */
  getCronJobs(days = 7): CronJobEvent[] {
    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
    
    const events = this.db.query(
      `SELECT * FROM events WHERE category = 'cron' AND timestamp > ? ORDER BY timestamp DESC`
    ).all(since) as any[];

    return events.map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}'),
    }));
  }

  /**
   * Get dashboard summary
   */
  getSummary(days = 7): DashboardSummary {
    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    const query = (category: string) =>
      this.db.query(
        `SELECT * FROM events WHERE category = ? AND timestamp > ?`
      ).all(category, since) as any[];

    const gateway = query('gateway');
    const llm = query('llm');
    const skill = query('skill');
    const cron = query('cron');
    const session = this.db.query(
      `SELECT event_name, COUNT(*) as count FROM events WHERE category = 'session' AND timestamp > ? GROUP BY event_name`
    ).all(since) as any[];
    const agent = this.db.query(
      `SELECT event_name, COUNT(*) as count FROM events WHERE category = 'agent' AND timestamp > ? GROUP BY event_name`
    ).all(since) as any[];

    const summarize = (events: any[], eventName: string) => {
      const filtered = events.filter(e => e.event_name === eventName);
      const count = filtered.length;
      const successRate = count > 0 
        ? (filtered.filter(e => e.success).length / count) * 100 
        : 0;
      const avgLatency = count > 0 
        ? filtered.reduce((sum, e) => sum + (e.duration_ms || 0), 0) / count 
        : 0;
      return { count, success_rate: successRate, avg_latency: avgLatency };
    };

    return {
      gateway: summarize(gateway, 'request'),
      llm: { count: llm.length, avg_latency: llm.length > 0 ? llm.reduce((sum, e) => sum + (e.duration_ms || 0), 0) / llm.length : 0 },
      skill: summarize(skill, 'execution'),
      cron: summarize(cron, 'job'),
      session: {
        created: session.find(e => e.event_name === 'create')?.count || 0,
        resumed: session.find(e => e.event_name === 'resume')?.count || 0,
        forked: session.find(e => e.event_name === 'fork')?.count || 0,
        abandoned: session.find(e => e.event_name === 'abandon')?.count || 0,
      },
      agent: {
        spawned: agent.find(e => e.event_name === 'spawn')?.count || 0,
        completed: agent.find(e => e.event_name === 'complete')?.count || 0,
        timeouts: agent.find(e => e.event_name === 'timeout')?.count || 0,
      },
    };
  }

  /**
   * Cleanup old data
   */
  cleanup(retentionDays = 30): number {
    const cutoff = Math.floor(Date.now() / 1000) - (retentionDays * 24 * 60 * 60);
    const result = this.db.run(`DELETE FROM events WHERE timestamp < ?`, [cutoff]);
    this.db.run(`INSERT INTO cleanup_log (cleaned_at, deleted_rows) VALUES (?, ?)`, [Math.floor(Date.now() / 1000), result.changes]);
    return result.changes;
  }

  /**
   * Close connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton
let instance: TelemetryDAO | null = null;

export const telemetryDAO = (): TelemetryDAO => {
  if (!instance) {
    instance = new TelemetryDAO();
  }
  return instance;
};
