/**
 * Unified Session Store
 *
 * Central storage for session management with SQLite persistence.
 * All 0xKobold subsystems reference this store via stable session IDs.
 */

import { Database } from "bun:sqlite";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type {
  UnifiedSession,
  SessionHierarchy,
  SessionSnapshot,
  SessionEvent,
  SessionEventType,
  SessionFilter,
  SnapshotFilter,
  SessionSummary,
  MigrationResult,
  SessionState,
} from "./types.js";

/**
 * Generate stable session ID from pi-coding-agent session
 * Same input = same output (survives restarts)
 */
export function generateStableSessionId(piSessionId: string, deviceId?: string): string {
  const hash = createHash("sha256")
    .update(piSessionId)
    .update(deviceId || getDeviceId())
    .digest("hex")
    .slice(0, 24);
  return `kobold-${hash}`;
}

/**
 * Generate device ID - stable per installation
 */
export function getDeviceId(): string {
  // In production, this should read from ~/.0xkobold/device.id
  // For now, use environment or generate
  if (process.env.KOBOLD_DEVICE_ID) {
    return process.env.KOBOLD_DEVICE_ID;
  }
  
  // Generate stable device ID from hostname + machine ID if available
  const { machineIdSync } = require("node-machine-id");
  try {
    return machineIdSync() || "unknown-device";
  } catch {
    return "dev-device";
  }
}

/**
 * Unified Session Store
 */
