/**
 * Obsidian Bridge Extension for pi-coding-agent
 * 
 * Provides bidirectional sync between Obsidian vault and agent tasks.
 * Works via file access (obsidian-cli optional for advanced features).
 * 
 * Features:
 * - Polls vault for #kobold tagged tasks 
 * - Creates vault structure if not exists
 * - Completes tasks back to Obsidian when done
 * 
 * Supports both ~/.pi and ~/.0xkobold paths for compatibility
 * 
 * Storage Priority:
 * 1. PI_OBSIDIAN_STORAGE env var
 * 2. PI_DATA_DIR env > ~/.0xkobold (if exists) > ~/.pi
 * 
 * Setup:
 * 1. Set PI_OBSIDIAN_VAULT to your vault path (optional)
 *    Or extension creates vault at ~/.0xkobold/obsidian_vault or ~/.pi/obsidian_vault
 * 2. Tag tasks with #kobold in Obsidian
 * 3. Use /obsidian_poll or integrate with your scheduler
 * 
 * @module @0xkobold/pi-obsidian-bridge
 */

import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
// @ts-ignore - TypeBox version compatibility
import { Type } from "@sinclair/typebox";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

// ============================================================================
// CONFIGURATION
// ============================================================================

interface ObsidianBridgeConfig {
  enabled: boolean;
  vaultPath: string;
  tasksFilePath: string;
  storagePath: string;
}

/**
 * Get the base directory for pi/0xkobold data.
 * Priority: PI_DATA_DIR env > PI_OBSIDIAN_STORAGE env > ~/.0xkobold (if exists) > ~/.pi
 */
function getBaseDir(): string {
  if (process.env.PI_DATA_DIR) {
    return process.env.PI_DATA_DIR;
  }
  if (process.env.PI_OBSIDIAN_STORAGE) {
    return process.env.PI_OBSIDIAN_STORAGE;
  }
  const koboldDir = join(homedir(), ".0xkobold");
  if (existsSync(koboldDir)) return koboldDir;
  return join(homedir(), ".pi");
}

/**
 * Get storage directory with priority:
 * 1. PI_OBSIDIAN_STORAGE env var
 * 2. PI_DATA_DIR env > ~/.0xkobold (if exists) > ~/.pi
 */
function getDefaultStorage(): string {
  if (process.env.PI_OBSIDIAN_STORAGE) {
    return process.env.PI_OBSIDIAN_STORAGE;
  }
  return getBaseDir();
}

function loadConfig(): ObsidianBridgeConfig {
  const baseDir = getBaseDir();
  const defaultVault = join(baseDir, "obsidian_vault");

  return {
    enabled: process.env.PI_OBSIDIAN_ENABLED !== "false",
    vaultPath: process.env.PI_OBSIDIAN_VAULT || defaultVault,
    tasksFilePath: process.env.PI_OBSIDIAN_TASKS_FILE || "10-Action/Tasks.md",
    storagePath: baseDir,
  };
}

// ============================================================================
// TYPES
// ============================================================================

interface PendingTask {
  id: string;
  title: string;
  tags: string[];
  source: "obsidian";
  discoveredAt: string;
  status: "pending" | "in_progress" | "completed";
}

interface BridgeState {
  lastPoll: string | null;
  pendingTasks: PendingTask[];
}

export type { PendingTask, BridgeState, ObsidianBridgeConfig };

// ============================================================================
// BRIDGE CLASS
// ============================================================================

export class ObsidianBridge {
  private config: ObsidianBridgeConfig;
  private vaultDetected = false;
  private stateFile: string;

  constructor(config: ObsidianBridgeConfig) {
    this.config = config;
    this.stateFile = join(config.storagePath, "obsidian-bridge.json");
  }

  async init(): Promise<void> {
    if (!this.config.enabled) {
      console.log("[ObsidianBridge] Extension disabled");
      return;
    }

    console.log("[ObsidianBridge] Initializing...");
    await this.ensureDir(this.config.storagePath);
    await this.detectOrCreateVault();
    await this.loadState();
  }

  private async ensureDir(path: string): Promise<void> {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }

  private async detectOrCreateVault(): Promise<void> {
    const obsidianConfigPath = join(this.config.vaultPath, ".obsidian");
    
    if (existsSync(obsidianConfigPath)) {
      this.vaultDetected = true;
      console.log(`[ObsidianBridge] Using existing vault: ${this.config.vaultPath}`);
      return;
    }

    console.log(`[ObsidianBridge] Creating default vault at ${this.config.vaultPath}`);
    
    const paths = [
      this.config.vaultPath,
      obsidianConfigPath,
      join(this.config.vaultPath, "00-Inbox"),
      join(this.config.vaultPath, "01-Projects"),
      join(this.config.vaultPath, "10-Action"),
      join(this.config.vaultPath, "90-Archive"),
    ];

    for (const path of paths) {
      if (!existsSync(path)) mkdirSync(path, { recursive: true });
    }

    // Create welcome note
    const welcomePath = join(this.config.vaultPath, "00-Inbox", "Welcome.md");
    if (!existsSync(welcomePath)) {
      const content = `# Kobold Obsidian Bridge

Welcome to your Kobold-managed Obsidian vault!

## How to use

1. **Add tasks**: Create notes in \`00-Inbox/\` or edit \`10-Action/Tasks.md\`
2. **Tag with #kobold**: Tasks with #kobold are picked up by Kobold
3. **Poll**: Use /obsidian_poll to find tasks
4. **Complete**: Tasks marked done sync back to Obsidian

## Quick Start

\`\`\`markdown
- [ ] My first task #kobold
\`\`\`
`;
      await Bun.write(welcomePath, content);
    }

    // Create Tasks.md
    const tasksPath = join(this.config.vaultPath, "10-Action", "Tasks.md");
    if (!existsSync(tasksPath)) {
      const content = `# Tasks

## Active

- [ ] Welcome! Tag tasks with #kobold #example

## Archive
`;
      await Bun.write(tasksPath, content);
    }

    this.vaultDetected = true;
    console.log("[ObsidianBridge] Created default vault");
  }

  // ========================================================================
  // TASK OPERATIONS
  // ========================================================================

  async pollForTasks(): Promise<PendingTask[]> {
    if (!this.vaultDetected) {
      console.log("[ObsidianBridge] Vault not initialized");
      return [];
    }

    try {
      const tasksPath = join(this.config.vaultPath, this.config.tasksFilePath);
      
      if (!existsSync(tasksPath)) {
        await this.createTasksFile(tasksPath);
        return [];
      }

      const content = await Bun.file(tasksPath).text();
      const tasks = this.parseTasks(content);

      if (tasks.length > 0) {
        console.log(`[ObsidianBridge] Found ${tasks.length} #kobold tasks`);
        await this.addTasks(tasks);
      }

      await this.saveState({ lastPoll: new Date().toISOString() });
      return tasks;
    } catch (error) {
      console.error("[ObsidianBridge] Poll failed:", error);
      return [];
    }
  }

  private async createTasksFile(tasksPath: string): Promise<void> {
    const dir = join(this.config.vaultPath, "10-Action");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    await Bun.write(tasksPath, "# Tasks\n\n## Active\n\n## Archive\n");
  }

