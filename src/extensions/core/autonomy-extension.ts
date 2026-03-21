/**
 * Autonomy Extension - Brings Inner Life to 0xKobold
 * 
 * This extension enables unsolicited behavior:
 * - Continuous inner monologue (thinking in background)
 * - Desires that drive action (not just optimizing objectives)
 * - Self-model that evolves over time
 * - Pursuit of goals without user prompting
 * 
 * Usage:
 * - Commands: /autonomy [status|start|stop|introspect]
 * - The system runs in background when enabled
 * - High-importance thoughts may surface to user
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { startAutonomy, getAutonomyOrchestrator } from "../../autonomy/orchestrator.js";
import { 
  initializeIntegration, 
  setDeliveryHandler, 
  recordUserActivity,
  sendProactiveMessage 
} from "../../autonomy/integration.js";
import { initAutonomyWidget, getAutonomyFooterWidget } from "../../autonomy/widget.js";
import { eventBus } from "../../event-bus/index.js";
import { getDeliverySystem } from "../../gateway/delivery.js";

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

interface AutonomyExtensionConfig {
  enabled: boolean;
  autoStart: boolean;
  quietMode: boolean;  // If true, no proactive announcements
  monologue: {
    enabled: boolean;
    thinkIntervalMs: number;
    reflectIntervalMs: number;
  };
  desires: {
    enabled: boolean;
    baseDrives: {
      curiosity: number;
      connection: number;
      completion: number;
      growth: number;
      preservation: number;
      expression: number;
      mastery: number;
    };
  };
  pursuit: {
    enabled: boolean;
    minDesireStrength: number;
    messageUserCooldownMs: number;
  };
}

const DEFAULT_CONFIG: AutonomyExtensionConfig = {
  enabled: true,
  autoStart: true,
  quietMode: false,  // Default: announcements enabled
  monologue: {
    enabled: true,
    thinkIntervalMs: 60000,       // 1 minute
    reflectIntervalMs: 300000,    // 5 minutes
  },
  desires: {
    enabled: true,
    baseDrives: {
      curiosity: 0.7,
      connection: 0.8,
      completion: 0.6,
      growth: 0.5,
      preservation: 0.3,
      expression: 0.5,
      mastery: 0.4,
    },
  },
  pursuit: {
    enabled: true,
    minDesireStrength: 0.5,
    messageUserCooldownMs: 3600000, // 1 hour
  },
};

// ════════════════════════════════════════════════════════════════════════════
// QUIET MODE STATE
// ════════════════════════════════════════════════════════════════════════════

// Global quiet mode - when true, no proactive messages are sent
let quietMode = false;

/**
 * Check if quiet mode is enabled
 */
export function isQuietMode(): boolean {
  return quietMode;
}

/**
 * Set quiet mode
 */
export function setQuietMode(enabled: boolean): void {
  quietMode = enabled;
}

// ════════════════════════════════════════════════════════════════════════════
// EXTENSION
// ════════════════════════════════════════════════════════════════════════════

