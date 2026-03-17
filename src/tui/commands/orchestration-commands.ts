/**
 * 🐉 Draconic TUI Orchestration Commands
 * 
 * Slash commands for subagent management:
 * - /agent-spawn <type> <task>
 * - /agent-tree [runId]
 * - /agent-result <runId>
 * - /agent-kill <runId>
 * - /agent-status [runId]
 * - /agents
 */

import type { DraconicTUI, SpawnOptions, AgentType, AgentTree } from "../draconic-tui";

export interface CommandContext {
  tui: DraconicTUI;
  chatLog: {
    addSystem(message: string): void;
    addUser(message: string): void;
    addAssistant(message: string): void;
  };
  openOverlay(component: any): void;
  closeOverlay(): void;
  requestRender(): void;
  getCurrentSession(): { agentId?: string; runId?: string };
}

export interface SlashCommand {
  name: string;
  description: string;
  aliases?: string[];
  usage?: string;
  hasArgument?: boolean;
  execute(ctx: CommandContext, args?: string): Promise<void>;
}

// ============================================================================
// Command: /agent-spawn
// ============================================================================

const AgentSpawnCommand: SlashCommand = {
  name: "agent-spawn",
  aliases: ["/spawn", "/delegate"],
  description: "Spawn a subagent for a specific task",
  usage: "/agent-spawn <type> <task> [--strategy fast|thorough|auto]",
  hasArgument: true,

  async execute(ctx, args) {
    if (!args) {
      ctx.chatLog.addSystem(
        "Usage: /agent-spawn <type> <task>\n" +
        "Types: coordinator, specialist, researcher, planner, reviewer\n" +
        "Examples:\n" +
        "  /agent-spawn researcher \"analyze authentication flow\"\n" +
        "  /agent-spawn specialist \"refactor user service\" --strategy thorough"
      );
      return;
    }

    // Parse: /agent-spawn researcher "analyze code" --strategy fast
    const match = args.match(/^(\w+)\s+"([^"]+)"(?:\s+--strategy\s+(\w+))?$/);
    if (!match) {
      // Try simpler parse: type ...task
      const parts = args.split(/\s+/);
      const type = parts[0] as AgentType;
      const task = parts.slice(1).join(" ").replace(/^["']|["']$/g, "");
      
      if (!isValidAgentType(type)) {
        ctx.chatLog.addSystem(`❌ Invalid agent type: ${type}. Valid: coordinator, specialist, researcher, planner, reviewer`);
        return;
      }

      await doSpawn(ctx, type, task);
      return;
    }

    const [, type, task, strategy] = match;
    
    if (!isValidAgentType(type)) {
      ctx.chatLog.addSystem(`❌ Invalid agent type: ${type}`);
      return;
    }

    await doSpawn(ctx, type as AgentType, task, strategy as SpawnOptions["strategy"]);
  },
};

async function doSpawn(
  ctx: CommandContext,
  type: AgentType,
  task: string,
  strategy: SpawnOptions["strategy"] = "auto"
): Promise<void> {
  const session = ctx.getCurrentSession();
  
  ctx.chatLog.addSystem(`🐉 Spawning ${type}...`);
  ctx.chatLog.addSystem(`   Task: ${task.slice(0, 50)}${task.length > 50 ? "..." : ""}`);

  try {
    const result = await ctx.tui.spawnSubagent({
      type,
      task,
      parentId: session.runId,
      strategy,
      inherit: true,
      notify: true,
    });

    ctx.chatLog.addSystem(
      `✅ Spawned ${result.runId}\n` +
      `   Estimated: ${result.tokens?.estimated || "unknown"} tokens\n` +
      `   Status: ${result.status}`
    );

    // If completed immediately (rare), show result
    if (result.status === "completed" && result.output) {
      ctx.chatLog.addSystem("📄 Result:\n" + result.output.slice(0, 500));
    } else {
      ctx.chatLog.addSystem("   Use /agent-result " + result.runId + " to check result");
    }
  } catch (err) {
    ctx.chatLog.addSystem(`❌ Spawn failed: ${err}`);
  }
}

function isValidAgentType(type: string): type is AgentType {
  return ["coordinator", "specialist", "researcher", "planner", "reviewer"].includes(type);
}

// ============================================================================
// Command: /agent-tree
// ============================================================================

const AgentTreeCommand: SlashCommand = {
  name: "agent-tree",
  aliases: ["/tree", "/hierarchy"],
  description: "Show agent hierarchy tree",
  usage: "/agent-tree [runId]",
  hasArgument: false,

  async execute(ctx, args) {
    const runId = args?.trim();
    
    try {
      const tree = await ctx.tui.getAgentTree(runId);
      
      if (!tree) {
        ctx.chatLog.addSystem("No agent tree found.");
        return;
      }

      const formatted = formatTree(tree, "", true);
      ctx.chatLog.addSystem("🐉 Agent Tree:\n" + formatted);
    } catch (err) {
      ctx.chatLog.addSystem(`❌ Failed to get tree: ${err}`);
    }
  },
};

function formatTree(node: AgentTree, prefix: string, isLast: boolean): string {
  const connector = isLast ? "└── " : "├── ";
  const statusEmoji = {
    running: "🟡",
    completed: "✅",
    error: "❌",
    idle: "⚪",
  }[node.status] || "⚪";

  const line = `${prefix}${connector}${statusEmoji} ${node.runId} [${node.type}]${node.task ? ": " + node.task.slice(0, 30) : ""}`;
  
  let result = line;
  const childPrefix = prefix + (isLast ? "    " : "│   ");
  
  node.children.forEach((child, i) => {
    const childIsLast = i === node.children.length - 1;
    result += "\n" + formatTree(child, childPrefix, childIsLast);
  });

  return result;
}

// ============================================================================
// Command: /agent-result
// ============================================================================

const AgentResultCommand: SlashCommand = {
  name: "agent-result",
  aliases: ["/result", "/output"],
  description: "Show subagent result/output",
  usage: "/agent-result <runId>",
  hasArgument: true,

  async execute(ctx, args) {
    const runId = args?.trim();
    if (!runId) {
      ctx.chatLog.addSystem("Usage: /agent-result <runId>");
      return;
    }

    try {
      const artifacts = await ctx.tui.getResult(runId);
      
      if (!artifacts || artifacts.length === 0) {
        ctx.chatLog.addSystem(`No results found for ${runId}. Agent may still be running.`);
        return;
      }

      const artifact = artifacts[0];
      
      if (artifact.type === "file" && artifact.path) {
        ctx.chatLog.addSystem(`📄 Result saved to: ${artifact.path}`);
      }
      
      if (artifact.content) {
        const preview = artifact.content.slice(0, 2000);
        ctx.chatLog.addSystem("📄 Output preview (first 2000 chars):\n" + preview);
      }
    } catch (err) {
      ctx.chatLog.addSystem(`❌ Failed to get result: ${err}`);
    }
  },
};

// ============================================================================
// Command: /agent-kill
// ============================================================================

const AgentKillCommand: SlashCommand = {
  name: "agent-kill",
  aliases: ["/kill", "/stop"],
  description: "Kill a running agent",
  usage: "/agent-kill <runId>",
  hasArgument: true,

  async execute(ctx, args) {
    const runId = args?.trim();
    if (!runId) {
      ctx.chatLog.addSystem("Usage: /agent-kill <runId>");
      return;
    }

    try {
      const success = await ctx.tui.killAgent(runId);
      ctx.chatLog.addSystem(success 
        ? `✅ Killed ${runId}` 
        : `❌ Failed to kill ${runId}`
      );
    } catch (err) {
      ctx.chatLog.addSystem(`❌ Error: ${err}`);
    }
  },
};

// ============================================================================
// Command: /agent-status
// ============================================================================

const AgentStatusCommand: SlashCommand = {
  name: "agent-status",
  aliases: ["/status"],
  description: "Show agent status details",
  usage: "/agent-status [runId]",
  hasArgument: false,

  async execute(ctx, args) {
    const runId = args?.trim();
    
    try {
      const status = await ctx.tui.getStatus(runId);
      ctx.chatLog.addSystem("🐉 Agent Status:\n" + JSON.stringify(status, null, 2));
    } catch (err) {
      ctx.chatLog.addSystem(`❌ Failed to get status: ${err}`);
    }
  },
};

// ============================================================================
// Command: /agents
// ============================================================================

const AgentsCommand: SlashCommand = {
  name: "agents",
  description: "List all active agents",
  usage: "/agents",
  hasArgument: false,

  async execute(ctx) {
    try {
      const agents = await ctx.tui.listAgents();
      
      if (agents.length === 0) {
        ctx.chatLog.addSystem("No active agents.");
        return;
      }

      const lines = agents.map(a => {
        const status = a.status === "running" ? "🟡" : "✅";
        return `${status} ${a.runId} [${a.type}]: ${a.task?.slice(0, 40) || "no task"}`;
      });

      ctx.chatLog.addSystem("🐉 Active Agents:\n" + lines.join("\n"));
    } catch (err) {
      ctx.chatLog.addSystem(`❌ Failed to list agents: ${err}`);
    }
  },
};

// ============================================================================
// Export all commands
// ============================================================================

// ============================================================================
// Command: /personality - OpenClaw/Hermes-style personality overlay
// ============================================================================

const PersonalityCommand: SlashCommand = {
  name: "personality",
  aliases: ["/persona", "/mode"],
  description: "Switch session personality/mode overlay",
  usage: "/personality [name] or /personality list or /personality reset",
  hasArgument: false,

  async execute(ctx, args) {
    const workspaceDir = process.env.KOBOLD_WORKSPACE || process.env.HOME + "/.0xkobold";
    const personalitiesDir = workspaceDir + "/personalities";
    
    // List personalities
    if (args?.trim() === "list" || !args?.trim()) {
      try {
        const fs = await import("fs/promises");
        const files = await fs.readdir(personalitiesDir);
        const personalities = files.filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""));
        
        ctx.chatLog.addSystem(
          "🎭 Available Personalities:\n" + 
          personalities.map(p => `  • ${p}`).join("\n") +
          "\n\nUsage: /personality <name> to switch\n" +
          "       /personality reset to clear overlay"
        );
      } catch {
        ctx.chatLog.addSystem("No personalities found. Create ~/.0xkobold/personalities/<name>.md");
      }
      return;
    }
    
    // Reset personality
    if (args?.trim() === "reset" || args?.trim() === "clear") {
      // Store in session that personality is cleared
      process.env.KOBOLD_PERSONALITY = "";
      ctx.chatLog.addSystem("🎭 Personality overlay cleared. Using default persona.");
      return;
    }
    
    // Set personality
    const personalityName = args?.trim().toLowerCase();
    if (!personalityName) {
      ctx.chatLog.addSystem("Usage: /personality <name> | list | reset");
      return;
    }
    
    try {
      const fs = await import("fs/promises");
      const personalityPath = `${personalitiesDir}/${personalityName}.md`;
      const content = await fs.readFile(personalityPath, "utf-8");
      
      if (content.length === 0) {
        ctx.chatLog.addSystem(`❌ Personality '${personalityName}' is empty.`);
        return;
      }
      
      // Set environment variable for session
      process.env.KOBOLD_PERSONALITY = personalityName;
      process.env.KOBOLD_PERSONALITY_CONTENT = content;
      
      ctx.chatLog.addSystem(
        `🎭 Personality set: ${personalityName}\n` +
        `Preview: ${content.slice(0, 100).replace(/\n/g, " ")}...`
      );
    } catch {
      ctx.chatLog.addSystem(
        `❌ Personality '${personalityName}' not found.\n` +
        `Create it at: ~/.0xkobold/personalities/${personalityName}.md`
      );
    }
  },
};