  private parseTasks(content: string): PendingTask[] {
    const tasks: PendingTask[] = [];
    
    for (const line of content.split("\n")) {
      const match = line.match(/^- \[ ] (.+)$/);
      if (match) {
        const text = match[1];
        const tags = (text.match(/#\w+/g) || []).map(t => t.slice(1));

        if (tags.includes("kobold")) {
          const title = text.replace(/#\w+/g, "").trim();
          const id = this.hashTask(title);
          
          tasks.push({
            id,
            title,
            tags,
            source: "obsidian",
            discoveredAt: new Date().toISOString(),
            status: "pending",
          });
        }
      }
    }

    return tasks;
  }

  private hashTask(title: string): string {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      const char = title.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `obs-${Math.abs(hash).toString(36)}`;
  }

  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  private async loadState(): Promise<BridgeState> {
    if (!existsSync(this.stateFile)) {
      return { lastPoll: null, pendingTasks: [] };
    }
    try {
      return JSON.parse(await Bun.file(this.stateFile).text());
    } catch {
      return { lastPoll: null, pendingTasks: [] };
    }
  }

  private async saveState(partial: Partial<BridgeState>): Promise<void> {
    const current = await this.loadState();
    await Bun.write(this.stateFile, JSON.stringify({ ...current, ...partial }, null, 2));
  }

  private async addTasks(newTasks: PendingTask[]): Promise<void> {
    const state = await this.loadState();
    const existing = new Set(state.pendingTasks.map(t => t.id));
    const trulyNew = newTasks.filter(t => !existing.has(t.id));
    
    if (trulyNew.length > 0) {
      state.pendingTasks.push(...trulyNew);
      await this.saveState(state);
    }
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  async getPendingTasks(): Promise<PendingTask[]> {
    const state = await this.loadState();
    return state.pendingTasks.filter(t => t.status === "pending");
  }

  async markInProgress(taskId: string): Promise<void> {
    const state = await this.loadState();
    const task = state.pendingTasks.find(t => t.id === taskId);
    if (task) {
      task.status = "in_progress";
      await this.saveState(state);
    }
  }

  async completeTask(taskId: string): Promise<boolean> {
    if (!this.vaultDetected) return false;

    const state = await this.loadState();
    const task = state.pendingTasks.find(t => t.id === taskId);
    if (!task) return false;

    try {
      const tasksPath = join(this.config.vaultPath, this.config.tasksFilePath);
      let content = await Bun.file(tasksPath).text();
      
      // Mark as done in markdown
      const escaped = task.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^- \\[[ x]] ${escaped}`, "m");
      content = content.replace(regex, match => match.replace("[ ]", "[x]"));
      
      await Bun.write(tasksPath, content);

      task.status = "completed";
      await this.saveState(state);

      console.log(`[ObsidianBridge] Completed: ${task.title}`);
      return true;
    } catch (error) {
      console.error("[ObsidianBridge] Complete failed:", error);
      return false;
    }
  }

  async getStatus(): Promise<{
    enabled: boolean;
    connected: boolean;
    vault: string;
    pendingCount: number;
    lastPoll: string | null;
  }> {
    const state = await this.loadState();
    return {
      enabled: this.config.enabled,
      connected: this.vaultDetected,
      vault: this.config.vaultPath,
      pendingCount: state.pendingTasks.filter(t => t.status === "pending").length,
      lastPoll: state.lastPoll,
    };
  }
}

// ============================================================================
// MAIN EXTENSION
// ============================================================================

export default async function obsidianBridgeExtension(pi: ExtensionAPI): Promise<void> {
  const config = loadConfig();
  
  if (!config.enabled) {
    console.log("[ObsidianBridge] Disabled - set PI_OBSIDIAN_ENABLED=true to enable");
    return;
  }

  const bridge = new ObsidianBridge(config);
  await bridge.init();

  // Register tools
  pi.registerTool({
    name: "obsidian_poll_tasks",
    label: "/obsidian_poll",
    description: "Poll Obsidian vault for #kobold tasks",
    // @ts-ignore
    parameters: {},
    async execute(): Promise<AgentToolResult<any>> {
      const tasks = await bridge.pollForTasks();
      const status = await bridge.getStatus();
      return {
        content: [{ type: "text" as const, text: `📓 Found ${tasks.length} tasks (${status.pendingCount} total pending)` }],
        details: { tasks, status },
      };
    },
  });

  pi.registerTool({
    name: "obsidian_get_tasks",
    label: "/obsidian_tasks",  
    description: "Get pending tasks from Obsidian",
    // @ts-ignore
    parameters: {},
    async execute(): Promise<AgentToolResult<any>> {
      const tasks = await bridge.getPendingTasks();
      const list = tasks.map(t => `  • ${t.title}`).join("\n") || "  (no tasks)";
      return {
        content: [{ type: "text" as const, text: `📓 ${tasks.length} pending:\n${list}` }],
        details: { tasks },
      };
    },
  });

  pi.registerTool({
    name: "obsidian_complete_task",
    label: "/obsidian_done",
    description: "Mark Obsidian task as complete",
    // @ts-ignore
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID from obsidian_tasks" })
    }),
    async execute(_id: string, params: { taskId: string }): Promise<AgentToolResult<any>> {
      const success = await bridge.completeTask(params.taskId);
      return {
        content: [{ type: "text" as const, text: success ? "✅ Complete" : "❌ Failed" }],
        details: { success },
      };
    },
  });

  pi.registerTool({
    name: "obsidian_status",
    label: "/obsidian_status",
    description: "Get Obsidian bridge status",
    // @ts-ignore
    parameters: {},
    async execute(): Promise<AgentToolResult<any>> {
      const status = await bridge.getStatus();
      return {
        content: [{ 
          type: "text" as const, 
          text: `📓 ${status.connected ? "✅" : "⚠️"} ${status.vault}\n📋 ${status.pendingCount} tasks` 
        }],
        details: { status },
      };
    },
  });

  pi.registerCommand("obsidian-open", {
    description: "Open Obsidian vault location",
    handler: async () => {
      const status = await bridge.getStatus();
      console.log(`📓 Vault: ${status.vault}`);
    },
  });

  // Expose for programmatic use
  (pi as any).obsidianBridge = bridge;

  console.log("[ObsidianBridge] Loaded 📓");
  console.log(`[ObsidianBridge] Storage: ${config.storagePath}`);
  console.log(`[ObsidianBridge] Vault: ${config.vaultPath}`);
  console.log(`[ObsidianBridge] Tools: /obsidian_poll, /obsidian_tasks, /obsidian_done, /obsidian_status`);
}
