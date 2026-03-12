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
import { resolve, relative } from "path";

interface WorkspaceState {
  isLocal: boolean;
  workspacePath: string;
  displayPath: string;
}

function getWorkspaceState(): WorkspaceState {
  const globalWorkspace = resolve(homedir(), ".0xkobold");
  const workingDir = process.env.KOBOLD_WORKING_DIR || process.cwd();
  const resolvedWorkingDir = resolve(workingDir);
  
  // Check if we're in local mode:
  // 1. KOBOLD_LOCAL_MODE explicitly set to 'true', OR
  // 2. Working dir is NOT the global workspace
  const isLocal = !!(
    process.env.KOBOLD_LOCAL_MODE === 'true' ||
    (resolvedWorkingDir !== globalWorkspace && !resolvedWorkingDir.startsWith(globalWorkspace + "/"))
  );

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

    // Set initial footer status
    const emoji = state.isLocal ? "📁" : "🏠";
    const text = `${emoji} ${state.displayPath}`;
    ctx.ui.setStatus("workspace", text);

    // Update working directory for file operations
    if (state.workspacePath !== process.cwd()) {
      try {
        process.chdir(state.workspacePath);
        console.log(`[WorkspaceFooter] Changed cwd to: ${state.workspacePath}`);
      } catch (err) {
        console.warn(`[WorkspaceFooter] Could not change cwd: ${err}`);
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
