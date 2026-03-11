/**
 * 🐉 0xKobold TUI Entry Point
 *
 * Mode-aware TUI initialization:
 * - LOCAL mode (default): Direct Draconic orchestration
 * - REMOTE mode (--remote): Gateway client
 *
 * Usage:
 *   bun run tui           # Local mode (superior)
 *   bun run tui --remote  # Remote gateway mode
 */

import {
  createDraconicTUI,
  detectMode,
  type DraconicTUI,
} from "./draconic-tui";

import { createStatusBarProvider } from "./components/status-bar";
import { createAgentTreeComponent } from "./components/agent-tree-overlay";
import { createOrchestrationCommandHandlers, OrchestrationCommands } from "./commands/orchestration-commands";

export interface KoboldTUIOptions {
  mode?: "local" | "remote";
  remoteUrl?: string;
  sessionKey?: string;
  agentId?: string;
}

export function createKoboldTUI(options: KoboldTUIOptions = {}): {
  tui: DraconicTUI;
  statusBar: ReturnType<typeof createStatusBarProvider>;
  commands: ReturnType<typeof createOrchestrationCommandHandlers>;
  getTreeOverlay: () => Promise<any>;
  mode: string;
} {
  // Detect or use provided mode
  const mode = options.mode || detectMode();
  console.log(`🐉 0xKobold TUI starting in ${mode.toUpperCase()} mode...`);

  // Create Draconic TUI (dual-mode)
  const tui = createDraconicTUI();

  // Create status bar
  const statusBar = createStatusBarProvider(tui);

  // Create command context (simplified - would integrate with actual TUI)
  const commandContext = {
    tui,
    chatLog: {
      addSystem: (msg: string) => console.log("[SYSTEM]", msg),
      addUser: (msg: string) => console.log("[USER]", msg),
      addAssistant: (msg: string) => console.log("[ASSISTANT]", msg),
    },
    openOverlay: (component: any) => console.log("[OVERLAY]", component),
    closeOverlay: () => console.log("[OVERLAY CLOSED]"),
    requestRender: () => {},
    getCurrentSession: () => ({ agentId: options.agentId, runId: process.env.DRACONIC_RUN_ID }),
  };

  // Create command handlers
  const commands = createOrchestrationCommandHandlers(commandContext);

  // Tree overlay factory
  const getTreeOverlay = () => createAgentTreeComponent(tui);

  // Subscribe to events
  tui.on("spawned", (result) => {
    commandContext.chatLog.addSystem(`🐉 Agent spawned: ${result.runId} [${result.type}]`);
  });

  tui.on("completed", (result) => {
    commandContext.chatLog.addSystem(
      `✅ ${result.runId} completed (${result.duration}ms, ${result.tokens?.actual} tokens)`
    );
  });

  tui.on("error", (error) => {
    commandContext.chatLog.addSystem(`❌ Orchestrator error: ${error.message}`);
  });

  return {
    tui,
    statusBar,
    commands,
    getTreeOverlay,
    mode,
  };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const isRemote = args.includes("--remote");
  
  const remoteUrl = isRemote 
    ? (args[args.indexOf("--remote") + 1] || process.env.KOBOLD_REMOTE_URL || "ws://localhost:18789")
    : undefined;

  const kobold = createKoboldTUI({
    mode: isRemote ? "remote" : "local",
    remoteUrl,
  });

  // Start status bar updates
  kobold.statusBar.start();

  // Print initial status
  console.log("🐉 0xKobold TUI Ready");
  console.log(`   Mode: ${kobold.mode.toUpperCase()}`);
  console.log(`   Status: ${kobold.statusBar.getText()}`);
  console.log("");
  console.log("Commands:");
  console.log(kobold.commands.getHelp());
  console.log("");

  // Demo: Show tree (would be interactive in real TUI)
  setTimeout(async () => {
    const tree = await kobold.tui.getAgentTree();
    if (tree) {
      console.log("Current agent tree:");
      console.log(JSON.stringify(tree, null, 2));
    } else {
      console.log("No agents running. Try: /agent-spawn researcher 'hello world'");
    }
  }, 1000);
}

export default createKoboldTUI;
