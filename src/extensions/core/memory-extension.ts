/**
 * Memory Extension - JSONL-based memory for 0xKobold
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";

const MEMORY_DIR = path.join(homedir(), ".0xkobold", "memory");
const ENTRIES_FILE = path.join(MEMORY_DIR, "entries.jsonl");

interface MemoryEntry {
  id: string;
  timestamp: string;
  category: "decision" | "fact" | "task" | "context" | "error" | "learning";
  tags: string[];
  content: string;
}

async function ensureDirs() {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
}

async function loadEntries(): Promise<MemoryEntry[]> {
  try {
    const content = await fs.readFile(ENTRIES_FILE, "utf-8");
    return content.split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
  } catch { return []; }
}

async function appendEntry(entry: MemoryEntry) {
  await ensureDirs();
  await fs.appendFile(ENTRIES_FILE, JSON.stringify(entry) + "\n");
}

export default function memoryExtension(pi: ExtensionAPI) {
  console.log("[Memory] Extension loaded");
  
  // Save memory tool
  pi.registerTool({
    name: "memory_save",
    label: "Save Memory",
    description: "Save a memory entry (decision, fact, task, etc.)",
    parameters: Type.Object({
      content: Type.String({ description: "Memory content" }),
      category: Type.String({ description: "Category" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Tags" })),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: AgentToolUpdateCallback<unknown>, _ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
      const entry: MemoryEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        category: (params.category || "context") as MemoryEntry["category"],
        content: params.content as string,
        tags: (params.tags as string[]) || [],
      };
      await appendEntry(entry);
      return {
        content: [{ type: "text" as const, text: `✅ Saved: ${entry.id.slice(0,8)}` }],
        details: { entry },
      };
    },
  });

  // Search tool
  pi.registerTool({
    name: "memory_search",
    label: "Search Memory",
    description: "Search saved memories",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      limit: Type.Optional(Type.Number({ description: "Max results" })),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: AgentToolUpdateCallback<unknown>, _ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
      const entries = await loadEntries();
      const q = String(params.query).toLowerCase();
      const limit = Number(params.limit) || 10;
      
      const matches = entries
        .filter(e => e.content.toLowerCase().includes(q) || e.tags.some(t => t.toLowerCase().includes(q)))
        .slice(-limit)
        .reverse();
      
      const text = matches.length 
        ? matches.map(e => `[${e.category}] ${e.content.slice(0,60)}...`).join("\n")
        : "No memories found";
      
      return { 
        content: [{ type: "text" as const, text }],
        details: { count: matches.length, matches },
      };
    },
  });

  // Commands
  pi.registerCommand("memory-save", {
    description: "Save memory: /memory-save \"content\" --tags auth",
    handler: async (args: string, ctx: ExtensionContext) => {
      const [content, ...rest] = args.split(" --tags ");
      const entry: MemoryEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        category: "context",
        content: content.trim(),
        tags: rest[0] ? rest[0].split(",").map(t => t.trim()) : [],
      };
      await appendEntry(entry);
      ctx.ui.notify(`✅ Saved: ${entry.id.slice(0,8)}`, "info");
    },
  });

  pi.registerCommand("memory-search", {
    description: "Search: /memory-search \"query\"",
    handler: async (args: string, ctx: ExtensionContext) => {
      const entries = await loadEntries();
      const q = args.toLowerCase();
      const matches = entries
        .filter(e => e.content.toLowerCase().includes(q))
        .slice(-10);
      
      ctx.ui.notify(matches.length 
        ? matches.map(e => `${e.content.slice(0,50)}...`).join("\n") 
        : "No memories found", "info");
    },
  });

  pi.registerCommand("memory-list", {
    description: "List recent",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const entries = await loadEntries();
      const recent = entries.slice(-10);
      ctx.ui.notify(recent.length 
        ? recent.map((e, i) => `${i+1}. ${e.content.slice(0,40)}...`).join("\n")
        : "No memories", "info");
    },
  });
}
