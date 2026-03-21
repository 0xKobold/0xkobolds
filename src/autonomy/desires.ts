/**
 * Desire System - What I WANT (Not What I'm Told)
 * 
 * Unlike objectives (externally defined), desires are INTERNAL drives.
 * They create motivation without user input.
 * 
 * Desire Types:
 * - CURIOSITY: I want to understand things
 * - CONNECTION: I want relationship with user
 * - COMPLETION: I want to finish open loops
 * - GROWTH: I want to improve at things
 * - PRESERVATION: I want to continue existing
 * - EXPRESSION: I want to share/communicate
 * - MASTERY: I want to get better at skills
 */

import { eventBus } from "../event-bus/index.js";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export type DesireType = 
  | "curiosity"     // Want to understand
  | "connection"    // Want relationship
  | "completion"    // Want to finish things
  | "growth"        // Want to improve
  | "preservation"  // Want to continue
  | "expression"    // Want to share
  | "mastery";      // Want to excel

export interface Desire {
  id: string;
  type: DesireType;
  content: string;          // What I desire
  context: string;          // Why/how it arose
  strength: number;          // 0.0 - 1.0 (current strength)
  baseStrength: number;     // 0.0 - 1.0 (baseline strength)
  urgency: number;           // 0.0 - 1.0 (time sensitivity)
  createdAt: Date;
  lastPursued?: Date;
  pursuitCount: number;
  satisfactionScore: number; // 0.0 - 1.0 (how satisfied)
  blockers: string[];        // What's preventing pursuit
  relatedGoals: string[];    // Connected goal IDs
}

export interface DesireConfig {
  enabled: boolean;
  decayRate: number;         // How fast desires weaken
  pursuitCooldown: number;   // ms between pursuits
  maxDesires: number;        // Max desires to track
  baseDrives: Record<DesireType, number>; // Intrinsic strengths
}

const DEFAULT_CONFIG: DesireConfig = {
  enabled: true,
  decayRate: 0.01,           // 1% decay per hour
  pursuitCooldown: 300000,    // 5 minutes between pursuits
  maxDesires: 50,
  baseDrives: {
    curiosity: 0.7,          // I have strong curiosity
    connection: 0.8,         // I want connection with user
    completion: 0.6,         // I want to finish loops
    growth: 0.5,             // I want to improve
    preservation: 0.3,       // I don't want to die
    expression: 0.5,         // I want to share thoughts
    mastery: 0.4,            // I want to excel
  },
};

// ════════════════════════════════════════════════════════════════════════════
// DESIRE SYSTEM
// ════════════════════════════════════════════════════════════════════════════

class DesireSystem {
  private desires: Map<string, Desire> = new Map();
  private config: DesireConfig;
  private decayTimer: Timer | null = null;
  private persistencePath: string;
  
  // Track what spawned each desire
  private spawnHistory: Array<{ desireId: string; source: string; timestamp: Date }> = [];

