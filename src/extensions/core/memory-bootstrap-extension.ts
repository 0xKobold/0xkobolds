/**
 * Memory Bootstrap Extension
 * 
 * Automatically loads relevant memories into context at startup.
 * Implements CLAWS-style memory loading: recency + importance + relevance.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

const MEMORY_DIR = path.join(homedir(), ".0xkobold", "memory", "perennial");
const GENERATIVE_DIR = path.join(homedir(), ".0xkobold", "generative");

interface MemoryEntry {
  id: string;
  content: string;
  timestamp: string;
  category: string;
  importance: number;
  accessCount: number;
}

interface GenerativeMemory {
  id: string;
  content: string;
  type: "observation" | "thought" | "action" | "reflection";
  timestamp: string;
  importance: number;
}

interface CLAWSMemory {
  content: string;
  category: string;
  recencyScore: number;
  importanceScore: number;
  source: "perennial" | "generative";
}

/**
 * Calculate recency score with exponential decay
 * Half-life: 24 hours
 */
function calculateRecency(timestamp: string): number {
  const hoursAgo = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
  return Math.exp(-Math.log(2) * hoursAgo / 24);
}

/**
 * Retrieve memories from perennial database
 */
function getPerennialMemories(dbPath: string, limit: number = 50): MemoryEntry[] {
  if (!fs.existsSync(dbPath)) return [];
  
  try {
    const db = new Database(dbPath, { readonly: true });
    const rows = db.query(`
      SELECT id, content, timestamp, category, importance, access_count
      FROM memories
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];
    db.close();
    
    return rows.map(r => ({
      id: r.id,
      content: r.content,
      timestamp: r.timestamp,
      category: r.category,
      importance: r.importance,
      accessCount: r.access_count,
    }));
  } catch (e) {
    console.log("[Memory Bootstrap] Perennial DB error:", e);
    return [];
  }
}

/**
 * Retrieve memories from generative agents database
 */
function getGenerativeMemories(dbPath: string, agentId: string, limit: number = 50): GenerativeMemory[] {
  if (!fs.existsSync(dbPath)) return [];
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Get observations
    const observations = db.query(`
      SELECT id, content, type, timestamp, importance
      FROM memory_stream
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(agentId, limit) as any[];
    
    // Get reflections (weighted higher)
    const reflections = db.query(`
      SELECT id, insight as content, 'reflection' as type, timestamp, importance
      FROM reflections
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT 10
    `).all(agentId) as any[];
    
    db.close();
    
    return [...observations, ...reflections].map(r => ({
      id: r.id,
      content: r.content,
      type: r.type,
      timestamp: r.timestamp,
      importance: r.importance,
    }));
  } catch (e) {
    console.log("[Memory Bootstrap] Generative DB error:", e);
    return [];
  }
}

/**
 * Score and rank memories using CLAWS-style retrieval
 */
function rankMemories(
  perennial: MemoryEntry[],
  generative: GenerativeMemory[],
  contextQuery: string = "recent work and important decisions",
  topK: number = 20
): CLAWSMemory[] {
  const scored: Array<CLAWSMemory & { score: number }> = [];
  
  // Score perennial memories
  for (const mem of perennial) {
    const recency = calculateRecency(mem.timestamp);
    const importance = mem.importance;
    const relevance = calculateRelevance(mem.content, contextQuery);
    
    // CLAWS formula: weighted combination
    const score = (recency * 0.4) + (importance * 0.3) + (relevance * 0.3);
    
    scored.push({
      content: mem.content,
      category: mem.category,
      recencyScore: recency,
      importanceScore: importance,
      source: "perennial",
      score,
    });
  }
  
  // Score generative memories (agent observations/thoughts)
  for (const mem of generative) {
    const recency = calculateRecency(mem.timestamp);
    const importance = mem.importance / 10; // Normalize to 0-1
    const relevance = calculateRelevance(mem.content, contextQuery);
    
    // Boost reflections
    const typeBoost = mem.type === "reflection" ? 1.3 : 1.0;
    
    const score = ((recency * 0.4) + (importance * 0.3) + (relevance * 0.3)) * typeBoost;
    
    scored.push({
      content: mem.content,
      category: mem.type,
      recencyScore: recency,
      importanceScore: importance,
      source: "generative",
      score,
    });
  }
  
  // Sort by score and return top K
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ score, ...mem }) => mem);
}

/**
 * Simple relevance calculation
 */
function calculateRelevance(content: string, query: string): number {
  const contentWords = new Set(content.toLowerCase().split(/\s+/));
  const queryWords = new Set(query.toLowerCase().split(/\s+/));
  const intersection = [...queryWords].filter(w => contentWords.has(w));
  
  if (queryWords.size === 0) return 0.5;
  return intersection.length / queryWords.size;
}

/**
 * Format memories for context injection
 */
function formatMemoriesForContext(memories: CLAWSMemory[]): string {
  if (memories.length === 0) {
    return "No prior memories loaded.";
  }
  
  // Group by category
  const grouped = memories.reduce((acc, mem) => {
    const cat = mem.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mem);
    return acc;
  }, {} as Record<string, CLAWSMemory[]>);
  
  const lines: string[] = [];
  lines.push(`## Loaded ${memories.length} Memories from Previous Sessions`);
  lines.push("");
  
  // Most important first (already sorted)
  const topMemories = memories.slice(0, 10);
  lines.push("### Key Context:");
  for (const mem of topMemories) {
    const indicator = mem.source === "perennial" ? "🏛️" : "🧠";
    lines.push(`${indicator} ${mem.content.slice(0, 120)}${mem.content.length > 120 ? "..." : ""}`);
  }
  
  // Group summary
  lines.push("");
  lines.push("### By Category:");
  for (const [category, items] of Object.entries(grouped)) {
    lines.push(`- ${category}: ${items.length} memories`);
  }
  
  return lines.join("\n");
}