// ============================================================================
// Command: /agent-cleanup (Meta-agent pattern!)
// ============================================================================

const AgentCleanupCommand: SlashCommand = {
  name: "agent-cleanup",
  aliases: ["/cleanup"],
  description: "Spawn cleanup subagent to remove stale completed agents",
  usage: "/agent-cleanup [--dry-run] [--target=stale|artifacts|all]",
  hasArgument: false,

  async execute(ctx, args) {
    const dryRun = args?.includes("--dry-run") || args?.includes("-n");
    const targetMatch = args?.match(/--target=(stale|artifacts|all)/);
    const target = (targetMatch?.[1] as "stale" | "artifacts" | "all") || "all";

    ctx.chatLog.addSystem(`🧹 Spawning cleanup subagent (target: ${target}, dry-run: ${dryRun})...`);
    
    try {
      const result = await ctx.tui.spawnSubagent({
        type: "specialist",
        task: `Run agent cleanup: target=${target}, dryRun=${dryRun}. Use agentCleanup skill with proper retention policy.`,
        strategy: "fast",
      });

      if (result.status === "running" || result.status === "completed") {
        ctx.chatLog.addSystem(`🧹 Cleanup subagent spawned: ${result.runId?.slice(-8)}`);
        ctx.chatLog.addSystem("The specialist will auto-report back when complete.");
      } else {
        ctx.chatLog.addSystem(`❌ Failed to spawn cleanup: ${"spawn failed"}`);
      }
    } catch (err) {
      ctx.chatLog.addSystem(`❌ Error: ${err}`);
    }
  },
};

