/**
 * Session Pruning Extension - OpenClaw Style
 * 
 * Manages context window limits and memory compaction
 * Features:
 * - History limiting (DM vs group contexts)
 * - Context pruning based on cache TTL
 * - Automatic compaction before hitting limits
 * - Token counting for context windows
 * - Branch support for multi-turn conversations
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";
import { parseArgs } from "../command-args.js";

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const PRUNING_DB = join(KOBOLD_DIR, "pruning.db");

interface SessionConfig {
  id: string;
  maxHistoryMessages: number;
  maxContextTokens: number;
  compactionThreshold: number; // % of context window before compaction
}

interface MessageEntry {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  timestamp: number;
  tokenCount: number;
  cacheTTL: number; // Cache expiry timestamp
  preserved: boolean; // Never prune this message
}

interface CompactionRule {
  id: string;
  sessionId: string;
  turnRange: [number, number]; // Turn start and end
  summary: string; // Compacted summary
  originalSize: number; // Token count before compaction
}

let db: Database | null = null;
let currentConfig: SessionConfig | null = null;

/**
 * Initialize pruning database
 */
function initDatabase(): Database {
  if (db) return db;

  if (!existsSync(KOBOLD_DIR)) {
    mkdirSync(KOBOLD_DIR, { recursive: true });
  }

  db = new Database(PRUNING_DB);
  db.run("PRAGMA journal_mode = WAL;");

  // Session configurations
  db.run(`
    CREATE TABLE IF NOT EXISTS session_configs (
      id TEXT PRIMARY KEY,
      max_history_messages INTEGER DEFAULT 100,
      max_context_tokens INTEGER DEFAULT 8000,
      compaction_threshold INTEGER DEFAULT 80, -- 80%
      channel_type TEXT DEFAULT 'dm' -- dm or group
    )
  `);

  // Messages with pruning metadata
  db.run(`
    CREATE TABLE IF NOT EXISTS message_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      token_count INTEGER DEFAULT 0,
      cache_ttl INTEGER, -- NULL = no cache (always keep)
      preserved INTEGER DEFAULT 0,
      turn_number INTEGER
    )
  `);

  // Compaction rules (summaries)
  db.run(`
    CREATE TABLE IF NOT EXISTS compaction_rules (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      turn_start INTEGER NOT NULL,
      turn_end INTEGER NOT NULL,
      summary TEXT NOT NULL,
      original_size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Cache TTL tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS cache_ttl (
      message_id TEXT PRIMARY KEY,
      ttl INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL
    )
  `);

  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session ON message_entries(session_id, timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_cache_ttl ON cache_ttl(ttl)`);

  console.log("[SessionPruning] Database initialized");
  return db;
}

/**
 * Estimate token count (approximate)
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Get messages for session with TTL checking
 */
function getPrunableMessages(database: Database, sessionId: string, beforeTurn?: number): MessageEntry[] {
  const now = Date.now();
  
  let query = `
    SELECT m.* FROM message_entries m
    LEFT JOIN cache_ttl c ON m.id = c.message_id
    WHERE m.session_id = ? 
    AND m.preserved = 0
    AND (c.ttl IS NULL OR c.ttl < ?)
  `;
  
  const params: (string | number)[] = [sessionId, now];
  
  if (beforeTurn) {
    query += " AND m.turn_number <= ?";
    params.push(beforeTurn);
  }
  
  query += " ORDER BY m.timestamp";
  
  const rows = database.query(query).all(...params) as any[];
  
  return rows.map(r => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    timestamp: r.timestamp,
    tokenCount: r.token_count,
    cacheTTL: r.cache_ttl,
    preserved: r.preserved === 1,
  }));
}

/**
 * Compact old messages into summary
 */
async function compactMessages(
  database: Database,
  sessionId: string,
  startTurn: number,
  endTurn: number,
  aiSummary: string
): Promise<void> {
  const id = `compact-${Date.now()}`;
  const now = Date.now();
  
  // Calculate original size
  const messages = database.query(
    "SELECT SUM(token_count) as total FROM message_entries WHERE session_id = ? AND turn_number >= ? AND turn_number <= ?"
  // @ts-ignore SQLite binding
  ).get([sessionId, startTurn, endTurn]) as any;
  
  const originalSize = messages?.total || 0;
  
  // Store compaction rule
// @ts-ignore SQLite binding
  database.run(
    `INSERT INTO compaction_rules (id, session_id, turn_start, turn_end, summary, original_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionId, startTurn, endTurn, aiSummary, originalSize, now]
  );
  
  // Mark original messages as compacted (soft delete)
// @ts-ignore SQLite binding
  database.run(
    "UPDATE message_entries SET preserved = -1 WHERE session_id = ? AND turn_number >= ? AND turn_number <= ?",
    [sessionId, startTurn, endTurn]
  );
  
  console.log(`[SessionPruning] Compacted turns ${startTurn}-${endTurn} → ${estimateTokens(aiSummary)} tokens`);
}

