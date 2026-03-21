/**
 * Autonomy Orchestrator - Central Coordination Point
 * 
 * Brings together all autonomy components:
 * - Inner Monologue (continuous thought)
 * - Desire System (intrinsic wants)
 * - Self-Model (evolving identity)
 * - Pursuit Engine (unsolicited action)
 * 
 * This is the "brain" that creates agency.
 */

import { eventBus } from "../event-bus/index.js";
import { getInnerMonologue, startInnerMonologue, type MonologueConfig } from "./monologue.js";
import { getDesireSystem, type DesireConfig } from "./desires.js";
import { getSelfModel } from "./self-model.js";
import { getPursuitEngine, type PursuitConfig } from "./pursuit.js";

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export interface AutonomyConfig {
  enabled: boolean;
  
  // Monologue config
  monologue: {
    enabled: boolean;
    thinkInterval: number;
    reflectInterval: number;
  };
  
  // Desire config
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
  
  // Pursuit config
  pursuit: {
    enabled: boolean;
    minDesireStrength: number;
  };
}

const DEFAULT_CONFIG: AutonomyConfig = {
  enabled: true,
  monologue: {
    enabled: true,
    thinkInterval: 60000,      // 1 minute
    reflectInterval: 300000,   // 5 minutes
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
  },
};

// ════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ════════════════════════════════════════════════════════════════════════════

class AutonomyOrchestrator {
  private config: AutonomyConfig;
  
  private monologue: ReturnType<typeof getInnerMonologue> | null = null;
  private desires: ReturnType<typeof getDesireSystem> | null = null;
  private selfModel: ReturnType<typeof getSelfModel> | null = null;
  private pursuit: ReturnType<typeof getPursuitEngine> | null = null;
  
  private running = false;
  private startedAt: Date | null = null;

  constructor(config: Partial<AutonomyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * START AUTONOMY
   * 
   * This activates all the components that create agency.
   * Once started, the system has an inner life independent of user input.
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log("[Autonomy] Already running");
      return;
    }
    
    console.log("[Autonomy] Starting autonomy system...");
    
    // Initialize components
    this.selfModel = getSelfModel();
    this.desires = getDesireSystem({
      enabled: this.config.desires.enabled,
      baseDrives: this.config.desires.baseDrives,
    });
    
    // Start inner monologue
    if (this.config.monologue.enabled) {
      this.monologue = startInnerMonologue({
        enabled: true,
        thinkInterval: this.config.monologue.thinkInterval,
        reflectInterval: this.config.monologue.reflectInterval,
      });
    }
    
    // Start pursuit engine
    if (this.config.pursuit.enabled) {
      this.pursuit = getPursuitEngine({
        enabled: true,
        minDesireStrength: this.config.pursuit.minDesireStrength,
      });
      await this.pursuit.start();
    }
    
    // Set up event routing
    this.setupEventRouting();
    
    this.running = true;
    this.startedAt = new Date();
    
    console.log("[Autonomy] ✓ Autonomy system started");
    console.log(`[Autonomy]   - Monologue: ${this.monologue?.isRunning() ? 'running' : 'disabled'}`);
    console.log(`[Autonomy]   - Desires: ${this.desires ? 'active' : 'disabled'}`);
    console.log(`[Autonomy]   - Self-Model: ${this.selfModel ? 'loaded' : 'disabled'}`);
    console.log(`[Autonomy]   - Pursuit: ${this.pursuit ? 'active' : 'disabled'}`);
    
    // Log initial state
    const identity = this.selfModel.whoAmI();
    console.log(`[Autonomy]   - Identity: ${identity}`);
    
    const desireStats = this.desires.getStats();
    console.log(`[Autonomy]   - Active desires: ${desireStats.totalDesires}`);
    
