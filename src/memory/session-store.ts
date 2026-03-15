/**
 * Session Store (Phase 2 + Phase 5)
 *
 * SQLite-based session persistence for gateway.
 * Phase 5: Links to memory systems for conversation continuity.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

// ============================================================================
// Session Events (Phase 6: Memory Consolidation)
// ============================================================================

/**
 * A session-scoped event (observation, thought, action, reflection).
 * Replaces memory_stream from learning-extension for better integration.
 */
export interface SessionEvent {
  id: string;
  sessionId: string;
  timestamp: number; // Unix epoch ms
  type: "observation" | "thought" | "action" | "reflection";
  content: string;
  importance: number; // 1-10 scale
  agentId?: string;
  location?: string;
  people?: string[];
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface SessionEventStore {
  addEvent: (event: Omit<SessionEvent, "id" | "timestamp">) => SessionEvent;
  getEvents: (sessionId: string, options?: {
    type?: SessionEvent["type"];
    minImportance?: number;
    limit?: number;
  }) => SessionEvent[];
  getRecentEvents: (sessionId: string, limit?: number) => SessionEvent[];
  searchEvents: (sessionId: string, query: string, limit?: number) => SessionEvent[];
  deleteEvents: (sessionId: string) => void;
}

export interface SessionEntry {
  sessionId: string;
  sessionKey: string;
  agentId?: string;
  updatedAt: number;
  createdAt: number;
  messageCount?: number;
  modelOverride?: string;
  providerOverride?: string;
  thinkingLevel?: string;
  verboseLevel?: string;
  authProfileOverride?: string;
  skillsSnapshot?: unknown;
  cliSessionIds?: Record<string, string>;
  spawnedBy?: string;
  systemPromptReport?: unknown;
  // Phase 5: Memory integration
  memoryThreadId?: string;           // Links to generative agents memory
  perennialSessionId?: string;       // Links to perennial memory
  userProfileId?: string;            // Links to user profile
  lastRunId?: string;                // Last agent run for this session
  conversationSummary?: string;        // Compacted summary for quick loading
}

export interface SessionStore {
  get: (sessionKey: string) => SessionEntry | undefined;
  set: (sessionKey: string, entry: SessionEntry) => void;
  delete: (sessionKey: string) => void;
  list: () => string[];
  cleanup: (maxAgeMs: number) => void;
  // Phase 5: Memory-aware queries
  getByMemoryThread: (threadId: string) => SessionEntry | undefined;
  getActiveSessions: () => SessionEntry[];
  getSessionsForUser: (userProfileId: string) => SessionEntry[];
  // Phase 6: Session events (consolidated from learning-extension)
  events: SessionEventStore;
}

const DB_PATH = `${process.env.HOME || "~"}/.0xkobold/sessions.db`;

let db: Database | null = null;

function getDb(): Database {
  if (db) return db;

  mkdirSync(dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_key TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_id TEXT,
      updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      model_override TEXT,
      provider_override TEXT,
      thinking_level TEXT,
      verbose_level TEXT,
      auth_profile_override TEXT,
      skills_snapshot TEXT,
      cli_session_ids TEXT,
      spawned_by TEXT,
      system_prompt_report TEXT,
      -- Phase 5: Memory integration columns
      memory_thread_id TEXT,
      perennial_session_id TEXT,
      user_profile_id TEXT,
      last_run_id TEXT,
      conversation_summary TEXT,
      message_count INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_sessions_updated 
    ON sessions(updated_at)
  `);

  // Phase 5: Indexes for memory lookups
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_sessions_memory_thread 
    ON sessions(memory_thread_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_profile 
    ON sessions(user_profile_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_sessions_perennial 
    ON sessions(perennial_session_id)
  `);

  // Phase 6: Session events table (consolidated from learning-extension memory_stream)
  db.run(`
    CREATE TABLE IF NOT EXISTS session_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance INTEGER DEFAULT 5,
      agent_id TEXT,
      location TEXT,
      people TEXT,
      embedding BLOB,
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_session 
    ON session_events(session_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_timestamp 
    ON session_events(timestamp)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_type 
    ON session_events(type)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_importance 
    ON session_events(importance)
  `);

  return db;
}

function rowToEntry(row: Record<string, unknown>): SessionEntry {
  return {
    sessionId: row.session_id as string,
    sessionKey: row.session_key as string,
    agentId: row.agent_id as string | undefined,
    updatedAt: row.updated_at as number,
    createdAt: row.created_at as number,
    modelOverride: row.model_override as string | undefined,
    providerOverride: row.provider_override as string | undefined,
    thinkingLevel: row.thinking_level as string | undefined,
    verboseLevel: row.verbose_level as string | undefined,
    authProfileOverride: row.auth_profile_override as string | undefined,
    skillsSnapshot: row.skills_snapshot ? JSON.parse(row.skills_snapshot as string) : undefined,
    cliSessionIds: row.cli_session_ids ? JSON.parse(row.cli_session_ids as string) : undefined,
    spawnedBy: row.spawned_by as string | undefined,
    systemPromptReport: row.system_prompt_report
      ? JSON.parse(row.system_prompt_report as string)
      : undefined,
    // Phase 5
    memoryThreadId: row.memory_thread_id as string | undefined,
    perennialSessionId: row.perennial_session_id as string | undefined,
    userProfileId: row.user_profile_id as string | undefined,
    lastRunId: row.last_run_id as string | undefined,
    conversationSummary: row.conversation_summary as string | undefined,
    messageCount: (row.message_count as number) || 0,
  };
}

function rowToEvent(row: Record<string, unknown>): SessionEvent {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    timestamp: row.timestamp as number,
    type: row.type as SessionEvent["type"],
    content: row.content as string,
    importance: row.importance as number,
    agentId: row.agent_id as string | undefined,
    location: row.location as string | undefined,
    people: row.people ? JSON.parse(row.people as string) : undefined,
    embedding: row.embedding ? Array.from(new Float32Array(row.embedding as ArrayBuffer)) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
  };
}