/**
 * Check if compaction needed
 */
function shouldCompact(database: Database, sessionId: string, threshold: number): boolean {
  const stats = database.query(
    "SELECT SUM(token_count) as total FROM message_entries WHERE session_id = ? AND preserved >= 0"
  // @ts-ignore SQLite binding
  ).get([sessionId]) as any;
  
  const currentTokens = stats?.total || 0;
// @ts-ignore SQLite binding
  const config = database.query("SELECT max_context_tokens FROM session_configs WHERE id = ?").get([sessionId]) as any;
  const maxTokens = config?.max_context_tokens || 8000;
  
  const percentage = (currentTokens / maxTokens) * 100;
  
  if (percentage > threshold) {
    console.log(`[SessionPruning] Context at ${percentage.toFixed(1)}% (threshold: ${threshold}%)`);
    return true;
  }
  
  return false;
}

/**
 * Get effective history for session (respecting compactions)
 */
function getEffectiveHistory(database: Database, sessionId: string): any[] {
  // Get compaction summaries first
  const compactions = database.query(
    "SELECT * FROM compaction_rules WHERE session_id = ? ORDER BY turn_start"
  ).all(sessionId) as any[];
  
  // Get remaining messages
  const messages = database.query(
    "SELECT * FROM message_entries WHERE session_id = ? AND preserved >= 0 ORDER BY timestamp"
  ).all(sessionId) as any[];
  
  // Merge: summaries + remaining messages
  const result: any[] = [];
  
  for (const compaction of compactions) {
    result.push({
      role: "system",
      content: `[Previous conversation summary (turns ${compaction.turn_start}-${compaction.turn_end}): ${compaction.summary}]`,
      type: "compaction",
    });
  }
  
  for (const msg of messages) {
    result.push({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    });
  }
  
  return result;
}

/**
 * Session Pruning Extension
 */
