/**
 * Memory Synthesis Extension
 * 
 * Auto-generates human-readable MEMORY.md from perennial database
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Type } from "@sinclair/typebox";
import { homedir } from "node:os";

const MEMORY_DB = path.join(homedir(), ".0xkobold", "memory", "perennial", "knowledge.db");
const MEMORY_MD = path.join(homedir(), ".0xkobold", "MEMORY.md");

interface MemoryEntry {
  id: string;
  content: string;
  timestamp: string;
  category: string;
  importance: number;
  tags: string[];
}

async function loadMemories(): Promise<MemoryEntry[]> {
  try {
    const db = new Database(MEMORY_DB);
    const rows = db.query(`
      SELECT id, content, timestamp, category, importance, tags
      FROM memories
      ORDER BY importance DESC, timestamp DESC
    `).all() as any[];
    
    return rows.map(r => ({
      ...r,
      tags: JSON.parse(r.tags),
    }));
  } catch {
    return [];
  }
}

function generateMemoryMd(memories: MemoryEntry[]): string {
  const highImportance = memories.filter(m => m.importance >= 0.7);
  const decisions = memories.filter(m => m.category === "decision");
  const facts = memories.filter(m => m.category === "fact");
  const tasks = memories.filter(m => m.category === "task" && m.importance >= 0.5);
  
  const sections: string[] = [
    "# Personal Knowledge Vault",
    "",
    `> Auto-generated synthesis of ${memories.length} memories`,
    `> Last updated: ${new Date().toLocaleString()}`,
    "",
    "## High-Impact Decisions",
    "",
  ];
  
  if (decisions.length > 0) {
    for (const d of decisions.slice(0, 10)) {
      const date = new Date(d.timestamp).toLocaleDateString();
      sections.push(`- **[${date}]** ${d.content}`);
    }
  } else {
    sections.push("_No major decisions recorded yet._");
  }
  
  sections.push("", "## Key Facts Learned", "");
  
  if (facts.length > 0) {
    for (const f of facts.slice(0, 15)) {
      const date = new Date(f.timestamp).toLocaleDateString();
      sections.push(`- **[${date}]** ${f.content}`);
    }
  } else {
    sections.push("_No facts recorded yet._");
  }
  
  sections.push("", "## Active Tasks", "");
  
  if (tasks.length > 0) {
    for (const t of tasks.slice(0, 10)) {
      const date = new Date(t.timestamp).toLocaleDateString();
      sections.push(`- [ ] **[${date}]** ${t.content}`);
    }
  } else {
    sections.push("_No active tasks._");
  }
  
  sections.push("", "## Categories", "");
  const categories = [...new Set(memories.map(m => m.category))];
  for (const cat of categories) {
    const count = memories.filter(m => m.category === cat).length;
    sections.push(`- ${cat}: ${count} memories`);
  }
  
  sections.push(
    "",
    "---",
    "",
    "_This file is auto-generated from perennial memory. Use `/remember` to add new memories._"
  );
  
  return sections.join("\n");
}

export default function memorySynthesisExtension(pi: ExtensionAPI) {
  console.log("[Memory Synthesis] Ready");
  
  // TOOL: Synthesize MEMORY.md
  pi.registerTool({
    name: "memory_synthesize",
    label: "Synthesize MEMORY.md",
    description: "Generate human-readable MEMORY.md from perennial database",
    parameters: Type.Object({}),
    async execute(): Promise<any> {
      const memories = await loadMemories();
      
      if (memories.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No memories found. Use /remember to add some!" }],
          details: { count: 0 },
        };
      }
      
      const markdown = generateMemoryMd(memories);
      await fs.writeFile(MEMORY_MD, markdown);
      
      return {
        content: [{
          type: "text" as const,
          text: `📝 Generated MEMORY.md with ${memories.length} memories`,
        }],
        details: { count: memories.length, path: MEMORY_MD },
      };
    },
  });
  
  // COMMANDS
  pi.registerCommand("memory-synthesize", {
    description: "Generate MEMORY.md from database",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const memories = await loadMemories();
      if (memories.length === 0) {
        ctx.ui.notify("No memories found. Use /remember first!", "warning");
        return;
      }
      
      const markdown = generateMemoryMd(memories);
      await fs.writeFile(MEMORY_MD, markdown);
      
      ctx.ui.notify(`📝 MEMORY.md updated with ${memories.length} memories`, "info");
    },
  });
  
  pi.registerCommand("memory-read", {
    description: "Read synthesized MEMORY.md",
    handler: async (_args: string, ctx: ExtensionContext) => {
      try {
        const content = await fs.readFile(MEMORY_MD, "utf-8");
        const preview = content.split("\n").slice(0, 20).join("\n");
        ctx.ui.notify(`📝 MEMORY.md:\n${preview}\n...`, "info");
      } catch {
        ctx.ui.notify("MEMORY.md not found. Run /memory-synthesize first.", "warning");
      }
    },
  });
}