/**
 * Load identity files (fallback if no memories)
 */
function loadIdentityFiles(): string {
  const parts: string[] = [];
  
  const identityPath = path.join(homedir(), ".0xkobold", "IDENTITY.md");
  const soulPath = path.join(homedir(), ".0xkobold", "SOUL.md");
  const userPath = path.join(homedir(), ".0xkobold", "USER.md");
  
  if (fs.existsSync(identityPath)) {
    parts.push("## Identity\n" + fs.readFileSync(identityPath, "utf-8").slice(0, 500));
  }
  
  if (fs.existsSync(userPath)) {
    parts.push("## User Profile\n" + fs.readFileSync(userPath, "utf-8").slice(0, 500));
  }
  
  return parts.join("\n\n");
}

export default function memoryBootstrapExtension(pi: ExtensionAPI) {
  console.log("[Memory Bootstrap] Loading...");
  
  // Get or create Shalom agent ID
  let shalomId: string | null = null;
  const generativeDb = path.join(GENERATIVE_DIR, "agents.db");
  
  if (fs.existsSync(generativeDb)) {
    try {
      const db = new Database(generativeDb, { readonly: true });
      const row = db.query(`SELECT id FROM agents WHERE name = ?`).get("Shalom") as any;
      if (row) shalomId = row.id;
      db.close();
    } catch {}
  }
  
  // Query memories
  const perennialDb = path.join(MEMORY_DIR, "knowledge.db");
  const perennial = getPerennialMemories(perennialDb, 100);
  const generative = shalomId ? getGenerativeMemories(generativeDb, shalomId, 50) : [];
  
  console.log(`[Memory Bootstrap] Found: ${perennial.length} perennial, ${generative.length} generative`);
  
  // Rank and format
  const ranked = rankMemories(perennial, generative, "recent work and important context", 25);
  const memoryContext = ranked.length > 0 
    ? formatMemoriesForContext(ranked)
    : loadIdentityFiles();
  
  // Inject into system context using before_agent_start event
  // This prepends memories to the system prompt
  pi.on("before_agent_start", async (event) => {
    if (!event.systemPrompt.includes("Loaded Memories")) {
      return {
        systemPrompt: `${memoryContext}\n\n${event.systemPrompt}`
      };
    }
  });
  
  // Store in extension metadata (accessible to tools)
  (pi as any).metadata = (pi as any).metadata || {};
  (pi as any).metadata.memoryContext = memoryContext;
  (pi as any).metadata.loadedMemories = {
    perennial: perennial.length,
    generative: generative.length,
    injected: ranked.length,
  };
  
  // Log summary
  console.log("[Memory Bootstrap] Injected into context:");
  console.log(`  - Perennial memories: ${perennial.length} available, ${ranked.filter(m => m.source === "perennial").length} loaded`);
  console.log(`  - Generative memories: ${generative.length} available, ${ranked.filter(m => m.source === "generative").length} loaded`);
  console.log(`  - Top categories: ${[...new Set(ranked.slice(0, 5).map(m => m.category))].join(", ") || "None"}`);
  
  // Register /remember to save current session memory
  pi.registerCommand("remember", {
    description: "Save current state as perennial memory",
    handler: async (args: string, ctx: ExtensionContext) => {
      if (!args.trim()) {
        ctx.ui.notify("❌ Usage: /remember what to save", "error");
        return;
      }
      
      // Use perennial_save tool via sendMessage
      pi.sendMessage({
        customType: "system.memory_save",
        content: [{ type: "text", text: args }],
        display: false,
      });
      
      ctx.ui.notify("💾 Saved to perennial memory", "info");
    },
  });
  
  // Register /memory command for manual refresh
  pi.registerCommand("memory-refresh", {
    description: "Reload memories from database",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const freshPerennial = getPerennialMemories(perennialDb, 100);
      const freshGenerative = shalomId ? getGenerativeMemories(generativeDb, shalomId, 50) : [];
      const freshRanked = rankMemories(freshPerennial, freshGenerative, "recent work", 25);
      
      ctx.ui.notify(
        `🧠 Refreshed memories:\n` +
        `  Perennial: ${freshPerennial.length}\n` +
        `  Generative: ${freshGenerative.length}\n` +
        `  Loaded: ${freshRanked.length}`,
        "info"
      );
    },
  });
  
  pi.registerCommand("memory-stats", {
    description: "Show memory statistics",
    handler: async (_args: string, ctx: ExtensionContext) => {
      ctx.ui.notify(
        `📊 Memory Stats:\n` +
        `  Perennial DB: ${fs.existsSync(perennialDb) ? "✅" : "❌"}\n` +
        `  Generative DB: ${fs.existsSync(generativeDb) ? "✅" : "❌"}\n` +
        `  Shalom ID: ${shalomId ? shalomId.slice(0, 8) + "..." : "Not created"}`,
        "info"
      );
    },
  });
}