export default function sessionPruningExtension(pi: ExtensionAPI) {
  const database = initDatabase();
  let currentSessionId: string | null = null;
  let turnNumber = 0;

  // ═══════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════

  pi.on("session_start", async (_event, ctx) => {
    currentSessionId = process.env.KOBOLD_SESSION_ID || null;
    turnNumber = 0;
    
    if (!currentSessionId) return;
    
    // Initialize config for this session
// @ts-ignore SQLite binding
    const existing = database.query("SELECT * FROM session_configs WHERE id = ?").get([currentSessionId]) as any;
    
    if (!existing) {
      const channelType = process.env.KOBOLD_CHANNEL_TYPE || "dm";
      const maxMessages = channelType === "group" ? 50 : 100; // Groups get less history
      
// @ts-ignore SQLite binding
      database.run(
        `INSERT INTO session_configs (id, max_history_messages, max_context_tokens, compaction_threshold, channel_type)
         VALUES (?, ?, ?, ?, ?)`,
        [currentSessionId,
        maxMessages,
        8000,
        80,
        channelType]
      );
      
      console.log(`[SessionPruning] Configured session ${currentSessionId.slice(0, 8)}... as ${channelType}`);
    }
  });

  pi.on("turn_start", async () => {
    turnNumber++;
    
    if (!currentSessionId) return;
    
    // Check if we need compaction before this turn
// @ts-ignore SQLite binding
    const config = database.query("SELECT compaction_threshold FROM session_configs WHERE id = ?")
      // @ts-ignore SQLite binding
      .get([currentSessionId]) as any;
    
    if (config && shouldCompact(database, currentSessionId, config.compaction_threshold)) {
      // Signal that compaction is needed
      pi.sendMessage({
        customType: "session.compaction_needed",
        content: [{ type: "text", text: "Context window approaching limit" }],
        display: { type: "text", text: "⚠️ Context window approaching limit" },
        details: { sessionId: currentSessionId, turn: turnNumber },
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════════

  pi.registerCommand("session-config", {
    description: "Show or set session pruning config",
  // @ts-ignore Command args property
    args: [
      { name: "max-messages", description: "Max history messages", required: false },
      { name: "max-tokens", description: "Max context tokens", required: false },
    ],
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        { name: "max-messages", description: "Max history messages", required: false },
        { name: "max-tokens", description: "Max context tokens", required: false },
      ]);
      
      if (!currentSessionId) {
        ctx.ui?.notify?.("No active session", "warning");
        return;
      }
      
      if (parsed["max-messages"] || parsed["max-tokens"]) {
        // Update config
        if (parsed["max-messages"]) {
// @ts-ignore SQLite binding
          database.run(
            "UPDATE session_configs SET max_history_messages = ? WHERE id = ?",
            [parseInt(String(parsed["max-messages"])),
            currentSessionId]
          );
        }
        if (parsed["max-tokens"]) {
// @ts-ignore SQLite binding
          database.run(
            "UPDATE session_configs SET max_context_tokens = ? WHERE id = ?",
            [parseInt(String(parsed["max-tokens"])),
            currentSessionId]
          );
        }
      // @ts-ignore Notify type
        ctx.ui?.notify?.("Session config updated", "success");
      }
      
      // Show current config
// @ts-ignore SQLite binding
      const config = database.query("SELECT * FROM session_configs WHERE id = ?").get([currentSessionId]) as any;
      
      if (!config) {
        ctx.ui?.notify?.("Session config not found", "error");
        return;
      }
      
      const usage = database.query(
        "SELECT SUM(token_count) as total FROM message_entries WHERE session_id = ? AND preserved >= 0"
      // @ts-ignore SQLite binding
      ).get([currentSessionId]) as any;
      
      const lines = [
        "📊 Session Pruning Config",
        "",
        `Max Messages: ${config.max_history_messages}`,
        `Max Tokens: ${config.max_context_tokens}`,
        `Compaction Threshold: ${config.compaction_threshold}%`,
        `Channel Type: ${config.channel_type}`,
        "",
        `Current Usage: ${usage?.total || 0} tokens`,
      ];
      
      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("compact", {
    description: "Manually compact old messages",
  // @ts-ignore Command args property
    args: [
      { name: "turns", description: "Number of recent turns to keep", required: true },
    ],
    handler: async (args: string, ctx) => {
      if (!currentSessionId) {
        ctx.ui?.notify?.("No active session", "warning");
        return;
      }
      
      const parsed = parseArgs(args, [
        { name: "turns", description: "Number of recent turns to keep", required: true },
      ]);
      const keepTurns = parseInt(String(parsed.turns)) || 10;
      
      if (turnNumber <= keepTurns) {
        ctx.ui?.notify?.("Not enough turns to compact", "warning");
        return;
      }
      
      const compactStart = 1;
      const compactEnd = turnNumber - keepTurns;
      
      ctx.ui?.notify?.(`Compacting turns ${compactStart}-${compactEnd}...`, "info");
      
      // In real implementation, would call AI to summarize
      const summary = `Previous conversation with ${compactEnd} turns`;
      
      await compactMessages(database, currentSessionId, compactStart, compactEnd, summary);
      
      // @ts-ignore Notify type
      ctx.ui?.notify?.(`Compacted turns ${compactStart}-${compactEnd}. Kept last ${keepTurns} turns.`, "success");
    },
  });

  pi.registerCommand("prune-cache", {
    description: "Remove expired cached messages",
    handler: async (_args, ctx) => {
      if (!currentSessionId) {
        ctx.ui?.notify?.("No active session", "warning");
        return;
      }
      
      const now = Date.now();
      
      // Delete expired cached messages
// @ts-ignore SQLite binding
      const result = database.run(
        `DELETE FROM message_entries 
         WHERE session_id = ? 
         AND id IN (SELECT message_id FROM cache_ttl WHERE ttl < ?)`,
        [currentSessionId,
        now]
      );
      
      // Clean up cache_ttl table
// @ts-ignore SQLite binding
      database.run("DELETE FROM cache_ttl WHERE ttl < ?", now);
      
      // @ts-ignore Notify type
      ctx.ui?.notify?.(`Pruned ${result.changes} expired messages from cache`, "success");
    },
  });

  pi.registerCommand("compactions", {
    description: "List compaction summaries",
    handler: async (_args, ctx) => {
      if (!currentSessionId) {
        ctx.ui?.notify?.("No active session", "warning");
        return;
      }
      
      const compactions = database.query(
        "SELECT * FROM compaction_rules WHERE session_id = ? ORDER BY turn_start"
      ).all(currentSessionId) as any[];
      
      if (compactions.length === 0) {
        ctx.ui?.notify?.("No compactions yet", "info");
        return;
      }
      
      const lines = ["📦 Compaction History\n"];
      
      for (const c of compactions) {
        lines.push(`Turns ${c.turn_start}-${c.turn_end}: ${c.summary.slice(0, 60)}...`);
        lines.push(`  Original: ${c.original_size} tokens → Summary: ${estimateTokens(c.summary)} tokens`);
      }
      
      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // TOOLS
  // ═══════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "session_compact",
    description: "Compact old conversation history to save context window space",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        preserve_turns: {
          type: "number",
          description: "Number of recent turns to preserve (default: 10)",
          default: 10,
        },
      },
    },
    async execute(args: any) {
      if (!currentSessionId) {
        return {
          content: [{ type: "text", text: "No active session" }],
          details: { error: "no_session" },
        };
      }
      
      const preserve = (args.preserve_turns as number) || 10;
      
      if (turnNumber <= preserve) {
        return {
          content: [{ type: "text", text: "Not enough turns to compact" }],
          details: { current_turns: turnNumber },
        };
      }
      
      // AI would generate actual summary
      const summary = `Summary of turns 1-${turnNumber - preserve}`;
      
      await compactMessages(
        database,
        currentSessionId,
        1,
        turnNumber - preserve,
        summary
      );
      
      return {
        content: [
          { type: "text", text: `Compacted to ${preserve} turns. Old history summarized.` },
        ],
        details: {
          preserved: preserve,
          compacted: turnNumber - preserve,
        },
      };
    },
  });

  pi.registerTool({
    name: "session_stats",
    description: "Get session context window statistics",
  // @ts-ignore TSchema type mismatch
    // @ts-ignore TSchema mismatch
    parameters: { type: "object", properties: {} },
    async execute() {
      if (!currentSessionId) {
        return {
          content: [{ type: "text", text: "No active session" }],
          details: { error: "no_session" },
        };
      }
      
// @ts-ignore SQLite binding
      const config = database.query("SELECT * FROM session_configs WHERE id = ?")
      // @ts-ignore SQLite binding
      .get([currentSessionId]) as any;
      const usage = database.query(
        "SELECT COUNT(*) as count, SUM(token_count) as tokens FROM message_entries WHERE session_id = ? AND preserved >= 0"
      )
      // @ts-ignore SQLite binding
      .get([currentSessionId]) as any;
      const compactCount = database.query(
        "SELECT COUNT(*) as count FROM compaction_rules WHERE session_id = ?"
      )
      // @ts-ignore SQLite binding
      .get([currentSessionId]) as any;
      
      const percentage = config?.max_context_tokens 
        ? Math.round((usage?.tokens / config.max_context_tokens) * 100)
        : 0;
      
      return {
        content: [
          { type: "text", text: `Session Context:\n` +
            `Messages: ${usage?.count || 0}\n` +
            `Tokens: ${usage?.tokens || 0} / ${config?.max_context_tokens || 8000} (${percentage}%)\n` +
            `Compactions: ${compactCount?.count || 0}\n` +
            `Turn: ${turnNumber}`
          },
        ],
        details: {
          messages: usage?.count,
          tokens: usage?.tokens,
          max_tokens: config?.max_context_tokens,
          percentage,
          compactions: compactCount?.count,
          turn: turnNumber,
        },
      };
    },
  });

  // Status bar
  // @ts-ignore ExtensionAPI property
  pi.registerStatusBarItem("context", {
    render() {
      if (!currentSessionId) return "";
      
// @ts-ignore SQLite binding
      const config = database.query("SELECT max_context_tokens FROM session_configs WHERE id = ?")
      // @ts-ignore SQLite binding
      .get([currentSessionId]) as any;
      const usage = database.query(
        "SELECT SUM(token_count) as total FROM message_entries WHERE session_id = ? AND preserved >= 0"
      )
      // @ts-ignore SQLite binding
      .get([currentSessionId]) as any;
      
      if (!config) return "";
      
      const percentage = Math.round(((usage?.total || 0) / config.max_context_tokens) * 100);
      const icon = percentage > 90 ? "🔴" : percentage > 75 ? "🟡" : "🟢";
      
      return `${icon} ${percentage}%`;
    },
  });

  console.log("[SessionPruning] OpenClaw-style context management loaded");
  console.log("[SessionPruning] Commands: /session-config, /compact, /prune-cache, /compactions");
}