export function createSessionEventStore(): SessionEventStore {
  const db = getDb();

  return {
    addEvent(event: Omit<SessionEvent, "id" | "timestamp">): SessionEvent {
      const id = randomUUID();
      const timestamp = Date.now();
      
      db.run(`
        INSERT INTO session_events (
          id, session_id, timestamp, type, content, importance,
          agent_id, location, people, embedding, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        event.sessionId,
        timestamp,
        event.type,
        event.content,
        event.importance,
        event.agentId ?? null,
        event.location ?? null,
        event.people ? JSON.stringify(event.people) : null,
        event.embedding ? Buffer.from(new Float32Array(event.embedding).buffer) : null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]);

      return {
        id,
        timestamp,
        ...event,
      };
    },

    getEvents(sessionId: string, options?: {
      type?: SessionEvent["type"];
      minImportance?: number;
      limit?: number;
    }): SessionEvent[] {
      let sql = "SELECT * FROM session_events WHERE session_id = ?";
      const params: (string | number)[] = [sessionId];

      if (options?.type) {
        sql += " AND type = ?";
        params.push(options.type);
      }

      if (options?.minImportance) {
        sql += " AND importance >= ?";
        params.push(options.minImportance);
      }

      sql += " ORDER BY timestamp DESC";

      if (options?.limit) {
        sql += " LIMIT ?";
        params.push(options.limit);
      }

      const rows = db.query(sql).all(...params) as Record<string, unknown>[];
      return rows.map(rowToEvent);
    },

    getRecentEvents(sessionId: string, limit = 50): SessionEvent[] {
      const rows = db.query(`
        SELECT * FROM session_events 
        WHERE session_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `).all(sessionId, limit) as Record<string, unknown>[];
      return rows.map(rowToEvent);
    },

    searchEvents(sessionId: string, query: string, limit = 10): SessionEvent[] {
      // Simple FTS-like search using LIKE
      const rows = db.query(`
        SELECT * FROM session_events 
        WHERE session_id = ? AND content LIKE ?
        ORDER BY importance DESC, timestamp DESC
        LIMIT ?
      `).all(sessionId, `%${query}%`, limit) as Record<string, unknown>[];
      return rows.map(rowToEvent);
    },

    deleteEvents(sessionId: string): void {
      db.run("DELETE FROM session_events WHERE session_id = ?", [sessionId]);
    },
  };
}

export function createSessionStore(): SessionStore {
  const db = getDb();
  const cache = new Map<string, SessionEntry>();

  // Load existing sessions into cache
  const rows = db.query("SELECT * FROM sessions").all() as Record<string, unknown>[];
  for (const row of rows) {
    const entry = rowToEntry(row);
    cache.set(entry.sessionKey, entry);
  }

  return {
    get(sessionKey: string) {
      // Check cache first
      const cached = cache.get(sessionKey);
      if (cached) return cached;

      // Try database
      const row = db
        .query("SELECT * FROM sessions WHERE session_key = ?")
        .get(sessionKey) as Record<string, unknown> | null;

      if (!row) return undefined;

      const entry = rowToEntry(row);
      cache.set(sessionKey, entry);
      return entry;
    },

    set(sessionKey: string, entry: SessionEntry) {
      cache.set(sessionKey, entry);

      const now = Date.now();
      db.run(
        `
        INSERT INTO sessions (
          session_key, session_id, agent_id, updated_at, created_at,
          model_override, provider_override, thinking_level, verbose_level,
          auth_profile_override, skills_snapshot, cli_session_ids, spawned_by, system_prompt_report,
          memory_thread_id, perennial_session_id, user_profile_id, last_run_id,
          conversation_summary, message_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_key) DO UPDATE SET
          session_id = excluded.session_id,
          agent_id = excluded.agent_id,
          updated_at = excluded.updated_at,
          model_override = excluded.model_override,
          provider_override = excluded.provider_override,
          thinking_level = excluded.thinking_level,
          verbose_level = excluded.verbose_level,
          auth_profile_override = excluded.auth_profile_override,
          skills_snapshot = excluded.skills_snapshot,
          cli_session_ids = excluded.cli_session_ids,
          spawned_by = excluded.spawned_by,
          system_prompt_report = excluded.system_prompt_report,
          memory_thread_id = excluded.memory_thread_id,
          perennial_session_id = excluded.perennial_session_id,
          user_profile_id = excluded.user_profile_id,
          last_run_id = excluded.last_run_id,
          conversation_summary = excluded.conversation_summary,
          message_count = excluded.message_count
      `,
        [
          sessionKey,
          entry.sessionId,
          entry.agentId ?? null,
          now,
          entry.createdAt ?? now,
          entry.modelOverride ?? null,
          entry.providerOverride ?? null,
          entry.thinkingLevel ?? null,
          entry.verboseLevel ?? null,
          entry.authProfileOverride ?? null,
          entry.skillsSnapshot ? JSON.stringify(entry.skillsSnapshot) : null,
          entry.cliSessionIds ? JSON.stringify(entry.cliSessionIds) : null,
          entry.spawnedBy ?? null,
          entry.systemPromptReport ? JSON.stringify(entry.systemPromptReport) : null,
          // Phase 5
          entry.memoryThreadId ?? null,
          entry.perennialSessionId ?? null,
          entry.userProfileId ?? null,
          entry.lastRunId ?? null,
          entry.conversationSummary ?? null,
          entry.messageCount ?? 0,
        ],
      );
    },

    delete(sessionKey: string) {
      cache.delete(sessionKey);
      db.run("DELETE FROM sessions WHERE session_key = ?", [sessionKey]);
    },

    list() {
      return Array.from(cache.keys());
    },

    cleanup(maxAgeMs: number) {
      const cutoff = Date.now() - maxAgeMs;

      // Remove from database
      db.run("DELETE FROM sessions WHERE updated_at < ?", [cutoff]);

      // Remove from cache
      for (const [key, entry] of cache) {
        if (entry.updatedAt < cutoff) {
          cache.delete(key);
        }
      }
    },

    // Phase 5: Memory-aware queries
    getByMemoryThread(threadId: string) {
      const row = db
        .query("SELECT * FROM sessions WHERE memory_thread_id = ? LIMIT 1")
        .get(threadId) as Record<string, unknown> | null;
      
      if (!row) return undefined;
      return rowToEntry(row);
    },

    getActiveSessions() {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
      const rows = db
        .query("SELECT * FROM sessions WHERE updated_at > ? ORDER BY updated_at DESC")
        .all(cutoff) as Record<string, unknown>[];
      return rows.map(rowToEntry);
    },

    getSessionsForUser(userProfileId: string) {
      const rows = db
        .query("SELECT * FROM sessions WHERE user_profile_id = ? ORDER BY updated_at DESC")
        .all(userProfileId) as Record<string, unknown>[];
      return rows.map(rowToEntry);
    },

    // Phase 6: Session events (consolidated from learning-extension)
    events: createSessionEventStore(),
  };
}

export function generateSessionId(): string {
  return randomUUID();
}

// Global singleton
let globalStore: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!globalStore) {
    globalStore = createSessionStore();
  }
  return globalStore;
}

export function resetSessionStore(): void {
  globalStore = null;
}
