/**
 * Workspace Footer Extension
 *
 * Displays current workspace mode in the TUI footer:
 * - 🏠 Global: ~/.0xkobold
 * - 📁 Local: current directory path
 *
 * Shows different icons and paths based on --local flag
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { homedir } from "os";
import { resolve } from "path";
import { existsSync } from "fs";
import { getDraconicLairSystem } from "../../lair/DraconicLairSystem";

interface WorkspaceState {
  isLocal: boolean;
  workspacePath: string;
  displayPath: string;
}

function formatPath(p: string): string {
  const home = homedir();
  if (p === home) return "~";
  if (p.startsWith(home + "/")) return "~" + p.slice(home.length);
  return p;
}

function getWorkspaceState(): WorkspaceState {
  const globalWorkspace = resolve(homedir(), ".0xkobold");
  
  // Priority 1: Explicit KOBOLD_LOCAL_MODE flag ('true' or 'false')
  const explicitMode = process.env.KOBOLD_LOCAL_MODE;
  if (explicitMode === 'true') {
    const workingDir = process.env.KOBOLD_WORKING_DIR || process.cwd();
    return {
      isLocal: true,
      workspacePath: workingDir,
      displayPath: formatPath(workingDir),
    };
  }
  if (explicitMode === 'false') {
    return {
      isLocal: false,
      workspacePath: globalWorkspace,
      displayPath: "~/.0xkobold",
    };
  }
  
  // Fallback: Legacy path comparison (shouldn't reach here with v0.6.4+)
  const workingDir = process.env.KOBOLD_WORKING_DIR || process.cwd();
  const resolvedWorkingDir = resolve(workingDir);
  const isLocal = resolvedWorkingDir !== globalWorkspace && 
                  !resolvedWorkingDir.startsWith(globalWorkspace + "/");

  const workspacePath = isLocal ? workingDir : globalWorkspace;
  
  // Format display path
  let displayPath: string;
  if (isLocal) {
    // Show relative path from home, or just the path
    if (workspacePath.startsWith(homedir())) {
      displayPath = "~" + workspacePath.slice(homedir().length);
    } else {
      displayPath = workspacePath;
    }
  } else {
    displayPath = "~/.0xkobold";
  }

  return { isLocal, workspacePath, displayPath };
}

export default async function register(pi: ExtensionAPI) {
  console.log("[WorkspaceFooter] Extension registered");

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    const state = getWorkspaceState();
    
    console.log(`[WorkspaceFooter] Mode: ${state.isLocal ? 'local' : 'global'}`);
    console.log(`[WorkspaceFooter] Path: ${state.workspacePath}`);
    console.log(`[WorkspaceFooter] CWD: ${process.cwd()}`);

    // Set footer status (cwd already set at entry point)
    const emoji = state.isLocal ? "📁" : "🏠";
    const text = `${emoji} ${state.displayPath}`;
    ctx.ui.setStatus("workspace", text);

    // In local mode, check if this directory has a lair and create/notify
    if (state.isLocal) {
      const lairSystem = getDraconicLairSystem();
      const cwd = process.cwd();
      
      // getLair() creates one if it doesn't exist
      const lair = lairSystem.getLair(cwd);
      const isNew = lairSystem.listLairs().filter(l => l.path === cwd).length === 1;
      
      if (isNew) {
        ctx.ui.notify(
          `🏰 New Lair Detected\n\n` +
          `Created: ${lair.name}\n` +
          `Type: ${lair.type} | Framework: ${lair.framework}\n` +
          `\nThis project now has persistent context.`,
          "info"
        );
      } else {
        ctx.ui.notify(
          `🏰 Lair: ${lair.name}\n` +
          `Type: ${lair.type} | Framework: ${lair.framework}`,
          "info"
        );
      }
    }

    // Cleanup on shutdown
    pi.on("session_shutdown", async () => {
      ctx.ui.setStatus("workspace", undefined);
    });
  });

  // Register /workspace command to show current workspace
  pi.registerTool({
    name: "workspace_info",
    label: "📁 Workspace",
    description: "Show current workspace information",
    parameters: Type.Object({}),
    async execute(): Promise<{ content: any[]; details: WorkspaceState }> {
      const state = getWorkspaceState();

      const lines = [
        `📁 Workspace Info`,
        `─`.repeat(40),
        `Mode: ${state.isLocal ? 'Local (project)' : 'Global'}`,
        `Path: ${state.workspacePath}`,
        `Display: ${state.displayPath}`,
        ``,
        `Change mode:`,
        `  0xkobold --local    # Current directory`,
        `  0xkobold            # Global (~/.0xkobold)`,
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: state,
      };
    },
  });
}
