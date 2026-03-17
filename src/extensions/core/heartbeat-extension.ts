/**
 * Heartbeat Extension - OpenClaw-Compatible Periodic Agent Check-ins
 *
 * Runs periodic agent turns in the main session so the model can surface
 * anything that needs attention without spamming the user.
 *
 * OpenClaw-Compatible Configuration:
 * - Per-agent or global configuration
 * - Session isolation and light context options
 * - Delivery targets (last, none, specific channel)
 * - Active hours with timezone support
 * - Response contract (HEARTBEAT_OK token handling)
 *
 * Configuration in kobold.json or openclaw.json:
 * {
 *   "agents": {
 *     "defaults": {
 *       "heartbeat": {
 *         "every": "30m",
 *         "prompt": "Read HEARTBEAT.md...",
 *         "ackMaxChars": 300,
 *         "target": "none",
 *         "activeHours": { "start": "09:00", "end": "22:00", "timezone": "America/New_York" },
 *         "isolatedSession": false,
 *         "lightContext": false,
 *         "model": null,
 *         "includeReasoning": false,
 *         "suppressToolErrorWarnings": false
 *       }
 *     },
 *     "list": [
 *       {
 *         "id": "ops",
 *         "heartbeat": {
 *           "every": "1h",
 *           "target": "telegram",
 *           "to": "+15551234567"
 *         }
 *       }
 *     ]
 *   }
 * }
 *
 * Response Contract:
 * - If nothing needs attention, reply with "HEARTBEAT_OK"
 * - For alerts, do NOT include HEARTBEAT_OK
 * - HEARTBEAT_OK at start or end is stripped; reply dropped if remaining ≤ ackMaxChars
 *
 * For users: Edit HEARTBEAT.md in your workspace to customize checks.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, getConfigValue } from "../../config/loader.js";

// Get the directory of this module for template resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "heartbeat-template.md");

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const HEARTBEAT_TOKEN = "HEARTBEAT_OK";
const DEFAULT_EVERY = "30m";
const DEFAULT_ACK_MAX_CHARS = 300;
const HEARTBEAT_FILENAME = "HEARTBEAT.md";

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

interface ActiveHours {
  start: string; // "HH:MM" format, 24h
  end: string; // "HH:MM" format, 24h (24:00 allowed for end-of-day)
  timezone?: string; // IANA timezone identifier or "local"
}

interface HeartbeatConfig {
  enabled: boolean;
  every: string; // Duration string: "30m", "1h", "2h"
  prompt: string;
  ackMaxChars: number;
  target: "none" | "last" | string; // "none", "last", or channel ID
  to?: string; // Optional recipient override (e.g., phone number, chat ID)
  activeHours: ActiveHours | null;
  isolatedSession: boolean;
  lightContext: boolean;
  model?: string; // Optional model override
  includeReasoning: boolean;
  suppressToolErrorWarnings: boolean;
  directPolicy: "allow" | "block"; // Block DM delivery?
}

interface HeartbeatState {
  lastHeartbeat: string | null; // ISO timestamp
  lastDelivery: string | null; // ISO timestamp
  lastChannel: string | null; // Last channel used
  skippedCount: number;
  ackCount: number;
  alertCount: number;
}

// ════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

function getDefaultConfig(): HeartbeatConfig {
  return {
    enabled: true,
    every: DEFAULT_EVERY,
    prompt: `Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply ${HEARTBEAT_TOKEN}.`,
    ackMaxChars: DEFAULT_ACK_MAX_CHARS,
    target: "none",
    activeHours: null,
    isolatedSession: false,
    lightContext: false,
    includeReasoning: false,
    suppressToolErrorWarnings: false,
    directPolicy: "allow",
  };
}

function getDefaultState(): HeartbeatState {
  return {
    lastHeartbeat: null,
    lastDelivery: null,
    lastChannel: null,
    skippedCount: 0,
    ackCount: 0,
    alertCount: 0,
  };
}

/**
 * Parse duration string to milliseconds
 * Supports: "30m", "1h", "2h", "1h30m", "90s"
 */
