/**
 * Session Checkpoint System
 * 
 * Atomic session snapshots for recovery, debugging, and resumption
 * Determinism: Replay any conversation
 * Recoverability: Resume where you left off
 * Debuggability: Inspect agent "thoughts"
 */

import { Database } from "bun:sqlite";

export interface Checkpoint {
  id: string;
  sessionId: string;
  parentCheckpointId?: string;
  
  // State
  messageCount: number;
  conversationData: string;    // Serialized messages
  toolCallState: string;       // Serialized tool calls
  memoryThreadId: string;
  conversationSummary?: string;
  contextWindow: string;       // Current context
  
  // Metadata
  createdAt: string;
  reason: string;              // "auto", "manual", "pre_tool", "post_tool"
  tags: string[];
  
  // Restoration info
  restoredCount: number;       // Times restored
  lastRestoredAt?: string;
}

export interface CheckpointConfig {
  // Auto-checkpoint triggers
  autoCheckpointEvery: number;  // Messages
  checkpointBeforeTools: boolean;
  checkpointAfterTools: boolean;
  
  // Retention
  maxCheckpointsPerSession: number;
  autoPruneAge: number;         // Days
  
  // Forking
  allowForking: boolean;
}

const DEFAULT_CHECKPOINT_CONFIG: CheckpointConfig = {
  autoCheckpointEvery: 10,
  checkpointBeforeTools: true,
  checkpointAfterTools: true,
  maxCheckpointsPerSession: 50,
  autoPruneAge: 7,
  allowForking: true,
};

export class CheckpointManager {
  private db: Database;
  private config: CheckpointConfig;

