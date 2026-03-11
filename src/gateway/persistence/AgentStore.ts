/**
 * AgentStore - Persistent storage for Gateway agents
 * 
 * Stores agent state in SQLite so agents survive process restarts.
 * Uses WAL mode for performance. All agents are persisted, restored
 * on startup if they were active or recently completed.
 */

import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Types matching the runtime Agent interface
export type AgentStatus = "idle" | "running" | "completed" | "error";
export type AgentType = "primary" | "orchestrator" | "worker";
export type AgentEventType = "spawned" | "status_change" | "killed" | "completed" | "resumed" | "tokens_updated" | "checkpoint";

export interface PersistedAgent {
  id: string;
  parentId?: string;
  sessionKey: string;
  depth: number;
  type: AgentType;
  capabilities: string[];
  status: AgentStatus;
  task?: string;
  model: string;
  workspace: string;
  tokens: { input: number; output: number };
  stats: { runtime: number; toolCalls: number };
  spawnedAt: number; // Unix timestamp in ms
  updatedAt: number; // Unix timestamp in ms
}

export interface AgentEvent {
  id: string;
  agentId: string;
  eventType: AgentEventType;
  previousStatus?: AgentStatus;
  newStatus?: AgentStatus;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * AgentStore handles persistence of agent state to SQLite
 */
export class AgentStore {
  private db: Database;
  private dbPath: string;

  /**
   * Create a new AgentStore
   * @param dbPath Path to SQLite database file
   */
  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    
    // Enable WAL mode for better concurrency and performance
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA synchronous = NORMAL;");
    this.db.run("PRAGMA foreign_keys = ON;");
    
    // Initialize schema
    this.initializeSchema();
    
    console.log(`[AgentStore] Initialized at ${dbPath}`);
  }

  /**
   * Create tables and indexes if they don't exist
   */
  private initializeSchema(): void {
    // Try to load schema from SQL file first
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const schemaPath = join(__dirname, "schema.sql");
      
      if (existsSync(schemaPath)) {
        const schema = readFileSync(schemaPath, "utf-8");
        this.db.run(schema);
        console.log("[AgentStore] Loaded schema from schema.sql");
        return;
      }
    } catch {
      // Fall through to embedded schema
    }

    // Embedded schema fallback
    this.db.run(`
      CREATE TABLE IF NOT EXISTS persisted_agents (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES persisted_agents(id) ON DELETE SET NULL,
        session_key TEXT NOT NULL,
        depth INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL CHECK(type IN ('primary', 'orchestrator', 'worker')),
        capabilities TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'error')),
        task TEXT,
        model TEXT NOT NULL DEFAULT 'ollama/minimax-m2.5:cloud',
        workspace TEXT NOT NULL,
        tokens_input INTEGER NOT NULL DEFAULT 0,
        tokens_output INTEGER NOT NULL DEFAULT 0,
        stats_runtime INTEGER NOT NULL DEFAULT 0,
        stats_tool_calls INTEGER NOT NULL DEFAULT 0,
        spawned_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS agent_events (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES persisted_agents(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK(event_type IN ('spawned', 'status_change', 'killed', 'completed', 'resumed', 'tokens_updated', 'checkpoint')),
        previous_status TEXT,
        new_status TEXT,
        timestamp INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `);

    // Create indexes
    this.db.run("CREATE INDEX IF NOT EXISTS idx_agents_status ON persisted_agents(status)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_agents_parent ON persisted_agents(parent_id)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_agents_updated ON persisted_agents(updated_at)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_events_agent ON agent_events(agent_id)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_events_agent_time ON agent_events(agent_id, timestamp DESC)");