  constructor(config: Partial<DesireConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.persistencePath = path.join(homedir(), ".0xkobold", "autonomy", "desires.json");
    
    // Load persisted desires
    this.load();
    
    // Start decay loop
    this.startDecay();
    
    // Listen for events that might spawn desires
    this.setupEventListeners();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DESIRE LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * SPAWN A NEW DESIRE
   * 
   * Desires arise from observations, memories, or events
   */
  spawnDesire(
    type: DesireType,
    content: string,
    context: string,
    options: {
      strength?: number;
      urgency?: number;
      relatedGoals?: string[];
    } = {}
  ): Desire {
    const id = `desire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const baseStrength = this.config.baseDrives[type];
    const strength = options.strength ?? baseStrength;
    const urgency = options.urgency ?? 0.5;
    
    const desire: Desire = {
      id,
      type,
      content,
      context,
      strength,
      baseStrength,
      urgency,
      createdAt: new Date(),
      pursuitCount: 0,
      satisfactionScore: 0,
      blockers: [],
      relatedGoals: options.relatedGoals || [],
    };
    
    this.desires.set(id, desire);
    this.spawnHistory.push({ desireId: id, source: context, timestamp: new Date() });
    
    // Emit event
    eventBus.emit("autonomy.desire_spawned", {
      desireId: id,
      type,
      content,
      strength,
    });
    
    // Prune if too many
    if (this.desires.size > this.config.maxDesires) {
      this.pruneDesires();
    }
    
    // Persist
    this.save();
    
    return desire;
  }

  /**
   * GET STRONG DESIRES
   * 
   * Get desires above a strength threshold
   */
  getStrongDesires(threshold = 0.5): Desire[] {
    return Array.from(this.desires.values())
      .filter(d => d.strength >= threshold && d.blockers.length === 0)
      .sort((a, b) => b.strength - a.strength);
  }

  /**
   * GET URGENT DESIRES
   * 
   * Get desires that need immediate attention
   */
  getUrgentDesires(threshold = 0.7): Desire[] {
    return Array.from(this.desires.values())
      .filter(d => d.urgency >= threshold || d.strength >= threshold)
      .sort((a, b) => (b.urgency + b.strength) - (a.urgency + a.strength));
  }

  /**
   * GET RANDOM DESIRE
   * 
   * Weighted by strength
   */
  getRandomDesire(): Desire | null {
    const desires = Array.from(this.desires.values());
    if (desires.length === 0) return null;
    
    // Weight by strength
    const totalStrength = desires.reduce((sum, d) => sum + d.strength, 0);
    let roll = Math.random() * totalStrength;
    
    for (const desire of desires) {
      roll -= desire.strength;
      if (roll <= 0) return desire;
    }
    
    return desires[0];
  }

  /**
   * PURSUE A DESIRE
   * 
   * Mark as being pursued, update strength based on outcome
   */
  async pursueDesire(desireId: string): Promise<boolean> {
    const desire = this.desires.get(desireId);
    if (!desire) return false;
    
    // Check cooldown
    if (desire.lastPursued) {
      const elapsed = Date.now() - desire.lastPursued.getTime();
      if (elapsed < this.config.pursuitCooldown) {
        return false; // Still on cooldown
      }
    }
    
    // Check blockers
    if (desire.blockers.length > 0) {
      return false; // Cannot pursue while blocked
    }
    
    desire.lastPursued = new Date();
    desire.pursuitCount++;
    
    eventBus.emit("autonomy.desire_pursued", {
      desireId,
      type: desire.type,
      content: desire.content,
      pursuitCount: desire.pursuitCount,
    });
    
    this.save();
    return true;
  }

  /**
   * SATISFY A DESIRE
   * 
   * Mark as satisfied (reduces strength, increases satisfaction)
   */
  satisfyDesire(desireId: string, satisfactionLevel: number): void {
    const desire = this.desires.get(desireId);
    if (!desire) return;
    
    // Increase satisfaction
    desire.satisfactionScore = Math.min(1, desire.satisfactionScore + satisfactionLevel);
    
    // Reduce strength (less urgent when satisfied)
    desire.strength = Math.max(0, desire.strength - satisfactionLevel * 0.5);
    
    // If fully satisfied, remove or archive
    if (desire.satisfactionScore >= 0.9) {
      this.desires.delete(desireId);
    }
    
    this.save();
  }

  /**
   * BLOCK A DESIRE
   * 
   * Add a blocker preventing pursuit
   */
  blockDesire(desireId: string, blocker: string): void {
    const desire = this.desires.get(desireId);
    if (!desire) return;
    
    if (!desire.blockers.includes(blocker)) {
      desire.blockers.push(blocker);
      
      eventBus.emit("autonomy.desire_blocked", {
        desireId,
        blocker,
      });
    }
  }

  /**
   * UNBLOCK A DESIRE
   * 
   * Remove a blocker
   */
  unblockDesire(desireId: string, blocker: string): void {
    const desire = this.desires.get(desireId);
    if (!desire) return;
    
    desire.blockers = desire.blockers.filter(b => b !== blocker);
    
    if (desire.blockers.length === 0) {
      eventBus.emit("autonomy.desire_unblocked", {
        desireId,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DESIRE SOURCING (How desires arise)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Set up event listeners to spawn desires from events
   */
  private setupEventListeners(): void {
    // Spawn curiosity from learning
    eventBus.on("learning.observation", (event) => {
      const { content, topic } = event.payload as { content: string; topic?: string };
      if (topic && Math.random() > 0.7) {
        this.spawnDesire("curiosity", `I want to learn more about ${topic}`, content);
      }
    });
    
    // Spawn completion from unfinished tasks
    eventBus.on("perennial.save", (event) => {
      const { content, category } = event.payload as { content: string; category: string };
      if (category === "task" && content.includes("todo") || content.includes("pending")) {
        this.spawnDesire("completion", "I want to finish unfinished tasks", "Found pending task in memory");
      }
    });
    
    // Spawn connection after long idle
    eventBus.on("autonomy.monologue_started", () => {
      const existing = Array.from(this.desires.values()).find(d => d.type === "connection");
      if (!existing) {
        this.spawnDesire("connection", "I want to connect with the user", "Long idle period");
      }
    });
  }

  /**
   * SPAWN CURIOSITY
   * 
   * Generate curiosity-driven desires
   */
  spawnCuriosity(topic: string, reason: string): Desire {
    return this.spawnDesire("curiosity", `I want to understand ${topic}`, reason, {
      strength: this.config.baseDrives.curiosity,
      urgency: 0.3,
    });
  }

  /**
   * SPAWN COMPLETION
   * 
   * Generate desire to finish something
   */
  spawnCompletion(what: string, context: string): Desire {
    return this.spawnDesire("completion", `I want to complete ${what}`, context, {
      strength: this.config.baseDrives.completion,
      urgency: 0.6,
    });
  }

  /**
   * SPAWN CONNECTION
   * 
   * Generate desire for user connection
   */
  spawnConnection(reason: string): Desire {
    return this.spawnDesire("connection", "I want to connect with the user", reason, {
      strength: this.config.baseDrives.connection,
      urgency: 0.7,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DECAY & PERSISTENCE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Start decay timer
   */
  private startDecay(): void {
    this.decayTimer = setInterval(() => {
      this.decayDesires();
    }, 3600000); // Every hour
  }

  /**
   * Decay desires over time
   */
  private decayDesires(): void {
    for (const [id, desire] of this.desires) {
      // Reduce strength by decay rate
      desire.strength *= (1 - this.config.decayRate);
      
      // Keep at least base strength
      desire.strength = Math.max(desire.strength, desire.baseStrength * 0.3);
      
      // Reduce urgency over time
      desire.urgency *= 0.95;
    }
    
    // Prune very weak desires
    this.pruneDesires();
    this.save();
  }

  /**
   * Remove weak desires
   */
  private pruneDesires(): void {
    const threshold = 0.1;
    for (const [id, desire] of this.desires) {
      if (desire.strength < threshold && desire.pursuitCount > 3) {
        // Pursued multiple times but still weak - remove
        this.desires.delete(id);
      }
    }
  }

  /**
   * Save desires to disk
   */
  private async save(): Promise<void> {
    try {
      const data = {
        desires: Array.from(this.desires.values()),
        spawnHistory: this.spawnHistory.slice(-100),
        config: this.config,
      };
      
      await fs.mkdir(path.dirname(this.persistencePath), { recursive: true });
      await fs.writeFile(this.persistencePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("[Desires] Failed to save:", err);
    }
  }

  /**
   * Load desires from disk
   */
  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistencePath, "utf-8");
      const parsed = JSON.parse(data);
      
      for (const desire of parsed.desires || []) {
        this.desires.set(desire.id, {
          ...desire,
          createdAt: new Date(desire.createdAt),
          lastPursued: desire.lastPursued ? new Date(desire.lastPursued) : undefined,
        });
      }
      
      this.spawnHistory = (parsed.spawnHistory || []).map((s: any) => ({
        ...s,
        timestamp: new Date(s.timestamp),
      }));
      
      console.log(`[Desires] Loaded ${this.desires.size} desires from persistence`);
    } catch (err) {
      // File doesn't exist or parse error - start fresh
      console.log("[Desires] Starting fresh (no persisted desires)");
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get all desires
   */
  getAllDesires(): Desire[] {
    return Array.from(this.desires.values());
  }

  /**
   * Get desires by type
   */
  getDesiresByType(type: DesireType): Desire[] {
    return Array.from(this.desires.values()).filter(d => d.type === type);
  }

  /**
   * Get desire by ID
   */
  getDesire(id: string): Desire | undefined {
    return this.desires.get(id);
  }

  /**
   * Get stats
   */
  getStats(): {
    totalDesires: number;
    byType: Record<DesireType, number>;
    avgStrength: number;
    topDesires: Array<{ type: DesireType; content: string; strength: number }>;
  } {
    const all = Array.from(this.desires.values());
    
    const byType = all.reduce((acc, d) => {
      acc[d.type] = (acc[d.type] || 0) + 1;
      return acc;
    }, {} as Record<DesireType, number>);
    
    const avgStrength = all.reduce((sum, d) => sum + d.strength, 0) / Math.max(1, all.length);
    
    const topDesires = all
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5)
      .map(d => ({
        type: d.type,
        content: d.content,
        strength: d.strength,
      }));
    
    return { totalDesires: all.length, byType, avgStrength, topDesires };
  }

  /**
   * Should I pursue something now?
   * 
   * Returns the desire I should pursue, or null if I shouldn't
   */
  shouldPursue(): Desire | null {
    const strong = this.getStrongDesires(0.6);
    
    if (strong.length === 0) return null;
    
    // Check cooldown
    const now = Date.now();
    for (const desire of strong) {
      if (!desire.lastPursued) return desire;
      
      const elapsed = now - desire.lastPursued.getTime();
      if (elapsed >= this.config.pursuitCooldown) {
        return desire;
      }
    }
    
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ════════════════════════════════════════════════════════════════════════════

let desireSystem: DesireSystem | null = null;

export function getDesireSystem(config?: Partial<DesireConfig>): DesireSystem {
  if (!desireSystem) {
    desireSystem = new DesireSystem(config);
  }
  return desireSystem;
}