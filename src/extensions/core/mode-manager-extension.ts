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

You have access to READ-ONLY tools:
- File reading and searching
- Web search for documentation
- Code analysis and exploration
- No file modifications or shell execution

Before writing code, explain:
1. What you discovered
2. Your approach and rationale
3. Alternative solutions considered
4. Potential risks`,
    allowedTools: [
      "read_file_with_line_numbers",
      "read_file",
      "search_files",
      "search_and_replace",
      "web_search",
      "web_fetch",
      "view_web_document",
      "ask_user",
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
- File read/write/modification
- Shell commands
- Code generation and refactoring

Be concise and focused on delivering working code.`,
    allowedTools: [
      "read_file_with_line_numbers",
      "read_file",
      "edit_file",
      "write_file",
      "search_files",
      "search_and_replace",
      "apply_diff",
      "execute_shell",
      "run_bash",
      "web_search",
      "web_fetch",
      "view_web_document",
      "ask_user",
      "fetch_webpage",
    ],
    color: "green",
  },
};

const MODE_CONFIG_FILE = join(homedir(), ".0xkobold", "modes.json");

/**
 * Load mode configuration from disk
 */
function loadModeConfig(): ModeConfig {
  try {
    if (existsSync(MODE_CONFIG_FILE)) {
      const content = readFileSync(MODE_CONFIG_FILE, "utf-8");
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
    const dir = join(homedir(), ".0xkobold");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(MODE_CONFIG_FILE, JSON.stringify(config, null, 2));
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
  let currentMode: Mode = DEFAULT_MODES.build;
  let config: ModeConfig = loadModeConfig();

  // Initialize from saved config
  const modes = getAllModes(config);
  if (modes[config.currentMode]) {
    currentMode = modes[config.currentMode];
  }

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
    config.currentMode = modeId;
    saveModeConfig(config);

    // Update agent system prompt if available
    // @ts-ignore ExtensionAPI type
    if (pi.sessionManager) {
      // @ts-ignore ExtensionAPI type
      pi.sessionManager.setSystemPrompt?.(mode.systemPrompt);
    }

    // Update status bar
    updateModeStatus();

    return true;
  }

  /**
   * Update status bar with current mode
   */
  function updateModeStatus() {
    const statusText = `${currentMode.icon} ${currentMode.name}`;
    const colorFn = currentMode.id === "plan" ? "cyan" : "green";

    // Use global pi.ui.setStatus if available
    // @ts-ignore ExtensionAPI type
    if (pi.sessionManager?.ui) {
      // @ts-ignore ExtensionAPI type
      pi.sessionManager.ui.setStatus?.("mode", statusText);
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
    // @ts-ignore ExtensionAPI type
    handler: async (_args) => {
      if (setMode("plan")) {
        // @ts-ignore ExtensionAPI type
        pi.ui.notify?.(currentMode.systemPrompt, "info");
      }
    },
  });

  pi.registerCommand("build", {
    description: "Switch to BUILD mode (full tool access)",
    // @ts-ignore ExtensionAPI type
    handler: async (_args) => {
      if (setMode("build")) {
        // @ts-ignore ExtensionAPI type
        pi.ui.notify?.(currentMode.systemPrompt, "info");
      }
    },
  });

  pi.registerCommand("mode", {
    description: "Show current mode or switch modes",
    // @ts-ignore ExtensionAPI type
    handler: async (args: string[]) => {
      if (args.length === 0) {
        // Show current mode
        // @ts-ignore ExtensionAPI type
        pi.ui.notify?.(`Current mode: ${currentMode.icon} ${currentMode.name}`, "info");
        // @ts-ignore ExtensionAPI type
        pi.ui.notify?.(currentMode.description, "info");
        // @ts-ignore ExtensionAPI type
        pi.ui.notify?.(`System prompt:\n${currentMode.systemPrompt}`, "info");
      } else {
        // Switch to specified mode
        const modeId = args[0];
        if (setMode(modeId)) {
          // @ts-ignore ExtensionAPI type
      // @ts-ignore Notify type
          pi.ui.notify?.(`Switched to ${currentMode.icon} ${currentMode.name} mode`, "success");
        } else {
          const available = Object.keys(getAllModes(config)).join(", ");
          // @ts-ignore ExtensionAPI type
          pi.ui.notify?.(`Unknown mode: ${modeId}. Available: ${available}`, "error");
        }
      }
    },
  });

  pi.registerCommand("modes", {
    description: "List all available modes",
    // @ts-ignore ExtensionAPI type
    handler: async () => {
      const modes = getAllModes(config);
      const modeList = Object.values(modes)
        .map((m) => `${m.icon} ${m.name} (${m.id})`)
        .join("\n");
      // @ts-ignore ExtensionAPI type
      pi.ui.notify?.(`Available modes:\n${modeList}`, "info");
    },
  });

  // Custom mode registration
  pi.registerCommand("mode-add", {
    description: "Register a custom mode",
    // @ts-ignore ExtensionAPI type
    handler: async (args: string[]) => {
      // This would parse a JSON mode definition
      // For now, just show how to use it
      // @ts-ignore ExtensionAPI type
      pi.ui.notify?.(
        "Custom mode registration:\n" +
          "Edit ~/.0xkobold/modes.json and add your mode to customModes array",
        "info"
      );
    },
  });

  // Hook into session start to set up UI
  // @ts-ignore Event type
  pi.on("session_start", async (_event, ctx) => {
    // Set initial status on the mode manager extension itself
    updateModeStatus();

    // Set up keybinding for quick mode toggle
    // @ts-ignore ExtensionContext type
    ctx.keybindings?.add?.("mode-toggle", "ctrl+m", async () => {
      const newMode = currentMode.id === "plan" ? "build" : "plan";
      if (setMode(newMode)) {
        // @ts-ignore Notify type
      // @ts-ignore Notify type
        ctx.ui?.notify?.(`Switched to ${currentMode.icon} ${currentMode.name} mode`, "success");
      }
    });

    // Register the mode in the status bar
    // @ts-ignore ExtensionContext type
    if (ctx.ui) {
      // @ts-ignore ExtensionContext type
      ctx.ui.setStatus?.("mode", `${currentMode.icon} ${currentMode.name}`);
    }
  });

  // Hook into message processing to apply system prompt
  // @ts-ignore Event type
  pi.on("message", async (_event, ctx) => {
    // Ensure system prompt matches current mode
    // @ts-ignore ExtensionContext type
    if (ctx.sessionManager?.setSystemPrompt) {
      // @ts-ignore ExtensionContext type
      const currentSystemPrompt = ctx.sessionManager.getSystemPrompt?.();
      if (currentSystemPrompt !== currentMode.systemPrompt) {
        // @ts-ignore ExtensionContext type
        ctx.sessionManager.setSystemPrompt(currentMode.systemPrompt);
      }
    }
  });

  // Filter tools based on mode
  // @ts-ignore Event type
  pi.on("before_tool_call", async (_event, ctx) => {
    // @ts-ignore ExtensionContext type
    const toolName = ctx.toolCall?.name || "";
    const isAllowed = currentMode.allowedTools.some(
      (allowed) => toolName.toLowerCase().includes(allowed.toLowerCase())
    );

    if (!isAllowed) {
      // @ts-ignore ExtensionContext type
      ctx.ui?.notify?.(
        `Tool "${toolName}" not available in ${currentMode.name} mode.\n` +
          `Switch to build mode with: /build`,
        "error"
      );
      // Cancel the tool call
      return { cancel: true };
    }
  });

  console.log(`Mode Manager Extension loaded. Current mode: ${currentMode.id}`);
}
