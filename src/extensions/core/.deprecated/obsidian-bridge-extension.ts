/**
 * Obsidian Bridge Extension - Heartbeat Integration
 * 
 * Uses the Heartbeat scheduler to poll Obsidian for tasks.
 * 
 * How it works:
 * 1. On heartbeat 'checkin' events, poll Obsidian vault for #kobold tasks
 * 2. Tasks found are written to ~/.0xkobold/obsidian-tasks.json
 * 3. On next startup (or via gateway), Kobold processes these tasks
 * 4. When tasks complete, Kobold marks them done in Obsidian
 * 
 * This integrates with the existing Heartbeat system (no separate polling)
 * and stores tasks in ~/.0xkobold (managed by Kobold, not in project dir)
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { HeartbeatScheduler, ScheduledEvent } from "../../heartbeat/scheduler.js";

// Config storage in ~/.0xkobold
const KOBOLD_DIR = join(homedir(), ".0xkobold");
const DEFAULT_VAULT_PATH = join(KOBOLD_DIR, "obsidian_vault");
const TASKS_FILE = join(KOBOLD_DIR, "obsidian-tasks.json");
const STATE_FILE = join(KOBOLD_DIR, "obsidian-bridge-state.json");

interface ObsidianBridgeExtensionConfig {
  enabled: boolean;
  vaultName?: string; // Auto-detected if not set
  tasksFilePath: string; // Path in vault, e.g., "10-Action/Tasks.md"
  pollOn: ("morning" | "evening" | "periodic" | "idle")[];
}

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
  lastProcessedTaskId: string | null;
  pendingTasks: PendingTask[];
}

const DEFAULT_CONFIG: ObsidianBridgeExtensionConfig = {
  enabled: false,
  tasksFilePath: "10-Action/Tasks.md",
  pollOn: ["morning", "periodic"], // Poll on morning check-in and every 30 min
};

class ObsidianBridgeExtension {
  private api: ExtensionAPI;
  private config: ObsidianBridgeExtensionConfig;
  private scheduler: HeartbeatScheduler | null = null;
  private vaultDetected = false;
  private vaultPath: string | null = null;
  private cliAvailable = false;

  constructor(api: ExtensionAPI, config: Partial<ObsidianBridgeExtensionConfig> = {}) {
    this.api = api;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Ensure ~/.0xkobold exists
    if (!existsSync(KOBOLD_DIR)) {
      mkdirSync(KOBOLD_DIR, { recursive: true });
    }

    this.init();
  }

  private async init(): Promise<void> {
    if (!this.config.enabled) {
      console.log("[ObsidianBridge] Extension disabled");
      return;
    }

    console.log("[ObsidianBridge] Initializing...");

    // Check CLI (optional)
    this.checkCli();

    // Detect vault - prioritizes ~/.0xkobold/obsidian_vault
    await this.detectVault();

    // If no vault found, create default Kobold vault
    if (!this.vaultPath) {
      console.log(`[ObsidianBridge] Creating default vault at ${DEFAULT_VAULT_PATH}`);
      this.createDefaultVault();
      this.vaultPath = DEFAULT_VAULT_PATH;
    }

    this.vaultDetected = true;
    console.log(`[ObsidianBridge] Connected to vault: ${this.vaultPath}`);
    console.log(`[ObsidianBridge] CLI available: ${this.cliAvailable} (advanced features ${this.cliAvailable ? 'enabled' : 'disabled'})`);

    // Load any existing tasks
    await this.loadState();

    // Register with Heartbeat scheduler
    this.registerWithHeartbeat();
  }

  private createDefaultVault(): void {
    const vault = DEFAULT_VAULT_PATH;
    
    // Create vault structure
    const paths = [
      vault,
      join(vault, ".obsidian"),
      join(vault, "00-Inbox"),
      join(vault, "01-Projects"),
      join(vault, "10-Action"),
      join(vault, "90-Archive"),
      join(vault, "Daily"),
    ];

    for (const path of paths) {
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    }

    // Create welcome note
    const welcomePath = join(vault, "00-Inbox", "Welcome.md");
    if (!existsSync(welcomePath)) {
      const welcomeContent = `# Kobold Obsidian Bridge

Welcome to your Kobold-managed Obsidian vault!

## How to use

1. **Add tasks**: Create notes in \`00-Inbox/\` or add tasks to \`10-Action/Tasks.md\`
2. **Tag with #kobold**: Any task tagged #kobold will be picked up by Kobold
3. **Heartbeat polling**: Kobold checks this vault on heartbeat events
4. **Processing**: Tasks appear in Kobold kanban for processing
5. **Completion**: When done, Kobold marks tasks complete here

## Folder Structure

- \`00-Inbox/\` - New tasks and notes
- \`01-Projects/\` - Project-specific notes
- \`10-Action/\` - Tasks and actions (Tasks.md synced with Kobold)
- \`90-Archive/\` - Completed/archived items
- \`Daily/\` - Daily notes exported from Kobold sessions

## Quick Start

\`\`\`markdown
- [ ] Review authentication system #kobold #security
- [ ] Deploy v0.6.11 #kobold #deploy
\`\`\`

Open this vault in Obsidian: \`${vault}\`
`;
      Bun.write(welcomePath, welcomeContent);
    }

    // Create initial Tasks.md
    const tasksPath = join(vault, "10-Action", "Tasks.md");
    if (!existsSync(tasksPath)) {
      const tasksContent = `# Tasks

Synced with 0xKobold kanban board.

## Active

- [ ] Example task from Obsidian #kobold

## Archive

<!-- Completed tasks end up here -->
`;
      Bun.write(tasksPath, tasksContent);
    }

    console.log(`[ObsidianBridge] Created default vault with structure`);
  }

  private async detectVault(): Promise<void> {
    // Priority 1: Check Kobold's managed vault location
    if (existsSync(DEFAULT_VAULT_PATH)) {
      // Ensure .obsidian folder exists (create if needed)
      const obsidianConfigPath = join(DEFAULT_VAULT_PATH, ".obsidian");
      if (!existsSync(obsidianConfigPath)) {
        mkdirSync(obsidianConfigPath, { recursive: true });
        console.log("[ObsidianBridge] Created .obsidian config folder in default vault");
      }
      this.vaultPath = DEFAULT_VAULT_PATH;
      console.log(`[ObsidianBridge] Using Kobold-managed vault: ${DEFAULT_VAULT_PATH}`);
      return;
    }

    // Priority 2: User-configured vault name
    if (this.config.vaultName) {
      const candidates = [
        join(homedir(), "Documents", "Obsidian", this.config.vaultName),
        join(homedir(), "Library", "Mobile Documents", "iCloud~md~obsidian", "Documents", this.config.vaultName),
        join(homedir(), "iCloudDrive", "Obsidian", this.config.vaultName),
        join(homedir(), "Obsidian", this.config.vaultName),
      ];

      for (const path of candidates) {
        if (existsSync(join(path, ".obsidian"))) {
          this.vaultPath = path;
          console.log(`[ObsidianBridge] Found user vault: ${path}`);
          return;
        }
      }
    }

    // Priority 3: Try obsidian-cli default
    if (this.cliAvailable) {
      try {
        const { execSync } = await import("child_process");
        const result = execSync("obsidian-cli print-default --path-only", { 
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "ignore"] 
        }).trim();
        if (result && existsSync(result)) {
          this.vaultPath = result;
          console.log(`[ObsidianBridge] Found CLI default vault: ${result}`);
        }
      } catch {
        // CLI couldn't get default
      }
    }
  }

  private checkCli(): void {
    try {
      const { execSync } = require("child_process");
      execSync("which obsidian-cli", { stdio: "ignore" });
      this.cliAvailable = true;
    } catch {
      this.cliAvailable = false;
    }
  }

  private registerWithHeartbeat(): void {
    // Get the Heartbeat scheduler singleton
    const { getScheduler } = require("../../heartbeat/scheduler.js");
    this.scheduler = getScheduler();

    // Listen for check-in events
    this.scheduler.on("checkin", (event: ScheduledEvent) => {
      if (this.shouldPollOn(event.type)) {
        this.pollForTasks();
      }
    });

    console.log(`[ObsidianBridge] Registered with Heartbeat. Polling on: ${this.config.pollOn.join(", ")}`);
  }

  private shouldPollOn(checkInType: string): boolean {
    return this.config.pollOn.includes(checkInType as any);
  }

  /**
   * Poll Obsidian vault for #kobold tasks
   * Called by Heartbeat on scheduled events
   * Works without CLI - uses direct file access
   */
  private async pollForTasks(): Promise<void> {
    if (!this.vaultDetected) return;

    console.log("[ObsidianBridge] Polling for tasks...");

    try {
      // Use direct file access (no CLI needed)
      const tasksPath = join(this.vaultPath!, this.config.tasksFilePath);
      
      if (!existsSync(tasksPath)) {
        // Create tasks file if it doesn't exist
        const tasksDir = join(this.vaultPath!, "10-Action");
        if (!existsSync(tasksDir)) {
          mkdirSync(tasksDir, { recursive: true });
        }
        
        const initialContent = `# Tasks\n\nSynced with 0xKobold kanban board.\n\nTasks tagged with #kobold will be picked up by Kobold.\n\n## Active\n\n\n## Archive\n\n<!-- Completed tasks end up here -->\n`;
        await Bun.write(tasksPath, initialContent);
        console.log(`[ObsidianBridge] Created tasks file: ${tasksPath}`);
        return;
      }

      // Read the tasks file
      const content = await Bun.file(tasksPath).text();
      const newTasks = this.parseTasks(content);

      if (newTasks.length > 0) {
        console.log(`[ObsidianBridge] Found ${newTasks.length} new #kobold tasks`);
        await this.addTasks(newTasks);
      } else {
        console.log("[ObsidianBridge] No new #kobold tasks found");
      }

      // Update state
      await this.saveState({
        lastPoll: new Date().toISOString(),
        lastProcessedTaskId: newTasks.length > 0 ? newTasks[newTasks.length - 1].id : null,
      });

    } catch (error) {
      console.error("[ObsidianBridge] Failed to poll for tasks:", error);
    }
  }

  /**
   * Parse markdown tasks looking for #kobold tag
   */
  private parseTasks(content: string): PendingTask[] {
    const tasks: PendingTask[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      // Match: - [ ] Task title #tag1 #tag2
      const match = line.match(/^- \[ ] (.+)$/);
      if (match) {
        const text = match[1];
        const tagMatches = text.match(/#\w+/g) || [];
        const tags = tagMatches.map(t => t.slice(1));

        if (tags.includes("kobold")) {
          const title = text.replace(/#\w+/g, "").trim();
          const taskId = this.hashTask(title);
          
          tasks.push({
            id: taskId,
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
    // Simple hash for task ID
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      const char = title.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `obs-${Math.abs(hash).toString(36)}`;
  }

  /**
   * Add new tasks to the pending list
   */
  private async addTasks(newTasks: PendingTask[]): Promise<void> {
    const state = await this.loadState();
    const existingIds = new Set(state.pendingTasks.map(t => t.id));
    
    const trulyNew = newTasks.filter(t => !existingIds.has(t.id));
    if (trulyNew.length === 0) return;

    state.pendingTasks.push(...trulyNew);
    await this.saveState(state);
  }

  /**
   * Mark a task as complete in Obsidian
   * Works without CLI - uses direct file access
   */
  async completeTask(taskId: string): Promise<boolean> {
    if (!this.vaultDetected) return false;

    const state = await this.loadState();
    const task = state.pendingTasks.find(t => t.id === taskId);
    if (!task) return false;

    try {
      const tasksPath = join(this.vaultPath!, this.config.tasksFilePath);
      
      // Read current content
      let content = await Bun.file(tasksPath).text();
      
      // Find and replace [ ] with [x] for this task
      const escapedTitle = task.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^- (\\[ ]|\\[x]) ${escapedTitle}.*$`, "m");
      content = content.replace(regex, match => match.replace("[ ]", "[x]"));
      
      // Add Archive section if needed
      if (!content.includes("## Archive")) {
        content += "\n\n## Archive\n";
      }
      
      // Write back
      await Bun.write(tasksPath, content);

      // Update state
      task.status = "completed";
      await this.saveState(state);

      console.log(`[ObsidianBridge] Completed task: ${task.title}`);
      return true;
    } catch (error) {
      console.error("[ObsidianBridge] Failed to complete task:", error);
      return false;
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get pending tasks (called by Kobold to process work)
   */
  async getPendingTasks(): Promise<PendingTask[]> {
    const state = await this.loadState();
    return state.pendingTasks.filter(t => t.status === "pending");
  }

  /**
   * Mark task as in-progress (prevents duplicate processing)
   */
  async markInProgress(taskId: string): Promise<void> {
    const state = await this.loadState();
    const task = state.pendingTasks.find(t => t.id === taskId);
    if (task) {
      task.status = "in_progress";
      await this.saveState(state);
    }
  }

  /**
   * Load state from ~/.0xkobold/obsidian-bridge-state.json
   */
  private async loadState(): Promise<BridgeState> {
    if (!existsSync(STATE_FILE)) {
      return {
        lastPoll: null,
        lastProcessedTaskId: null,
        pendingTasks: [],
      };
    }

    try {
      const content = await Bun.file(STATE_FILE).text();
      return JSON.parse(content);
    } catch {
      return {
        lastPoll: null,
        lastProcessedTaskId: null,
        pendingTasks: [],
      };
    }
  }

  /**
   * Save state to ~/.0xkobold/obsidian-bridge-state.json
   */
  private async saveState(partial: Partial<BridgeState>): Promise<void> {
    const current = await this.loadState();
    const updated = { ...current, ...partial };
    await Bun.write(STATE_FILE, JSON.stringify(updated, null, 2));
  }

  /**
   * Get status for TUI/CLI display
   */
  async getStatus(): Promise<{
    enabled: boolean;
    connected: boolean;
    vault: string | null;
    pendingCount: number;
    lastPoll: string | null;
  }> {
    const state = await this.loadState();
    return {
      enabled: this.config.enabled,
      connected: this.vaultDetected && this.cliAvailable,
      vault: this.vaultPath,
      pendingCount: state.pendingTasks.filter(t => t.status === "pending").length,
      lastPoll: state.lastPoll,
    };
  }
}

// Extension factory function
export async function registerObsidianBridgeExtension(
  api: ExtensionAPI,
  context: ExtensionContext
): Promise<void> {
  // Load config from kobold.json
  const { loadConfig } = await import("../../config/loader.js");
  const configSnapshot = await loadConfig();
  
  // Safely access obsidian config
  const obsConfig = (configSnapshot.config as any)?.obsidian;
  
  const bridgeConfig: Partial<ObsidianBridgeExtensionConfig> = {
    enabled: obsConfig?.enabled ?? false,
    vaultName: obsConfig?.vault,
    tasksFilePath: obsConfig?.tasksFile ?? "10-Action/Tasks.md",
    pollOn: obsConfig?.pollOn ?? ["morning", "periodic"],
  };

  const extension = new ObsidianBridgeExtension(api, bridgeConfig);

  // Register tools
  api.registerTool({
    name: "obsidian_poll_tasks",
    label: "/obsidian_poll",
    description: "Manually poll Obsidian for #kobold tasks",
    // @ts-ignore TSchema mismatch  
    parameters: {},
    async execute(_toolCallId: string, _params: unknown, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      await (extension as any).pollForTasks();
      const status = await extension.getStatus();
      return {
        content: [{ type: "text", text: `Polled Obsidian. Found ${status.pendingCount} pending tasks.` }],
        details: { status },
      };
    },
  });

  api.registerTool({
    name: "obsidian_get_tasks",
    label: "/obsidian_tasks",  
    description: "Get pending tasks from Obsidian bridge",
    // @ts-ignore TSchema mismatch
    parameters: {},
    async execute(_toolCallId: string, _params: unknown, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      const tasks = await extension.getPendingTasks();
      return {
        content: [{ type: "text", text: `Found ${tasks.length} pending tasks from Obsidian.` }],
        details: { tasks, count: tasks.length },
      };
    },
  });

  api.registerTool({
    name: "obsidian_complete_task",
    label: "/obsidian_done",
    description: "Mark an Obsidian-sourced task as complete",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID from obsidian_get_tasks" },
      },
      required: ["taskId"],
    },
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      const args = params as { taskId: string };
      const success = await extension.completeTask(args.taskId);
      return {
        content: [{ type: "text", text: success ? "Task marked complete in Obsidian" : "Failed to complete task" }],
        details: { success },
      };
    },
  });

  api.registerTool({
    name: "obsidian_status",
    label: "/obsidian_status",
    description: "Get Obsidian bridge status",
    // @ts-ignore TSchema mismatch
    parameters: {},
    async execute(_toolCallId: string, _params: unknown, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      const status = await extension.getStatus();
      return {
        content: [{ type: "text", text: `Obsidian Bridge: ${status.enabled ? (status.connected ? "✅ Connected" : "⚠️ Disconnected") : "🔴 Disabled"}` }],
        details: { status },
      };
    },
  });

  console.log("[ObsidianBridge] Extension registered");
}

export default registerObsidianBridgeExtension;