export class SessionStore {
  private db: Database;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);

    // Performance settings
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA synchronous = NORMAL;");
    this.db.run("PRAGMA foreign_keys = ON;");
    this.db.run("PRAGMA wal_autocheckpoint = 1000;");

    this.initializeSchema();
    console.log(`[SessionStore] Initialized at ${dbPath}`);
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const schemaPath = join(__dirname, "schema.sql");

      if (existsSync(schemaPath)) {
        const schema = readFileSync(schemaPath, "utf-8");
        this.db.run(schema);
        console.log("[SessionStore] Schema initialized from schema.sql");
        return;
      }
    } catch {
      // Fall through to no-op - tables created lazily
    }
  }

  // ============================================================================
  // Session CRUD
  // ============================================================================

  /**
   * Create a new session
   */
  async createSession(
    piSessionId: string,
    data: Partial<UnifiedSession>
  ): Promise<UnifiedSession> {
    const id = generateStableSessionId(piSessionId, data.deviceId);
    const now = Date.now();
    const deviceId = data.deviceId || getDeviceId();

    const session: UnifiedSession = {
      id,
      piSessionId,
      piSessionFile: data.piSessionFile,
      deviceId,
      userId: data.userId,
      state: data.state || "idle",
      mode: data.mode || "persistent",
      cwd: data.cwd || process.cwd(),
      workspaceType: data.workspaceType || "main",
      createdAt: now,
      lastActivityAt: now,
      lastAccessedAt: now,
      completedAt: data.completedAt,
      totalTurns: data.totalTurns || 0,
      totalTokens: data.totalTokens || { input: 0, output: 0 },
      source: data.source || "tui",
      channelId: data.channelId,
      config: data.config,
      metadata: data.metadata,
    };

    const stmt = this.db.prepare(`
      INSERT INTO unified_sessions (
        id, pi_session_id, pi_session_file, device_id, user_id,
        state, mode, cwd, workspace_type,
        created_at, last_activity_at, last_accessed_at, completed_at,
        total_turns, total_tokens_input, total_tokens_output,
        source, channel_id, config, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.piSessionId,
      session.piSessionFile || null,
      session.deviceId,
      session.userId || null,
      session.state,
      session.mode,
      session.cwd,
      session.workspaceType,
      session.createdAt,
      session.lastActivityAt,
      session.lastAccessedAt,
      session.completedAt || null,
      session.totalTurns,
      session.totalTokens.input,
      session.totalTokens.output,
      session.source,
      session.channelId || null,
      JSON.stringify(session.config || {}),
      JSON.stringify(session.metadata || {})
    );

    await this.logEvent(id, "created", { piSessionId });

    console.log(`[SessionStore] Created session: ${id.slice(0, 16)}...`);
    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(id: string): Promise<UnifiedSession | null> {
    const row = this.db
      .query("SELECT * FROM unified_sessions WHERE id = ?")
      .get(id) as any;

    if (!row) return null;
    return this.rowToSession(row);
  }

  /**
   * Get session by pi-coding-agent session ID
   */
  async getByPiSessionId(piSessionId: string): Promise<UnifiedSession | null> {
    const id = generateStableSessionId(piSessionId);
    return this.getSession(id);
  }

  /**
   * Get or create session (idempotent)
   */
  async getOrCreateSession(
    piSessionId: string,
    data?: Partial<UnifiedSession>
  ): Promise<{ session: UnifiedSession; created: boolean }> {
    const existing = await this.getByPiSessionId(piSessionId);
    if (existing) {
      await this.touch(existing.id);
      return { session: existing, created: false };
    }
    const created = await this.createSession(piSessionId, data);
    return { session: created, created: true };
  }

  /**
   * Update session fields
   */
  async updateSession(id: string, updates: Partial<UnifiedSession>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.state !== undefined) {
      sets.push("state = ?");
      values.push(updates.state);
    }
    if (updates.mode !== undefined) {
      sets.push("mode = ?");
      values.push(updates.mode);
    }
    if (updates.cwd !== undefined) {
      sets.push("cwd = ?");
      values.push(updates.cwd);
    }
    if (updates.workspaceType !== undefined) {
      sets.push("workspace_type = ?");
      values.push(updates.workspaceType);
    }
    if (updates.lastActivityAt !== undefined) {
      sets.push("last_activity_at = ?");
      values.push(updates.lastActivityAt);
    }
    if (updates.completedAt !== undefined) {
      sets.push("completed_at = ?");
      values.push(updates.completedAt);
    }
    if (updates.totalTurns !== undefined) {
      sets.push("total_turns = ?");
      values.push(updates.totalTurns);
    }
    if (updates.totalTokens !== undefined) {
      sets.push("total_tokens_input = ?");
      values.push(updates.totalTokens.input);
      sets.push("total_tokens_output = ?");
      values.push(updates.totalTokens.output);
    }
    if (updates.config !== undefined) {
      sets.push("config = ?");
      values.push(JSON.stringify(updates.config));
    }
    if (updates.metadata !== undefined) {
      sets.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }

    if (sets.length === 0) return;

    sets.push("version = version + 1");
    values.push(id);

    const query = `UPDATE unified_sessions SET ${sets.join(", ")} WHERE id = ?`;
    this.db.run(query, values);
  }

  /**
   * Update session state with event logging
   */
  async setState(
    id: string,
    newState: SessionState,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const current = await this.getSession(id);
    if (!current) throw new Error(`Session ${id} not found`);

    await this.updateSession(id, { state: newState });

    const eventType = this.stateToEventType(newState);
    await this.logEvent(id, eventType, { previousState: current.state, ...metadata });
  }

  /**
   * Delete session (cascades to hierarchy, snapshots, events)
   */
  async deleteSession(id: string): Promise<void> {
    this.db.run("DELETE FROM unified_sessions WHERE id = ?", [id]);
  }

  /**
   * Touch session (update last_accessed_at)
   */
  async touch(id: string): Promise<void> {
    this.db.run(
      "UPDATE unified_sessions SET last_accessed_at = ? WHERE id = ?",
      [Date.now(), id]
    );
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * List sessions with filters
   */
  async listSessions(filter?: SessionFilter, limit: number = 100): Promise<SessionSummary[]> {
    let query = `
      SELECT 
        s.id, s.state, s.source, s.cwd, 
        s.created_at, s.last_activity_at,
        s.total_turns,
        h.spawn_depth,
        (SELECT COUNT(*) FROM session_hierarchy WHERE parent_session_id = s.id) > 0 as has_children
      FROM unified_sessions s
      LEFT JOIN session_hierarchy h ON s.id = h.session_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filter?.state) {
      const states = Array.isArray(filter.state) ? filter.state : [filter.state];
      query += ` AND s.state IN (${states.map(() => "?").join(", ")})`;
      params.push(...states);
    }
    if (filter?.source) {
      const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
      query += ` AND s.source IN (${sources.map(() => "?").join(", ")})`;
      params.push(...sources);
    }
    if (filter?.deviceId) {
      query += " AND s.device_id = ?";
      params.push(filter.deviceId);
    }
    if (filter?.userId) {
      query += " AND s.user_id = ?";
      params.push(filter.userId);
    }
    if (filter?.activeSince) {
      query += " AND s.last_activity_at > ?";
      params.push(filter.activeSince);
    }

    query += " ORDER BY s.last_activity_at DESC LIMIT ?";
    params.push(limit);

    const rows = this.db.query(query).all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      state: row.state,
      source: row.source,
      cwd: row.cwd,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      totalTurns: row.total_turns,
      hasChildren: !!row.has_children,
      depth: row.spawn_depth || 0,
    }));
  }

  /**
   * Get active sessions (idle + active)
   */
  async getActiveSessions(hours: number = 168): Promise<UnifiedSession[]> {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;

    const rows = this.db
      .query(
        `
        SELECT * FROM unified_sessions 
        WHERE state IN ('idle', 'active') 
          AND last_activity_at > ?
        ORDER BY last_activity_at DESC
      `
      )
      .all(cutoff) as any[];

    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Get recent sessions for resume
   */
  async getSessionsForResume(maxAgeHours: number = 168): Promise<UnifiedSession[]> {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;

    const rows = this.db
      .query(
        `
        SELECT * FROM unified_sessions 
        WHERE (state IN ('idle', 'active', 'suspended') 
               OR (state = 'completed' AND completed_at > ?))
          AND last_activity_at > ?
        ORDER BY 
          CASE state 
            WHEN 'active' THEN 1 
            WHEN 'idle' THEN 2 
            WHEN 'suspended' THEN 3 
            ELSE 4 
          END,
          last_activity_at DESC
      `
      )
      .all(cutoff, cutoff) as any[];

    return rows.map((row) => this.rowToSession(row));
  }

  // ============================================================================
  // Hierarchy
  // ============================================================================

  /**
   * Create hierarchy entry
   */
  async createHierarchy(
    sessionId: string,
    data: Partial<SessionHierarchy>
  ): Promise<SessionHierarchy> {
    const hierarchy: SessionHierarchy = {
      sessionId,
      parentSessionId: data.parentSessionId,
      rootSessionId: data.rootSessionId || data.parentSessionId || sessionId,
      spawnDepth: data.spawnDepth || 0,
      spawnedBy: data.spawnedBy,
      spawnReason: data.spawnReason,
      spawnMethod: data.spawnMethod || "auto",
      spawnedAt: data.spawnedAt || Date.now(),
      isFork: data.isFork || false,
      forkedFromParent: data.forkedFromParent || false,
    };

    const stmt = this.db.prepare(`
      INSERT INTO session_hierarchy (
        session_id, parent_session_id, root_session_id, spawn_depth,
        spawned_by, spawn_reason, spawn_method, spawned_at,
        is_fork, forked_from_parent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      hierarchy.sessionId,
      hierarchy.parentSessionId || null,
      hierarchy.rootSessionId,
      hierarchy.spawnDepth,
      hierarchy.spawnedBy || null,
      hierarchy.spawnReason || null,
      hierarchy.spawnMethod,
      hierarchy.spawnedAt,
      hierarchy.isFork ? 1 : 0,
      hierarchy.forkedFromParent ? 1 : 0
    );

    return hierarchy;
  }

  /**
   * Get hierarchy for session
   */
  async getHierarchy(sessionId: string): Promise<SessionHierarchy | null> {
    const row = this.db
      .query("SELECT * FROM session_hierarchy WHERE session_id = ?")
      .get(sessionId) as any;

    if (!row) return null;
    return this.rowToHierarchy(row);
  }

  /**
   * Get children of a session
   */
  async getChildren(parentId: string): Promise<string[]> {
    const rows = this.db
      .query("SELECT session_id FROM session_hierarchy WHERE parent_session_id = ? ORDER BY spawned_at")
      .all(parentId) as any[];

    return rows.map((r) => r.session_id);
  }

  /**
   * Get tree from root
   */
  async getSessionTree(rootId: string): Promise<UnifiedSession[]> {
    const result: UnifiedSession[] = [];
    const toProcess = [rootId];
    const processed = new Set<string>();

    while (toProcess.length > 0) {
      const id = toProcess.shift()!;
      if (processed.has(id)) continue;
      processed.add(id);

      const session = await this.getSession(id);
      if (session) {
        result.push(session);
        const children = await this.getChildren(id);
        for (const childId of children) {
          if (!processed.has(childId)) {
            toProcess.push(childId);
          }
        }
      }
    }

    return result;
  }

  // ============================================================================
  // Snapshots
  // ============================================================================

  /**
   * Create snapshot
   */
  async createSnapshot(
    sessionId: string,
    type: SessionSnapshot["type"],
    data: Partial<SessionSnapshot>
  ): Promise<string> {
    const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const stmt = this.db.prepare(`
      INSERT INTO session_snapshots (
        id, session_id, timestamp, type, triggered_by,
        conversation_history, context_window,
        tasks_state, channels_state, agents_state,
        working_memory, perennial_refs, metadata,
        token_count, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const conversationHistory = JSON.stringify(data.conversationHistory || []);
    const metadata = JSON.stringify(data.metadata || {});

    stmt.run(
      id,
      sessionId,
      data.timestamp || Date.now(),
      type,
      data.triggeredBy || null,
      conversationHistory,
      JSON.stringify(data.contextWindow || null),
      JSON.stringify(data.tasks || null),
      JSON.stringify(data.channels || null),
      JSON.stringify(data.agents || null),
      JSON.stringify(data.workingMemory || null),
      JSON.stringify(data.perennialRefs || null),
      metadata,
      conversationHistory.length,
      data.expiresAt || null
    );

    return id;
  }

  /**
   * Get latest snapshot
   */
  async getLatestSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
    const row = this.db
      .query(
        "SELECT * FROM session_snapshots WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1"
      )
      .get(sessionId) as any;

    if (!row) return null;
    return this.rowToSnapshot(row);
  }

  /**
   * Clean up old snapshots
   */
  async cleanupSnapshots(keepCount: number = 10): Promise<number> {
    const result = this.db.run(
      `
      DELETE FROM session_snapshots 
      WHERE id NOT IN (
        SELECT id FROM session_snapshots 
        ORDER BY timestamp DESC 
        LIMIT ?
      )
    `,
      [keepCount]
    );

    return result.changes;
  }

  // ============================================================================
  // Events
  // ============================================================================

  async logEvent(sessionId: string, type: SessionEventType, metadata?: Record<string, unknown>): Promise<void> {
    const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    this.db.run(
      `INSERT INTO session_events (id, session_id, type, timestamp, metadata) 
       VALUES (?, ?, ?, ?, ?)`,
      [id, sessionId, type, Date.now(), JSON.stringify(metadata || {})]
    );
  }

  /**
   * Get events for session
   */
  async getEvents(sessionId: string, limit: number = 50): Promise<SessionEvent[]> {
    const rows = this.db
      .query(
        `SELECT * FROM session_events 
         WHERE session_id = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`
      )
      .all(sessionId, limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      type: r.type,
      timestamp: r.timestamp,
      metadata: JSON.parse(r.metadata || "{}"),
    }));
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  async getStats(): Promise<{
    total: number;
    active: number;
    idle: number;
    error: number;
    completed: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTurns: number;
  }> {
    const row = this.db.query("SELECT * FROM session_stats").get() as any;

    return {
      total: row?.total_sessions || 0,
      active: row?.active_count || 0,
      idle: row?.idle_count || 0,
      error: row?.error_count || 0,
      completed: row?.completed_count || 0,
      totalInputTokens: row?.total_input_tokens || 0,
      totalOutputTokens: row?.total_output_tokens || 0,
      totalTurns: row?.total_turns || 0,
    };
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  async cleanup(completedAgeHours: number = 168): Promise<{
    sessionsDeleted: number;
    snapshotsDeleted: number;
  }> {
    const cutoff = Date.now() - completedAgeHours * 60 * 60 * 1000;

    // Delete old completed sessions
    const sessionsResult = this.db.run(
      "DELETE FROM unified_sessions WHERE state = 'completed' AND completed_at < ?",
      [cutoff]
    );

    // Clean up orphaned snapshots
    const snapshotsResult = await this.cleanupSnapshots();

    return {
      sessionsDeleted: sessionsResult.changes,
      snapshotsDeleted: snapshotsResult,
    };
  }

  async checkpoint(): Promise<void> {
    this.db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  async close(): Promise<void> {
    await this.checkpoint();
    this.db.close();
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private rowToSession(row: any): UnifiedSession {
    return {
      id: row.id,
      piSessionId: row.pi_session_id,
      piSessionFile: row.pi_session_file || undefined,
      deviceId: row.device_id,
      userId: row.user_id || undefined,
      state: row.state,
      mode: row.mode,
      cwd: row.cwd,
      workspaceType: row.workspace_type,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      lastAccessedAt: row.last_accessed_at,
      completedAt: row.completed_at || undefined,
      totalTurns: row.total_turns,
      totalTokens: {
        input: row.total_tokens_input,
        output: row.total_tokens_output,
      },
      source: row.source,
      channelId: row.channel_id || undefined,
      config: JSON.parse(row.config || "{}"),
      metadata: JSON.parse(row.metadata || "{}"),
    };
  }

  private rowToHierarchy(row: any): SessionHierarchy {
    return {
      sessionId: row.session_id,
      parentSessionId: row.parent_session_id || undefined,
      rootSessionId: row.root_session_id || undefined,
      spawnDepth: row.spawn_depth,
      spawnedBy: row.spawned_by || undefined,
      spawnReason: row.spawn_reason || undefined,
      spawnMethod: row.spawn_method,
      spawnedAt: row.spawned_at,
      isFork: !!row.is_fork,
      forkedFromParent: !!row.forked_from_parent,
    };
  }

  private rowToSnapshot(row: any): SessionSnapshot {
    return {
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      type: row.type,
      triggeredBy: row.triggered_by || undefined,
      conversationHistory: JSON.parse(row.conversation_history || "[]"),
      contextWindow: row.context_window ? JSON.parse(row.context_window) : undefined,
      tasks: row.tasks_state ? JSON.parse(row.tasks_state) : undefined,
      channels: row.channels_state ? JSON.parse(row.channels_state) : undefined,
      agents: row.agents_state ? JSON.parse(row.agents_state) : undefined,
      workingMemory: row.working_memory ? JSON.parse(row.working_memory) : undefined,
      perennialRefs: row.perennial_refs ? JSON.parse(row.perennial_refs) : undefined,
      metadata: JSON.parse(row.metadata || "{}"),
    };
  }

  private stateToEventType(state: SessionState): SessionEventType {
    const mapping: Record<SessionState, SessionEventType> = {
      idle: "created",
      active: "activated",
      error: "error",
      completed: "completed",
      suspended: "resumed",
    };
    return mapping[state];
  }
}

export default SessionStore;
