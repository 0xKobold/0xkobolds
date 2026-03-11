/**
 * 🏰 Draconic Lair Extension
 *
 * Provides /lair commands for project workspace management
 * Superior to agent-workspace-extension with auto-detection and per-file memory
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync } from "node:fs";
import * as path from "node:path";
import {
  DraconicLairSystem,
  DraconicLair,
  getDraconicLairSystem,
} from "../../lair/DraconicLairSystem";

// 🏰 Lair system singleton
let lairSystem: DraconicLairSystem;

export default function register(pi: ExtensionAPI) {
  // Initialize
  lairSystem = getDraconicLairSystem();

  // ============================================================================
  // TOOL: lair_manage
  // ============================================================================
  pi.registerTool({
    name: "lair_manage",
    label: "🏰 Draconic Lair Management",
    description: "Manage project workspaces with auto-detection and file tracking",
    parameters: Type.Object({
      operation: Type.String({
        description: "Operation: get, create, list, stats, add_agent, remove_agent, record_file",
      }),
      path: Type.Optional(Type.String({ description: "Project path" })),
      lairId: Type.Optional(Type.String({ description: "Lair ID" })),
      agentId: Type.Optional(Type.String({ description: "Agent ID" })),
      filePath: Type.Optional(Type.String({ description: "File path" })),
      fileOperation: Type.Optional(Type.String({ description: "File operation type" })),
      description: Type.Optional(Type.String({ description: "Operation description" })),
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
        case "get": {
          const projectPath = params.path as string;
          if (!projectPath) {
            return { content: [{ type: "text", text: "❌ path required" }], details: { error: "missing_path" } };
          }

          const lair = lairSystem.getLair(projectPath);

          return {
            content: [{
              type: "text",
              text: `🏰 Lair: ${lair.name}\nID: ${lair.id}\nType: ${lair.type}\nFramework: ${lair.framework}\nLanguage: ${lair.language}\n
Active Agents: ${lair.activeAgents.size}\nFile Memories: ${lair.fileMemories.size}\n\nSuggested Tools:\n${lair.suggestedTools.map(t => `  • ${t}`).join("\n")}`,
            }],
            details: { lair },
          };
        }

        case "list": {
          const lairs = lairSystem.listLairs();
          const stats = lairSystem.getStats();

          return {
            content: [{
              type: "text",
              text: `🏰 All Lairs (${stats.totalLairs}):\n\n${lairs.map(l => `• ${l.name} (${l.type}, ${l.framework}) - ${l.activeAgents.size} agents`).join("\n")}`,
            }],
            details: { lairs, stats },
          };
        }

        case "stats": {
          const stats = lairSystem.getStats();

          return {
            content: [{
              type: "text",
              text: `🏰 Lair Statistics:\n\nTotal: ${stats.totalLairs}\nActive Agents: ${stats.totalAgents}\nFile Memories: ${stats.totalFileMemories}\n\nBy Type:\n${Object.entries(stats.byType).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`,
            }],
            details: stats,
          };
        }

        case "add_agent": {
          const lairId = params.lairId as string;
          const agentId = params.agentId as string;

          if (!lairId || !agentId) {
            return { content: [{ type: "text", text: "❌ lairId and agentId required" }], details: { error: "missing_params" } };
          }

          const success = lairSystem.addAgent(lairId, agentId);
          return {
            content: [{ type: "text", text: success ? `✅ Agent ${agentId} added to lair` : `❌ Failed to add agent` }],
            details: { success, lairId, agentId },
          };
        }

        case "record_file": {
          const lairId = params.lairId as string;
          const filePath = params.filePath as string;
          const agentId = params.agentId as string;
          const fileOp = params.fileOperation as string;
          const desc = params.description as string;

          if (!lairId || !filePath || !agentId) {
            return { content: [{ type: "text", text: "❌ missing required params" }], details: { error: "missing_params" } };
          }

          lairSystem.recordFileOperation(lairId, filePath, agentId, fileOp as any, desc || "");

          return {
            content: [{ type: "text", text: `✅ Recorded ${fileOp} on ${path.basename(filePath)}` }],
            details: { lairId, filePath, agentId, operation: fileOp },
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

  // /lair [path]
  pi.registerCommand("lair", {
    description: "Get or create lair: /lair [path]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const projectPath = args.trim() || process.cwd();
      const lair = lairSystem.getLair(projectPath);

      ctx.ui.notify(`🏰 Lair: ${lair.name}\nType: ${lair.type}\nFramework: ${lair.framework}\nAgents: ${lair.activeAgents.size}`, "info");
    },
  });

  // /lairs
  pi.registerCommand("lairs", {
    description: "List all lairs",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const lairs = lairSystem.listLairs();
      const stats = lairSystem.getStats();

      ctx.ui.notify(
        `${stats.totalLairs} lairs:\n${lairs.slice(0, 10).map(l => `• ${l.name}`).join("\n")}`,
        "info"
      );
    },
  });

  // /lair-stats
  pi.registerCommand("lair-stats", {
    description: "Show lair statistics",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const stats = lairSystem.getStats();

      ctx.ui.notify(
        `🏰 Lair Stats:\nLairs: ${stats.totalLairs}\nActive Agents: ${stats.totalAgents}\nFile Memories: ${stats.totalFileMemories}`,
        "info"
      );
    },
  });

  // /lair-agents <lair-path>
  pi.registerCommand("lair-agents", {
    description: "Show agents in lair: /lair-agents <path>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const projectPath = args.trim() || process.cwd();
      const lair = lairSystem.getLair(projectPath);
      const agents = Array.from(lair.activeAgents).join(", ") || "none";

      ctx.ui.notify(`${lair.name} agents:\n${agents}`, "info");
    },
  });

  console.log("[🏰 DraconicLair] Extension loaded");
  console.log("  Commands: /lair, /lairs, /lair-stats, /lair-agents");
}
