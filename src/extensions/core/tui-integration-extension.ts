/**
 * 🐉 TUI Integration Extension
 * 
 * Bridges our Draconic TUI components with @mariozechner/pi-tui
 * - Status bar in footer
 * - /agent-tree overlay
 * - /agent-result display
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createDraconicTUI } from "../../tui/draconic-tui";
import { createAgentTreePanel } from "../../tui/components/agent-tree-panel";
import { eventBus } from "../../event-bus";

const tui = createDraconicTUI();
const treePanel = createAgentTreePanel(tui);
let statusBarInterval: NodeJS.Timeout | null = null;
let showTreePanel = true; // Toggle state
let mainAgentRegistered = false;

export default async function register(pi: ExtensionAPI) {
  console.log("[🐉 DraconicTUI] Loading integration...");

  // 🧹 AGGRESSIVE CLEAR: Remove ALL stale agents on every reload
  try {
    const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
    const registry = getDraconicRunRegistry();
    const allRuns = registry.query({}).runs;
    const nonRunning = allRuns.filter(r => r.status !== "running");
    for (const run of nonRunning) {
      registry.delete(run.id);
    }
    if (nonRunning.length > 0 || allRuns.length > 0) {
      console.log(`[🧹 TUI Reload] Cleared ${nonRunning.length}/${allRuns.length} stale agents`);
    }
  } catch (e) {
    // Silent fail on initial load
  }

  // ============================================================================
  // 🐉 NATURAL LANGUAGE SUPPORT
  // ============================================================================
  pi.on("input", async (event) => {
    const { parseNaturalLanguage, isNaturalLanguage } = await import("../../tui/commands/natural-language-commands");
    
    const input = event?.text?.trim();
    if (!input || input.startsWith("/")) return { action: "continue" };
    
    // Check if natural language matches
    const parsed = parseNaturalLanguage(input);
    if (parsed) {
      // Transform the input to a slash command
      const paramsText = Object.entries(parsed.params)
        .map(([k, v]) => typeof v === "string" && v.includes(" ") ? `${k}="${v}"` : `${k}=${v}`)
        .join(" ");
      
      const command = `/${parsed.tool} ${paramsText}`;
      
      return {
        action: "transform",
        text: command,
      };
    }
    
    return { action: "continue" };
  });

  // 🐉 Auto-register main agent if not already
  if (!mainAgentRegistered) {
    const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
    const registry = getDraconicRunRegistry();
    
    // Check if main agent already exists
    const existing = registry.query({ type: "coordinator" }).runs.find(r => r.depth === 0);
    
    if (!existing) {
      const mainRun = registry.create({
        sessionKey: process.env.DRACONIC_SESSION_KEY || "tui-main",
        name: "main",
        type: "coordinator",
        task: "TUI Main Agent",
        workspace: process.cwd(),
        capabilities: {
          primary: ["coordination", "orchestration"],
          secondary: [],
        },
        parentId: undefined, // Root
        depth: 0,
        isProcessingQueue: false,
      });
      
      registry.updateStatus(mainRun.id, "running");
      process.env.DRACONIC_RUN_ID = mainRun.id;
      console.log(`[🐉 DraconicTUI] Main agent registered: ${mainRun.id}`);
    } else {
      process.env.DRACONIC_RUN_ID = existing.id;
      console.log(`[🐉 DraconicTUI] Connected to existing main agent: ${existing.id}`);
    }
    
    mainAgentRegistered = true;
  }

  // ============================================================================
  // Register footer status command
  // ============================================================================
  pi.registerTool({
    name: "draconic_tui_status",
    label: "🐉 TUI Status",
    description: "Show Draconic orchestrator status in TUI footer",
    parameters: Type.Object({}),
    async execute(): Promise<AgentToolResult<any>> {
      const tree = await tui.getAgentTree();
      
      if (!tree) {
        return {
          content: [{ type: "text", text: "🐉 idle" }],
          details: { active: 0, total: 0, task: null },
        };
      }

      const { active, total } = countAgents(tree);
      const currentTask = findActiveTask(tree);
      
      const statusText = active > 0 
        ? `🐉 ${active} | ${currentTask?.slice(0, 25) || "working..."}`
        : "🐉 idle";

      return {
        content: [{ 
          type: "text", 
          text: statusText,
        }],
        details: { active, total, task: currentTask || null },
      };
    },
  });

  // ============================================================================
  // Register /agent-tree command
  // ============================================================================
  pi.registerTool({
    name: "agent_tree_view",
    label: "🐉 Agent Tree",
    description: "Show agent hierarchy tree",
    parameters: Type.Object({
      runId: Type.Optional(Type.String({ description: "Specific agent run ID (optional)" })),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<AgentToolResult<any>> {
      const runId = params.runId as string | undefined;
      const tree = await tui.getAgentTree(runId);
      
      if (!tree) {
        return {
          content: [{ type: "text", text: "🐉 No agents in hierarchy\n\nTry:\n  /agent-spawn researcher \"analyze something\"" }],
          details: { empty: true },
        };
      }

      const formatted = formatTree(tree);
      
      return {
        content: [{
          type: "text",
          text: `🐉 Agent Tree:\n\n${formatted}`,
        }],
        details: { tree },
      };
    },
  });

  // ============================================================================
  // Register /agent-result command
  // ============================================================================
  pi.registerTool({
    name: "agent_result_view",
    label: "🐉 Agent Result",
    description: "View subagent output result",
    parameters: Type.Object({
      runId: Type.String({ description: "Agent run ID" }),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<AgentToolResult<any>> {
      const runId = params.runId as string;
      const artifacts = await tui.getResult(runId);
      
      if (!artifacts || artifacts.length === 0) {
        return {
          content: [{ type: "text", text: `No results found for ${runId}` }],
          details: null,
        };
      }

      const artifact = artifacts[0];
      const preview = artifact.content?.slice(0, 2000) || "No content";
      
      return {
        content: [{
          type: "text",
          text: `🐉 Result for ${runId}:\n${"─".repeat(50)}\n${preview}\n${artifact.content && artifact.content.length > 2000 ? "\n... (truncated)" : ""}`,
        }],
        details: { artifact },
      };
    },
  });

  // ============================================================================
  // Register /agent-spawn command
  // ============================================================================
  pi.registerTool({
    name: "agent_spawn_tui",
    label: "🐉 Spawn Agent",
    description: "Spawn a subagent with tracking",
    parameters: Type.Object({
      type: Type.String({ description: "Agent type: coordinator, specialist, researcher, planner, reviewer" }),
      task: Type.String({ description: "Task description" }),
      strategy: Type.Optional(Type.String({ description: "Strategy: fast, thorough, auto" })),
    }),
    async execute(
      _id: string, 
      params: Record<string, unknown>, 
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ): Promise<AgentToolResult<any>> {
      const agentType = params.type as string;
      const task = params.task as string;
      const strategy = (params.strategy as string) || "auto";

      try {
        // Show spawning message
        ctx.ui.notify(`🐉 Spawning ${agentType}...`, "info");

        // Call agent_orchestrate via our TUI
        const result = await tui.spawnSubagent({
          type: agentType as any,
          task,
          parentId: process.env.DRACONIC_RUN_ID,
          strategy: strategy as any,
        });

        return {
          content: [{
            type: "text",
            text: `✅ Spawned ${result.runId}\nType: ${agentType}\nTask: ${task.slice(0, 50)}...\nStrategy: ${strategy}`,
          }],
          details: { result },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Failed to spawn: ${err}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  // ============================================================================
  // Subscribe to events for status updates
  // ============================================================================
  eventBus.on("agent.completed", async (event: any) => {
    const { runId, type, duration, artifactPath } = event.payload;
    console.log(`[🐉 TUI] ${type} completed (${Math.round(duration / 1000)}s): ${runId.slice(-8)}`);
    if (artifactPath) console.log(`         📄 ${artifactPath}`);
  });

  // Start status bar updater
  if (!statusBarInterval) {
    statusBarInterval = setInterval(async () => {
      const tree = await tui.getAgentTree();
      if (tree) {
        const { active } = countAgents(tree);
        process.env.DRACONIC_TUI_ACTIVE_AGENTS = String(active);
      } else {
        process.env.DRACONIC_TUI_ACTIVE_AGENTS = "0";
      }
    }, 500);
  }

  // ============================================================================
  // Register tree sidebar commands
  // ============================================================================
  
  // Command to toggle tree panel visibility
  pi.registerTool({
    name: "agent_tree_toggle",
    label: "🐉 Toggle Tree Panel",
    description: "Show/hide the persistent agent tree panel",
    parameters: Type.Object({}),
    async execute(): Promise<AgentToolResult<any>> {
      showTreePanel = !showTreePanel;
      return {
        content: [{ 
          type: "text", 
          text: showTreePanel ? "🐉 Tree panel ON" : "🐉 Tree panel OFF",
        }],
        details: { visible: showTreePanel },
      };
    },
  });

  // Command to get current tree lines (for display)
  pi.registerTool({
    name: "agent_tree_lines",
    label: "🐉 Get Tree Lines",
    description: "Get formatted tree lines for sidebar display",
    parameters: Type.Object({
      width: Type.Optional(Type.Number({ description: "Max width in characters" })),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<AgentToolResult<any>> {
      const width = (params.width as number) || 50;
      
      // First, get actual tree from registry
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
      const registry = getDraconicRunRegistry();
      const stats = registry.getStats();
      
      // Get all runs and build tree
      const allRuns = registry.query({}).runs;
      
      if (allRuns.length === 0) {
        return {
          content: [{
            type: "text",
            text: "🐉 No agents running\n\nTo spawn an agent:\n  /agent-spawn researcher \"analyze code\""
          }],
          details: { lines: [], visible: true, stats: { total: 0 } },
        };
      }
      
      // Build tree lines
      const lines: string[] = [`🐉 Agents (${stats.activeRuns}/${stats.totalRuns})`];
      
      // Show all root runs
      const rootRuns = allRuns.filter(r => !r.parentId);
      rootRuns.forEach((run, i) => {
        const isLast = i === rootRuns.length - 1;
        const status = run.status === "completed" ? "✅" : run.status === "error" ? "❌" : "🔄";
        const type = run.type?.[0]?.toUpperCase() || "?";
        const task = run.task ? `: ${run.task.slice(0, width - 20)}` : "";
        lines.push(`${isLast ? "└── " : "├── "}${status} [${type}] ${run.id.slice(-8)}${task}`);
      });
      
      return {
        content: [{
          type: "text",
          text: lines.join("\n"),
        }],
        details: { lines, visible: true, stats },
      };
    },
  });

  // ============================================================================
  // 🐉 SIDEBAR MODE - Persistent Tree Display
  // ============================================================================
  let sidebarActive = true; // 🐉 ON by default
  let sidebarInterval: NodeJS.Timeout | null = null;
  
  pi.registerTool({
    name: "agent_tree_sidebar",
    label: "🐉 Toggle Sidebar",
    description: "Toggle persistent agent tree sidebar",
    parameters: Type.Object({}),
    async execute(_id: string, _params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<any>> {
      sidebarActive = !sidebarActive;
      
      if (sidebarActive) {
        const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
        const registry = getDraconicRunRegistry();
        const stats = registry.getStats();
        
        // Show compact sidebar
        const allRuns = registry.query({}).runs;
        const lines: string[] = ["🐉 AGENT TREE ────────────"];
        
        if (allRuns.length === 0) {
          lines.push("No agents yet");
          lines.push("Spawn: /agent-spawn researcher \"task\"");
        } else {
          const rootRuns = allRuns.filter(r => !r.parentId);
          
          const renderSidebar = (run: any, prefix: string, isLast: boolean) => {
            const status = run.status === "running" ? "●" : run.status === "completed" ? "✓" : "○";
            const type = run.type?.[0]?.toUpperCase() || "?";
            const task = run.task ? run.task.slice(0, 15) : "";
            lines.push(`${prefix}${isLast ? "└─ " : "├─ "}${status} [${type}] ${run.id.slice(-4)} ${task}`);
            
            const children = allRuns.filter(r => r.parentId === run.id);
            children.forEach((child: any, i: number) => {
              const childIsLast = i === children.length - 1;
              renderSidebar(child, prefix + (isLast ? "   " : "│  "), childIsLast);
            });
          };
          
          rootRuns.forEach((run, i) => renderSidebar(run, "", i === rootRuns.length - 1));
        }
        
        lines.push("─────────────────────────────");
        lines.push("[/sidebar to hide]");
        
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { active: true, stats },
        };
      } else {
        return {
          content: [{ type: "text", text: "🐉 Sidebar hidden" }],
          details: { active: false },
        };
      }
    },
  });

  // ============================================================================
  // 🐉 REGISTER ALL NEW FEATURES
  // ============================================================================
  registerKeybindings(pi);
  registerAgentControls(pi, tui);
  registerQuickSpawns(pi);
  registerArtifactBrowser(pi);
  setupRealtimeUpdates(pi, treePanel);

  // ============================================================================
  // Session start hook - setup persistent header and footer
  // ============================================================================
  pi.on("session_start", async (_event, ctx) => {
    console.log("[🐉 DraconicTUI] Session started - setting up header/footer");
    
    const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
    const registry = getDraconicRunRegistry();
    
    // ============================================================================
    // 🐉 HEADER - Tree view using setWidget (only ACTIVE agents)
    // ============================================================================
    const MAX_HEADER_AGE_MS = 30_000; // Show completed agents for 30s max
    const updateHeader = () => {
      try {
        // 🔧 FIX: Only show ACTIVE agents, not completed
        const activeRuns = registry.query({ status: "running" }).runs;
        const stats = registry.getStats();
        
        if (activeRuns.length === 0) {
          ctx.ui.setWidget("draconic-tree-header", ["🐉 No agents running"], {
            placement: "aboveEditor",
          });
          return;
        }
        
        const lines: string[] = [];
        lines.push(`🐉 Agents: ${stats.activeRuns}/${stats.totalRuns} running`);
        lines.push("─".repeat(40));
        
        // Show root agents with children (prioritize active)
        const rootRuns = activeRuns
          .filter(r => !r.parentId || r.depth === 0)
          .sort((a, b) => {
            // Sort: running first, then by time
            if (a.status === "running" && b.status !== "running") return -1;
            if (b.status === "running" && a.status !== "running") return 1;
            return (b.metrics?.lastActivityAt || 0) - (a.metrics?.lastActivityAt || 0);
          })
          .slice(0, 3);
        
        rootRuns.forEach((run, i) => {
          const status = run.status === "running" ? "●" : 
                        run.status === "completed" ? "✓" : 
                        run.status === "error" ? "✗" : "○";
          const type = run.type?.[0]?.toUpperCase() || "?";
          const task = run.task?.slice(0, 25) || "";
          const children = activeRuns.filter(r => r.parentId === run.id);
          const childInfo = children.length > 0 ? ` (+${children.length})` : "";
          
          lines.push(`${status} [${type}] ${run.id.slice(-6)}${childInfo} ${task}`);
          
          // Show children
          children.slice(0, 2).forEach((child, ci) => {
            const cStatus = child.status === "running" ? "●" : 
                           child.status === "completed" ? "✓" : 
                           child.status === "error" ? "✗" : "○";
            const cType = child.type?.[0]?.toUpperCase() || "?";
            const prefix = ci === Math.min(children.length - 1, 1) ? "  └─" : "  ├─";
            lines.push(`${prefix} ${cStatus} [${cType}] ${child.id.slice(-6)} ${child.task?.slice(0, 20) || ""}`);
          });
          
          if (children.length > 2) {
            lines.push(`  └─ ... ${children.length - 2} more`);
          }
        });
        
        
        ctx.ui.setWidget("draconic-tree-header", lines.slice(0, 8), {
          placement: "aboveEditor",
        });
        
      } catch (e) {
        // Silent fail
      }
    };
    
    // Initial header
    updateHeader();
    
    // Update header every 500ms
    const headerInterval = setInterval(updateHeader, 500);
    
    // ============================================================================
    // 🐉 FOOTER - Compact status
    // ============================================================================
    const updateFooter = async () => {
      try {
        const stats = registry.getStats();
        
        if (stats.totalRuns === 0) {
          ctx.ui.setStatus("draconic-tree", "🐉 idle");
          return;
        }
        
        // Find most relevant agent to display - ONLY RUNNING
        const activeRuns = registry.query({ status: "running" }).runs;
        const displayRun = activeRuns
          .sort((a, b) => (b.depth || 0) - (a.depth || 0))[0]; // Prefer deeper (subagents)
        
        if (displayRun && stats.activeRuns > 0) {
          const emoji = displayRun.type === "specialist" ? "👨‍💻" : 
                       displayRun.type === "researcher" ? "🔬" :
                       displayRun.type === "planner" ? "📋" :
                       displayRun.type === "reviewer" ? "👁️" : "🐉";
          const task = displayRun.task?.slice(0, 15) || "";
          const completedCount = stats.totalRuns - stats.activeRuns;
          const completedInfo = completedCount > 0 ? ` (+${completedCount})` : "";
          ctx.ui.setStatus("draconic-tree", `🐉 ${stats.activeRuns} running${completedInfo} ${emoji} ${task}`);
        } else {
          ctx.ui.setStatus("draconic-tree", "🐉 idle");
        }
      } catch (e) {
        // Silent fail
      }
    };
    
    // Initial footer
    await updateFooter();
    
    // Update footer every 500ms  
    const footerInterval = setInterval(updateFooter, 500);
    
    // Cleanup on session shutdown
    pi.on("session_shutdown", async () => {
      clearInterval(headerInterval);
      clearInterval(footerInterval);
      ctx.ui.setWidget("draconic-tree-header", undefined);
      ctx.ui.setStatus("draconic-tree", undefined);
    });
  });

  // ============================================================================
  // Subscribe to events for status updates
  // ============================================================================
  
  // Also update tree panel on events
  eventBus.on("agent.spawned", () => treePanel.refresh());
  eventBus.on("agent.completed", () => treePanel.refresh());

  console.log("[🐉 DraconicTUI] Integration loaded");
  console.log("  Commands: /agent-spawn, /agent-tree, /agent-result, /sidebar");
  console.log("  Natural: 'spawn a researcher to...', 'analyze...', 'implement...'");
  console.log("  Tools: draconic_tui_status, agent_tree_view, agent_result_view");
  console.log("  Footer: 🐉 agent status (auto-updates)");
  console.log("  Panel: /agent-tree-toggle (show/hide), /agent-tree-lines (get display)");
  console.log("  Sidebar: /sidebar (toggle)");
}

// ============================================================================
// 🐉 KEYBOARD SHORTCUTS - Quick Access
// ============================================================================
function registerKeybindings(pi: ExtensionAPI) {
  // Ctrl+Shift+A - Show agent tree
  pi.registerShortcut("ctrl+shift+a", {
    description: "🐉 Show agent tree",
    handler: async (ctx) => {
      ctx.ui.notify("🐉 Opening agent tree...", "info");
      // Simulate command execution
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
      const registry = getDraconicRunRegistry();
      const allRuns = registry.query({}).runs;
      
      if (allRuns.length === 0) {
        ctx.ui.notify("🐉 No agents running", "info");
      } else {
        ctx.ui.notify(`🐉 ${allRuns.length} agents`, "info");
      }
    },
  });

  // Ctrl+Shift+S - Quick spawn specialist
  pi.registerShortcut("ctrl+shift+s", {
    description: "🐉 Quick spawn specialist",
    handler: async (ctx) => {
      ctx.ui.notify("🐉 Use: /spawn-specialist <task>", "info");
    },
  });

  // Ctrl+Shift+R - Quick spawn researcher
  pi.registerShortcut("ctrl+shift+r", {
    description: "🐉 Quick spawn researcher",
    handler: async (ctx) => {
      ctx.ui.notify("🐉 Use: /spawn-researcher <task>", "info");
    },
  });

  // Ctrl+Shift+K - Kill last running agent
  pi.registerShortcut("ctrl+shift+k", {
    description: "🐉 Kill last running agent",
    handler: async (ctx) => {
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
      const registry = getDraconicRunRegistry();
      const running = registry.query({ status: "running" }).runs[0];
      
      if (running) {
        registry.updateStatus(running.id, "error");
        ctx.ui.notify(`🐉 Stopped ${running.id.slice(-8)}`, "info");
      } else {
        ctx.ui.notify("🐉 No running agents", "info");
      }
    },
  });

  console.log("[🐉 DraconicTUI] Keybindings registered:");
  console.log("  ctrl+shift+a = Show tree");
  console.log("  ctrl+shift+s = Quick specialist");
  console.log("  ctrl+shift+r = Quick researcher");
  console.log("  ctrl+shift+k = Kill agent");
}

// ============================================================================
// 🐉 AGENT CONTROL COMMANDS
// ============================================================================
function registerAgentControls(pi: ExtensionAPI, tui: any) {
  // /agent-stop <runId>
  pi.registerTool({
    name: "agent_stop",
    label: "🛑 Stop Agent",
    description: "Stop a running agent gracefully",
    parameters: Type.Object({
      runId: Type.String({ description: "Agent run ID (or 'last' for most recent)" }),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<any>> {
      const runId = params.runId as string;
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
      const registry = getDraconicRunRegistry();
      
      let targetId = runId;
      if (runId === "last") {
        const last = registry.query({ status: "running" }).runs[0];
        if (!last) {
          return { content: [{ type: "text", text: "No running agents" }], details: null };
        }
        targetId = last.id;
      }
      
      const run = registry.get(targetId);
      if (!run) {
        return { content: [{ type: "text", text: `Agent ${targetId} not found` }], details: null };
      }
      
      if (run.status !== "running") {
        return { content: [{ type: "text", text: `Agent ${targetId} is already ${run.status}` }], details: { status: run.status } };
      }
      
      registry.updateStatus(targetId, "paused");
      ctx.ui.notify(`🛑 Stopped ${targetId.slice(-8)}`, "info");
      
      return {
        content: [{ type: "text", text: `🛑 Stopped agent ${targetId}\nType: ${run.type}\nTask: ${run.task?.slice(0, 50)}...` }],
        details: { runId: targetId, status: "paused" },
      };
    },
  });

  // /agent-resume <runId>
  pi.registerTool({
    name: "agent_resume",
    label: "▶️ Resume Agent",
    description: "Resume a paused agent",
    parameters: Type.Object({
      runId: Type.String({ description: "Agent run ID (or 'last')" }),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<any>> {
      const runId = params.runId as string;
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
      const registry = getDraconicRunRegistry();
      
      let targetId = runId;
      if (runId === "last") {
        const last = registry.query({ status: "paused" }).runs[0];
        if (!last) {
          return { content: [{ type: "text", text: "No paused agents" }], details: null };
        }
        targetId = last.id;
      }
      
      const run = registry.get(targetId);
      if (!run) {
        return { content: [{ type: "text", text: `Agent ${targetId} not found` }], details: null };
      }
      
      if (run.status !== "paused") {
        return { content: [{ type: "text", text: `Agent ${targetId} is ${run.status}, not paused` }], details: { status: run.status } };
      }
      
      registry.updateStatus(targetId, "running");
      ctx.ui.notify(`▶️ Resumed ${targetId.slice(-8)}`, "info");
      
      return {
        content: [{ type: "text", text: `▶️ Resumed agent ${targetId}` }],
        details: { runId: targetId, status: "running" },
      };
    },
  });

  // /agent-kill <runId>
  pi.registerTool({
    name: "agent_kill",
    label: "💀 Kill Agent",
    description: "Force kill an agent (use /agent-stop for graceful stop)",
    parameters: Type.Object({
      runId: Type.String({ description: "Agent run ID (or 'last')" }),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<any>> {
      const runId = params.runId as string;
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
      const registry = getDraconicRunRegistry();
      
      let targetId = runId;
      if (runId === "last") {
        const last = registry.query({}).runs[registry.query({}).runs.length - 1];
        if (!last) {
          return { content: [{ type: "text", text: "No agents" }], details: null };
        }
        targetId = last.id;
      }
      
      const run = registry.get(targetId);
      if (!run) {
        return { content: [{ type: "text", text: `Agent ${targetId} not found` }], details: null };
      }
      
      registry.updateStatus(targetId, "error");
      eventBus.emit("agent.stopped", { runId: targetId, type: run.type, reason: "killed" });
      ctx.ui.notify(`💀 Killed ${targetId.slice(-8)}`, "warning");
      
      return {
        content: [{ type: "text", text: `💀 Killed agent ${targetId}` }],
        details: { runId: targetId, killed: true },
      };
    },
  });

  // /agents - List all with controls
  pi.registerTool({
    name: "agents_list_controls",
    label: "🐉 Agent Controls",
    description: "List all agents with control options",
    parameters: Type.Object({
      filter: Type.Optional(Type.String({ description: "Filter by status: running, completed, error, paused, all" })),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<AgentToolResult<any>> {
      const status = params.filter as string | undefined;
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
      const registry = getDraconicRunRegistry();
      
      const allRuns = status 
        ? registry.query({ status: status as any }).runs
        : registry.query({}).runs;
      
      if (allRuns.length === 0) {
        return {
          content: [{ type: "text", text: "🐉 No agents" }],
          details: { count: 0 },
        };
      }
      
      const lines: string[] = [`🐉 Agents (${allRuns.length})`];
      lines.push("─".repeat(50));
      
      allRuns.forEach((run, i) => {
        const statusEmoji = run.status === "running" ? "▶️" : run.status === "completed" ? "✅" : run.status === "error" ? "❌" : run.status === "paused" ? "⏸️" : "○";
        const type = run.type?.[0]?.toUpperCase() || "?";
        const task = run.task?.slice(0, 25) || "no task";
        lines.push(`${i + 1}. ${statusEmoji} [${type}] ${run.id.slice(-8)} | ${task}`);
      });
      
      lines.push("");
      lines.push("Commands:");
      lines.push("  /agent-stop <id|last>  - Stop gracefully");
      lines.push("  /agent-resume <id|last> - Resume paused");
      lines.push("  /agent-kill <id|last>   - Force kill");
      
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { count: allRuns.length, runs: allRuns.map(r => ({ id: r.id, status: r.status, type: r.type })) },
      };
    },
  });

  console.log("[🐉 DraconicTUI] Agent controls registered:");
  console.log("  /agent-stop, /agent-resume, /agent-kill, /agents");
}

// ============================================================================
// 🐉 QUICK SPAWN PRESETS
// ============================================================================
function registerQuickSpawns(pi: ExtensionAPI) {
  const spawnAgent = async (type: string, task: string, ctx: ExtensionContext) => {
    ctx.ui.notify(`🐉 Spawning ${type}...`, "info");
    
    const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
    const registry = getDraconicRunRegistry();
    
    const parentId = process.env.DRACONIC_RUN_ID;
    const parent = parentId ? registry.get(parentId) : undefined;
    
    const run = registry.create({
      sessionKey: process.env.DRACONIC_SESSION_KEY || "tui",
      name: `${type}-${Date.now().toString(36).slice(-4)}`,
      type: type as any,
      task,
      workspace: process.cwd(),
      capabilities: {
        primary: type === "researcher" ? ["research", "analysis"] : 
                  type === "specialist" ? ["coding", "implementation"] :
                  type === "planner" ? ["planning", "architecture"] :
                  type === "reviewer" ? ["review", "quality"] : ["general"],
        secondary: [],
      },
      parentId,
      depth: (parent?.depth ?? -1) + 1,
      isProcessingQueue: false,
    });
    
    registry.updateStatus(run.id, "running");
    eventBus.emit("agent.spawned", { runId: run.id, parentId, type });
    
    ctx.ui.notify(`Spawned ${type}: ${run.id.slice(-8)}`, "info");
    
    return run.id;
  };

  // /specialist <task>
  pi.registerTool({
    name: "spawn_specialist",
    label: "👨‍💻 Specialist",
    description: "Quick spawn a specialist agent for coding tasks",
    parameters: Type.Object({
      task: Type.String({ description: "Task description" }),
      strategy: Type.Optional(Type.String({ description: "Strategy: fast, thorough, auto" })),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<any>> {
      const task = params.task as string;
      const runId = await spawnAgent("specialist", task, ctx);
      return {
        content: [{ type: "text", text: `👨‍💻 Spawned specialist\nTask: ${task.slice(0, 50)}...\nID: ${runId}` }],
        details: { runId, type: "specialist", task },
      };
    },
  });

  // /researcher <task>
  pi.registerTool({
    name: "spawn_researcher",
    label: "🔬 Researcher",
    description: "Quick spawn a researcher agent for analysis",
    parameters: Type.Object({
      task: Type.String({ description: "Research task" }),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<any>> {
      const task = params.task as string;
      const runId = await spawnAgent("researcher", task, ctx);
      return {
        content: [{ type: "text", text: `🔬 Spawned researcher\nTask: ${task.slice(0, 50)}...\nID: ${runId}` }],
        details: { runId, type: "researcher", task },
      };
    },
  });

  // /planner <task>
  pi.registerTool({
    name: "spawn_planner",
    label: "📋 Planner",
    description: "Quick spawn a planner agent for architecture/design",
    parameters: Type.Object({
      task: Type.String({ description: "Planning task" }),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<any>> {
      const task = params.task as string;
      const runId = await spawnAgent("planner", task, ctx);
      return {
        content: [{ type: "text", text: `📋 Spawned planner\nTask: ${task.slice(0, 50)}...\nID: ${runId}` }],
        details: { runId, type: "planner", task },
      };
    },
  });

  // /reviewer <task>
  pi.registerTool({
    name: "spawn_reviewer",
    label: "👁️ Reviewer",
    description: "Quick spawn a reviewer agent for code review",
    parameters: Type.Object({
      task: Type.String({ description: "Review task" }),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<any>> {
      const task = params.task as string;
      const runId = await spawnAgent("reviewer", task, ctx);
      return {
        content: [{ type: "text", text: `👁️ Spawned reviewer\nTask: ${task.slice(0, 50)}...\nID: ${runId}` }],
        details: { runId, type: "reviewer", task },
      };
    },
  });

  console.log("[🐉 DraconicTUI] Quick spawns registered:");
  console.log("  /specialist, /researcher, /planner, /reviewer");
}

// ============================================================================
// 🐉 ARTIFACT BROWSER
// ============================================================================
function registerArtifactBrowser(pi: ExtensionAPI) {
  // /artifacts
  pi.registerTool({
    name: "artifacts_list",
    label: "🗂️ Artifacts",
    description: "Browse all agent artifacts (outputs)",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max artifacts to show", default: 10 })),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<AgentToolResult<any>> {
      const limit = (params.limit as number) || 10;
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
      const registry = getDraconicRunRegistry();
      
      // Get completed runs with artifacts
      const allRuns = registry.query({ status: "completed" }).runs.slice(0, limit);
      
      if (allRuns.length === 0) {
        return {
          content: [{ type: "text", text: "🗂️ No artifacts yet\n\nComplete an agent run to generate artifacts." }],
          details: { count: 0 },
        };
      }
      
      const lines: string[] = [`�️ Artifacts (${allRuns.length})`];
      lines.push("─".repeat(50));
      
      allRuns.forEach((run, i) => {
        const type = run.type?.[0]?.toUpperCase() || "?";
        const task = run.task?.slice(0, 30) || "no task";
        const duration = run.metrics?.duration 
          ? Math.round(run.metrics.duration / 1000) + "s"
          : "?";
        lines.push(`${i + 1}. [${type}] ${run.id.slice(-8)} | ${duration} | ${task}`);
      });
      
      lines.push("");
      lines.push("View: /artifact <runId> or /artifact-latest");
      
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { count: allRuns.length, runs: allRuns.map(r => r.id) },
      };
    },
  });

  // /artifact <runId>
  pi.registerTool({
    name: "artifact_view",
    label: "📄 View Artifact",
    description: "View specific artifact by run ID",
    parameters: Type.Object({
      runId: Type.String({ description: "Run ID (or 'latest')" }),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<AgentToolResult<any>> {
      let runId = params.runId as string;
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
      const registry = getDraconicRunRegistry();
      
      if (runId === "latest") {
        const latest = registry.query({}).runs
          .filter(r => r.artifacts && r.artifacts.length > 0)
          .sort((a, b) => (b.metrics?.lastActivityAt || 0) - (a.metrics?.lastActivityAt || 0))[0];
        if (!latest) {
          return { content: [{ type: "text", text: "No artifacts yet" }], details: null };
        }
        runId = latest.id;
      }
      
      const run = registry.get(runId);
      if (!run) {
        return { content: [{ type: "text", text: `Run ${runId} not found` }], details: null };
      }
      
      if (!run.artifacts || run.artifacts.length === 0) {
        return { 
          content: [{ type: "text", text: `Run ${runId} has no artifacts\nStatus: ${run.status}\nTask: ${run.task?.slice(0, 50)}...` }], 
          details: { runId, status: run.status } 
        };
      }
      
      const artifact = run.artifacts[0];
      const content = typeof artifact.content === "string" 
        ? artifact.content 
        : JSON.stringify(artifact.content, null, 2);
      const preview = content.slice(0, 2000);
      
      const lines: string[] = [
        `📄 Artifact: ${runId.slice(-8)}`,
        `Type: ${run.type}`,
        `Status: ${run.status}`,
        `Task: ${run.task}`,
        "─".repeat(50),
        preview,
        content.length > 2000 ? "\n... (truncated, use /artifact-result for full)" : "",
      ];
      
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { runId, artifact, truncated: content.length > 2000 },
      };
    },
  });

  // /artifact-latest
  pi.registerTool({
    name: "artifact_latest",
    label: "📄 Latest Artifact",
    description: "View most recent artifact",
    parameters: Type.Object({}),
    async execute(_id: string): Promise<AgentToolResult<any>> {
      const { getDraconicRunRegistry } = await import("../../agent/DraconicRunRegistry");
      const registry = getDraconicRunRegistry();
      
      const latest = registry.query({}).runs
        .filter(r => r.artifacts && r.artifacts.length > 0)
        .sort((a, b) => (b.metrics?.lastActivityAt || 0) - (a.metrics?.lastActivityAt || 0))[0];
      
      if (!latest) {
        return { content: [{ type: "text", text: "🗂️ No artifacts yet" }], details: null };
      }
      
      const artifact = latest.artifacts![0];
      const content = typeof artifact.content === "string" 
        ? artifact.content 
        : JSON.stringify(artifact.content, null, 2);
      
      return {
        content: [{
          type: "text",
          text: `📄 Latest: ${latest.id.slice(-8)} [${latest.type}]\n\n${content.slice(0, 2000)}${content.length > 2000 ? "\n..." : ""}`,
        }],
        details: { runId: latest.id, artifact },
      };
    },
  });

  console.log("[🐉 DraconicTUI] Artifact browser registered:");
  console.log("  /artifacts, /artifact, /artifact-latest");
}

// ============================================================================
// REAL-TIME TREE UPDATES - Event-driven
// ============================================================================
function setupRealtimeUpdates(pi: ExtensionAPI, treePanel: any) {
  // Subscribe to all agent lifecycle events
  const events = ["agent.spawned", "agent.started", "agent.completed", "agent.error", "agent.stopped", "agent.status_changed"];
  
  events.forEach(eventName => {
    eventBus.on(eventName as any, (data: any) => {
      console.log(`[🐉 DraconicTUI] Event: ${eventName}`, data?.runId?.slice(-8) || "");
      treePanel.refresh();
    });
  });

  console.log("[🐉 DraconicTUI] Real-time updates enabled");
  console.log("  Events:", events.join(", "));
}

// Helpers
function countAgents(tree: any): { active: number; total: number } {
  let active = tree.status === "running" ? 1 : 0;
  let total = 1;
  
  for (const child of tree.children || []) {
    const childCounts = countAgents(child);
    active += childCounts.active;
    total += childCounts.total;
  }
  
  return { active, total };
}

function findActiveTask(tree: any): string | undefined {
  if (tree.status === "running" && tree.task) {
    return tree.task;
  }
  
  for (const child of tree.children || []) {
    const task = findActiveTask(child);
    if (task) return task;
  }
  
  return undefined;
}

function formatTree(node: any, indent = "", isLast = true): string {
  const prefix = "  ".repeat(indent.length / 2);
  const connector = isLast ? "└── " : "├── ";
  const status = node.status === "completed" ? "✅" : node.status === "error" ? "❌" : "🔄";
  const type = node.type?.[0]?.toUpperCase() || "?";
  const task = node.task ? `: ${node.task.slice(0, 30)}` : "";
  
  let lines = [`${prefix}${connector}${status} [${type}] ${node.runId}${task}`];
  
  const children = node.children || [];
  children.forEach((child: any, i: number) => {
    const childIsLast = i === children.length - 1;
    lines.push(formatTree(child, prefix + (isLast ? "    " : "│   "), childIsLast));
  });
  
  return lines.join("\n");
}
