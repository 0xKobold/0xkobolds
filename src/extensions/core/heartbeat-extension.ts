/**
 * Heartbeat Extension - Koclaw-style Periodic Check-ins
 *
 * Monitors agent health via periodic LLM check-ins using HEARTBEAT.md.
 * This is a simplified implementation inspired by koclaw/openclaw.
 *
 * How it works:
 * 1. Config from kobold.json (agents.defaults.heartbeat)
 * 2. Agent reads HEARTBEAT.md and decides if action is needed
 * 3. If response is HEARTBEAT_OK (with optional short text), it's suppressed
 *
 * Configuration in kobold.json:
 * {
 *   "agents": {
 *     "defaults": {
 *       "heartbeat": {
 *         "enabled": true,
 *         "every": "30m",
 *         "prompt": "Read HEARTBEAT.md...",
 *         "ackMaxChars": 300,
 *         "activeHours": { "start": "09:00", "end": "22:00" }
 *       }
 *     }
 *   }
 * }
 *
 * For users: Edit HEARTBEAT.md in your workspace to customize checks.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { loadConfig, getConfigValue } from "../../config/loader.js";

// Constants matching koclaw conventions
const HEARTBEAT_TOKEN = "HEARTBEAT_OK";
const DEFAULT_EVERY = "30m";
const DEFAULT_ACK_MAX_CHARS = 300;
const HEARTBEAT_FILENAME = "HEARTBEAT.md";

interface HeartbeatConfig {
  enabled: boolean;
  every: string;
  prompt: string;
  ackMaxChars: number;
  activeHours: {
    start: string;
    end: string;
    timezone?: string;
  } | null;
}

function getDefaultConfig(): HeartbeatConfig {
  return {
    enabled: true,
    every: DEFAULT_EVERY,
    prompt: `Read HEARTBEAT.md if it exists. Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply ${HEARTBEAT_TOKEN}.`,
    ackMaxChars: DEFAULT_ACK_MAX_CHARS,
    activeHours: null,
  };
}

// Parse duration string to milliseconds
function parseDurationMs(duration: string): number {
  const regex = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s?(?:(\d+)s?)?$/i;
  const match = duration.trim().match(regex);

  if (!match) {
    console.warn(`[Heartbeat] Invalid duration "${duration}", using default`);
    return 30 * 60 * 1000;
  }

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

// Read HEARTBEAT.md from workspace
async function readHeartbeatFile(workspacePath: string): Promise<string | null> {
  try {
    const filePath = path.join(workspacePath, HEARTBEAT_FILENAME);
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch {
    return null;
  }
}

// Check if content is effectively empty
function isEffectivelyEmpty(content: string): boolean {
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#+\s/.test(trimmed)) continue;
    if (/^[-*+]\s*(\[[\sXx]\]\s*)?$/.test(trimmed)) continue;
    return false;
  }
  return true;
}

// Check if currently within active hours
function isWithinActiveHours(config: HeartbeatConfig): boolean {
  if (!config.activeHours) return true;

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [currentHour, currentMin] = timeStr.split(":").map(Number);
  const [startHour, startMin] = config.activeHours.start.split(":").map(Number);
  const [endHour, endMin] = config.activeHours.end.split(":").map(Number);

  const currentMinutes = currentHour * 60 + currentMin;
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes === endMinutes) return true;

  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// Find workspace directory
async function findWorkspaceDir(): Promise<string> {
  try {
    await fs.access(HEARTBEAT_FILENAME);
    return process.cwd();
  } catch {
    // not found
  }

  let current = process.cwd();
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    try {
      await fs.access(path.join(current, HEARTBEAT_FILENAME));
      return current;
    } catch {
      continue;
    }
  }

  return process.cwd();
}

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

export default function heartbeatExtension(pi: ExtensionAPI) {
  const startTime = Date.now();
  let checkInterval: ReturnType<typeof setInterval> | null = null;
  let lastHeartbeat = 0;

  // Load config from kobold.json
  let config: HeartbeatConfig = getDefaultConfig();
  let configLoaded = false;

  async function loadHeartbeatConfig(): Promise<void> {
    try {
      const snapshot = await loadConfig();
      const hbConfig = snapshot.config.agents?.defaults?.heartbeat;

      if (hbConfig) {
        config = {
          enabled: hbConfig.enabled ?? config.enabled,
          every: hbConfig.every ?? config.every,
          prompt: hbConfig.prompt ?? config.prompt,
          ackMaxChars: hbConfig.ackMaxChars ?? config.ackMaxChars,
          activeHours: hbConfig.activeHours ?? config.activeHours,
        };
      }
      configLoaded = true;
    } catch (err) {
      console.warn('[Heartbeat] Failed to load config, using defaults:', err);
    }
  }

  // Load config on startup
  loadHeartbeatConfig().then(() => {
    console.log(`[Heartbeat] Config loaded (enabled: ${config.enabled}, every: ${config.every})`);
  });

  // Reload config on environment changes
  pi.on("session_start", async () => {
    await loadHeartbeatConfig();
    console.log(`[Heartbeat] Extension loaded (enabled: ${config.enabled}, every: ${config.every})`);
  });

  // ═══════════════════════════════════════════════════════════════
  // REGISTER HEARTBEAT TOOL
  // ═══════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "heartbeat_check",
    label: "Heartbeat Check",
    description: "Perform a heartbeat check by reading HEARTBEAT.md. Returns the content for review. Reply with HEARTBEAT_OK if nothing needs attention, or describe the issue.",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "Force a check even if recently performed",
        },
      },
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { force } = params as { force?: boolean };
      const now = Date.now();
      const everyMs = parseDurationMs(config.every);

      // Check active hours
      if (!isWithinActiveHours(config)) {
        return {
          content: [{
            type: "text" as const,
            text: "Heartbeat skipped - outside active hours. Reply HEARTBEAT_OK to acknowledge.",
          }],
          details: { skipped: true, reason: "outside_active_hours" },
        };
      }

      if (!force && now - lastHeartbeat < everyMs) {
        return {
          content: [{
            type: "text" as const,
            text: "Heartbeat skipped - too soon since last check. Reply HEARTBEAT_OK to acknowledge.",
          }],
          details: { skipped: true, lastHeartbeat },
        };
      }

      const workspaceDir = await findWorkspaceDir();
      const heartbeatContent = await readHeartbeatFile(workspaceDir);

      if (heartbeatContent === null) {
        return {
          content: [{
            type: "text" as const,
            text: `No HEARTBEAT.md found in workspace. Reply ${HEARTBEAT_TOKEN} to acknowledge, or create the file to enable heartbeat checks.`,
          }],
          details: { fileExists: false },
        };
      }

      if (isEffectivelyEmpty(heartbeatContent)) {
        return {
          content: [{
            type: "text" as const,
            text: "HEARTBEAT.md is effectively empty (no actionable items). Reply HEARTBEAT_OK to acknowledge.",
          }],
          details: { fileExists: true, isEmpty: true },
        };
      }

      lastHeartbeat = now;

      return {
        content: [{
          type: "text" as const,
          text: `HEARTBEAT.md content:\n\n${heartbeatContent}\n\nReview the checklist above. If nothing needs attention, reply with "${HEARTBEAT_TOKEN}". Otherwise, describe what needs attention.`,
        }],
        details: { fileExists: true, isEmpty: false },
      };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════════

  pi.registerCommand("heartbeat", {
    description: "Show heartbeat status or trigger manual check",
    handler: async (args, ctx) => {
      await loadHeartbeatConfig();

      if (args.trim() === "now" || args.trim() === "check") {
        if (!isWithinActiveHours(config)) {
          ctx.ui.notify("❤️ Heartbeat skipped - outside active hours.", "info");
          return;
        }

        ctx.ui.notify("Running heartbeat check...", "info");
        const workspaceDir = await findWorkspaceDir();
        const content = await readHeartbeatFile(workspaceDir);

        if (content === null) {
          ctx.ui.notify("❤️ No HEARTBEAT.md found. Run /heartbeat-init to create one.", "warning");
        } else if (isEffectivelyEmpty(content)) {
          ctx.ui.notify("❤️ HEARTBEAT.md is empty - no actionable items.", "info");
        } else {
          ctx.ui.notify(`❤️ HEARTBEAT.md found:\n${content.substring(0, 200)}...`, "info");
        }
        return;
      }

      const lines = [
        "❤️ Heartbeat Configuration",
        `Enabled: ${config.enabled ? "✅" : "❌"}`,
        `Interval: ${config.every}`,
        `Ack Max Chars: ${config.ackMaxChars}`,
      ];

      if (config.activeHours) {
        lines.push(`Active Hours: ${config.activeHours.start} - ${config.activeHours.end}`);
      }

      const workspaceDir = await findWorkspaceDir();
      const hbExists = await fileExists(path.join(workspaceDir, HEARTBEAT_FILENAME));
      lines.push(`HEARTBEAT.md: ${hbExists ? "✅ Found" : "⚠️ Not found"}`);

      lines.push("", "Usage:", "  /heartbeat now - Run check immediately", "  /heartbeat-init - Create HEARTBEAT.md");

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("heartbeat-init", {
    description: "Create HEARTBEAT.md template in workspace",
    handler: async (_args, ctx) => {
      const workspaceDir = await findWorkspaceDir();
      const filePath = path.join(workspaceDir, HEARTBEAT_FILENAME);

      if (await fileExists(filePath)) {
        ctx.ui.notify(`HEARTBEAT.md already exists at ${filePath}`, "warning");
        return;
      }

      const template = `# Heartbeat Checklist

<!--
This file controls what the agent checks during periodic heartbeats.
Keep it short and actionable. If this file is empty or only contains headers,
heartbeats will be skipped to save tokens.

The agent reads this file every heartbeat interval (default: 30m).
If nothing needs attention, it replies with HEARTBEAT_OK.
If something needs attention, it describes the issue without the token.
-->

## Regular Checks

- [ ] Review any pending tasks in your workspace
- [ ] Check for blocked items needing human input
- [ ] Verify system status (if monitoring anything)

## Context-Aware

Only check these when relevant:
- [ ] Active sessions that haven't been updated recently
- [ ] Scheduled tasks or reminders
- [ ] Follow-ups from previous conversations

## Response Protocol

If nothing needs attention → reply: \`HEARTBEAT_OK\`
If something needs attention → brief alert message (no HEARTBEAT_OK token)
`;

      try {
        await fs.writeFile(filePath, template, "utf-8");
        ctx.ui.notify(`✅ Created ${filePath}`, "info");
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`❌ Failed to create file: ${errMsg}`, "error");
      }
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // HEALTH CHECK COMMAND (for VPS deployment)
  // ═══════════════════════════════════════════════════════════════

  pi.registerCommand("healthz", {
    description: "Health check endpoint for VPS/container monitoring",
    handler: async (_args, ctx) => {
      const uptime = process.uptime();
      const memory = process.memoryUsage();
      const now = new Date().toISOString();

      const status = {
        status: "healthy",
        timestamp: now,
        uptime: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        uptimeSeconds: Math.floor(uptime),
        version: process.env.npm_package_version || "0.0.3",
        extensions: {
          heartbeat: {
            enabled: config.enabled,
            interval: config.every,
            lastCheck: lastHeartbeat ? new Date(lastHeartbeat).toISOString() : null
          }
        },
        memory: {
          heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + " MB",
          heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + " MB",
          rss: Math.round(memory.rss / 1024 / 1024) + " MB"
        }
      };

      // Return JSON for programmatic access
      ctx.ui.notify(JSON.stringify(status, null, 2), "info");
    },
  });

  // Also register /health as alias
  pi.registerCommand("health", {
    description: "Health check (alias for /healthz)",
    handler: async (_args, ctx) => {
      // Forward to healthz
      const healthzCmd = (pi as any).getCommands?.()?.find((c: any) => c.name === "healthz");
      if (healthzCmd) {
        await healthzCmd.handler("", ctx);
      }
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTO-HEARTBEAT SCHEDULER
  // ═══════════════════════════════════════════════════════════════

  pi.on("session_start", async () => {
    await loadHeartbeatConfig();

    if (!config.enabled) {
      console.log("[Heartbeat] Disabled in config, not starting scheduler");
      return;
    }

    const everyMs = parseDurationMs(config.every);

    // Schedule periodic checks
    checkInterval = setInterval(async () => {
      if (!isWithinActiveHours(config)) {
        console.log("[Heartbeat] Skipped - outside active hours");
        return;
      }

      const workspaceDir = await findWorkspaceDir();
      const content = await readHeartbeatFile(workspaceDir);

      // Skip if no file or empty file
      if (content === null || isEffectivelyEmpty(content)) {
        return;
      }

      // Use the tool to trigger heartbeat
      pi.sendUserMessage("Perform a heartbeat check using the heartbeat_check tool.", { deliverAs: "followUp" });
    }, everyMs);

    console.log(`[Heartbeat] Scheduler started (every ${config.every})`);
  });

  pi.on("session_shutdown", async () => {
    if (checkInterval) {
      clearInterval(checkInterval);
      console.log("[Heartbeat] Scheduler stopped");
    }
  });

  console.log("[Heartbeat] Extension loaded");
}
