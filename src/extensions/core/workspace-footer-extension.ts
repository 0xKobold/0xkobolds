/**
 * Workspace Footer Extension
 *
 * Displays workspace and router status in footer.
 * Uses unified-router.ts as single source of truth.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { homedir } from "os";
import { resolve } from "path";
import { getDraconicLairSystem } from "../../lair/DraconicLairSystem";
import { getFooterStatus, getRouter } from "../../llm";

interface WorkspaceState {
  isLocal: boolean;
  workspacePath: string;
  displayPath: string;
}

function getWorkspaceState(): WorkspaceState {
  const globalWorkspace = resolve(homedir(), ".0xkobold");
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
  
  const workingDir = process.env.KOBOLD_WORKING_DIR || process.cwd();
  const resolvedWorkingDir = resolve(workingDir);
  const isLocal = resolvedWorkingDir !== globalWorkspace && 
                  !resolvedWorkingDir.startsWith(globalWorkspace + "/");
  
  return {
    isLocal,
    workspacePath: isLocal ? workingDir : globalWorkspace,
    displayPath: isLocal ? formatPath(workingDir) : "~/.0xkobold",
  };
}

function formatPath(p: string): string {
  const home = homedir();
  if (p === home) return "~";
  if (p.startsWith(home + "/")) return "~" + p.slice(home.length);
  return p;
}

export default async function register(pi: ExtensionAPI) {
  console.log("[WorkspaceFooter] Extension registered");

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    const state = getWorkspaceState();
    
    // Set workspace status
    const emoji = state.isLocal ? "📁" : "🏠";
    ctx.ui.setStatus("workspace", `${emoji} ${state.displayPath}`);

    // Initialize router (no footer status - pi-coding-agent already shows (auto))
    setTimeout(async () => {
      try {
        // Trigger router initialization
        await getRouter();
        console.log("[Footer] Router initialized");
      } catch (err: any) {
        console.log("[Footer] Router not ready:", err?.message);
      }
    }, 100);

    // Lair notification
    if (state.isLocal) {
      const lairSystem = getDraconicLairSystem();
      const cwd = process.cwd();
      const lair = lairSystem.getLair(cwd);
      const isNew = lairSystem.listLairs().filter(l => l.path === cwd).length === 1;
      
      if (isNew) {
        ctx.ui.notify(
          `🏰 New Lair: ${lair.name}\nType: ${lair.type} | Framework: ${lair.framework}`,
          "info"
        );
      }
    }

    // Cleanup
    pi.on("session_shutdown", async () => {
      ctx.ui.setStatus("workspace", undefined);
      ctx.ui.setStatus("router", undefined);
    });


  });

  // Register workspace info tool
  pi.registerTool({
    name: "workspace_info",
    label: "📁 Workspace",
    description: "Show current workspace information",
    parameters: Type.Object({}),
    async execute(_toolCallId: string, _params: {}, _signal: AbortSignal, _onUpdate: any, _ctx: any): Promise<{ content: any[]; details: {} }> {
      const state = getWorkspaceState();
      return {
        content: [{
          type: "text",
          text: `Workspace: ${state.displayPath}\nMode: ${state.isLocal ? 'local' : 'global'}`,
        }],
        details: {},
      };
    },
  });
}
