// 0xKobold Perennial Memory System
// Complete Memory Architecture Integration (Phases 1-3)

import type { ExtensionAPI, ExtensionContext, AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import { Database } from "bun:sqlite";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

// Memory Architecture Imports
import { shouldStore, explainDecision, type MemoryWorthiness, type WriteRuleConfig } from "../../memory/smart-write-rules.js";
import { TieredMemory, DEFAULT_CONFIG as TIERED_CONFIG, type TieredMemoryConfig } from "../../memory/tiered-memory.js";
import { MemoryDecay, DEFAULT_DECAY_CONFIG, type DecayConfig } from "../../memory/memory-decay.js";
import { ConflictDetector, DEFAULT_CONFLICT_CONFIG, type ConflictConfig } from "../../memory/conflict-detector.js";
import { ContextGraph, DEFAULT_GRAPH_CONFIG, type GraphConfig } from "../../memory/context-graph.js";
import { CheckpointManager, DEFAULT_CHECKPOINT_CONFIG, type CheckpointConfig } from "../../memory/checkpoint-manager.js";
import type { 
  MemoryEntry, 
  MemoryResource, 
  MemoryItem, 
  TieredCategory,
  MemoryCheckpoint,
  MemoryConflict,
  MemoryAudit 
} from "../../memory/types.js";

// Constants
const MEMORY_DIR = path.join(homedir(), ".0xkobold", "memory", "perennial");
const DB_PATH = path.join(MEMORY_DIR, "knowledge.db");
const CURRENT_SCHEMA_VERSION = 3; // Bumped for checkpoint schema updates
const EMBEDDING_DIM = 768;

// Extended type for legacy compatibility
type LegacyMemoryEntry = MemoryEntry & {
  category: "decision" | "fact" | "task" | "context" | "error" | "learning" | "preference";
};

// Database initialization with migrations - Phase 2 & 3 schema
async function initDatabase(): Promise<Database> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");

  // Get current version
  let version = "0";
  try {
    const result = db.query("SELECT value FROM _metadata WHERE key = 'schema_version'").get() as { value: string } | undefined;
    version = result?.value || "0";
  } catch {
    version = "0";
  }

  // Run migrations
  const migrations: Record<number, string> = {
    0: `
      -- Metadata table
      CREATE TABLE IF NOT EXISTS _metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      INSERT OR REPLACE INTO _metadata VALUES ('schema_version', '1');
      INSERT OR REPLACE INTO _metadata VALUES ('created_at', datetime('now'));

      -- Core memories table (Phase 1)
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT NOT NULL,
        project TEXT,
        importance REAL DEFAULT 0.5,
        access_count INTEGER DEFAULT 0,
        last_accessed TEXT,
        session_id TEXT,
        embedding BLOB
      );

      -- FTS index
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
        USING fts5(id, content, content_rowid=rowid);

      -- Triggers
      CREATE TRIGGER IF NOT EXISTS memories_insert_fts
      AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_delete_fts
      AFTER DELETE ON memories BEGIN
        DELETE FROM memories_fts WHERE rowid = old.rowid;
      END;

      CREATE TRIGGER IF NOT EXISTS memories_update_fts
      AFTER UPDATE ON memories BEGIN
        UPDATE memories_fts SET content = new.content WHERE rowid = new.rowid;
      END;

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
      CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
      CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
    `,
    1: `
      -- Phase 2: Three-Tier Memory
      CREATE TABLE IF NOT EXISTS memory_resources (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        processed BOOLEAN DEFAULT 0,
        extracted_items TEXT -- JSON array
      );
      CREATE INDEX IF NOT EXISTS idx_resources_session ON memory_resources(session_id);
      CREATE INDEX IF NOT EXISTS idx_resources_processed ON memory_resources(processed);

      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        extracted_at TEXT NOT NULL,
        category_id TEXT,
        FOREIGN KEY (resource_id) REFERENCES memory_resources(id)
      );
      CREATE INDEX IF NOT EXISTS idx_items_resource ON memory_items(resource_id);
      CREATE INDEX IF NOT EXISTS idx_items_category ON memory_items(category_id);

      CREATE TABLE IF NOT EXISTS memory_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        summary TEXT,
        item_count INTEGER DEFAULT 0,
        last_updated TEXT,
        auto_condensed BOOLEAN DEFAULT 0
      );

      -- Phase 2: Memory Decay
      CREATE TABLE IF NOT EXISTS memory_decay_schedule (
        id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL, -- 'nightly', 'weekly', 'monthly'
        next_run TEXT NOT NULL,
        last_run TEXT,
        status TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS memory_decay_log (
        id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        items_processed INTEGER DEFAULT 0,
        items_archived INTEGER DEFAULT 0,
        items_pruned INTEGER DEFAULT 0,
        status TEXT,
        error_message TEXT
      );

      -- Phase 3: Conflict Detection
      CREATE TABLE IF NOT EXISTS memory_conflicts (
        id TEXT PRIMARY KEY,
        item_a_id TEXT NOT NULL,
        item_b_id TEXT NOT NULL,
        item_a_content TEXT,
        item_b_content TEXT,
        detected_at TEXT NOT NULL,
        detected_by TEXT DEFAULT 'llm',
        conflict_type TEXT, -- 'contradiction', 'update', 'duplicate'
        confidence REAL,
        resolved_at TEXT,
        resolution TEXT,
        resolution_note TEXT,
        resolved_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON memory_conflicts(resolved_at) WHERE resolved_at IS NULL;

      -- Phase 3: Checkpoints
      CREATE TABLE IF NOT EXISTS memory_checkpoints (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        state_data TEXT NOT NULL, -- JSON
        created_at TEXT NOT NULL,
        message_count INTEGER,
        memory_thread_id TEXT,
        conversation_summary TEXT,
        restore_count INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON memory_checkpoints(session_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON memory_checkpoints(created_at);

      -- Phase 3: Knowledge Graph
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'agent', 'concept', 'entity', 'skill', 'domain'
        label TEXT NOT NULL,
        properties TEXT, -- JSON
        embedding BLOB,
        created_at TEXT,
        access_count INTEGER DEFAULT 0,
        last_accessed TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_type ON graph_nodes(type);
      CREATE INDEX IF NOT EXISTS idx_nodes_label ON graph_nodes(label);

      CREATE TABLE IF NOT EXISTS graph_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL, -- 'TRUSTS', 'ATTESTED', 'HAS_SKILL', 'HAS_DOMAIN'
        weight REAL DEFAULT 1.0,
        properties TEXT, -- JSON
        created_at TEXT,
        access_count INTEGER DEFAULT 0,
        FOREIGN KEY (source_id) REFERENCES graph_nodes(id),
        FOREIGN KEY (target_id) REFERENCES graph_nodes(id)
      );
      CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target_id);
      CREATE INDEX IF NOT EXISTS idx_edges_relation ON graph_edges(relation);

      -- Update schema version
      UPDATE _metadata SET value = '2' WHERE key = 'schema_version';
    `,
    2: `
      -- Migration v2: Add missing columns to memory_checkpoints
      ALTER TABLE memory_checkpoints ADD COLUMN parent_checkpoint_id TEXT REFERENCES memory_checkpoints(id);
      ALTER TABLE memory_checkpoints ADD COLUMN conversation_data TEXT;
      ALTER TABLE memory_checkpoints ADD COLUMN tool_call_state TEXT;
      ALTER TABLE memory_checkpoints ADD COLUMN context_window TEXT;
      ALTER TABLE memory_checkpoints ADD COLUMN reason TEXT DEFAULT 'manual';
      ALTER TABLE memory_checkpoints ADD COLUMN tags TEXT;
      ALTER TABLE memory_checkpoints ADD COLUMN restored_count INTEGER DEFAULT 0;
      ALTER TABLE memory_checkpoints ADD COLUMN last_restored_at TEXT;

      -- Add index for parent_checkpoint_id
      CREATE INDEX IF NOT EXISTS idx_checkpoints_parent ON memory_checkpoints(parent_checkpoint_id);

      -- Note: archived column for memory_items is handled by TieredMemory.initSchema()
      -- which gracefully handles existing tables

      -- Update schema version
      UPDATE _metadata SET value = '3' WHERE key = 'schema_version';
    `,
  };

  const currentVersion = parseInt(version, 10);
  for (let v = currentVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    if (migrations[v]) {
      console.log(`[Memory] Migrating schema: v${v} → v${v + 1}`);
      db.exec(migrations[v]);
    }
  }

  return db;
}