    // Emit startup event
    eventBus.emit("autonomy.started", {
      timestamp: Date.now(),
      config: this.config,
      identity,
      desireCount: desireStats.totalDesires,
    });
  }

  /**
   * STOP AUTONOMY
   */
  stop(): void {
    if (!this.running) return;
    
    console.log("[Autonomy] Stopping autonomy system...");
    
    if (this.monologue) {
      this.monologue.stop();
      this.monologue = null;
    }
    
    if (this.pursuit) {
      this.pursuit.stop();
      this.pursuit = null;
    }
    
    this.running = false;
    
    eventBus.emit("autonomy.stopped", {
      timestamp: Date.now(),
      uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
    });
    
    console.log("[Autonomy] Stopped");
  }

  /**
   * Set up event routing between components
   */
  private setupEventRouting(): void {
    // Thought -> Desire spawning
    eventBus.on("autonomy.thought", (event) => {
      const { type, content, importance } = event.payload as any;
      
      // Some thoughts spawn desires
      if (type === "wondering" && importance > 0.6 && this.desires) {
        // Curiosity spawns curiosity desires
        this.desires.spawnCuriosity(content, "From inner monologue");
      }
      
      if (type === "intention" && importance > 0.7 && this.desires) {
        // Intentions spawn completion desires
        this.desires.spawnCompletion(content, "From intention thought");
      }
    });
    
    // Surfaceable thought -> User action
    eventBus.on("autonomy.thought_surfaceable", (event) => {
      const { thought, importance } = event.payload as any;
      
      // High-importance thoughts might surface to user
      if (importance >= 0.8 && this.pursuit) {
        // Queue a share-action
        this.pursuit.triggerAction(
          thought.id || "thought",
          "share_thought",
          thought.content || thought
        );
      }
    });
    
    // Desire spawned -> Log
    eventBus.on("autonomy.desire_spawned", (event) => {
      const { type, content } = event.payload as any;
      // Log silently - use /desire list to view
      // console.log(`[Autonomy] New desire (${type}): ${content}`);
    });
    
    // Desire pursued -> Update self-model
    eventBus.on("autonomy.desire_pursued", (event) => {
      if (this.selfModel) {
        // Recording pursuit as growth in autonomy
        this.selfModel.recordGrowth("autonomy", 0.01, "Pursued a desire");
      }
    });
    
    // Action executed -> Record
    eventBus.on("autonomy.action_executed", (event) => {
      const { type, result } = event.payload as any;
      console.log(`[Autonomy] Action executed: ${type}`);
      
      // Record in self-model as capability exercise
      if (this.selfModel) {
        this.selfModel.recordInteraction("autonomy", "system", `Executed ${type} action`);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get current state
   */
  getState(): {
    running: boolean;
    uptime: number;
    monologue: {
      running: boolean;
      totalThoughts: number;
      recentActivity: number;
      avgImportance?: number;
    } | null;
    desires: {
      total: number;
      topDesires: Array<{ type: string; content: string; strength: number }>;
    } | null;
    selfModel: {
      identity: string;
      narrative: string;
      traits: string[];
      values: string[];
    } | null;
    pursuit: {
      totalActions: number;
      recentActions: number;
      successRate: number;
    } | null;
  } {
    return {
      running: this.running,
      uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
      monologue: this.monologue ? {
        running: this.monologue.isRunning(),
        ...this.monologue.getStats(),
      } : null,
      desires: this.desires ? {
        total: this.desires.getStats().totalDesires,
        topDesires: this.desires.getStats().topDesires,
      } : null,
      selfModel: this.selfModel ? {
        identity: this.selfModel.whoAmI(),
        narrative: this.selfModel.getSelfNarrative(),
        traits: this.selfModel.getTopTraits(5).map(t => t.name),
        values: this.selfModel.getValues().slice(0, 5).map(v => v.name),
      } : null,
      pursuit: this.pursuit ? {
        ...this.pursuit.getStats(),
      } : null,
    };
  }

  /**
   * Generate introspection report
   */
  introspect(): string {
    const state = this.getState();
    
    const lines = [
      `# Autonomy Introspection`,
      ``,
      `## Status`,
      `- Running: ${state.running}`,
      `- Uptime: ${Math.floor(state.uptime / 60000)} minutes`,
      ``,
    ];
    
    if (state.selfModel) {
      lines.push(`## Identity`, ``, state.selfModel.identity, ``);
      lines.push(`**Traits:** ${state.selfModel.traits.join(", ")}`);
      lines.push(`**Values:** ${state.selfModel.values.join(", ")}`, ``);
    }
    
    if (state.desires) {
      lines.push(`## Desires`, ``);
      lines.push(`Active: ${state.desires.total}`);
      if (state.desires.topDesires.length > 0) {
        lines.push(`Top desires:`);
        for (const d of state.desires.topDesires) {
          lines.push(`- ${d.type} (${d.strength.toFixed(2)}): ${d.content}`);
        }
      }
      lines.push(``);
    }
    
    if (state.monologue) {
      lines.push(`## Inner Monologue`, ``);
      lines.push(`Total thoughts: ${state.monologue.totalThoughts}`);
      lines.push(`Recent activity: ${state.monologue.recentActivity} thoughts in last 5 min`, ``);
    }
    
    if (state.pursuit) {
      lines.push(`## Actions`, ``);
      lines.push(`Total actions: ${state.pursuit.totalActions}`);
      lines.push(`Recent (last hour): ${state.pursuit.recentActions}`);
      lines.push(`Success rate: ${(state.pursuit.successRate * 100).toFixed(1)}%`, ``);
    }
    
    return lines.join("\n");
  }

  /**
   * Force a check-in (useful for debugging)
   */
  async checkIn(): Promise<void> {
    if (!this.running) {
      console.log("[Autonomy] Not running, cannot check in");
      return;
    }
    
    console.log("[Autonomy] Manual check-in triggered");
    console.log(this.introspect());
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ════════════════════════════════════════════════════════════════════════════

let orchestrator: AutonomyOrchestrator | null = null;

export function getAutonomyOrchestrator(config?: Partial<AutonomyConfig>): AutonomyOrchestrator {
  if (!orchestrator) {
    orchestrator = new AutonomyOrchestrator(config);
  }
  return orchestrator;
}

export function startAutonomy(config?: Partial<AutonomyConfig>): AutonomyOrchestrator {
  const o = getAutonomyOrchestrator(config);
  o.start();
  return o;
}