    console.log("[AgentStore] Initialized embedded schema");
  }

  /**
   * Create a new agent in the database
   */
  async createAgent(agent: PersistedAgent): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO persisted_agents (
        id, parent_id, session_key, depth, type, capabilities, status,
        task, model, workspace, tokens_input, tokens_output,
        stats_runtime, stats_tool_calls, spawned_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      agent.id,
      agent.parentId || null,
      agent.sessionKey,
      agent.depth,
      agent.type,
      JSON.stringify(agent.capabilities),
      agent.status,
      agent.task || null,
      agent.model,
      agent.workspace,
      agent.tokens.input,
      agent.tokens.output,
      agent.stats.runtime,
      agent.stats.toolCalls,
      agent.spawnedAt,
      agent.updatedAt
    );

    await this.logEvent(agent.id, "spawned");
  }

  /**
   * Retrieve an agent by ID
   */
  async getAgent(id: string): Promise<PersistedAgent | null> {
    const row = this.db.query("SELECT * FROM persisted_agents WHERE id = ?").get(id) as Record<string, any> | undefined;
    
    if (!row) return null;
    return this.rowToAgent(row);
  }

  /**
   * Update specific fields of an agent
   */
  async updateAgent(id: string, updates: Partial<PersistedAgent>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.parentId !== undefined) {
      sets.push("parent_id = ?");
      values.push(updates.parentId);
    }
    if (updates.sessionKey !== undefined) {
      sets.push("session_key = ?");
      values.push(updates.sessionKey);
    }
    if (updates.depth !== undefined) {
      sets.push("depth = ?");
      values.push(updates.depth);
    }
    if (updates.type !== undefined) {
      sets.push("type = ?");
      values.push(updates.type);
    }
    if (updates.capabilities !== undefined) {
      sets.push("capabilities = ?");
      values.push(JSON.stringify(updates.capabilities));
    }
    if (updates.status !== undefined) {
      sets.push("status = ?");
      values.push(updates.status);
    }
    if (updates.task !== undefined) {
      sets.push("task = ?");
      values.push(updates.task);
    }
    if (updates.model !== undefined) {
      sets.push("model = ?");
      values.push(updates.model);
    }
    if (updates.workspace !== undefined) {
      sets.push("workspace = ?");
      values.push(updates.workspace);
    }
    if (updates.tokens !== undefined) {
      sets.push("tokens_input = ?");
      values.push(updates.tokens.input);
      sets.push("tokens_output = ?");
      values.push(updates.tokens.output);
    }
    if (updates.stats !== undefined) {
      sets.push("stats_runtime = ?");
      values.push(updates.stats.runtime);
      sets.push("stats_tool_calls = ?");
      values.push(updates.stats.toolCalls);
    }

    // Always update updated_at
    sets.push("updated_at = ?");
    values.push(Date.now());

    values.push(id);

    const query = `UPDATE persisted_agents SET ${sets.join(", ")} WHERE id = ?`;
    this.db.run(query, values);
  }

  /**
   * Update just the status of an agent, with event logging
   */
  async updateStatus(id: string, newStatus: AgentStatus, metadata?: Record<string, unknown>): Promise<void> {
    // Get current status for event logging
    const current = await this.getAgent(id);
    const previousStatus = current?.status;

    const stmt = this.db.prepare(`
      UPDATE persisted_agents SET status = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(newStatus, Date.now(), id);

    await this.logEvent(id, "status_change", {
      previousStatus,
      newStatus,
      ...metadata
    });
  }

  /**
   * Delete an agent (hard delete)
   */
  async deleteAgent(id: string): Promise<void> {
    this.db.run("DELETE FROM persisted_agents WHERE id = ?", [id]);
  }

  /**
   * List agents with optional filtering
   */
  async listAgents(filter?: {
    status?: AgentStatus;
    parentId?: string;
    type?: AgentType;
  }): Promise<PersistedAgent[]> {
    let query = "SELECT * FROM persisted_agents WHERE 1=1";
    const params: any[] = [];

    if (filter?.status) {
      query += " AND status = ?";
      params.push(filter.status);
    }
    if (filter?.parentId) {
      query += " AND parent_id = ?";
      params.push(filter.parentId);
    }
    if (filter?.type) {
      query += " AND type = ?";
      params.push(filter.type);
    }

    query += " ORDER BY updated_at DESC";

    const rows = this.db.query(query).all(...params) as Record<string, any>[];
    return rows.map(r => this.rowToAgent(r));
  }

  /**
   * Get all children of a parent agent
   */
  async getChildren(parentId: string): Promise<PersistedAgent[]> {
    const rows = this.db.query("SELECT * FROM persisted_agents WHERE parent_id = ? ORDER BY spawned_at")
      .all(parentId) as Record<string, any>[];
    return rows.map(r => this.rowToAgent(r));
  }

  /**
   * Get agent and all descendants (full tree)
   */
  async getAgentTree(rootId: string): Promise<PersistedAgent[]> {
    const result: PersistedAgent[] = [];
    const toProcess = [rootId];
    const processed = new Set<string>();

    while (toProcess.length > 0) {
      const id = toProcess.shift()!;
      if (processed.has(id)) continue;
      processed.add(id);

      const agent = await this.getAgent(id);
      if (agent) {
        result.push(agent);
        const children = await this.getChildren(id);
        for (const child of children) {
          if (!processed.has(child.id)) {
            toProcess.push(child.id);
          }
        }
      }
    }

    return result;
  }

  /**
   * Get currently active (running or idle) agents
   */
  async getActiveAgents(): Promise<PersistedAgent[]> {
    return this.listAgents({ status: "running" });
  }

  /**
   * Alias for getActiveAgents (compatibility with gateway-server)
   */
  async listActive(): Promise<PersistedAgent[]> {
    return this.getActiveAgents();
  }

  /**
   * Get recently completed agents (last N hours)
   */
  async getRecentCompleted(hours: number = 24): Promise<PersistedAgent[]> {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const rows = this.db.query(`
      SELECT * FROM persisted_agents 
      WHERE status = 'completed' AND updated_at > ? 
      ORDER BY updated_at DESC
    `).all(cutoff) as Record<string, any>[];
    return rows.map(r => this.rowToAgent(r));
  }

  /**
   * Get agents that should be restored on startup:
   * - Status is 'running' or 'idle'
   * - OR status is 'completed' within last N hours
   */
  async restoreAgentsForResume(maxAgeHours: number = 24): Promise<PersistedAgent[]> {
    const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    
    const rows = this.db.query(`
      SELECT * FROM persisted_agents 
      WHERE status IN ('running', 'idle') 
         OR (status = 'completed' AND updated_at > ?)
      ORDER BY depth ASC, spawned_at ASC
    `).all(cutoff) as Record<string, any>[];

    return rows.map(r => this.rowToAgent(r));
  }

  /**
   * Delete old completed agents to free space
   * @returns Number of agents deleted
   */
  async cleanupOldAgents(maxAgeHours: number = 168): Promise<number> {
    const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    
    const result = this.db.run(`
      DELETE FROM persisted_agents 
      WHERE status IN ('completed', 'error') AND updated_at < ?
    `, [cutoff]);

    const count = result.changes;
    if (count > 0) {
      // Run VACUUM to reclaim space
      this.db.run("VACUUM");
      console.log(`[AgentStore] Cleaned up ${count} old agents`);
    }

    return count;
  }

  /**
   * Log a lifecycle event for an agent
   */
  async logEvent(
    agentId: string,
    eventType: AgentEventType,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    // Get previous/new status if it's a status change
    let previousStatus: AgentStatus | undefined;
    let newStatus: AgentStatus | undefined;
    
    if (eventType === "status_change") {
      previousStatus = metadata?.previousStatus as AgentStatus;
      newStatus = metadata?.newStatus as AgentStatus;
    }

    const stmt = this.db.prepare(`
      INSERT INTO agent_events (id, agent_id, event_type, previous_status, new_status, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      eventId,
      agentId,
      eventType,
      previousStatus || null,
      newStatus || null,
      Date.now(),
      JSON.stringify(metadata || {})
    );
  }

  /**
   * Get events for an agent
   */
  async getAgentEvents(agentId: string, limit: number = 50): Promise<AgentEvent[]> {
    const rows = this.db.query(`
      SELECT * FROM agent_events 
      WHERE agent_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(agentId, limit) as Record<string, any>[];

    return rows.map(r => this.rowToEvent(r)).reverse(); // Oldest first
  }

  /**
   * Get total count of persisted agents
   */
  async getAgentCount(): Promise<number> {
    const row = this.db.query("SELECT COUNT(*) as count FROM persisted_agents").get() as { count: number };
    return row?.count || 0;
  }

  /**
   * Force checkpoint to ensure all data is written to disk
   */
  async checkpoint(): Promise<void> {
    this.db.run("PRAGMA wal_checkpoint(TRUNCATE)");
    console.log("[AgentStore] Checkpoint completed");
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    await this.checkpoint();
    this.db.close();
    console.log("[AgentStore] Closed");
  }

  /**
   * Convert a database row to PersistedAgent
   */
  private rowToAgent(row: Record<string, any>): PersistedAgent {
    return {
      id: row.id,
      parentId: row.parent_id || undefined,
      sessionKey: row.session_key,
      depth: row.depth,
      type: row.type as AgentType,
      capabilities: JSON.parse(row.capabilities),
      status: row.status as AgentStatus,
      task: row.task || undefined,
      model: row.model,
      workspace: row.workspace,
      tokens: {
        input: row.tokens_input,
        output: row.tokens_output,
      },
      stats: {
        runtime: row.stats_runtime,
        toolCalls: row.stats_tool_calls,
      },
      spawnedAt: row.spawned_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Convert a database row to AgentEvent
   */
  private rowToEvent(row: Record<string, any>): AgentEvent {
    return {
      id: row.id,
      agentId: row.agent_id,
      eventType: row.event_type,
      previousStatus: row.previous_status || undefined,
      newStatus: row.new_status || undefined,
      timestamp: row.timestamp,
      metadata: JSON.parse(row.metadata || "{}"),
    };
  }
}

export default AgentStore;
