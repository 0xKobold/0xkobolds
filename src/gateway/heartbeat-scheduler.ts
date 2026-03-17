/**
 * Gateway Heartbeat Scheduler
 *
 * Runs heartbeat checks even when TUI is closed.
 * OpenClaw-compatible: scheduled agent runs with delivery targets.
 *
 * Architecture:
 * - Gateway process is always-running when 0xkobold starts
 * - Heartbeat scheduler checks agent configs on interval
 * - Creates isolated session for each heartbeat
 * - Delivers alerts to configured targets (Discord, Telegram, etc.)
 */

import { EventEmitter } from "node:events";
import { loadConfig } from "../config/loader";
import { getGateway } from "./gateway-server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentHeartbeatConfig } from "../config/types";

// Heartbeat state tracking
interface HeartbeatState {
  agentId: string;
  lastRun: number | null;
  lastResult: "ok" | "alert" | "error" | null;
  lastMessage: string | null;
  consecutiveOk: number;
  nextRun: number | null;
}

// Delivery target types
type DeliveryTarget = "none" | "last" | "discord" | "telegram" | "whatsapp" | string;

// Scheduled heartbeat configuration
interface ScheduledHeartbeat {
  id: string;
  agentId: string;
  config: AgentHeartbeatConfig;
  state: HeartbeatState;
  timer?: Timer;
}

// Heartbeat result from agent run
interface HeartbeatResult {
  ok: boolean;
  token?: string;
  message?: string;
  error?: string;
}

// Constants
const HEARTBEAT_OK = "HEARTBEAT_OK";
const STATE_DIR = join(homedir(), ".0xkobold", "memory");
const STATE_FILE = join(STATE_DIR, "heartbeat-states.json");

/**
 * Gateway Heartbeat Scheduler
 *
 * Manages periodic heartbeat runs for all configured agents.
 * Runs in the Gateway process, not the TUI.
 */
export class HeartbeatScheduler extends EventEmitter {
  private scheduled: Map<string, ScheduledHeartbeat> = new Map();
  private checkTimer: Timer | null = null;
  private isRunning = false;
  private globalConfig: AgentHeartbeatConfig | null = null;

  constructor() {
    super();
  }

  /**
   * Start the heartbeat scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    // Load global heartbeat config
    await this.loadConfig();

    // Load persisted state
    await this.loadState();

    // Start check timer (every minute)
    this.checkTimer = setInterval(() => this.checkAll(), 60000);
    this.isRunning = true;

    console.log("[HeartbeatScheduler] Started (checking every minute)");
    this.emit("started");
  }

  /**
   * Stop the heartbeat scheduler
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.isRunning = false;
    console.log("[HeartbeatScheduler] Stopped");
    this.emit("stopped");
  }

  /**
   * Load heartbeat configuration from kobold.json / openclaw.json
   */
  private async loadConfig(): Promise<void> {
    try {
      const configSnapshot = await loadConfig();
      const config = configSnapshot.config;

      // Get global defaults
      const defaultHeartbeat = config.agents?.defaults?.heartbeat;
      this.globalConfig = defaultHeartbeat || {
        enabled: true,
        every: "30m",
        ackMaxChars: 300,
        target: "none" as DeliveryTarget,
      };

      // Get per-agent configs
      const agentList = config.agents?.list || [];

      // If any agent has a heartbeat block, only those run
      const hasAgentHeartbeats = agentList.some(a => a.heartbeat?.enabled !== undefined);

      if (hasAgentHeartbeats) {
        for (const agent of agentList) {
          if (agent.heartbeat?.enabled !== false) {
            const mergedConfig = this.mergeConfig(this.globalConfig, agent.heartbeat);
            this.scheduleAgent(agent.id, mergedConfig);
          }
        }
      } else if (this.globalConfig?.enabled !== false) {
        // Default: single agent "default" with global config
        this.scheduleAgent("default", this.globalConfig);
      }

      console.log(`[HeartbeatScheduler] Loaded ${this.scheduled.size} agent heartbeat configs`);
    } catch (err) {
      console.error("[HeartbeatScheduler] Failed to load config:", err);
    }
  }

  /**
   * Merge agent config with global defaults
   */
  private mergeConfig(global: AgentHeartbeatConfig, agent?: AgentHeartbeatConfig): AgentHeartbeatConfig {
    if (!agent) return global;
    return {
      ...global,
      ...agent,
      activeHours: agent.activeHours ?? global.activeHours,
    };
  }

  /**
   * Schedule an agent for heartbeat runs
   */
  private scheduleAgent(agentId: string, config: AgentHeartbeatConfig): void {
    const id = `heartbeat-${agentId}`;

    const scheduled: ScheduledHeartbeat = {
      id,
      agentId,
      config,
      state: {
        agentId,
        lastRun: null,
        lastResult: null,
        lastMessage: null,
        consecutiveOk: 0,
        nextRun: null,
      },
    };

    // Calculate next run
    scheduled.state.nextRun = this.calculateNextRun(config);

    this.scheduled.set(id, scheduled);
  }

