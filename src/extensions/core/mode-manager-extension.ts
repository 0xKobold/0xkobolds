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
- Ask questions using 'question' or 'questionnaire' tools
- Request mode change to 'build' when ready to implement (requires user approval)
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
      "bash",
      "web_search",
      "web_fetch",
      "web_qa",
      "agent_spawn",
      "agent_list",
      "agent_delegate",
      "question",
      "questionnaire",
      "request_mode_change",
      "set_session_name",
      "get_session_name",
      "generate_handoff_prompt",
      "send_discord_message",
      "heartbeat_check",
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
- Ask questions using 'question' or 'questionnaire' tools
- Agent spawning, delegation, and task breakdown
  - Valid agent types: coordinator, specialist, worker, reviewer, researcher, planner, executor
- Code generation and refactoring
- Request mode change to 'plan' for investigation (requires user approval)

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
      "web_qa",
      "fetch_webpage",
      "question",
      "questionnaire",
      "request_mode_change",
      "set_session_name",
      "get_session_name",
      "generate_handoff_prompt",
      "send_discord_message",
      "task_breakdown",
      "agent_spawn",
      "agent_delegate",
      "agent_list",
      "heartbeat_check",
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
    if (ctx.ui?.setStatus) {
      try {
        ctx.ui.setStatus("mode", statusText);
      } catch (err) {
        console.log("[ModeManager] Failed to set status:", err);
      }
    }
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

  // Debounce guards for shortcuts (separate to avoid conflicts)
  let ctrlShiftMDebounce = false;
  let f2Debounce = false;

  // Track pending mode change requests from the agent
  let pendingModeRequest: { requestedMode: string; reason: string; timestamp: number } | null = null;

  // Register keyboard shortcut for quick mode toggle (ctrl+shift+m - avoiding ctrl+m which conflicts with Enter)
  // Only register if the API supports it (not in test mocks)
  if (typeof pi.registerShortcut === "function") {
    pi.registerShortcut("ctrl+shift+m", {
      description: "Toggle between plan/build modes",
      handler: async (ctx) => {
        // Debounce protection - skip if already processing
        if (ctrlShiftMDebounce) {
          console.log("[ModeManager] Ctrl+Shift+M debounced, skipping");
          return;
        }
        ctrlShiftMDebounce = true;

        try {
          const currentModeId = MODE_MANAGER_STATE.currentModeId;
          console.log(`[ModeManager] Ctrl+Shift+M triggered: switching from ${currentModeId}`);

          const newMode = currentModeId === "plan" ? "build" : "plan";

          if (setMode(newMode)) {
            const modes = getAllModes(config);
            const mode = modes[newMode];
            ctx.ui.notify(`Switched to ${mode.icon} ${mode.name} mode`, "info");
          }
        } finally {
          // Release debounce after a short delay
          setTimeout(() => {
            ctrlShiftMDebounce = false;
          }, 300);
        }
      },
    });

    // Register F2 key for quick mode toggle
    pi.registerShortcut("f2", {
      description: "Toggle between plan/build modes (F2)",
      handler: async (ctx) => {
        if (f2Debounce) {
          console.log("[ModeManager] F2 debounced, skipping");
          return;
        }
        f2Debounce = true;

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
            f2Debounce = false;
          }, 300);
        }
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // AGENT MODE REQUESTS - LLM can request mode changes, user approves
  // ═══════════════════════════════════════════════════════════════

  // Register tool for agent to request mode changes
  pi.registerTool({
    name: "request_mode_change",
    label: "request_mode_change",
    description: "Request to switch to a different mode (plan or build). Requires user approval. Use when you need to investigate (plan) or when you're ready to implement (build).",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        target_mode: {
          type: "string",
          enum: ["plan", "build"],
          description: "The mode to request switching to",
        },
        reason: {
          type: "string",
          description: "Why you want to switch modes. Be specific about what you need to do.",
        },
      },
      required: ["target_mode", "reason"],
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { target_mode, reason } = params as { target_mode: string; reason: string };
      
      console.log(`[ModeManager] Agent requested mode change: ${target_mode} - ${reason}`);

      // Check if already in that mode
      if (currentMode.id === target_mode) {
        return {
          content: [{ type: "text", text: `Already in ${target_mode} mode.` }],
          details: { success: true, alreadyInMode: true },
        };
      }

      // Store the pending request
      pendingModeRequest = {
        requestedMode: target_mode,
        reason,
        timestamp: Date.now(),
      };

      // Notify user about the request
      if (ctx.ui?.notify) {
        ctx.ui.notify(
          `🔄 Mode Change Requested\nAgent wants to switch to: ${target_mode.toUpperCase()} mode\nReason: ${reason}\n\nType "/approve" to allow or "/deny" to reject.`,
          "info"
        );
      }

      return {
        content: [{ 
          type: "text", 
          text: `Requested switch to ${target_mode} mode.\nReason: ${reason}\n\nWaiting for user approval...` 
        }],
        details: { 
          success: true, 
          requested: target_mode, 
          reason,
          requiresApproval: true 
        },
      };
    },
  });

  // Command for user to approve a pending mode change
  pi.registerCommand("approve", {
    description: "Approve a pending mode change request from the agent",
    handler: async (_args, ctx) => {
      if (!pendingModeRequest) {
        ctx.ui.notify("No pending mode change request to approve.", "warning");
        return;
      }

      const { requestedMode, reason, timestamp } = pendingModeRequest;
      const age = Math.round((Date.now() - timestamp) / 1000);

      console.log(`[ModeManager] User approved mode change to ${requestedMode} (requested ${age}s ago)`);

      if (setMode(requestedMode)) {
        const modes = getAllModes(config);
        const mode = modes[requestedMode];
        ctx.ui.notify(
          `✅ Approved! Switched to ${mode.icon} ${mode.name} mode\nReason: ${reason}`,
          "info"
        );
        pendingModeRequest = null;
        
        // Update system prompt for the active session
        // @ts-ignore sessionManager may expose setSystemPrompt
        ctx.sessionManager?.setSystemPrompt?.(currentMode.systemPrompt);
        
        // Trigger agent to continue with the plan
        // This sends a user message that will trigger a new turn
        const continuationMessage = `I've approved your request to switch to ${requestedMode.toUpperCase()} mode. The mode is now active (${mode.icon} ${mode.name}).

Please continue with your plan. You can now use the tools available in ${mode.name} mode.`;
        
        ctx.ui.notify("🚀 Continuing with plan...", "info");
        
        // Send user message to trigger agent continuation
        // @ts-ignore sendUserMessage is available on pi
        pi.sendUserMessage?.(continuationMessage);
      }
    },
  });

  // Command for user to deny a pending mode change
  pi.registerCommand("deny", {
    description: "Deny a pending mode change request from the agent",
    handler: async (_args, ctx) => {
      if (!pendingModeRequest) {
        ctx.ui.notify("No pending mode change request to deny.", "warning");
        return;
      }

      const { requestedMode, reason } = pendingModeRequest;
      console.log(`[ModeManager] User denied mode change to ${requestedMode}`);

      ctx.ui.notify(
        `❌ Denied mode change to ${requestedMode}\nReason given: ${reason}\n\nCurrent mode: ${currentMode.icon} ${currentMode.name}`,
        "info"
      );
      
      pendingModeRequest = null;
      
      // Inform the agent that the request was denied
      // @ts-ignore sendUserMessage is available on pi
      pi.sendUserMessage?.(
        `I've denied your request to switch to ${requestedMode.toUpperCase()} mode. ` +
        `Please continue working in ${currentMode.name.toUpperCase()} mode with the currently available tools, ` +
        `or explain why you need the mode change if you'd like to request again.`
      );
    },
  });

  // Command to check if there's a pending request
  pi.registerCommand("pending", {
    description: "Check if there's a pending mode change request",
    handler: async (_args, ctx) => {
      if (!pendingModeRequest) {
        ctx.ui.notify(`No pending mode change requests.\nCurrent mode: ${currentMode.icon} ${currentMode.name}`, "info");
        return;
      }

      const { requestedMode, reason, timestamp } = pendingModeRequest;
      const age = Math.round((Date.now() - timestamp) / 1000);
      
      ctx.ui.notify(
        `⏳ Pending Mode Change Request:\n` +
        `  Mode: ${requestedMode.toUpperCase()}\n` +
        `  Reason: ${reason}\n` +
        `  Age: ${age}s ago\n\n` +
        `Type "/approve" or "/deny"`,
        "info"
      );
    },
  });

  // Log initialization for debugging
  console.log(`[ModeManager] Extension initialized. Mode: ${currentMode.id}, Shortcut: ctrl+shift+m`);

  // Hook into session start to set up UI
  pi.on("session_start", async (_event, ctx) => {
    // Set initial status - but only if UI is fully ready
    if (ctx.ui?.setStatus && ctx.hasUI) {
      try {
        ctx.ui.setStatus("mode", `${currentMode.icon} ${currentMode.name}`);
      } catch (err) {
        console.log("[ModeManager] Status setup deferred:", err);
      }
    }
  });

  // Hook into before agent start to apply mode-specific system prompt
  pi.on("before_agent_start", async (_event) => {
    // Return mode-specific system prompt modification
    return {
      systemPrompt: currentMode.systemPrompt + "\n\nCurrent mode: " + currentMode.name + " " + currentMode.icon
    };
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

  // Filter bash commands in plan mode
  // @ts-ignore - UserBash handler signature
  pi.on("user_bash", async (event, _ctx) => {
    if (currentMode.id !== "plan") {
      return; // Allow all bash in build mode
    }

    const command = event.command.trim();
    const baseCommand = command.split(/\s+/)[0].toLowerCase();
    
    console.log(`[ModeManager] Bash command: "${command}" | Mode: ${currentMode.id}`);

    // Check if explicitly blocked
    const isBlocked = BLOCKED_BASH_COMMANDS.some(
      blocked => command.toLowerCase().startsWith(blocked.toLowerCase()) || baseCommand === blocked.toLowerCase()
    );

    if (isBlocked) {
      const msg = `Command "${command}" is not allowed in Plan mode.`;
      console.log(`[ModeManager] BLOCKED bash: ${msg}`);
      return {
        result: {
          stdout: "",
          stderr: msg + "\nAllowed commands: " + READONLY_BASH_COMMANDS.join(", ") + "\nSwitch to build mode with: /build",
          exitCode: 1,
        }
      };
    }

    // Check if explicitly allowed
    const isAllowed = READONLY_BASH_COMMANDS.some(
      allowed => command.toLowerCase().startsWith(allowed.toLowerCase()) || baseCommand === allowed.toLowerCase()
    );

    if (!isAllowed) {
      const msg = `Command "${command}" may not be safe in Plan mode.`;
      console.log(`[ModeManager] WARNING bash: ${msg}`);
      // Allow but warn - or could block here if strict
      return;
    }

    console.log(`[ModeManager] ALLOWED bash: "${command}"`);
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