function parseDurationMs(duration: string): number {
  const regex = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s?(?:(\d+)s?)?$/i;
  const match = duration.trim().match(regex);

  if (!match) {
    console.warn(`[Heartbeat] Invalid duration "${duration}", using default 30m`);
    return 30 * 60 * 1000;
  }

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Check if current time is within active hours
 */
function isWithinActiveHours(config: HeartbeatConfig): boolean {
  if (!config.activeHours) return true;

  const now = new Date();

  // Get timezone
  let tz: string;
  if (config.activeHours.timezone === "local") {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } else if (config.activeHours.timezone) {
    tz = config.activeHours.timezone;
  } else {
    // Try user timezone from config, fallback to local
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const timeStr = formatter.format(now);
    const [currentHour, currentMin] = timeStr.split(":").map(Number);
    const currentMinutes = currentHour * 60 + currentMin;

    const startMinutes = parseTimeToMinutes(config.activeHours.start);
    const endMinutes = parseTimeToMinutes(config.activeHours.end);

    // Handle wrap-around (e.g., 22:00 to 06:00)
    if (startMinutes === endMinutes) {
      // Zero-width window, always outside
      return false;
    }

    if (startMinutes > endMinutes) {
      // Wrap around midnight
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    // Invalid timezone, use local
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = parseTimeToMinutes(config.activeHours.start);
    const endMinutes = parseTimeToMinutes(config.activeHours.end);

    if (startMinutes === endMinutes) return false;
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}

/**
 * Find workspace directory containing HEARTBEAT.md
 */
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

/**
 * Read HEARTBEAT.md from workspace
 */
async function readHeartbeatFile(workspacePath: string): Promise<string | null> {
  try {
    const filePath = path.join(workspacePath, HEARTBEAT_FILENAME);
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch {
    return null;
  }
}

/**
 * Check if content is effectively empty (no actionable items)
 */
function isEffectivelyEmpty(content: string): boolean {
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#+\s/.test(trimmed)) continue; // Headers
    if (/^[-*+]\s*(\[[\sXx]\]\s*)?$/.test(trimmed)) continue; // Empty list items
    if (/^<!--.*-->$/.test(trimmed)) continue; // HTML comments
    if (/^\*\*.*\*\*$/.test(trimmed)) continue; // Bold standalone
    return false;
  }
  return true;
}

/**
 * Process HEARTBEAT_OK response contract
 * Returns { isAck, strippedContent }
 */
function processHeartbeatResponse(
  content: string,
  ackMaxChars: number
): { isAck: boolean; strippedContent: string; shouldDeliver: boolean } {
  const trimmed = content.trim();

  // Check for HEARTBEAT_OK at start or end
  const startsWithToken = trimmed.startsWith(HEARTBEAT_TOKEN);
  const endsWithToken = trimmed.endsWith(HEARTBEAT_TOKEN);

  if (!startsWithToken && !endsWithToken) {
    // Not an ack - this is an alert
    return { isAck: false, strippedContent: content, shouldDeliver: true };
  }

  // Strip the token
  let stripped = trimmed;
  if (startsWithToken) {
    stripped = stripped.slice(HEARTBEAT_TOKEN.length).trim();
  }
  if (endsWithToken && !startsWithToken) {
    stripped = stripped.slice(0, -HEARTBEAT_TOKEN.length).trim();
  }

  // Check remaining length
  const shouldDeliver = stripped.length > ackMaxChars;

  return {
    isAck: true,
    strippedContent: stripped,
    shouldDeliver,
  };
}

/**
 * Load heartbeat configuration from kobold.json
 */
async function loadHeartbeatConfig(): Promise<HeartbeatConfig> {
  const defaultConfig = getDefaultConfig();

  try {
    const snapshot = await loadConfig();
    const hbConfig = snapshot.config.agents?.defaults?.heartbeat;

    if (hbConfig) {
      return {
        enabled: hbConfig.enabled ?? defaultConfig.enabled,
        every: hbConfig.every ?? defaultConfig.every,
        prompt: hbConfig.prompt ?? defaultConfig.prompt,
        ackMaxChars: hbConfig.ackMaxChars ?? defaultConfig.ackMaxChars,
        target: hbConfig.target ?? defaultConfig.target,
        to: hbConfig.to,
        activeHours: hbConfig.activeHours ?? defaultConfig.activeHours,
        isolatedSession: hbConfig.isolatedSession ?? defaultConfig.isolatedSession,
        lightContext: hbConfig.lightContext ?? defaultConfig.lightContext,
        model: hbConfig.model,
        includeReasoning: hbConfig.includeReasoning ?? defaultConfig.includeReasoning,
        suppressToolErrorWarnings: hbConfig.suppressToolErrorWarnings ?? defaultConfig.suppressToolErrorWarnings,
        directPolicy: hbConfig.directPolicy ?? defaultConfig.directPolicy,
      };
    }
  } catch (err) {
    console.warn("[Heartbeat] Failed to load config, using defaults:", err);
  }

  return defaultConfig;
}

// ════════════════════════════════════════════════════════════════════════════
// EXTENSION
// ════════════════════════════════════════════════════════════════════════════

export default function heartbeatExtension(pi: ExtensionAPI) {
  const startTime = Date.now();
  let checkInterval: ReturnType<typeof setInterval> | null = null;
  let config: HeartbeatConfig = getDefaultConfig();
  let state: HeartbeatState = getDefaultState();
  let configLoaded = false;

  // ═══════════════════════════════════════════════════════════════
  // CONFIG LOADING
  // ═══════════════════════════════════════════════════════════════

  async function reloadConfig(): Promise<void> {
    config = await loadHeartbeatConfig();
    configLoaded = true;
  }

  // Load config on startup
  reloadConfig().then(() => {
    console.log(`[Heartbeat] Config loaded (enabled: ${config.enabled}, every: ${config.every})`);
  });

  pi.on("session_start", async () => {
    await reloadConfig();
    console.log(`[Heartbeat] Extension loaded (enabled: ${config.enabled}, every: ${config.every})`);
  });

  // ═══════════════════════════════════════════════════════════════
  // HEARTBEAT CHECK TOOL
  // ═══════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "heartbeat_check",
    label: "Heartbeat Check",
    description:
      "Perform a heartbeat check by reading HEARTBEAT.md. Returns the content for review. Reply with HEARTBEAT_OK if nothing needs attention, or describe the issue.",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "Force a check even if recently performed",
        },
        agent: {
          type: "string",
          description: "Agent ID to check (for per-agent configs)",
        },
      },
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { force, agent } = params as { force?: boolean; agent?: string };
      const now = Date.now();
      const everyMs = parseDurationMs(config.every);

      // Check active hours
      if (!isWithinActiveHours(config)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Heartbeat skipped - outside active hours (${config.activeHours?.start} - ${config.activeHours?.end}). Reply ${HEARTBEAT_TOKEN} to acknowledge.`,
            },
          ],
          details: { skipped: true, reason: "outside_active_hours", activeHours: config.activeHours },
        };
      }

      // Check if too soon (unless forced)
      if (!force && state.lastHeartbeat && now - new Date(state.lastHeartbeat).getTime() < everyMs) {
        const nextCheck = new Date(new Date(state.lastHeartbeat).getTime() + everyMs);
        return {
          content: [
            {
              type: "text" as const,
              text: `Heartbeat skipped - next check at ${nextCheck.toLocaleTimeString()}. Reply ${HEARTBEAT_TOKEN} to acknowledge.`,
            },
          ],
          details: { skipped: true, reason: "too_soon", nextCheck: nextCheck.toISOString() },
        };
      }

      // Find and read HEARTBEAT.md
      const workspaceDir = await findWorkspaceDir();
      const heartbeatContent = await readHeartbeatFile(workspaceDir);

      if (heartbeatContent === null) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No HEARTBEAT.md found in workspace. Reply ${HEARTBEAT_TOKEN} to acknowledge, or create the file to enable heartbeat checks.`,
            },
          ],
          details: { fileExists: false, workspaceDir },
        };
      }

      if (isEffectivelyEmpty(heartbeatContent)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `HEARTBEAT.md is effectively empty (no actionable items). Reply ${HEARTBEAT_TOKEN} to acknowledge.`,
            },
          ],
          details: { fileExists: true, isEmpty: true },
        };
      }

      // Update state
      state.lastHeartbeat = new Date().toISOString();

      // Build response with config context
      const responseLines = [
        `HEARTBEAT.md content:`,
        "",
        heartbeatContent,
        "",
        "---",
        `Check interval: ${config.every}`,
        config.activeHours ? `Active hours: ${config.activeHours.start} - ${config.activeHours.end}` : null,
        `Delivery target: ${config.target}`,
        "",
        `Review the checklist above. If nothing needs attention, reply with "${HEARTBEAT_TOKEN}". Otherwise, describe what needs attention.`,
      ].filter(Boolean);

      return {
        content: [
          {
            type: "text" as const,
            text: responseLines.join("\n"),
          },
        ],
        details: {
          fileExists: true,
          isEmpty: false,
          config: {
            every: config.every,
            target: config.target,
            activeHours: config.activeHours,
          },
        },
      };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // HEARTBEAT STATUS COMMAND
  // ═══════════════════════════════════════════════════════════════

  pi.registerCommand("heartbeat", {
    description: "Show heartbeat status or trigger manual check",
    handler: async (args, ctx) => {
      await reloadConfig();

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

      // Show status
      const lines = [
        "❤️ Heartbeat Configuration",
        `Enabled: ${config.enabled ? "✅" : "❌"}`,
        `Interval: ${config.every}`,
        `Ack Max Chars: ${config.ackMaxChars}`,
        `Target: ${config.target}`,
        `Isolated Session: ${config.isolatedSession}`,
        `Light Context: ${config.lightContext}`,
      ];

      if (config.activeHours) {
        lines.push(`Active Hours: ${config.activeHours.start} - ${config.activeHours.end}`);
        if (config.activeHours.timezone) {
          lines.push(`Timezone: ${config.activeHours.timezone}`);
        }
      }

      if (config.model) {
        lines.push(`Model Override: ${config.model}`);
      }

      const workspaceDir = await findWorkspaceDir();
      const hbExists = await fs
        .access(path.join(workspaceDir, HEARTBEAT_FILENAME))
        .then(() => true)
        .catch(() => false);
      lines.push(`HEARTBEAT.md: ${hbExists ? "✅ Found" : "⚠️ Not found"}`);

      // State
      lines.push("");
      lines.push("📊 State:");
      lines.push(`Last Check: ${state.lastHeartbeat || "Never"}`);
      lines.push(`Acknowledged: ${state.ackCount}`);
      lines.push(`Alerts: ${state.alertCount}`);
      lines.push(`Skipped: ${state.skippedCount}`);

      lines.push("", "Usage:", "  /heartbeat now - Run check immediately", "  /heartbeat-init - Create HEARTBEAT.md");

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // HEARTBEAT INIT COMMAND
  // ═══════════════════════════════════════════════════════════════

  pi.registerCommand("heartbeat-init", {
    description: "Create HEARTBEAT.md template in workspace",
    handler: async (_args, ctx) => {
      const workspaceDir = await findWorkspaceDir();
      const filePath = path.join(workspaceDir, HEARTBEAT_FILENAME);

      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        ctx.ui.notify(`HEARTBEAT.md already exists at ${filePath}`, "warning");
        return;
      }

      // Try to read the template file, fallback to embedded template
      let template: string;
      try {
        template = await fs.readFile(TEMPLATE_PATH, "utf-8");
      } catch {
        // Fallback to minimal template
        template = `# Heartbeat Checklist

## Response Protocol

Reply with HEARTBEAT_OK if nothing needs attention.

---

## Regular Checks

- [ ] Pending tasks needing human input
- [ ] Blocked items
- [ ] System status alerts

## Context-Aware Checks

Only when relevant:
- [ ] Scheduled tasks/reminders
- [ ] Social platform notifications
- [ ] Monitoring alerts

---

HEARTBEAT_OK
`;
      }

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
  // PER-AGENT HEARTBEAT CONFIG
  // ═══════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "heartbeat_config",
    label: "Heartbeat Config",
    description:
      "Get or update heartbeat configuration. Use this to check current settings or modify behavior per agent.",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get", "set"],
          description: "Get current config or update settings",
        },
        setting: {
          type: "object",
          description: "Settings to update (for set action)",
        },
      },
    },
    async execute(_toolCallId, params) {
      const { action, setting } = params as { action?: string; setting?: Record<string, unknown> };

      if (action === "set" && setting) {
        // Merge new settings
        config = { ...config, ...setting };
        return {
          content: [
            {
              type: "text" as const,
              text: `Heartbeat config updated:\n${JSON.stringify(config, null, 2)}`,
            },
          ],
          details: { config },
        };
      }

      // Get current config
      return {
        content: [
          {
            type: "text" as const,
            text: `Current heartbeat configuration:\n${JSON.stringify(config, null, 2)}`,
          },
        ],
        details: { config, state },
      };
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
        heartbeat: {
          enabled: config.enabled,
          interval: config.every,
          lastCheck: state.lastHeartbeat,
          activeHours: config.activeHours,
          currentlyActive: isWithinActiveHours(config),
        },
        memory: {
          heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
          rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
        },
        stats: {
          acknowledged: state.ackCount,
          alerts: state.alertCount,
          skipped: state.skippedCount,
        },
      };

      ctx.ui.notify(JSON.stringify(status, null, 2), "info");
    },
  });

  pi.registerCommand("health", {
    description: "Health check (alias for /healthz)",
    handler: async (_args, ctx) => {
      // Forward to healthz
      const cmds = (pi as any).getCommands?.() || [];
      const healthz = cmds.find((c: any) => c.name === "healthz");
      if (healthz) {
        await healthz.handler("", ctx);
      }
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTO-HEARTBEAT SCHEDULER
  // ═══════════════════════════════════════════════════════════════

  pi.on("session_start", async () => {
    await reloadConfig();

    if (!config.enabled) {
      console.log("[Heartbeat] Disabled in config, not starting scheduler");
      return;
    }

    const everyMs = parseDurationMs(config.every);

    // Clear any existing interval
    if (checkInterval) {
      clearInterval(checkInterval);
    }

    // Schedule periodic checks
    checkInterval = setInterval(async () => {
      if (!isWithinActiveHours(config)) {
        console.log("[Heartbeat] Skipped - outside active hours");
        state.skippedCount++;
        return;
      }

      const workspaceDir = await findWorkspaceDir();
      const content = await readHeartbeatFile(workspaceDir);

      // Skip if no file or empty file
      if (content === null || isEffectivelyEmpty(content)) {
        console.log("[Heartbeat] Skipped - no or empty HEARTBEAT.md");
        return;
      }

      // Trigger heartbeat via user message
      pi.sendUserMessage(config.prompt, { deliverAs: "followUp" });
    }, everyMs);

    console.log(`[Heartbeat] Scheduler started (every ${config.every})`);
  });

  pi.on("session_shutdown", async () => {
    if (checkInterval) {
      clearInterval(checkInterval);
      console.log("[Heartbeat] Scheduler stopped");
    }
  });

  console.log("[Heartbeat] Extension loaded (OpenClaw-compatible)");
}