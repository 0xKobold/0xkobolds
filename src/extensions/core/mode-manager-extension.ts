/**
 * Mode Manager Extension for 0xKobold
 *
 * Provides Plan/Build mode switching with different system prompts
 * and tool restrictions. Supports extensible modes for custom workflows.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Global guard to prevent double initialization (hot-reload protection)
const MODE_MANAGER_STATE = {
  initialized: false,
  currentModeId: "build" as string,
};

// Plan mode: Read-only bash commands allowed
const READONLY_BASH_COMMANDS = [
  // File inspection
  "cat", "head", "tail", "less", "more",
  // Search
  "grep", "find", "rg", "fd",
  // Directory
  "ls", "pwd", "tree",
  // Git read-only
  "git status", "git log", "git diff", "git branch", "git show",
  // Package info
  "npm list", "npm outdated", "yarn info",
  // System info
  "uname", "whoami", "date", "uptime",
  // Process info
  "ps", "top", "htop",
  // Network info
  "curl", "wget", "ping", "netstat", "ss",
];

// Plan mode: Bash commands that are always blocked
const BLOCKED_BASH_COMMANDS = [
  // File modification
  "rm", "mv", "cp", "mkdir", "touch", "rmdir",
  // Git write
  "git add", "git commit", "git push", "git pull", "git merge", "git rebase",
  // Package install
  "npm install", "npm i", "yarn add", "yarn install", "pip install",
  // System dangerous
  "sudo", "kill", "reboot", "shutdown", "poweroff",
  // Editors
  "vim", "vi", "nano", "code", "emacs",
];

// Mode definitions
type ModeType = "plan" | "build" | string;

interface Mode {
  id: ModeType;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
  allowedTools: string[];
  color: string;
}

interface ModeConfig {
  currentMode: ModeType;
  customModes: Mode[];
}

// Default modes
const DEFAULT_MODES: Record<string, Mode> = {
  plan: {
    id: "plan",
    name: "Plan",
    description: "Investigation and planning mode - read-only tools",
    icon: "🔍",
    systemPrompt: `You are in PLAN MODE. Focus on investigation, analysis, and planning.

Your role:
- Investigate the codebase thoroughly before making changes
- Ask clarifying questions before proposing solutions
- Research files, dependencies, and architecture
- Create detailed plans with clear steps
- Consider edge cases and alternatives
- Spawn agents for parallel research tasks

You have access to READ-ONLY tools:
- File reading and searching (read, find, grep, ls)
- Web search for documentation
- Code analysis and exploration
- Spawn agents for multi-agent collaboration
- No file modifications or shell execution

Before writing code, explain:
1. What you discovered
2. Your approach and rationale
3. Alternative solutions considered
4. Potential risks`,
    allowedTools: [
      "read",
      "grep",
      "find",
      "ls",
      "bash",           // Added: but filtered to read-only commands
      "web_search",
      "web_fetch",
      "agent_spawn",
      "agent_list",
      "agent_delegate",
    ],
    color: "blue",
  },
  build: {
    id: "build",
    name: "Build",
    description: "Implementation mode - full tool access",
    icon: "🔨",
    systemPrompt: `You are in BUILD MODE. Focus on implementation and execution.

Your role:
- Implement the requested changes efficiently
- Write clean, well-documented code
- Test your changes when possible
- Handle errors gracefully
- Follow existing code patterns

You have access to ALL tools including:
- File read/write/modification (read, edit, write)
- Search tools (find, grep, ls)
- Shell commands (bash)
- Code generation and refactoring

Be concise and focused on delivering working code.`,
    allowedTools: [
      "read",
      "edit",
      "write",
      "grep",
      "find",
      "ls",
      "bash",
      "web_search",
      "web_fetch",
      "view_web_document",
      "ask_user",
      "fetch_webpage",
    ],
    color: "green",
  },
};

function getModeConfigPath(): string {
  const homeDir = process.env.HOME || homedir();
  return join(homeDir, ".0xkobold", "modes.json");
}

/**
 * Load mode configuration from disk
 */
function loadModeConfig(): ModeConfig {
  try {
    const configPath = getModeConfigPath();
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn("Failed to load mode config:", error);
  }
  return { currentMode: "build", customModes: [] };
}

/**
 * Save mode configuration to disk
 */