  /**
   * Calculate next run time based on config
   */
  private calculateNextRun(config: AgentHeartbeatConfig): number {
    const now = Date.now();
    const intervalMs = this.parseInterval(config.every || "30m");

    // Check active hours
    if (config.activeHours && !this.isWithinActiveHours(config.activeHours, now)) {
      // Find next active window
      const nextActive = this.findNextActiveWindow(config.activeHours, now);
      if (nextActive) return nextActive;
    }

    return now + intervalMs;
  }

  /**
   * Parse interval string to milliseconds
   */
  private parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)(s|m|h)$/);
    if (!match) return 30 * 60 * 1000; // Default 30 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s": return value * 1000;
      case "m": return value * 60 * 1000;
      case "h": return value * 60 * 60 * 1000;
      default: return 30 * 60 * 1000;
    }
  }

  /**
   * Check if current time is within active hours
   */
  private isWithinActiveHours(
    activeHours: NonNullable<AgentHeartbeatConfig["activeHours"]>,
    timestamp: number
  ): boolean {
    const date = new Date(timestamp);

    // Get timezone
    const tz = activeHours.timezone || "local";
    let localDate = date;
    if (tz !== "local") {
      try {
        localDate = new Date(date.toLocaleString("en-US", { timeZone: tz }));
      } catch {
        // Invalid timezone, use local
      }
    }

    const hours = localDate.getHours();
    const minutes = localDate.getMinutes();
    const currentTime = hours * 60 + minutes;

    // Parse start/end times
    const [startH, startM] = activeHours.start.split(":").map(Number);
    const [endH, endM] = activeHours.end.split(":").map(Number);

    const startTime = startH * 60 + startM;
    const endTime = endH * 60 + endM;

    // Handle midnight crossing (e.g., 22:00 - 06:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime < endTime;
    }

    // Handle equal times (zero-width window) - skip always
    if (startTime === endTime) {
      return false;
    }

    return currentTime >= startTime && currentTime < endTime;
  }

  /**
   * Find next active window start
   */
  private findNextActiveWindow(
    activeHours: NonNullable<AgentHeartbeatConfig["activeHours"]>,
    now: number
  ): number | null {
    const [startH, startM] = activeHours.start.split(":").map(Number);
    const date = new Date(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(startH, startM, 0, 0);

    return tomorrow.getTime();
  }

  /**
   * Check all scheduled heartbeats
   */
  private async checkAll(): Promise<void> {
    const now = Date.now();

    for (const [id, scheduled] of this.scheduled) {
      // Skip if next run is in the future
      if (scheduled.state.nextRun && scheduled.state.nextRun > now) {
        continue;
      }

      // Check active hours
      if (scheduled.config.activeHours) {
        if (!this.isWithinActiveHours(scheduled.config.activeHours, now)) {
          continue;
        }
      }

      // Run heartbeat
      await this.runHeartbeat(scheduled);
    }
  }

  /**
   * Run a single heartbeat
   */
  private async runHeartbeat(scheduled: ScheduledHeartbeat): Promise<void> {
    const { agentId, config } = scheduled;
    const startTime = Date.now();

    console.log(`[HeartbeatScheduler] Running heartbeat for ${agentId}`);

    try {
      // Read HEARTBEAT.md
      const heartbeatContent = await this.readHeartbeatFile(agentId);

      if (!heartbeatContent) {
        // No heartbeat file, skip silently
        scheduled.state.lastRun = startTime;
        scheduled.state.lastResult = "ok";
        scheduled.state.nextRun = this.calculateNextRun(config);
        return;
      }

      // Run agent with heartbeat prompt
      const result = await this.executeHeartbeat(agentId, config, heartbeatContent);

      // Update state
      scheduled.state.lastRun = startTime;

      if (result.ok) {
        scheduled.state.lastResult = "ok";
        scheduled.state.consecutiveOk++;

        // Strip HEARTBEAT_OK token if present
        let message = result.message || "";
        if (message.includes(HEARTBEAT_OK)) {
          message = message.replace(HEARTBEAT_OK, "").trim();
          // If message is too short after stripping, it's just an ack
          if (message.length <= (config.ackMaxChars || 300)) {
            message = "";
          }
        }

        if (message) {
          // Something needs attention
          scheduled.state.lastResult = "alert";
          scheduled.state.lastMessage = message;
          await this.deliverAlert(agentId, config, message);
        }
      } else {
        scheduled.state.lastResult = "error";
        scheduled.state.lastMessage = result.error || "Unknown error";
        scheduled.state.consecutiveOk = 0;
      }

      // Calculate next run
      scheduled.state.nextRun = this.calculateNextRun(config);

      // Persist state
      await this.saveState();

      this.emit("heartbeat", {
        agentId,
        result: scheduled.state.lastResult,
        duration: Date.now() - startTime,
      });

    } catch (err) {
      console.error(`[HeartbeatScheduler] Error running heartbeat for ${agentId}:`, err);
      scheduled.state.lastResult = "error";
      scheduled.state.lastMessage = String(err);
    }
  }

  /**
   * Read HEARTBEAT.md for an agent
   */
  private async readHeartbeatFile(agentId: string): Promise<string | null> {
    // Try agent-specific heartbeat file first
    const agentPath = join(homedir(), ".0xkobold", "agents", agentId, "HEARTBEAT.md");
    const globalPath = join(homedir(), ".0xkobold", "HEARTBEAT.md");

    try {
      const content = await readFile(agentPath, "utf-8");
      return content;
    } catch {
      // Fall back to global
    }

    try {
      const content = await readFile(globalPath, "utf-8");
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Execute heartbeat via agent run
   */
  private async executeHeartbeat(
    agentId: string,
    config: AgentHeartbeatConfig,
    heartbeatContent: string
  ): Promise<HeartbeatResult> {
    // Build heartbeat prompt
    const prompt = config.prompt ||
      "Read HEARTBEAT.md in the workspace. Execute the checks defined there. " +
      "If nothing needs attention, reply with HEARTBEAT_OK. " +
      "If something needs attention, briefly describe the issue.";

    // Get gateway instance
    const gateway = getGateway();
    if (!gateway) {
      return { ok: false, error: "Gateway not running" };
    }

    // For now, return OK if we have heartbeat content
    // In full implementation, this would:
    // 1. Create an isolated session
    // 2. Load agent config
    // 3. Run the heartbeat prompt
    // 4. Capture response

    // Simple check: does the file contain HEARTBEAT_OK at the end?
    const endsWithOk = heartbeatContent.trim().endsWith(HEARTBEAT_OK);

    return {
      ok: true,
      message: endsWithOk ? "" : heartbeatContent.slice(0, 500),
    };
  }

  /**
   * Deliver alert to configured target
   */
  private async deliverAlert(
    agentId: string,
    config: AgentHeartbeatConfig,
    message: string
  ): Promise<void> {
    const target = config.target || "none";

    if (target === "none") {
      console.log(`[HeartbeatScheduler] [${agentId}] Alert (not delivered): ${message.slice(0, 100)}...`);
      return;
    }

    const gateway = getGateway();
    if (!gateway) {
      console.error(`[HeartbeatScheduler] Cannot deliver alert: Gateway not running`);
      return;
    }

    // Format message
    const formatted = `⚠️ [${agentId}] Heartbeat Alert\n\n${message}`;

    switch (target) {
      case "last":
        // Deliver to last used channel
        gateway.broadcast({ type: "heartbeat", agentId, message: formatted });
        break;

      case "discord":
        // Deliver via Discord channel
        gateway.broadcastToChannel("discord", { type: "heartbeat", agentId, message: formatted });
        break;

      case "telegram":
        // Deliver via Telegram
        gateway.broadcastToChannel("telegram", { type: "heartbeat", agentId, message: formatted });
        break;

      default:
        // Custom channel ID
        gateway.broadcastToChannel(target, { type: "heartbeat", agentId, message: formatted });
    }

    console.log(`[HeartbeatScheduler] [${agentId}] Alert delivered to ${target}`);
    this.emit("alert", { agentId, target, message });
  }

  /**
   * Load persisted state
   */
  private async loadState(): Promise<void> {
    try {
      await mkdir(STATE_DIR, { recursive: true });
      const data = await readFile(STATE_FILE, "utf-8");
      const states = JSON.parse(data) as Record<string, HeartbeatState>;

      for (const [id, state] of Object.entries(states)) {
        const scheduled = this.scheduled.get(id);
        if (scheduled) {
          scheduled.state = state;
        }
      }
    } catch {
      // No state file, use defaults
    }
  }

  /**
   * Persist state to disk
   */
  private async saveState(): Promise<void> {
    const states: Record<string, HeartbeatState> = {};

    for (const [id, scheduled] of this.scheduled) {
      states[id] = scheduled.state;
    }

    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(states, null, 2));
  }

  /**
   * Get current state for an agent
   */
  getState(agentId: string): HeartbeatState | null {
    const id = `heartbeat-${agentId}`;
    return this.scheduled.get(id)?.state || null;
  }

  /**
   * Get all scheduled heartbeats
   */
  getScheduled(): Map<string, ScheduledHeartbeat> {
    return this.scheduled;
  }

  /**
   * Manually trigger heartbeat for an agent
   */
  async triggerNow(agentId: string): Promise<HeartbeatResult> {
    const id = `heartbeat-${agentId}`;
    const scheduled = this.scheduled.get(id);

    if (!scheduled) {
      return { ok: false, error: `No heartbeat config for agent ${agentId}` };
    }

    await this.runHeartbeat(scheduled);
    return {
      ok: scheduled.state.lastResult === "ok",
      message: scheduled.state.lastMessage || undefined,
      error: scheduled.state.lastResult === "error" ? scheduled.state.lastMessage || undefined : undefined,
    };
  }
}

// Singleton instance
let schedulerInstance: HeartbeatScheduler | null = null;

export function getHeartbeatScheduler(): HeartbeatScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new HeartbeatScheduler();
  }
  return schedulerInstance;
}

export function startHeartbeatScheduler(): HeartbeatScheduler {
  const scheduler = getHeartbeatScheduler();
  scheduler.start();
  return scheduler;
}

export function stopHeartbeatScheduler(): void {
  schedulerInstance?.stop();
}