// 0xKobold Perennial Memory System
// A digital familiar that remembers forever

import type { ExtensionAPI, ExtensionContext, AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import { Database } from "bun:sqlite";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

// Constants
const MEMORY_DIR = path.join(homedir(), ".0xkobold", "memory", "perennial");
const DB_PATH = path.join(MEMORY_DIR, "knowledge.db");
const CURRENT_SCHEMA_VERSION = 1;
const EMBEDDING_DIM = 768;

// Types
interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  timestamp: string;
  category: "decision" | "fact" | "task" | "context" | "error" | "learning" | "preference";
  tags: string[];
  project?: string;
  importance: number;
  accessCount: number;
  lastAccessed: string;
  sessionId?: string;
}

// Database initialization with migrations
async function initDatabase(): Promise<Database> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
  
  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  
  // Get current version (handle first-run case where _metadata doesn't exist)
  let version = "0";
  try {
    const result = db.query("SELECT value FROM _metadata WHERE key = 'schema_version'").get() as { value: string } | undefined;
    version = result?.value || "0";
  } catch {
    // _metadata table doesn't exist yet - this is a fresh database
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
      
      -- Core memories table
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT NOT NULL, -- JSON array
        project TEXT,
        importance REAL DEFAULT 0.5,
        access_count INTEGER DEFAULT 0,
        last_accessed TEXT,
        session_id TEXT,
        embedding BLOB -- 768 floats, stored as bytes
      );
      
      -- Full-text search index
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts 
      USING fts5(id, content, content_rowid=rowid);
      
      -- Triggers to keep FTS in sync
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
      
      -- Schema version
      UPDATE _metadata SET value = '1' WHERE key = 'schema_version';
    `,
  };
  
  const currentVersion = parseInt(version as string, 10);
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
  const buffer = Buffer.alloc(EMBEDDING_DIM * 4); // Float32 = 4 bytes
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

// Deserialize - handles both Bun Blob/ArrayBuffer and Node Buffer
function blobToEmbedding(blob: Buffer | ArrayBuffer | Uint8Array): number[] {
  const embedding: number[] = [];
  const dataView = blob instanceof ArrayBuffer 
    ? new DataView(blob) 
    : new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    embedding.push(dataView.getFloat32(i * 4, true)); // little-endian
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

export default async function perennialMemoryExtension(pi: ExtensionAPI) {
  console.log("[Perennial Memory] Loading...");
  
  // Get Ollama URL from config or use default
  const config = (pi as any).config || {};
  const ollamaUrl = config.ollama?.url || "http://localhost:11434";
  
  const db = await initDatabase();
  
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
  
  // TOOL: Save memory with embedding
  pi.registerTool({
    name: "perennial_save",
    label: "Save Perennial Memory",
    description: "Save a memory with semantic indexing. Will be remembered forever and findable by meaning, not just exact words.",
    parameters: Type.Object({
      content: Type.String({ description: "What to remember" }),
      category: Type.String({ description: "Type: decision, fact, task, context, error, learning, preference" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Tags for organization" })),
      importance: Type.Optional(Type.Number({ description: "0.0-1.0, higher = more important" })),
      project: Type.Optional(Type.String({ description: "Optional project name" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: AgentToolUpdateCallback<unknown>, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
      const entry: MemoryEntry = {
        id: randomUUID(),
        content: params.content as string,
        timestamp: new Date().toISOString(),
        category: (params.category || "context") as MemoryEntry["category"],
        tags: (params.tags as string[]) || [],
        project: params.project as string | undefined,
        importance: (params.importance as number) ?? 0.5,
        accessCount: 0,
        lastAccessed: new Date().toISOString(),
        sessionId: ctx.sessionManager?.getSessionId?.(),
      };
      
      // Get embedding if Ollama available
      let embedding: number[] | undefined;
      if (ollamaAvailable) {
        try {
          embedding = await getEmbedding(entry.content, ollamaUrl);
          entry.embedding = embedding;
        } catch (err) {
          console.warn("[Perennial Memory] Failed to get embedding:", err);
        }
      }
      
      // Save to database
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
          text: `🏛️ Memory archived: ${entry.id.slice(0, 8)}\n[${entry.category}] "${entry.content.slice(0, 50)}..."`,
        }],
        details: { entry, hasEmbedding: !!embedding },
      };
    },
  });
  
  // TOOL: Hybrid search
  pi.registerTool({
    name: "perennial_search",
    label: "Search Perennial Memory",
    description: "Semantic search across all memories. Finds related concepts even with different wording.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query (concepts, not just keywords)" }),
      category: Type.Optional(Type.String({ description: "Filter by category" })),
      project: Type.Optional(Type.String({ description: "Filter by project" })),
      limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>): Promise<AgentToolResult<unknown>> {
      const query = params.query as string;
      const limit = (params.limit as number) || 10;
      const category = params.category as string | undefined;
      const project = params.project as string | undefined;
      
      const results: Array<MemoryEntry & { score: number; matchType: string }> = [];
      
      // 1. Semantic search (if Ollama available)
      if (ollamaAvailable) {
        try {
          const queryEmbedding = await getEmbedding(query, ollamaUrl);
          
          // Get all entries with embeddings (limit to recent 1000 for performance)
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
            
            // Apply temporal decay
            const ageDays = (Date.now() - new Date(row.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            const decay = Math.exp(-Math.log(2) * ageDays / 30); // 30-day half-life
            
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
            });
          }
        } catch (err) {
          console.warn("[Perennial Memory] Semantic search failed:", err);
        }
      }
      
      // 2. Text search (always works)
      const textMatches = db.query(`
        SELECT m.id, m.content, m.timestamp, m.category, m.tags, m.project, 
               m.importance, m.access_count, m.last_accessed
        FROM memories m
        JOIN memories_fts fts ON m.rowid = fts.rowid
        WHERE memories_fts MATCH ?
        ${category ? "AND m.category = ?" : ""}
        ${project ? "AND m.project = ?" : ""}
        ORDER BY rank
        LIMIT ?
      `).all(query, ...(category ? [category] : []), ...(project ? [project] : []), limit) as any[];
      
      for (const row of textMatches) {
        // Check if already in results
        const existing = results.find(r => r.id === row.id);
        if (existing) {
          existing.score = Math.max(existing.score, 0.8); // Boost for text matches
          existing.matchType = "hybrid";
        } else {
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
            score: 0.7, // Base score for text match
            matchType: "text",
          });
        }
      }
      
      // Sort by score and take top results
      const sorted = results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      
      // Update access counts
      for (const r of sorted) {
        db.query(`UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?`)
          .run(new Date().toISOString(), r.id);
      }
      
      // Format output
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
    description: "Export all memories to a portable format (JSONL or SQLite)",
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
        // Copy SQLite database
        await fs.copyFile(DB_PATH, outputPath);
      }
      
      return {
        content: [{ type: "text" as const, text: `📦 Exported ${rows.length} memories to ${outputPath}` }],
        details: { count: rows.length, path: outputPath },
      };
    },
  });
  
  // COMMANDS
  pi.registerCommand("remember", {
    description: "Save a memory forever: /remember \"Content\" --category fact --importance 0.9",
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
        category: (options.category || "context") as MemoryEntry["category"],
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
      
      ctx.ui.notify(`🏛️ Remembered forever: ${entry.id.slice(0, 8)}${embedding ? " (semantic)" : ""}`, "info");
    },
  });
  
  pi.registerCommand("recall", {
    description: "Recall by meaning: /recall \"that auth thing we did\"",
    handler: async (args: string, ctx: ExtensionContext) => {
      if (!args.trim()) {
        ctx.ui.notify("❌ Usage: /recall \"vague description of what you remember\"", "error");
        return;
      }
      
      // Use the search tool
      const limit = 5;
      let results: any[] = [];
      
      if (ollamaAvailable) {
        try {
          const queryEmbedding = await getEmbedding(args, ollamaUrl);
          const rows = db.query(`SELECT id, content, category, importance, embedding FROM memories WHERE embedding IS NOT NULL LIMIT 1000`).all() as any[];
          
          results = rows
            .map(row => ({
              ...row,
              score: cosineSimilarity(queryEmbedding, blobToEmbedding(row.embedding)),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
        } catch {}
      }
      
      // Fallback to text search
      if (results.length === 0) {
        const rows = db.query(`
          SELECT id, content, category, importance, rank
          FROM memories JOIN memories_fts ON memories.rowid = memories_fts.rowid
          WHERE memories_fts MATCH ?
          LIMIT ?
        `).all(args, limit) as any[];
        
        results = rows.map(r => ({ ...r, score: 0.7 }));
      }
      
      ctx.ui.notify(results.length
        ? `🏛️ Found:\n${results.map((r, i) => `${i + 1}. [${r.category}] ${r.content.slice(0, 60)}...`).join("\n")}`
        : "No memories match that description", "info");
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
  
  console.log("[Perennial Memory] Ready");
  console.log(`  Database: ${DB_PATH}`);
  console.log(`  Schema: v${CURRENT_SCHEMA_VERSION}`);
  console.log(`  Ollama: ${ollamaAvailable ? "✅ connected" : "⚠️  not available"}`);
}
