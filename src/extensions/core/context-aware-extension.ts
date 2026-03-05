import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

interface ActiveContext {
  workingDir: string;
  isLocal: boolean;
  timestamp: number;
}

const CONTEXT_FILE = join(homedir(), ".0xkobold", ".active-context");

/**
 * Context-Aware Extension
 *
 * Reads the active context file and updates TUI display
 * to show the actual working directory with --local mode.
 */
export default function contextAwareExtension(pi: ExtensionAPI) {
  let activeContext: ActiveContext | null = null;

  /**
   * Load active context from file
   */
  function loadContext(): ActiveContext | null {
    try {
      if (!existsSync(CONTEXT_FILE)) {
        return null;
      }
      const content = readFileSync(CONTEXT_FILE, "utf-8");
      const parsed = JSON.parse(content);

      // Check if context is fresh (within 5 minutes)
      const age = Date.now() - parsed.timestamp;
      if (age > 5 * 60 * 1000) {
        return null; // Too old
      }

      return parsed as ActiveContext;
    } catch {
      return null;
    }
  }

  /**
   * Get git branch from a directory
   */
  function getGitBranch(dir: string): string | null {
    try {
      const { execSync } = require("child_process");
      const result = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: dir,
        encoding: "utf-8",
      });
      return result.trim();
    } catch {
      return null;
    }
  }

  // Load context on startup
  activeContext = loadContext();

  if (activeContext?.isLocal) {
    console.log(
      `[Context-Aware] Local mode active: ${activeContext.workingDir}`
    );
  }

  // Hook into session start
  pi.on("session_start", async (_event, ctx) => {
    activeContext = loadContext();

    // Only apply local context if:
    // 1. Context file says it's local
    // 2. KOBOLD_WORKING_DIR env var is set (confirms --local was used)
    if (!activeContext?.isLocal) {
      return; // Not in local mode
    }

    const envWorkingDir = process.env.KOBOLD_WORKING_DIR;
    if (!envWorkingDir || envWorkingDir === process.cwd()) {
      return; // Not actually in local mode (env var missing or matches cwd)
    };

    const { workingDir } = activeContext;
    const gitBranch = getGitBranch(workingDir);
    const dirName = basename(workingDir);

    // Replace the footer to show actual working directory
    ctx.ui?.setFooter?.((tui: any, theme: any, footerData: any) => ({
      invalidate() {},
      render(width: number): string[] {
        // Build status line with actual working directory
        const parts: string[] = [];

        // Working directory (the key fix!)
        const workingDirDisplay = `${workingDir}`;
        parts.push(theme.fg("dim", workingDirDisplay));

        // Git branch if available
        if (gitBranch) {
          parts.push(theme.fg("accent", `(${gitBranch})`));
        }

        // Mode indicator
        parts.push(theme.fg("dim", "• local mode"));

        // Original footer data
        const extensionStatuses = footerData.getExtensionStatuses?.() || new Map();
        const statusItems = Array.from(extensionStatuses.values()).filter(Boolean);
        if (statusItems.length > 0) {
          parts.push(theme.fg("dim", "• " + statusItems.slice(0, 2).join(" ")));
        }

        // Combine parts and truncate to width
        const line = parts.join(" ");
        if (line.length > width) {
          return [line.slice(0, width - 3) + "..."];
        }
        return [line];
      },
      dispose: footerData.onBranchChange?.(() => tui.requestRender()),
    }));

    // Add a status bar item showing we're in local mode
    ctx.ui?.setStatus?.("workspace", `🗂️ ${dirName}`);

    // Log for debugging
    console.log(`[Context-Aware] Footer updated for: ${workingDir}`);
  });

  // Register a command
  pi.registerCommand("context", {
    description: "Show current workspace context",
    handler: async (_args, ctx) => {
      activeContext = loadContext();

      if (!activeContext) {
        ctx.ui?.notify?.("No active context. Not in local mode.", "info");
        return;
      }

      ctx.ui?.notify?.(
        `🗂️ Current Context:\n` +
          `  Working: ${activeContext.workingDir}\n` +
          `  Mode: ${activeContext.isLocal ? "local" : "global"}\n` +
          `  From: ${new Date(activeContext.timestamp).toLocaleTimeString()}`,
        "info"
      );
    },
  });

  console.log("[Context-Aware] Extension loaded");
}
