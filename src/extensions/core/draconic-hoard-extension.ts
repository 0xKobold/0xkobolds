/**
 * 💎 Draconic Hoard Extension
 *
 * Provides /treasure commands for code snippet management
 * Superior code treasure hoarding with semantic search
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  DraconicHoardSystem,
  Treasure,
  getDraconicHoardSystem,
} from "../../hoard/DraconicHoardSystem";

// 💎 Hoard system singleton
let hoardSystem: DraconicHoardSystem;

export default function register(pi: ExtensionAPI) {
  // Initialize
  hoardSystem = getDraconicHoardSystem();

  // ============================================================================
  // TOOL: hoard_manage
  // ============================================================================
  pi.registerTool({
    name: "hoard_manage",
    label: "💎 Draconic Hoard Management",
    description: "Manage code snippets (treasures) with semantic search",
    parameters: Type.Object({
      operation: Type.String({
        description: "Operation: add, search, suggest, get, share, stats",
      }),
      name: Type.Optional(Type.String({ description: "Treasure name" })),
      description: Type.Optional(Type.String({ description: "Treasure description" })),
      code: Type.Optional(Type.String({ description: "Code snippet" })),
      language: Type.Optional(Type.String({ description: "Programming language" })),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Tags" })),
      query: Type.Optional(Type.String({ description: "Search query" })),
      task: Type.Optional(Type.String({ description: "Task for suggestions" })),
      treasureId: Type.Optional(Type.String({ description: "Treasure ID" })),
      sessionKey: Type.Optional(Type.String({ description: "Session for sharing" })),
      sourceFile: Type.Optional(Type.String({ description: "Source file path" })),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ): Promise<AgentToolResult<any>> {
      const operation = params.operation as string;

      switch (operation) {
        case "add": {
          const name = params.name as string;
          const desc = params.description as string;
          const code = params.code as string;
          const language = params.language as string;
          const tags = params.tags as string[];

          if (!name || !code) {
            return { content: [{ type: "text", text: "❌ name and code required" }], details: { error: "missing_params" } };
          }

          const id = hoardSystem.treasure({
            name,
            description: desc || "",
            code,
            language: language || "text",
            tags,
            sourceFile: params.sourceFile as string | undefined,
            sourceSession: (ctx as any).sessionKey || "unknown",
            createdBy: "user",
          });

          return {
            content: [{ type: "text", text: `💎 Treasure added: ${id.slice(0, 8)}...\nName: ${name}` }],
            details: { id, name },
          };
        }

        case "search": {
          const query = params.query as string;
          if (!query) {
            return { content: [{ type: "text", text: "❌ query required" }], details: { error: "missing_query" } };
          }

          const results = hoardSystem.search(query, { limit: 5 });

          if (results.length === 0) {
            return { content: [{ type: "text", text: "🔍 No treasures found" }], details: { results: [] } };
          }

          return {
            content: [{
              type: "text",
              text: `🔍 Found ${results.length} treasures:\n\n${results.map((r, i) =>
                `${i + 1}. ${r.treasure.name} (${r.treasure.language})\n   Score: ${r.score.toFixed(2)}\n   ${r.treasure.description.slice(0, 60)}...`
              ).join("\n\n")}`,
            }],
            details: { results },
          };
        }

        case "suggest": {
          const task = params.task as string;
          if (!task) {
            return { content: [{ type: "text", text: "❌ task required" }], details: { error: "missing_task" } };
          }

          const suggestions = hoardSystem.suggestTreasures(task, { limit: 3 });

          if (suggestions.length === 0) {
            return { content: [{ type: "text", text: "💡 No relevant treasures found" }], details: { suggestions: [] } };
          }

          return {
            content: [{
              type: "text",
              text: `💡 Suggested treasures for task:\n\n${suggestions.map((s, i) =>
                `${i + 1}. ${s.treasure.name} (${s.treasure.language})\n   Relevance: ${(s.relevance * 100).toFixed(0)}%\n   ${s.reason}`
              ).join("\n\n")}`,
            }],
            details: { suggestions },
          };
        }

        case "get": {
          const treasureId = params.treasureId as string;
          if (!treasureId) {
            return { content: [{ type: "text", text: "❌ treasureId required" }], details: { error: "missing_id" } };
          }

          const treasure = hoardSystem.get(treasureId);

          if (!treasure) {
            return { content: [{ type: "text", text: "❌ Treasure not found" }], details: { error: "not_found" } };
          }

          return {
            content: [{
              type: "text",
              text: `💎 ${treasure.name}\nLanguage: ${treasure.language}\nQuality: ${treasure.quality}/10\nUsed: ${treasure.timesUsed} times\nTags: ${treasure.tags.join(", ")}\n\n\`\`\`${treasure.language}\n${treasure.code}\n\`\`\``,
            }],
            details: { treasure },
          };
        }

        case "share": {
          const treasureId = params.treasureId as string;
          const sessionKey = params.sessionKey as string;

          if (!treasureId || !sessionKey) {
            return { content: [{ type: "text", text: "❌ treasureId and sessionKey required" }], details: { error: "missing_params" } };
          }

          const success = hoardSystem.shareTreasure(treasureId, sessionKey);

          return {
            content: [{ type: "text", text: success ? "✅ Treasure shared" : "❌ Failed to share" }],
            details: { success },
          };
        }

        case "stats": {
          const stats = hoardSystem.getStats();

          return {
            content: [{
              type: "text",
              text: `💎 Hoard Statistics:\n\nTotal treasures: ${stats.totalTreasures}\nTotal usage: ${stats.totalUsage}\nAverage quality: ${stats.averageQuality.toFixed(1)}/10\nShared: ${stats.sharedTreasures}\n\nBy Language:\n${Object.entries(stats.byLanguage).map(([l, c]) => `  ${l}: ${c}`).join("\n")}`,
            }],
            details: stats,
          };
        }

        default:
          return { content: [{ type: "text", text: `❌ Unknown operation: ${operation}` }], details: { error: "unknown_op" } };
      }
    },
  });

  // ============================================================================
  // COMMANDS
  // ============================================================================

  // /treasure <query>
  pi.registerCommand("treasure", {
    description: "Search treasures: /treasure <query>",
    handler: async (args: string, ctx: ExtensionContext) => {
      if (!args.trim()) {
        ctx.ui.notify("❌ Usage: /treasure <search query>", "error");
        return;
      }

      const results = hoardSystem.search(args, { limit: 5 });

      if (results.length === 0) {
        ctx.ui.notify("🔍 No treasures found", "info");
        return;
      }

      ctx.ui.notify(
        `🔍 ${results.length} treasures:\n${results.map(r => `• ${r.treasure.name}`).join("\n")}`,
        "info"
      );
    },
  });

  // /treasure-add
  pi.registerCommand("treasure-add", {
    description: "Add treasure (interactive): /treasure-add",
    handler: async (_args: string, ctx: ExtensionContext) => {
      ctx.ui.notify("💎 Use hoard_manage tool to add treasures", "info");
    },
  });

  // /treasure-stats
  pi.registerCommand("treasure-stats", {
    description: "Show hoard statistics",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const stats = hoardSystem.getStats();
      ctx.ui.notify(
        `💎 Hoard: ${stats.totalTreasures} treasures, ${stats.totalUsage} uses`,
        "info"
      );
    },
  });

  // /treasure-suggest <task>
  pi.registerCommand("treasure-suggest", {
    description: "Suggest treasures for task: /treasure-suggest <task>",
    handler: async (args: string, ctx: ExtensionContext) => {
      if (!args.trim()) {
        ctx.ui.notify("❌ Usage: /treasure-suggest <task description>", "error");
        return;
      }

      const suggestions = hoardSystem.suggestTreasures(args, { limit: 3 });

      if (suggestions.length === 0) {
        ctx.ui.notify("💡 No relevant treasures", "info");
        return;
      }

      ctx.ui.notify(
        `💡 Suggestions:\n${suggestions.map(s => `• ${s.treasure.name} (${(s.relevance * 100).toFixed(0)}%)`).join("\n")}`,
        "info"
      );
    },
  });

  console.log("[💎 DraconicHoard] Extension loaded");
  console.log("  Commands: /treasure, /treasure-stats, /treasure-suggest");
}