// ============================================================================
// Command: /agent-reset (Clear registry cache)
// ============================================================================
const AgentResetCommand: SlashCommand = {
  name: "agent-reset",
  description: "Clear all agents from display (use after reload if stale data)",
  usage: "/agent-reset",
  hasArgument: false,

  async execute(ctx, _args) {
    try {
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry.js");
      const registry = getDraconicRunRegistry();
      const before = registry.query({}).runs.length;
      registry.clear();
      ctx.chatLog.addSystem(`🧹 Cleared ${before} agents from registry`);
    } catch (err) {
      ctx.chatLog.addSystem(`❌ Error: ${err}`);
    }
  },
};

// ============================================================================
// Export all commands
// ============================================================================

export const OrchestrationCommands: SlashCommand[] = [
  AgentSpawnCommand,
  AgentTreeCommand,
  AgentResultCommand,
  AgentKillCommand,
  AgentStatusCommand,
  AgentCleanupCommand,
  AgentsCommand,
  AgentResetCommand,
  PersonalityCommand,
];

// ============================================================================
// Command Handlers Factory  
// ============================================================================

export function createOrchestrationCommandHandlers(ctx: CommandContext) {
  const handlers = new Map<string, SlashCommand>();
  
  for (const cmd of OrchestrationCommands) {
    handlers.set(cmd.name, cmd);
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        handlers.set(alias, cmd);
      }
    }
  }

  return {
    handleCommand(input: string): Promise<void> | null {
      const match = input.match(/^\/?([\w-]+)(?:\s+(.*))?$/);
      if (!match) return null;

      const [, name, args] = match;
      const cmd = handlers.get(name) || handlers.get("/" + name);
      
      if (!cmd) return null;

      if (cmd.hasArgument && !args?.trim()) {
        ctx.chatLog.addSystem(`Usage: ${cmd.usage || `/${cmd.name} <argument>`}`);
        return Promise.resolve();
      }

      return cmd.execute(ctx, args);
    },
    
    getCommands(): SlashCommand[] {
      return OrchestrationCommands;
    },
    
    getHelp(): string {
      return OrchestrationCommands
        .map(c => `/${c.name} - ${c.description}`)
        .join("\n");
    },
  };
}