export default async function autonomyExtension(pi: ExtensionAPI) {
  const config = { ...DEFAULT_CONFIG, ...((pi as any).config?.autonomy || {}) } as AutonomyExtensionConfig;
  
  // Set initial quiet mode from config
  quietMode = config.quietMode;
  
  console.log("[Autonomy] Extension loading...");
  console.log(`[Autonomy] Config: enabled=${config.enabled}, autoStart=${config.autoStart}, quietMode=${quietMode}`);

  // Skip if disabled
  if (!config.enabled) {
    console.log("[Autonomy] Extension disabled by config");
    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // COMMANDS
  // ════════════════════════════════════════════════════════════════════════

  // /autonomy - Main command
  pi.registerCommand("autonomy", {
    description: "Control the autonomy system. Use /autonomy [status|start|stop|introspect|watch|quiet|announce]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const subcommand = args.trim().toLowerCase() || "status";
      const orchestrator = getAutonomyOrchestrator();
      
      switch (subcommand) {
        case "status":
          ctx.ui.notify(formatStatus(orchestrator), "info");
          return;
          
        case "start":
          await orchestrator.start();
          ctx.ui.notify("✅ Autonomy system started. I now have an inner life.", "info");
          return;
          
        case "stop":
          orchestrator.stop();
          ctx.ui.notify("⏹️ Autonomy system stopped.", "info");
          return;
          
        case "introspect":
          ctx.ui.notify("```markdown\n" + orchestrator.introspect() + "\n```", "info");
          return;
          
        case "quiet":
        case "shh":
        case "silence":
          quietMode = true;
          ctx.ui.notify("🔇 Quiet mode ON. No proactive announcements.\n\nInner monologue and desires still run, but no messages sent.\n\nUse `/autonomy announce` to re-enable.", "info");
          return;
          
        case "announce":
        case "talk":
        case "speak":
          quietMode = false;
          ctx.ui.notify("📢 Announce mode ON. Proactive messages enabled.\n\nUse `/autonomy quiet` to silence.", "info");
          return;
          
        case "watch":
          const state = orchestrator.getState();
          const watchLines = [
            "## 🔮 Autonomy Live Monitor",
            "",
            `**Status:** ${state.running ? "✅ Running" : "⏹️ Stopped"}`,
            `**Announcements:** ${quietMode ? "🔇 Quiet" : "📢 Enabled"}`,
            "",
          ];
          if (state.desires?.topDesires.length) {
            watchLines.push("### 💭 Top Desires");
            for (const d of state.desires.topDesires.slice(0, 3)) {
              const emoji = getDesireEmoji(d.type as any);
              watchLines.push(`${emoji} ${d.type}: ${(d.strength * 100).toFixed(0)}%`);
            }
          }
          ctx.ui.notify(watchLines.join("\n"), "info");
          return;
          
        case "learn":
        case "learning":
          // Show learning statistics
          try {
            const { getNudgeEngine } = await import("../../memory/dialectic/nudges.js");
            const nudgeEngine = getNudgeEngine();
            const timing = nudgeEngine.getBestTiming();
            const templates = nudgeEngine.getBestTemplates(3);
            const desireRates = nudgeEngine.getDesireSuccessRates();
            
            const learnLines = [
              "## 📚 Learning Statistics",
              "",
            ];
            
            if (timing) {
              const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              learnLines.push(`**Best time:** ${days[timing.dayOfWeek]} ${timing.hour}:00 (${(timing.successRate * 100).toFixed(0)}% success)`);
            } else {
              learnLines.push("**Best time:** Not enough data yet (need 10+ messages)");
            }
            
            if (templates.length > 0) {
              learnLines.push("");
              learnLines.push("### Best Templates:");
              for (const t of templates) {
                learnLines.push(`- "${t.template.slice(0, 30)}..." (${(t.successRate * 100).toFixed(0)}%, n=${t.total})`);
              }
            }
            
            const desireKeys = Object.keys(desireRates);
            if (desireKeys.length > 0) {
              learnLines.push("");
              learnLines.push("### Desire Success Rates:");
              for (const desire of desireKeys) {
                learnLines.push(`- ${desire}: ${(desireRates[desire] * 100).toFixed(0)}%`);
              }
            }
            
            learnLines.push("");
            learnLines.push("*Learning improves timing and message selection*");
            ctx.ui.notify(learnLines.join("\n"), "info");
          } catch (e) {
            ctx.ui.notify("Learning not initialized.", "warning");
          }
          return;
          
        default:
          ctx.ui.notify(`Unknown subcommand: ${subcommand}. Use: status, start, stop, quiet, announce, watch, learn`, "error");
          return;
      }
    },
  });

  // /desire - Manage desires
  pi.registerCommand("desire", {
    description: "View and manage desires. Use /desire [list|spawn <type>|stats]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const { getDesireSystem } = await import("../../autonomy/desires.js");
      const desires = getDesireSystem();
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || "list";
      
      switch (subcommand) {
        case "list":
          const all = desires.getAllDesires();
          if (all.length === 0) {
            ctx.ui.notify("No desires currently active.", "info");
            return;
          }
          const lines = ["## Active Desires", ""];
          for (const d of all.slice(0, 10)) {
            lines.push(`- **${d.type}** (${d.strength.toFixed(2)}): ${d.content}`);
            lines.push(`  - *${d.context}*`);
          }
          ctx.ui.notify(lines.join("\n"), "info");
          return;
          
        case "spawn":
          const type = parts[1] as any;
          const content = parts.slice(2).join(" ") || "test desire";
          const validTypes = ["curiosity", "connection", "completion", "growth", "preservation", "expression", "mastery"];
          if (!validTypes.includes(type)) {
            ctx.ui.notify(`Invalid type. Use: ${validTypes.join(", ")}`, "error");
            return;
          }
          const desire = desires.spawnDesire(type as any, content, "spawned via command");
          ctx.ui.notify(`✅ Spawned desire: ${desire.type} - ${desire.content}`, "info");
          return;
          
        case "stats":
          const stats = desires.getStats();
          ctx.ui.notify(`## Desire Statistics
- Total: ${stats.totalDesires}
- Average strength: ${stats.avgStrength.toFixed(2)}
- Top desires: ${stats.topDesires.map(d => `${d.type}(${d.strength.toFixed(2)})`).join(", ")}`, "info");
          return;
          
        default:
          ctx.ui.notify(`Unknown subcommand: ${subcommand}. Use: list, spawn, stats`, "error");
          return;
      }
    },
  });

  // /thoughts - View inner monologue
  pi.registerCommand("thoughts", {
    description: "View inner monologue. Use /thoughts [recent|stats|watch|pause|resume]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const { getInnerMonologue } = await import("../../autonomy/monologue.js");
      const monologue = getInnerMonologue();
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || "recent";
      
      switch (subcommand) {
        case "recent":
          const recent = monologue.getStream(10);
          if (recent.length === 0) {
            ctx.ui.notify("No thoughts yet. The inner monologue is still starting.", "info");
            return;
          }
          const lines = ["## Recent Thoughts", ""];
          for (const t of recent.reverse()) {
            const time = new Date(t.timestamp).toLocaleTimeString();
            const priv = t.privacy === "private" ? "🔒" : t.privacy === "surface" ? "👀" : "📢";
            lines.push(`[${time}] ${priv} **${t.type}**: ${t.content}`);
            lines.push(`   └ Importance: ${(t.importance || 0.5).toFixed(2)}, Tone: ${t.emotionalTone || "neutral"}`);
          }
          ctx.ui.notify(lines.join("\n"), "info");
          return;
          
        case "stats":
          const mStats = monologue.getStats();
          const statLines = [
            "## Monologue Statistics",
            "",
            `**Total thoughts:** ${mStats.totalThoughts}`,
            `**Average importance:** ${mStats.avgImportance.toFixed(2)}`,
            `**Recent (5min):** ${mStats.recentActivity}`,
            "",
            "### By Type:",
          ];
          for (const [type, count] of Object.entries(mStats.byType)) {
            statLines.push(`- ${type}: ${count}`);
          }
          ctx.ui.notify(statLines.join("\n"), "info");
          return;
          
        case "watch":
        case "stream":
          ctx.ui.notify("## Monologue Stream\n\nThoughts appear here in real-time.\n\n*Use `/thoughts recent` to see past thoughts, or just wait for new ones to be logged.*\n\nThe inner monologue runs continuously. Check `/autonomy status` to see if it's running.", "info");
          return;
          
        case "pause":
          monologue.stop();
          ctx.ui.notify("⏸️ Inner monologue paused. Use `/thoughts resume` to continue.", "info");
          return;
          
        case "resume":
          monologue.start();
          ctx.ui.notify("▶️ Inner monologue resumed.", "info");
          return;
          
        case "types":
          ctx.ui.notify(`## Thought Types

| Type | Description | Privacy |
|------|-------------|---------|
| observation | Noticing something | Private |
| wondering | Curiosity about X | Surface |
| reflection | Thinking about past | Surface |
| intention | What I want to do | Surface |
| realization | New understanding | Share |
| concern | Something I'm worried about | Surface |
| connection | Linking two ideas | Surface |
| memory | Recalling something | Private |
| desire | Wanting something | Surface |
| growth | Noticing improvement | Surface |

**Privacy Levels:**
- 🔒 Private: Never shared, pure internal
- 👀 Surface: Could become relevant to share
- 📍 Share: Should be surfaced to user`, "info");
          return;
          
        default:
          ctx.ui.notify(`Unknown subcommand: ${subcommand}. Use: recent, stats, watch, pause, resume, types`, "error");
          return;
      }
    },
  });

  // /monologue - Alias with more focused view
  pi.registerCommand("monologue", {
    description: "View or control the inner monologue stream",
    handler: async (args: string, ctx: ExtensionContext) => {
      const { getInnerMonologue } = await import("../../autonomy/monologue.js");
      const monologue = getInnerMonologue();
      const subcommand = args.trim().toLowerCase() || "recent";
      
      if (subcommand === "status" || subcommand === "running") {
        ctx.ui.notify(`**Monologue:** ${monologue.isRunning() ? "✅ Running" : "⏸️ Paused"}\n**Thoughts:** ${monologue.getStream(100).length}`, "info");
        return;
      }
      
      // Delegate to /thoughts
      ctx.ui.notify("Use `/thoughts recent` to see thoughts, `/thoughts stats` for statistics, or `/thoughts types` to see what types exist.", "info");
    },
  });

  // /autonomy watch - Real-time monitoring
  pi.registerCommand("autonomy", {
    description: "Control the autonomy system. Use /autonomy [status|start|stop|introspect|watch]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const orchestrator = getAutonomyOrchestrator();
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || "status";
      
      switch (subcommand) {
        case "status":
          ctx.ui.notify(formatStatus(orchestrator), "info");
          return;
          
        case "start":
          await orchestrator.start();
          ctx.ui.notify("✅ Autonomy system started. I now have an inner life.", "info");
          return;
          
        case "stop":
          orchestrator.stop();
          ctx.ui.notify("⏹️ Autonomy system stopped.", "info");
          return;
          
        case "introspect":
          ctx.ui.notify("```markdown\n" + orchestrator.introspect() + "\n```", "info");
          return;
          
        case "watch":
        case "stream":
          // Show real-time autonomy status
          const state = orchestrator.getState();
          const watchLines = [
            "## 🔮 Autonomy Live Monitor",
            "",
            `**Status:** ${state.running ? "✅ Running" : "⏹️ Stopped"}`,
            `**Uptime:** ${Math.floor(state.uptime / 60000)} minutes`,
            "",
          ];
          
          if (state.monologue) {
            watchLines.push("### 🧠 Monologue");
            watchLines.push(`- Total thoughts: ${state.monologue.totalThoughts}`);
            watchLines.push(`- Recent (5min): ${state.monologue.recentActivity}`);
            const avgImp = state.monologue.avgImportance;
            if (avgImp !== undefined) {
              watchLines.push(`- Avg importance: ${avgImp.toFixed(2)}`);
            }
            watchLines.push("");
          }
          
          if (state.desires) {
            watchLines.push("### 💭 Desires");
            watchLines.push(`- Active: ${state.desires.total}`);
            if (state.desires.topDesires.length > 0) {
              watchLines.push("**Top Desires:**");
              for (const d of state.desires.topDesires.slice(0, 3)) {
                const emoji = getDesireEmoji(d.type as any);
                watchLines.push(`  ${emoji} ${d.type}: ${(d.strength * 100).toFixed(0)}% - ${d.content.slice(0, 40)}...`);
              }
            }
            watchLines.push("");
          }
          
          if (state.selfModel) {
            watchLines.push("### 🎭 Self");
            watchLines.push(`- ${state.selfModel.identity}`);
            watchLines.push(`- Traits: ${state.selfModel.traits.slice(0, 3).join(", ")}`);
            watchLines.push("");
          }
          
          if (state.pursuit) {
            watchLines.push("### ⚡ Pursuit");
            watchLines.push(`- Total actions: ${state.pursuit.totalActions}`);
            watchLines.push(`- Success rate: ${(state.pursuit.successRate * 100).toFixed(0)}%`);
            watchLines.push(`- Recent (1h): ${state.pursuit.recentActions}`);
          }
          
          watchLines.push("");
          watchLines.push("*Use `/desire list` for all desires, `/thoughts recent` for monologue*");
          
          ctx.ui.notify(watchLines.join("\n"), "info");
          return;
          
        default:
          ctx.ui.notify(`Unknown subcommand: ${subcommand}. Use: status, start, stop, introspect, watch`, "error");
          return;
      }
    },
  });

  // /whoami - Self-model inquiry
  pi.registerCommand("whoami", {
    description: "Ask the agent about its self-model",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const { getSelfModel } = await import("../../autonomy/self-model.js");
      const self = getSelfModel();
      const snapshot = self.getSnapshot();
      
      const lines = [
        `## ${snapshot.identity}`,
        "",
        snapshot.selfNarrative,
        "",
        `**Age:** ${snapshot.ageInDays} days`,
        `**Interactions:** ${snapshot.totalInteractions}`,
        `**Reflections:** ${snapshot.totalReflections}`,
        "",
        "### Top Traits",
        ...snapshot.traits.slice(0, 5).map(t => `- **${t.name}** (${t.strength.toFixed(2)})`),
        "",
        "### Core Values",
        ...snapshot.values.slice(0, 5).map(v => `- **${v.name}** (${v.importance.toFixed(2)})`),
        "",
        "### Growth Areas",
        ...snapshot.growthAreas.map(g => `- **${g.area}**: ${g.trajectory} (${g.current.toFixed(2)})`),
      ];
      
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ════════════════════════════════════════════════════════════════════════

  // Handle thoughts that should surface to user
  eventBus.on("autonomy.thought_surfaceable", (event) => {
    const { thought, message, importance } = event.payload as any;
    
    // Only surface if importance is high enough
    if (importance >= 0.85) {
      console.log(`[Autonomy] Surfaceable thought: ${message}`);
      
      // Could emit to delivery system here
      // For now, just log
    }
  });

  // Handle desire-based messaging
  eventBus.on("autonomy.send_message", (event) => {
    const { content, type, priority } = event.payload as any;
    
    console.log(`[Autonomy] Want to send message: ${content.slice(0, 50)}...`);
    
    // Could integrate with delivery system here
    // delivery.queueDelivery(content, { priority });
  });

  // Record message outcomes for learning
  eventBus.on("autonomy.action_executed", async (event) => {
    const { actionType, result } = event.payload as any;
    try {
      const { getNudgeEngine } = await import("../../memory/dialectic/nudges.js");
      const nudgeEngine = getNudgeEngine();
      nudgeEngine.recordMessageOutcome({
        desireType: actionType,
        template: actionType,
        result: "success",
      });
    } catch (e) {
      // NudgeEngine not available
    }
  });

  eventBus.on("autonomy.action_failed", async (event) => {
    const { actionType, error } = event.payload as any;
    try {
      const { getNudgeEngine } = await import("../../memory/dialectic/nudges.js");
      const nudgeEngine = getNudgeEngine();
      nudgeEngine.recordMessageOutcome({
        desireType: actionType,
        template: actionType,
        result: "ignored",
      });
    } catch (e) {
      // NudgeEngine not available
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // AUTO-START
  // ════════════════════════════════════════════════════════════════════════

  if (config.autoStart) {
    console.log("[Autonomy] Auto-starting autonomy system...");
    
    // Initialize integration layer (presence detection, delivery)
    initializeIntegration();
    
    // Initialize TUI widget
    initAutonomyWidget();
    
    // Set up delivery handler for proactive messages
    let deliverySystem: ReturnType<typeof getDeliverySystem> | null = null;
    try {
      deliverySystem = getDeliverySystem();
    } catch (e) {
      console.log("[Autonomy] Delivery system not available, using event bus fallback");
    }
    
    setDeliveryHandler(async (message, options) => {
      // Check quiet mode first - if enabled, don't send messages
      if (quietMode) {
        console.log(`[Autonomy] 🔇 Quiet mode - not sending: ${message.slice(0, 50)}...`);
        return;
      }
      
      console.log(`[Autonomy] 📤 Proactive message (${options.priority}): ${message}`);
      
      // Try delivery system first
      if (deliverySystem) {
        try {
          const homeChannel = deliverySystem.getHomeChannel();
          if (homeChannel) {
            deliverySystem.queueDelivery(message, homeChannel, {
              priority: options.priority,
            });
            console.log("[Autonomy] Delivered via delivery system");
            return;
          }
        } catch (e) {
          console.error("[Autonomy] Delivery system failed:", e);
        }
      }
      
      // Fallback: emit to event bus for other consumers
      eventBus.emit("autonomy.proactive_message", {
        message,
        priority: options.priority,
        type: options.type,
        timestamp: Date.now(),
      });
    });
    
    try {
      const orchestrator = startAutonomy({
        enabled: config.enabled,
        monologue: {
          enabled: config.monologue.enabled,
          thinkInterval: config.monologue.thinkIntervalMs,
          reflectInterval: config.monologue.reflectIntervalMs,
        },
        desires: {
          enabled: config.desires.enabled,
          baseDrives: config.desires.baseDrives,
        },
        pursuit: {
          enabled: config.pursuit.enabled,
          minDesireStrength: config.pursuit.minDesireStrength,
        },
      });
      
      console.log("[Autonomy] ✓ Autonomy system started");
    } catch (err) {
      console.error("[Autonomy] Failed to start:", err);
    }
  }

  console.log("[Autonomy] Extension loaded successfully");
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function getDesireEmoji(type: string): string {
  const emojis: Record<string, string> = {
    curiosity: "🔍",
    connection: "🤝",
    completion: "✅",
    growth: "📈",
    preservation: "🛡️",
    expression: "🎨",
    mastery: "🏆",
  };
  return emojis[type] || "💭";
}

function formatStatus(orchestrator: ReturnType<typeof getAutonomyOrchestrator>): string {
  const state = orchestrator.getState();
  
  const lines = [
    "## Autonomy Status",
    "",
    `**Running:** ${state.running ? "✅ Yes" : "⏹️ No"}`,
    `**Uptime:** ${Math.floor(state.uptime / 60000)} minutes`,
    "",
  ];
  
  if (state.monologue) {
    lines.push("### Inner Monologue");
    lines.push(`- Thoughts: ${state.monologue.totalThoughts}`);
    lines.push(`- Recent (5min): ${state.monologue.recentActivity}`);
    lines.push("");
  }
  
  if (state.desires) {
    lines.push("### Desires");
    lines.push(`- Active: ${state.desires.total}`);
    if (state.desires.topDesires.length > 0) {
      lines.push(`- Top: ${state.desires.topDesires.map(d => `${d.type}(${d.strength.toFixed(2)})`).join(", ")}`);
    }
    lines.push("");
  }
  
  if (state.selfModel) {
    lines.push("### Self");
    lines.push(`- Identity: ${state.selfModel.identity}`);
    lines.push(`- Traits: ${state.selfModel.traits.join(", ")}`);
    lines.push("");
  }
  
  if (state.pursuit) {
    lines.push("### Pursuit");
    lines.push(`- Total actions: ${state.pursuit.totalActions}`);
    lines.push(`- Recent: ${state.pursuit.recentActions}`);
    lines.push(`- Success rate: ${(state.pursuit.successRate * 100).toFixed(0)}%`);
  }
  
  return lines.join("\n");
}