  constructor(db: Database, config?: Partial<CheckpointConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CHECKPOINT_CONFIG, ...config };
  }

  /**
   * Initialize checkpoint tables
   */
  initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memory_checkpoints (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        message_count INTEGER NOT NULL,
        conversation_data TEXT NOT NULL,      -- JSON
        tool_call_state TEXT,                  -- JSON
        memory_thread_id TEXT NOT NULL,
        conversation_summary TEXT,
        context_window TEXT,                   -- JSON
        created_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        tags TEXT,                             -- JSON array
        restored_count INTEGER DEFAULT 0,
        last_restored_at TEXT,
        FOREIGN KEY (parent_checkpoint_id) REFERENCES memory_checkpoints(id)
      )
    `);

    // Indexes
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON memory_checkpoints(session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON memory_checkpoints(created_at)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_checkpoints_parent ON memory_checkpoints(parent_checkpoint_id)`);

    console.log("[CheckpointManager] Schema initialized");
  }

  /**
   * Create a checkpoint
   */
  create(
    sessionId: string,
    state: {
      messages: any[];
      toolCalls?: any[];
      memoryThreadId: string;
      summary?: string;
    },
    reason: "auto" | "manual" | "pre_tool" | "post_tool",
    tags: string[] = [],
    parentCheckpointId?: string
  ): string {
    const id = `ckpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
    // Prune old checkpoints if needed
    this.pruneCheckpoints(sessionId);

    this.db.query(`
      INSERT INTO memory_checkpoints (
        id, session_id, parent_checkpoint_id, message_count,
        conversation_data, tool_call_state, memory_thread_id,
        conversation_summary, context_window, created_at, reason, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sessionId,
      parentCheckpointId || null,
      state.messages.length,
      JSON.stringify(state.messages),
      state.toolCalls ? JSON.stringify(state.toolCalls) : null,
      state.memoryThreadId,
      state.summary || null,
      JSON.stringify(state.messages.slice(-5)), // Last 5 messages as context
      new Date().toISOString(),
      reason,
      JSON.stringify(tags)
    );

    return id;
  }

  /**
   * Restore from checkpoint
   */
  restore(checkpointId: string): Checkpoint | null {
    const row = this.db.query(`SELECT * FROM memory_checkpoints WHERE id = ?`).get(checkpointId) as any;
    
    if (!row) return null;

    // Update restore count
    this.db.query(`
      UPDATE memory_checkpoints 
      SET restored_count = restored_count + 1, last_restored_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), checkpointId);

    return {
      id: row.id,
      sessionId: row.session_id,
      parentCheckpointId: row.parent_checkpoint_id,
      messageCount: row.message_count,
      conversationData: row.conversation_data,
      toolCallState: row.tool_call_state,
      memoryThreadId: row.memory_thread_id,
      conversationSummary: row.conversation_summary,
      contextWindow: row.context_window,
      createdAt: row.created_at,
      reason: row.reason,
      tags: JSON.parse(row.tags || "[]"),
      restoredCount: row.restored_count + 1,
      lastRestoredAt: new Date().toISOString(),
    };
  }

  /**
   * Fork session from checkpoint
   */
  fork(
    checkpointId: string,
    newSessionId: string,
    reason: string
  ): string | null {
    if (!this.config.allowForking) {
      console.warn("[CheckpointManager] Forking disabled");
      return null;
    }

    const original = this.restore(checkpointId);
    if (!original) return null;

    const newId = this.create(
      newSessionId,
      {
        messages: JSON.parse(original.conversationData),
        toolCalls: original.toolCallState ? JSON.parse(original.toolCallState) : undefined,
        memoryThreadId: original.memoryThreadId,
        summary: original.conversationSummary,
      },
      "manual",
      [...original.tags, "fork", reason],
      checkpointId
    );

    console.log(`[CheckpointManager] Forked ${checkpointId} → ${newId} for session ${newSessionId}`);
    return newId;
  }

  /**
   * Get checkpoints for session
   */
  getSessionCheckpoints(sessionId: string, limit = 20): Array<{
    id: string;
    messageCount: number;
    createdAt: string;
    reason: string;
    tags: string[];
    restoredCount: number;
    summary?: string;
  }> {
    const rows = this.db.query(`
      SELECT * FROM memory_checkpoints
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, limit) as any[];

    return rows.map(r => ({
      id: r.id,
      messageCount: r.message_count,
      createdAt: r.created_at,
      reason: r.reason,
      tags: JSON.parse(r.tags || "[]"),
      restoredCount: r.restored_count,
      summary: r.conversation_summary,
    }));
  }

  /**
   * Get checkpoint chain (for tree visualization)
   */
  getCheckpointChain(checkpointId: string): Checkpoint[] {
    const chain: Checkpoint[] = [];
    let current: string | undefined = checkpointId;

    while (current) {
      const row = this.db.query(`SELECT * FROM memory_checkpoints WHERE id = ?`).get(current) as any;
      if (!row) break;

      chain.push({
        id: row.id,
        sessionId: row.session_id,
        parentCheckpointId: row.parent_checkpoint_id,
        messageCount: row.message_count,
        conversationData: row.conversation_data,
        toolCallState: row.tool_call_state,
        memoryThreadId: row.memory_thread_id,
        conversationSummary: row.conversation_summary,
        contextWindow: row.context_window,
        createdAt: row.created_at,
        reason: row.reason,
        tags: JSON.parse(row.tags || "[]"),
        restoredCount: row.restored_count,
        lastRestoredAt: row.last_restored_at,
      });

      current = row.parent_checkpoint_id;
    }

    return chain.reverse();
  }

  /**
   * Delete checkpoint
   */
  delete(checkpointId: string): boolean {
    // Check for children
    const children = this.db.query(`SELECT COUNT(*) as n FROM memory_checkpoints WHERE parent_checkpoint_id = ?`).get(checkpointId) as { n: number };
    
    if (children.n > 0) {
      throw new Error(`Checkpoint ${checkpointId} has ${children.n} child checkpoint(s). Delete children first.`);
    }

    this.db.query(`DELETE FROM memory_checkpoints WHERE id = ?`).run(checkpointId);
    return true;
  }

  /**
   * Prune old checkpoints
   */
  private pruneCheckpoints(sessionId: string): void {
    // Count current
    const count = this.db.query(`SELECT COUNT(*) as n FROM memory_checkpoints WHERE session_id = ?`).get(sessionId) as { n: number };

    if (count.n >= this.config.maxCheckpointsPerSession) {
      // Delete oldest
      const toDelete = count.n - this.config.maxCheckpointsPerSession + 1;
      this.db.query(`
        DELETE FROM memory_checkpoints 
        WHERE session_id = ? 
        AND id IN (
          SELECT id FROM memory_checkpoints 
          WHERE session_id = ?
          ORDER BY created_at ASC
          LIMIT ?
        )
      `).run(sessionId, sessionId, toDelete);
    }

    // Delete by age
    const ageCutoff = new Date(Date.now() - this.config.autoPruneAge * 24 * 60 * 60 * 1000).toISOString();
    this.db.query(`
      DELETE FROM memory_checkpoints 
      WHERE session_id = ? AND created_at < ?
    `).run(sessionId, ageCutoff);
  }

  /**
   * Auto-checkpoint based on message count
   */
  shouldAutoCheckpoint(sessionId: string, messageCount: number): boolean {
    if (messageCount % this.config.autoCheckpointEvery === 0) {
      return true;
    }
    return false;
  }

  /**
   * Replay checkpoint (for debugging)
   */
  replay(checkpointId: string): {
    messages: any[];
    toolCalls?: any[];
    summary?: string;
  } | null {
    const checkpoint = this.restore(checkpointId);
    if (!checkpoint) return null;

    return {
      messages: JSON.parse(checkpoint.conversationData),
      toolCalls: checkpoint.toolCallState ? JSON.parse(checkpoint.toolCallState) : undefined,
      summary: checkpoint.conversationSummary,
    };
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalCheckpoints: number;
    totalSessions: number;
    avgPerSession: number;
    mostRestored: { id: string; count: number } | null;
  } {
    const total = (this.db.query(`SELECT COUNT(*) as n FROM memory_checkpoints`).get() as { n: number })?.n || 0;
    const sessions = (this.db.query(`SELECT COUNT(DISTINCT session_id) as n FROM memory_checkpoints`).get() as { n: number })?.n || 0;
    
    const mostRestored = this.db.query(`
      SELECT id, restored_count 
      FROM memory_checkpoints 
      WHERE restored_count > 0 
      ORDER BY restored_count DESC 
      LIMIT 1
    `).get() as any;

    return {
      totalCheckpoints: total,
      totalSessions: sessions,
      avgPerSession: sessions > 0 ? Math.round(total / sessions) : 0,
      mostRestored: mostRestored ? { id: mostRestored.id, count: mostRestored.restored_count } : null,
    };
  }
}

export { DEFAULT_CHECKPOINT_CONFIG };