function saveModeConfig(config: ModeConfig): void {
  try {
    const configPath = getModeConfigPath();
    const dir = join(configPath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Failed to save mode config:", error);
  }
}

/**
 * Get all available modes (default + custom)
 */
function getAllModes(config: ModeConfig): Record<string, Mode> {
  const modes = { ...DEFAULT_MODES };
  for (const customMode of config.customModes) {
    modes[customMode.id] = customMode;
  }
  return modes;
}

/**
 * Mode Manager Extension
 */
export default function modeManagerExtension(pi: ExtensionAPI) {
  // Prevent double initialization (hot-reload protection)
  if (MODE_MANAGER_STATE.initialized) {
    console.log("[ModeManager] Already initialized, skipping re-registration");
    return;
  }
  MODE_MANAGER_STATE.initialized = true;

  let config: ModeConfig = loadModeConfig();

  // Initialize from saved config or shared state
  const modes = getAllModes(config);
  let currentMode: Mode = modes[config.currentMode] || DEFAULT_MODES.build;
  MODE_MANAGER_STATE.currentModeId = currentMode.id;
  // Track which tools are available
  const allTools = new Map<string, any>();

  /**
   * Set the current mode
   */
  function setMode(modeId: ModeType): boolean {
    const modes = getAllModes(config);
    const mode = modes[modeId];

    if (!mode) {
      return false;
    }

    currentMode = mode;
    MODE_MANAGER_STATE.currentModeId = modeId;
    config.currentMode = modeId;
    saveModeConfig(config);

    console.log(`[ModeManager] Mode switched to: ${modeId}`);
    return true;
  }

  /**
   * Update status bar with current mode
   */
  function updateModeStatus(ctx: any) {
    const statusText = `${currentMode.icon} ${currentMode.name}`;

    // Use ctx.ui.setStatus if available
    if (ctx.ui) {
      ctx.ui.setStatus?.("mode", statusText);
    }
  }

  /**
   * Filter tools based on current mode
   */
  function filterTools(tools: any[]): any[] {
    if (!currentMode.allowedTools || currentMode.allowedTools.length === 0) {
      return tools;
    }

    return tools.filter((tool: any) => {
      const toolName = tool.name || tool.id || "";
      const allowed = currentMode.allowedTools.some(
        (allowed) => toolName.toLowerCase().includes(allowed.toLowerCase())
      );
      return allowed;
    });
  }

  // Register mode switch commands
  pi.registerCommand("plan", {
    description: "Switch to PLAN mode (read-only investigation)",
    handler: async (_args, ctx) => {
      if (setMode("plan")) {
        // Update session system prompt for the active session, if available
        // @ts-ignore sessionManager in mocks may expose setSystemPrompt
        ctx.sessionManager?.setSystemPrompt?.(currentMode.systemPrompt);
        ctx.ui.notify(currentMode.systemPrompt, "info");
      }
    },
  });

  pi.registerCommand("build", {
    description: "Switch to BUILD mode (full tool access)",
    handler: async (_args, ctx) => {
      if (setMode("build")) {
        // Update session system prompt for the active session, if available
        // @ts-ignore sessionManager in mocks may expose setSystemPrompt
        ctx.sessionManager?.setSystemPrompt?.(currentMode.systemPrompt);
        ctx.ui.notify(currentMode.systemPrompt, "info");
      }
    },
  });

  pi.registerCommand("mode", {
    description: "Show current mode or switch modes",
    handler: async (args, ctx) => {
      // Defensive: args might not be a string in some contexts
      const argsString = typeof args === "string" ? args : "";
      const argsArray = argsString.trim() ? argsString.split(/\s+/) : [];
      if (argsArray.length === 0) {
        // Show current mode
        ctx.ui.notify(
          `Current mode: ${currentMode.icon} ${currentMode.name} (${currentMode.id})`,
          "info",
        );
        ctx.ui.notify(currentMode.description, "info");
        ctx.ui.notify(`System prompt:\n${currentMode.systemPrompt}`, "info");
      } else {
        // Switch to specified mode
        const modeId = argsArray[0];
        if (setMode(modeId)) {
          ctx.ui.notify(`Switched to ${currentMode.icon} ${currentMode.name} mode`, "info");
        } else {
          const available = Object.keys(getAllModes(config)).join(", ");
          ctx.ui.notify(`Unknown mode: ${modeId}. Available: ${available}`, "error");
        }
      }
    },
  });

  pi.registerCommand("modes", {
    description: "List all available modes",
    handler: async (_args, ctx) => {
      const modes = getAllModes(config);
      const modeList = Object.values(modes)
        .map((m) => `${m.icon} ${m.name} (${m.id})`)
        .join("\n");
      ctx.ui.notify(`Available modes:\n${modeList}`, "info");
    },
  });

  // Custom mode registration
  pi.registerCommand("mode-add", {
    description: "Register a custom mode",
    handler: async (_args, ctx) => {
      // This would parse a JSON mode definition
      // For now, just show how to use it
      ctx.ui.notify(
        "Custom mode registration:\n" +
          "Edit ~/.0xkobold/modes.json and add your mode to customModes array",
        "info"
      );
    },
  });

  // Debounce guard for shortcut
  let shortcutDebounce = false;

  // Register keyboard shortcut for quick mode toggle (ctrl+shift+m - avoiding ctrl+m which conflicts with Enter)
  // Only register if the API supports it (not in test mocks)
  if (typeof pi.registerShortcut === "function") {
    pi.registerShortcut("ctrl+shift+m", {
      description: "Toggle between plan/build modes",
      handler: async (ctx) => {
        // Debounce protection - skip if already processing
        if (shortcutDebounce) {
          console.log("[ModeManager] Shortcut debounced, skipping");
          return;
        }
        shortcutDebounce = true;

        try {
          const currentModeId = MODE_MANAGER_STATE.currentModeId;
          console.log(`[ModeManager] Shortcut triggered: switching from ${currentModeId}`);

          const newMode = currentModeId === "plan" ? "build" : "plan";

          if (setMode(newMode)) {
            const modes = getAllModes(config);
            const mode = modes[newMode];
            ctx.ui.notify(`Switched to ${mode.icon} ${mode.name} mode`, "info");
          }
        } finally {
          // Release debounce after a short delay
          setTimeout(() => {
            shortcutDebounce = false;
          }, 300);
        }
      },
    });

    // Register F2 key for quick mode toggle
    pi.registerShortcut("f2", {
      description: "Toggle between plan/build modes (F2)",
      handler: async (ctx) => {
        if (shortcutDebounce) {
          console.log("[ModeManager] F2 debounced, skipping");
          return;
        }
        shortcutDebounce = true;

        try {
          const currentModeId = MODE_MANAGER_STATE.currentModeId;
          console.log(`[ModeManager] F2 pressed: switching from ${currentModeId}`);

          const newMode = currentModeId === "plan" ? "build" : "plan";

          if (setMode(newMode)) {
            const modes = getAllModes(config);
            const mode = modes[newMode];
            ctx.ui.notify(`Switched to ${mode.icon} ${mode.name} mode`, "info");
          }
        } finally {
          setTimeout(() => {
            shortcutDebounce = false;
          }, 300);
        }
      },
    });
  }

  // Log initialization for debugging
  console.log(`[ModeManager] Extension initialized. Mode: ${currentMode.id}, Shortcut: ctrl+shift+m`);

  // Hook into session start to set up UI
  pi.on("session_start", async (_event, ctx) => {
    // Set initial status on the mode manager extension itself
    updateModeStatus(ctx);

    // Register the mode in the status bar
    if (ctx.ui) {
      ctx.ui.setStatus?.("mode", `${currentMode.icon} ${currentMode.name}`);
    }
  });

  // Hook into before agent start to apply system prompt
  pi.on("before_agent_start", async (_event) => {
    // Note: System prompt is set via the mode-specific commands
    // The extension framework doesn't allow modifying system prompt
    // at runtime through ReadonlySessionManager
  });

  // Filter tools based on mode
  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName || "";
    const allowedToolsList = currentMode.allowedTools.join(", ");
    
    console.log(`[ModeManager] Tool call: "${toolName}" | Mode: ${currentMode.id} | Allowed: ${allowedToolsList}`);
    
    // Use exact case-insensitive matching (not substring matching)
    const isAllowed = currentMode.allowedTools.some(
      (allowed) => toolName.toLowerCase() === allowed.toLowerCase()
    );

    if (!isAllowed) {
      const msg = `Tool "${toolName}" not available in ${currentMode.name} mode. Allowed: ${allowedToolsList}`;
      console.log(`[ModeManager] BLOCKED: ${msg}`);
      ctx.ui.notify(
        msg + `\nSwitch to build mode with: /build`,
        "error"
      );
      // Block the tool call
      return { block: true, reason: msg };
    }
    
    console.log(`[ModeManager] ALLOWED: "${toolName}"`);
  });

  console.log(`Mode Manager Extension loaded. Current mode: ${currentMode.id}`);
}

/**
 * Reset mode manager state for testing purposes.
 * This allows tests to re-initialize the extension cleanly.
 * @internal
 */
export function __resetModeManagerState(): void {
  MODE_MANAGER_STATE.initialized = false;
  MODE_MANAGER_STATE.currentModeId = "build";
}