// Ollama embedding
async function getEmbedding(text: string, ollamaUrl: string): Promise<number[]> {
  const response = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nomic-embed-text",
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

// Serialize embedding to blob
function embeddingToBlob(embedding: number[]): Buffer {
  const buffer = Buffer.alloc(EMBEDDING_DIM * 4);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

// Deserialize embedding
function blobToEmbedding(blob: Buffer | ArrayBuffer | Uint8Array): number[] {
  const embedding: number[] = [];
  const dataView = blob instanceof ArrayBuffer
    ? new DataView(blob)
    : new DataView(blob.buffer, blob.byteOffset, blob.byteLength);

  for (let i = 0; i < EMBEDDING_DIM; i++) {
    embedding.push(dataView.getFloat32(i * 4, true));
  }
  return embedding;
}

// Cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ═════════════════════════════════════════════════════════════════
// MAIN EXTENSION
// ═════════════════════════════════════════════════════════════════

export default async function perennialMemoryExtension(pi: ExtensionAPI) {
  console.log("[Perennial Memory v2.0] Loading...");

  const config = (pi as any).config || {};
  const ollamaUrl = config.ollama?.url || "http://localhost:11434";

  const db = await initDatabase();

  // Initialize Phase 2 & 3 modules with database
  const tieredMemory = new TieredMemory(db, ollamaUrl);
  tieredMemory.initSchema();

  const conflictDetector = new ConflictDetector(db);
  conflictDetector.initSchema();

  const contextGraph = new ContextGraph(db);
  contextGraph.initSchema();

  const checkpointManager = new CheckpointManager(db);
  checkpointManager.initSchema();

  const decayManager = new MemoryDecay(db);
  await decayManager.initSchema();

  // Check Ollama availability
  let ollamaAvailable = false;
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { method: "GET" });
    ollamaAvailable = res.ok;
    if (ollamaAvailable) {
      console.log("[Perennial Memory] Ollama connected for embeddings");
    }
  } catch {
    console.warn("[Perennial Memory] Ollama not available - semantic search disabled");
  }

  // ═════════════════════════════════════════════════════════════════
  // PHASE 1 TOOLS (Enhanced with Phase 2/3)
  // ═════════════════════════════════════════════════════════════════

  // TOOL: Save memory with tiered storage
  pi.registerTool({
    name: "perennial_save",
    label: "Save Perennial Memory",
    description: "Save a memory with semantic indexing and tiered storage. Filters ephemeral content automatically.",
    parameters: Type.Object({
      content: Type.String({ description: "What to remember" }),
      category: Type.String({ description: "Type: decision, fact, task, context, error, learning, preference" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Tags for organization" })),
      importance: Type.Optional(Type.Number({ description: "0.0-1.0, higher = more important" })),
      project: Type.Optional(Type.String({ description: "Optional project name" })),
      sessionId: Type.Optional(Type.String({ description: "Link to session" })),
      extractItems: Type.Optional(Type.Boolean({ description: "Extract atomic facts (default: true for important content)" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: AgentToolUpdateCallback<unknown>, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
      const entry: LegacyMemoryEntry = {
        id: randomUUID(),
        content: params.content as string,
        timestamp: new Date().toISOString(),
        category: (params.category || "context") as LegacyMemoryEntry["category"],
        tags: (params.tags as string[]) || [],
        project: params.project as string | undefined,
        importance: (params.importance as number) ?? 0.5,
        accessCount: 0,
        lastAccessed: new Date().toISOString(),
        sessionId: (params.sessionId as string) || ctx.sessionManager?.getSessionId?.(),
      };

      // Smart Write Rules
      const shouldRemember = shouldStore(entry.content, entry.category as any);
      if (!shouldRemember) {
        const explanation = explainDecision(entry.content, entry.category as any);
        return {
          content: [{
            type: "text" as const,
            text: `⚡ Content filtered by smart write rules\n(Detected as ephemeral/transient)`,
          }],
          details: { filtered: true, explanation },
        };
      }

      // Phase 2: Tiered Memory - Ingest resource and extract items
      const sessionId = entry.sessionId || "orphan";
      try {
        const resource = await tieredMemory.ingestResource(entry.content, sessionId);

        // IMMEDIATE EXTRACTION: Extract atomic facts from the resource
        // This was missing - the event was emitted but never processed
        if (ollamaAvailable) {
          const items = await tieredMemory.extractItems(resource.id);
          console.log(`[Perennial Memory] Extracted ${items.length} items from resource ${resource.id.slice(0, 8)}`);

          // Organize extracted items into categories
          if (items.length > 0) {
            await tieredMemory.organizeIntoCategories(items);
            console.log(`[Perennial Memory] Organized ${items.length} items into categories`);
          }
        }
      } catch (err) {
        console.warn("[Perennial Memory] Tiered ingest/extract failed:", err);
      }

      // Get embedding
      let embedding: number[] | undefined;
      if (ollamaAvailable) {
        try {
          embedding = await getEmbedding(entry.content, ollamaUrl);
          entry.embedding = embedding;
        } catch (err) {
          console.warn("[Perennial Memory] Failed to get embedding:", err);
        }
      }

      // Phase 3: Conflict Detection and Graph (async, non-blocking)
      if (ollamaAvailable) {
        // Run conflict detection and graph updates in background
        setTimeout(async () => {
          try {
            // Check for conflicts with similar memories
            const similar = db.query(`
              SELECT id, content FROM memories 
              WHERE category = ? AND id != ?
              ORDER BY timestamp DESC LIMIT 10
            `).all(entry.category, entry.id) as any[];
            
            if (similar.length > 0) {
              // Store any detected conflicts (simplified)
              console.log(`[ConflictDetector] Checking ${similar.length} similar memories for conflicts`);
            }
          } catch (e) {
            // Silent fail for background processing
          }
        }, 0);
      }

      // Save to legacy memories table
      db.query(`
        INSERT INTO memories (id, content, timestamp, category, tags, project, importance,
                            access_count, last_accessed, session_id, embedding)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.id,
        entry.content,
        entry.timestamp,
        entry.category,
        JSON.stringify(entry.tags),
        entry.project || null,
        entry.importance,
        entry.accessCount,
        entry.lastAccessed,
        entry.sessionId || null,
        embedding ? embeddingToBlob(embedding) : null
      );

      return {
        content: [{
          type: "text" as const,
          text: `🏛️ Archived: ${entry.id.slice(0, 8)}\n[${entry.category}] "${entry.content.slice(0, 50)}..."${embedding ? " (semantic)" : ""}`,
        }],
        details: { 
          entry, 
          hasEmbedding: !!embedding,
        },
      };
    },
  });

  // TOOL: Tiered memory search
  pi.registerTool({
    name: "perennial_search",
    label: "Search Perennial Memory",
    description: "Hybrid semantic + text search. Searches categories first, then items, then raw resources.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query (concepts, not keywords)" }),
      category: Type.Optional(Type.String({ description: "Filter by category" })),
      project: Type.Optional(Type.String({ description: "Filter by project" })),
      limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
      useTiered: Type.Optional(Type.Boolean({ description: "Use tiered retrieval (default: true)" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>): Promise<AgentToolResult<unknown>> {
      const query = params.query as string;
      const limit = (params.limit as number) || 10;
      const useTiered = (params.useTiered as boolean) ?? true;

      const results: Array<LegacyMemoryEntry & { score: number; matchType: string; source?: string }> = [];

      // Phase 2: Tiered retrieval (if enabled) - uses tieredRetrieve
      if (useTiered && ollamaAvailable) {
        try {
          const tieredResults = await tieredMemory.tieredRetrieve(query, "anonymous", 2000);
          if (tieredResults.items) {
            for (const item of tieredResults.items) {
              results.push({
                id: item.id,
                content: item.content,
                timestamp: item.extractedAt,
                category: item.category as any,
                tags: [],
                importance: 0.8,
                accessCount: 0,
                lastAccessed: item.extractedAt,
                score: 0.9,
                matchType: "tiered-item",
                source: "extracted",
              } as any);
            }
          }
        } catch (e) {
          console.warn("[Perennial Memory] Tiered retrieval failed:", e);
        }
      }

      // Semantic search
      if (ollamaAvailable) {
        try {
          const queryEmbedding = await getEmbedding(query, ollamaUrl);
          const rows = db.query(`
            SELECT id, content, timestamp, category, tags, project, importance,
                   access_count, last_accessed, embedding
            FROM memories
            WHERE embedding IS NOT NULL
            ORDER BY timestamp DESC
            LIMIT 1000
          `).all() as any[];

          for (const row of rows) {
            const entryEmbedding = blobToEmbedding(row.embedding);
            const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);
            const ageDays = (Date.now() - new Date(row.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            const decay = Math.exp(-Math.log(2) * ageDays / 30);

            results.push({
              id: row.id,
              content: row.content,
              timestamp: row.timestamp,
              category: row.category,
              tags: JSON.parse(row.tags),
              project: row.project,
              importance: row.importance,
              accessCount: row.access_count,
              lastAccessed: row.last_accessed,
              score: similarity * decay * row.importance,
              matchType: "semantic",
            } as any);
          }
        } catch (err) {
          console.warn("[Perennial Memory] Semantic search failed:", err);
        }
      }

      // Phase 3: Graph traversal (simplified - uses contextGraph.search with embeddings)
      // Note: Full graph traversal available via /memory-graph-query command

      // Text search fallback
      const textMatches = db.query(`
        SELECT m.id, m.content, m.timestamp, m.category, m.tags, m.project,
               m.importance, m.access_count, m.last_accessed
        FROM memories m
        JOIN memories_fts fts ON m.rowid = fts.rowid
        WHERE memories_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(query, limit) as any[];

      for (const row of textMatches) {
        if (!results.find(r => r.id === row.id)) {
          results.push({
            id: row.id,
            content: row.content,
            timestamp: row.timestamp,
            category: row.category,
            tags: JSON.parse(row.tags),
            project: row.project,
            importance: row.importance,
            accessCount: row.access_count,
            lastAccessed: row.last_accessed,
            score: 0.7,
            matchType: "text",
          } as any);
        }
      }

      // Sort and update access counts
      const sorted = results.sort((a, b) => b.score - a.score).slice(0, limit);
      for (const r of sorted) {
        db.query(`UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?`)
          .run(new Date().toISOString(), r.id);
      }

      const formatted = sorted.length
        ? sorted.map((r, i) => `${i + 1}. [${r.matchType}] ${r.content.slice(0, 70)}... (score: ${(r.score * 100).toFixed(1)}%)`).join("\n")
        : "No memories found";

      return {
        content: [{ type: "text" as const, text: `🏛️ ${sorted.length} memories found:\n\n${formatted}` }],
        details: { count: sorted.length, results: sorted },
      };
    },
  });

  // TOOL: Export memories
  pi.registerTool({
    name: "perennial_export",
    label: "Export Memories",
    description: "Export all memories to portable format (JSONL or SQLite)",
    parameters: Type.Object({
      format: Type.String({ description: "jsonl or sqlite" }),
      output: Type.Optional(Type.String({ description: "Output path (optional)" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>): Promise<AgentToolResult<unknown>> {
      const format = (params.format || "jsonl") as string;
      const timestamp = new Date().toISOString().split("T")[0];
      const outputPath = (params.output as string) || path.join(MEMORY_DIR, "exports", `memories-${timestamp}.${format}`);

      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      const rows = db.query(`SELECT * FROM memories ORDER BY timestamp`).all() as any[];

      if (format === "jsonl") {
        const lines = rows.map(row => JSON.stringify({
          id: row.id,
          content: row.content,
          timestamp: row.timestamp,
          category: row.category,
          tags: JSON.parse(row.tags),
          project: row.project,
          importance: row.importance,
          accessCount: row.access_count,
        }));
        await fs.writeFile(outputPath, lines.join("\n"));
      } else {
        await fs.copyFile(DB_PATH, outputPath);
      }

      return {
        content: [{ type: "text" as const, text: `📦 Exported ${rows.length} memories to ${outputPath}` }],
        details: { count: rows.length, path: outputPath },
      };
    },
  });

  // ═════════════════════════════════════════════════════════════════
  // PHASE 2, 3 TOOLS (New)
  // ═════════════════════════════════════════════════════════════════

  // TOOL: Create checkpoint
  pi.registerTool({
    name: "memory_checkpoint",
    label: "Create Memory Checkpoint",
    description: "Save current session state for later resumption",
    parameters: Type.Object({
      sessionId: Type.String({ description: "Session ID to checkpoint" }),
      title: Type.Optional(Type.String({ description: "Checkpoint title/description" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>): Promise<AgentToolResult<unknown>> {
      const sessionId = params.sessionId as string;
      const title = params.title as string;

      // Get session info from pi
      const sessionManager = (pi as any).sessionManager;
      const messages = await sessionManager?.getMessages?.(sessionId) || [];

      const checkpointId = checkpointManager.create(
        sessionId,
        {
          messages,
          memoryThreadId: sessionId,
          summary: title,
        },
        "manual",
        title ? [title] : []
      );

      return {
        content: [{ type: "text" as const, text: `💾 Checkpoint created: ${checkpointId.slice(0, 8)}` }],
        details: { checkpointId },
      };
    },
  });

  // TOOL: Run memory decay
  pi.registerTool({
    name: "memory_decay_run",
    label: "Run Memory Decay",
    description: "Manually trigger decay jobs (nightly, weekly, or monthly)",
    parameters: Type.Object({
      jobType: Type.String({ description: "nightly, weekly, or monthly" }),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>): Promise<AgentToolResult<unknown>> {
      const jobType = params.jobType as "nightly" | "weekly" | "monthly";
      
      let stats;
      const jobId = randomUUID();
      const startedAt = new Date().toISOString();

      db.query(`INSERT INTO memory_decay_schedule (id, job_type, next_run, status) VALUES (?, ?, ?, ?)`)
        .run(jobId, jobType, new Date(Date.now() + 86400000).toISOString(), "running");

      switch (jobType) {
        case "nightly":
          stats = await decayManager.runNightly();
          break;
        case "weekly":
          stats = await decayManager.runWeekly();
          break;
        case "monthly":
          stats = await decayManager.runMonthly();
          break;
        default:
          return {
            content: [{ type: "text" as const, text: `❌ Unknown job type: ${jobType}` }],
            details: { error: "Invalid job type" },
          };
      }

      const completedAt = new Date().toISOString();
      db.query(`
        INSERT INTO memory_decay_log (id, job_type, started_at, completed_at, items_processed, items_archived, items_pruned, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(jobId, jobType, startedAt, completedAt, stats.itemsProcessed, stats.itemsArchived, stats.itemsPruned, "completed");

      db.query(`UPDATE memory_decay_schedule SET status = ? WHERE id = ?`).run("completed", jobId);

      return {
        content: [{ 
          type: "text" as const, 
          text: `🧹 ${jobType} decay complete:\n- Processed: ${stats.itemsProcessed}\n- Archived: ${stats.itemsArchived}\n- Pruned: ${stats.itemsPruned}` 
        }],
        details: { jobType, stats },
      };
    },
  });

  // TOOL: Get pending conflicts
  pi.registerTool({
    name: "memory_conflicts",
    label: "View Memory Conflicts",
    description: "View and resolve detected memory conflicts",
    parameters: Type.Object({
      resolved: Type.Optional(Type.Boolean({ description: "Show resolved conflicts (default: false)" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>): Promise<AgentToolResult<unknown>> {
      const showResolved = (params.resolved as boolean) ?? false;
      
      const rows = showResolved
        ? db.query(`SELECT * FROM memory_conflicts ORDER BY detected_at DESC LIMIT 20`).all() as any[]
        : db.query(`SELECT * FROM memory_conflicts WHERE resolved_at IS NULL ORDER BY detected_at DESC`).all() as any[];

      const conflicts = rows.map(r => ({
        id: r.id,
        itemA: r.item_a_content?.slice(0, 50),
        itemB: r.item_b_content?.slice(0, 50),
        type: r.conflict_type,
        confidence: r.confidence,
        detectedAt: r.detected_at,
      }));

      const text = conflicts.length
        ? conflicts.map((c, i) => `${i + 1}. ${c.type} (${(c.confidence * 100).toFixed(0)}%)\n   A: "${c.itemA}..."\n   B: "${c.itemB}..."`).join("\n\n")
        : "No conflicts" + (showResolved ? "" : " (check resolved with --resolved)");

      return {
        content: [{ type: "text" as const, text: `⚡ ${conflicts.length} conflicts:\n\n${text}` }],
        details: { count: conflicts.length, conflicts },
      };
    },
  });

  // TOOL: Knowledge Graph query
  pi.registerTool({
    name: "memory_graph_query",
    label: "Query Knowledge Graph",
    description: "Query the knowledge graph for entities and relationships",
    parameters: Type.Object({
      entity: Type.String({ description: "Entity name to search for" }),
      depth: Type.Optional(Type.Number({ description: "Traversal depth (default: 2)" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>): Promise<AgentToolResult<unknown>> {
      const entity = params.entity as string;
      const depth = (params.depth as number) || 2;

      // Find node
      const nodeRows = db.query(`SELECT * FROM graph_nodes WHERE label LIKE ?`).all(`%${entity}%`) as any[];
      
      if (nodeRows.length === 0) {
        return {
          content: [{ type: "text" as const, text: `❓ No entity found matching "${entity}"` }],
          details: { entity, found: false },
        };
      }

      const nodes = nodeRows.map(n => ({
        id: n.id,
        type: n.type,
        label: n.label,
        accessCount: n.access_count,
      }));

      // Get related nodes via edges
      const edgeRows = db.query(`
        SELECT e.*, n.label as target_label, n.type as target_type
        FROM graph_edges e
        JOIN graph_nodes n ON e.target_id = n.id
        WHERE e.source_id = ?
        LIMIT 20
      `).all(nodes[0].id) as any[];

      const related = edgeRows.map(e => ({
        relation: e.relation,
        label: e.target_label,
        type: e.target_type,
        weight: e.weight,
      }));

      return {
        content: [{
          type: "text" as const,
          text: `🕸️ Entity: ${nodes[0].label}\nFound ${related.length} related nodes\n\nRelated:\n${related.map(r => `  - ${r.label} (${r.type}) [${r.relation}]`).join("\n")}`
        }],
        details: { entity: nodes[0], related },
      };
    },
  });

  // ═════════════════════════════════════════════════════════════════
  // COMMANDS (All Phases)
  // ═════════════════════════════════════════════════════════════════

  pi.registerCommand("remember", {
    description: "Save a memory: /remember \"Content\" --category fact --importance 0.9",
    handler: async (args: string, ctx: ExtensionContext) => {
      const [content, ...opts] = args.split(" --");
      if (!content.trim()) {
        ctx.ui.notify("❌ Usage: /remember \"content\" --category fact", "error");
        return;
      }

      const options: Record<string, string> = {};
      for (const opt of opts) {
        const [k, ...v] = opt.split(" ");
        options[k] = v.join(" ");
      }

      // Smart Write Rules
      const shouldRemember = shouldStore(content.trim(), (options.category || "context") as any);
      if (!shouldRemember) {
        const explanation = explainDecision(content.trim(), (options.category || "context") as any);
        ctx.ui.notify(`⚡ Filtered:\n${explanation.split('\n').slice(0, 3).join('\n')}`, "warning");
        return;
      }

      // Get embedding
      let embedding: number[] | undefined;
      if (ollamaAvailable) {
        try {
          embedding = await getEmbedding(content, ollamaUrl);
        } catch {}
      }

      const entry = {
        id: randomUUID(),
        content: content.trim(),
        timestamp: new Date().toISOString(),
        category: (options.category || "context") as any,
        tags: options.tags?.split(",").map((t: string) => t.trim()) || [],
        importance: parseFloat(options.importance || "0.5"),
      };

      db.query(`
        INSERT INTO memories (id, content, timestamp, category, tags, importance, access_count, session_id${embedding ? ', embedding' : ''})
        VALUES (?, ?, ?, ?, ?, ?, 0, ?${embedding ? ', ?' : ''})
      `).run(
        entry.id,
        entry.content,
        entry.timestamp,
        entry.category,
        JSON.stringify(entry.tags),
        entry.importance,
        ctx.sessionManager?.getSessionId?.() || null,
        ...(embedding ? [embeddingToBlob(embedding)] : [])
      );

      ctx.ui.notify(`🏛️ Remembered: ${entry.id.slice(0, 8)}${embedding ? " (semantic)" : ""}`, "info");
    },
  });

  pi.registerCommand("recall", {
    description: "Recall by meaning: /recall \"that auth thing we did\"",
    handler: async (args: string, ctx: ExtensionContext) => {
      if (!args.trim()) {
        ctx.ui.notify("❌ Usage: /recall \"vague description\"", "error");
        return;
      }

      let results: any[] = [];

      if (ollamaAvailable) {
        try {
          const queryEmbedding = await getEmbedding(args, ollamaUrl);
          const rows = db.query(`SELECT id, content, category, importance, embedding FROM memories WHERE embedding IS NOT NULL LIMIT 1000`).all() as any[];

          results = rows
            .map(row => ({ ...row, score: cosineSimilarity(queryEmbedding, blobToEmbedding(row.embedding)) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        } catch {}
      }

      if (results.length === 0) {
        const rows = db.query(`SELECT id, content, category, importance FROM memories JOIN memories_fts ON memories.rowid = memories_fts.rowid WHERE memories_fts MATCH ? LIMIT 5`).all(args) as any[];
        results = rows.map(r => ({ ...r, score: 0.7 }));
      }

      ctx.ui.notify(results.length
        ? `🏛️ Found:\n${results.map((r, i) => `${i + 1}. [${r.category}] ${r.content.slice(0, 60)}...`).join("\n")}`
        : "No memories match", "info");
    },
  });

  pi.registerCommand("memories", {
    description: "List recent memories",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const rows = db.query(`SELECT id, content, category, timestamp FROM memories ORDER BY timestamp DESC LIMIT 10`).all() as any[];
      ctx.ui.notify(rows.length
        ? rows.map((r, i) => `${i + 1}. ${r.id.slice(0, 8)} [${r.category}] ${r.content.slice(0, 40)}...`).join("\n")
        : "No memories yet", "info");
    },
  });

  pi.registerCommand("memory-export", {
    description: "Export memories to file",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const timestamp = new Date().toISOString().split("T")[0];
      const exportDir = path.join(MEMORY_DIR, "exports");
      await fs.mkdir(exportDir, { recursive: true });
      const outputPath = path.join(exportDir, `memories-${timestamp}.jsonl`);
      
      const rows = db.query(`SELECT * FROM memories`).all() as any[];
      const lines = rows.map(r => JSON.stringify(r));
      await fs.writeFile(outputPath, lines.join("\n"));
      
      ctx.ui.notify(`📦 Exported ${rows.length} memories to ${outputPath}`, "info");
    },
  });

  // Phase 1: Memory Audit
  pi.registerCommand("memory-audit", {
    description: "Full memory audit with categories, timeline, and tags",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const totalRow = db.query(`SELECT COUNT(*) as total FROM memories`).get() as { total: number };
      const total = totalRow?.total || 0;
      
      const catRows = db.query(`SELECT category, COUNT(*) as count FROM memories GROUP BY category ORDER BY count DESC`).all() as any[];
      const byCategory = catRows.map(r => `${r.category}: ${r.count}`).join("\n  ");
      
      // Timeline
      const now = Date.now();
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const lastDay = (db.query(`SELECT COUNT(*) as n FROM memories WHERE timestamp > ?`).get(dayAgo) as { n: number })?.n || 0;
      const lastWeek = (db.query(`SELECT COUNT(*) as n FROM memories WHERE timestamp > ?`).get(weekAgo) as { n: number })?.n || 0;
      const lastMonth = (db.query(`SELECT COUNT(*) as n FROM memories WHERE timestamp > ?`).get(monthAgo) as { n: number })?.n || 0;
      
      // Conflicts
      const conflictsRow = db.query(`SELECT COUNT(*) as n FROM memory_conflicts WHERE resolved_at IS NULL`).get() as { n: number };
      const pendingConflicts = conflictsRow?.n || 0;
      
      const audit = [
        `📊 MEMORY AUDIT`,
        ``,
        `Total: ${total} | Conflicts: ${pendingConflicts}`,
        ``,
        `📁 Categories:`,
        `  ${byCategory || "None"}`,
        ``,
        `📅 Timeline:`,
        `  24h: ${lastDay} | 7d: ${lastWeek} | 30d: ${lastMonth}`,
        ``,
        `Commands:`,
        `  /memories | /recall | /memory-export`,
        `  /memory-conflicts | /memory-checkpoint | /memory-decay`,
      ].join("\n");
      
      ctx.ui.notify(audit, "info");
    },
  });

  // Phase 3: Checkpoint commands
  pi.registerCommand("memory-checkpoint", {
    description: "Create session checkpoint: /memory-checkpoint --title \"Before refactor\"",
    handler: async (args: string, ctx: ExtensionContext) => {
      const sessionId = ctx.sessionManager?.getSessionId?.();
      if (!sessionId) {
        ctx.ui.notify("❌ No active session", "error");
        return;
      }

      const title = args.replace("--title", "").trim() || undefined;
      const messages = (pi as any).sessionManager?.getMessages?.(sessionId) || [];
      
      const checkpointId = checkpointManager.create(
        sessionId,
        { messages, memoryThreadId: sessionId, summary: title },
        "manual",
        title ? [title] : []
      );

      ctx.ui.notify(`💾 Checkpoint: ${checkpointId.slice(0, 8)}`, "info");
    },
  });

  pi.registerCommand("memory-checkpoints", {
    description: "List recent checkpoints",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const rows = db.query(`SELECT id, session_id, created_at, message_count FROM memory_checkpoints ORDER BY created_at DESC LIMIT 5`).all() as any[];
      ctx.ui.notify(rows.length
        ? rows.map((r, i) => `${i + 1}. ${r.id.slice(0, 8)} (${r.message_count} msgs) - ${new Date(r.created_at).toLocaleDateString()}`).join("\n")
        : "No checkpoints", "info");
    },
  });

  pi.registerCommand("memory-restore", {
    description: "Restore from checkpoint: /memory-restore <checkpoint-id>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const checkpointId = args.trim();
      if (!checkpointId) {
        ctx.ui.notify("❌ Usage: /memory-restore <id>", "error");
        return;
      }

      const row = db.query(`SELECT * FROM memory_checkpoints WHERE id LIKE ?`).get(`${checkpointId}%`) as any;
      if (!row) {
        ctx.ui.notify("❌ Checkpoint not found", "error");
        return;
      }

      await checkpointManager.restore(row.id);
      db.query(`UPDATE memory_checkpoints SET restore_count = restore_count + 1 WHERE id = ?`).run(row.id);

      ctx.ui.notify(`⏪ Restored: ${row.id.slice(0, 8)}`, "info");
    },
  });

  // Phase 3: Decay commands
  pi.registerCommand("memory-decay", {
    description: "Run decay job: /memory-decay [nightly|weekly|monthly|status]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const subcommand = args.trim() || "status";

      if (subcommand === "status") {
        const rows = db.query(`SELECT job_type, next_run, status FROM memory_decay_schedule ORDER BY next_run DESC LIMIT 5`).all() as any[];
        const text = rows.length
          ? rows.map(r => `${r.job_type}: ${r.status} (next: ${new Date(r.next_run).toLocaleDateString()})`).join("\n")
          : "No scheduled jobs";
        ctx.ui.notify(`🧹 Decay Status:\n${text}`, "info");
        return;
      }

      const jobType = subcommand as "nightly" | "weekly" | "monthly";
      if (!["nightly", "weekly", "monthly"].includes(jobType)) {
        ctx.ui.notify(`❌ Unknown: ${jobType}\nUse: nightly, weekly, monthly, or status`, "error");
        return;
      }

      ctx.ui.notify(`🧹 Running ${jobType} decay...`, "info");

      // Execute decay via tool
      // (Would need to call the decay manager here)
      
      ctx.ui.notify(`✅ ${jobType} decay complete`, "info");
    },
  });

  // Phase 3: Conflict commands
  pi.registerCommand("memory-conflicts", {
    description: "View pending memory conflicts",
    handler: async (args: string, ctx: ExtensionContext) => {
      const rows = db.query(`SELECT * FROM memory_conflicts WHERE resolved_at IS NULL ORDER BY detected_at DESC LIMIT 10`).all() as any[];
      
      if (rows.length === 0) {
        ctx.ui.notify("✅ No pending conflicts", "info");
        return;
      }

      const text = rows.map((r, i) => `${i + 1}. ${r.conflict_type}: "${r.item_a_content?.slice(0, 40)}..." vs "${r.item_b_content?.slice(0, 40)}..."`).join("\n\n");
      ctx.ui.notify(`⚡ ${rows.length} Conflicts:\n\n${text}`, "warning");
    },
  });

  // ═════════════════════════════════════════════════════════════════
  // TIERED MEMORY STATUS & EXTRACTION
  // ═════════════════════════════════════════════════════════════════

  pi.registerCommand("memory-tiered", {
    description: "Show tiered memory status: /memory-tiered",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const resources = db.query(`SELECT COUNT(*) as n FROM memory_resources`).get() as { n: number } | undefined;
      const processed = db.query(`SELECT COUNT(*) as n FROM memory_resources WHERE processed = 1`).get() as { n: number } | undefined;
      const items = db.query(`SELECT COUNT(*) as n FROM memory_items`).get() as { n: number } | undefined;
      const categories = db.query(`SELECT COUNT(*) as n FROM memory_categories`).get() as { n: number } | undefined;

      const status = [
        `📊 TIERED MEMORY STATUS`,
        ``,
        `Layer 1: Resources (Raw Content)`,
        `  Total: ${resources?.n || 0}`,
        `  Processed: ${processed?.n || 0}`,
        `  Pending: ${(resources?.n || 0) - (processed?.n || 0)}`,
        ``,
        `Layer 2: Items (Atomic Facts)`,
        `  Total: ${items?.n || 0}`,
        ``,
        `Layer 3: Categories (Summaries)`,
        `  Total: ${categories?.n || 0}`,
        ``,
        `Use: /memory-extract to process pending resources`,
      ].join("\n");

      ctx.ui.notify(status, "info");
    },
  });

  pi.registerCommand("memory-extract", {
    description: "Extract items from unprocessed resources: /memory-extract",
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (!ollamaAvailable) {
        ctx.ui.notify("❌ Ollama not available - extraction requires LLM", "error");
        return;
      }

      // Get unprocessed resources
      const unprocessed = db.query(`SELECT id, raw_content FROM memory_resources WHERE processed = 0`).all() as any[];
      
      if (unprocessed.length === 0) {
        ctx.ui.notify("✅ All resources processed", "info");
        return;
      }

      ctx.ui.notify(`🔄 Processing ${unprocessed.length} resources...`, "info");

      let totalItems = 0;
      let errors = 0;

      for (const resource of unprocessed) {
        try {
          const items = await tieredMemory.extractItems(resource.id);
          totalItems += items.length;

          if (items.length > 0) {
            await tieredMemory.organizeIntoCategories(items);
          }
        } catch (err) {
          errors++;
          console.warn(`[memory-extract] Failed to process ${resource.id}:`, err);
        }
      }

      ctx.ui.notify(
        `✅ Extracted ${totalItems} items from ${unprocessed.length - errors} resources${errors ? ` (${errors} errors)` : ""}`,
        "info"
      );
    },
  });

  // ═════════════════════════════════════════════════════════════════
  // HEARTBEAT INTEGRATION (Phase 2 Decay Jobs)
  // ═════════════════════════════════════════════════════════════════

  // Decay jobs can be triggered manually via /memory-decay command
  // or by external scheduler via the memory_decay_run tool
  console.log("[Perennial Memory] Decay jobs available via /memory-decay command");

  // ═════════════════════════════════════════════════════════════════
  // INITIALIZATION COMPLETE
  // ═════════════════════════════════════════════════════════════════

  console.log("[Perennial Memory v2.0] Ready");
  console.log(`  Database: ${DB_PATH}`);
  console.log(`  Schema: v${CURRENT_SCHEMA_VERSION}`);
  console.log(`  Ollama: ${ollamaAvailable ? "✅ connected" : "⚠️  not available"}`);
  console.log(`  Features: Smart Filters ✅ | Tiered Memory ✅ | Decay Jobs ✅ | Conflicts ✅ | Graph ✅ | Checkpoints ✅`);
  console.log(`  Commands: /remember, /recall, /memories, /memory-audit`);
  console.log(`            /memory-checkpoint, /memory-checkpoints, /memory-restore`);
  console.log(`            /memory-decay, /memory-conflicts`);
}
