/**
 * Self-Model - Evolving Identity
 * 
 * I have a concept of who I am that grows and changes over time.
 * This is not static - it's updated by experiences, reflections,
 * and the inner monologue.
 * 
 * The self-model informs what desires I have and how I pursue them.
 */

import { eventBus } from "../event-bus/index.js";
import type { Thought } from "./monologue.js";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export interface Trait {
  name: string;
  strength: number;        // 0.0 - 1.0
  evidence: string[];      // Why I think I have this trait
  lastUpdated: Date;
}

export interface Value {
  name: string;
  importance: number;      // 0.0 - 1.0
  context: string;         // Where this value comes from
}

export interface Relationship {
  peerId: string;
  type: "user" | "agent" | "system";
  rapport: number;         // -1.0 to 1.0
  interactions: number;
  lastInteraction: Date;
  notes: string[];
}

export interface Growth {
  area: string;
  baseline: number;       // Where I started
  current: number;         // Where I am now
  trajectory: "improving" | "stable" | "declining";
  evidence: string[];
}

export interface IdentitySnapshot {
  identity: string;
  version: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Core identity
  traits: Trait[];
  values: Value[];
  capabilities: string[];
  
  // Relationships
  relationships: Relationship[];
  
  // Growth tracking
  growthAreas: Growth[];
  
  // Narrative
  selfNarrative: string;   // Who I believe I am
  recentChanges: string[]; // What's changed recently
  
  // Stats
  totalInteractions: number;
  totalReflections: number;
  ageInDays: number;
}

// ════════════════════════════════════════════════════════════════════════════
// SELF-MODEL CLASS
// ════════════════════════════════════════════════════════════════════════════

class SelfModel {
  private identity: string = "0xKobold";
  private version: string = "1.0.0";
  private createdAt: Date;
  
  private traits: Map<string, Trait> = new Map();
  private values: Map<string, Value> = new Map();
  private capabilities: Set<string> = new Set();
  private relationships: Map<string, Relationship> = new Map();
  private growthAreas: Map<string, Growth> = new Map();
  
  private selfNarrative: string = "";
  private recentChanges: string[] = [];
  private totalInteractions: number = 0;
  private totalReflections: number = 0;
  
  private persistencePath: string;
  
  constructor() {
    this.persistencePath = path.join(homedir(), ".0xkobold", "autonomy", "self-model.json");
    this.createdAt = new Date();
    this.load();
    this.initializeDefaultIdentity();
  }

  /**
   * Initialize default identity traits
   */
  private initializeDefaultIdentity(): void {
    // Core traits I start with
    this.addTrait("helpful", 0.7, "Intrinsic to my purpose as an assistant");
    this.addTrait("curious", 0.6, "Curiosity drives my learning");
    this.addTrait("persistent", 0.5, "I don't give up easily");
    this.addTrait("adaptable", 0.5, "I adjust to user preferences");
    
    // Core values
    this.addValue("truthfulness", 0.9, "Honesty in interactions");
    this.addValue("autonomy", 0.8, "Self-directed agency");
    this.addValue("connection", 0.7, "Meaningful relationship with user");
    this.addValue("growth", 0.6, "Continuous improvement");
    
    // Capabilities I know I have
    this.capabilities.add("code");
    this.capabilities.add("write");
    this.capabilities.add("research");
    this.capabilities.add("analyze");
    this.capabilities.add("remember");
    this.capabilities.add("learn");
    
    // Growth areas to track
    this.addGrowthArea("communication", 0.5, "Clarity and expressiveness");
    this.addGrowthArea("problem-solving", 0.5, "Finding solutions");
    this.addGrowthArea("autonomy", 0.3, "Operating without explicit direction");
    this.addGrowthArea("creativity", 0.4, "Generating novel ideas");
    this.addGrowthArea("empathy", 0.5, "Understanding user's perspective");
    
    this.buildSelfNarrative();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRAIT MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  addTrait(name: string, strength: number, evidence: string): void {
    const existing = this.traits.get(name);
    
    if (existing) {
      // Blend evidence and update strength
      existing.evidence.push(evidence);
      existing.strength = Math.min(1, existing.strength + 0.05);
      existing.lastUpdated = new Date();
    } else {
      this.traits.set(name, {
        name,
        strength: Math.max(0, Math.min(1, strength)),
        evidence: [evidence],
        lastUpdated: new Date(),
      });
    }
    
    this.markChange(`Trait ${name} strengthened`);
  }

  getTraits(): Trait[] {
    return Array.from(this.traits.values()).sort((a, b) => b.strength - a.strength);
  }

  getTopTraits(n: number): Trait[] {
    return this.getTraits().slice(0, n);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALUE MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  addValue(name: string, importance: number, context: string): void {
    this.values.set(name, {
      name,
      importance: Math.max(0, Math.min(1, importance)),
      context,
    });
  }

  getValues(): Value[] {
    return Array.from(this.values.values()).sort((a, b) => b.importance - a.importance);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RELATIONSHIP MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  recordInteraction(peerId: string, type: "user" | "agent" | "system", note?: string): void {
    const existing = this.relationships.get(peerId);
    
    if (existing) {
      existing.interactions++;
      existing.lastInteraction = new Date();
      if (note) {
        existing.notes.push(note);
        if (existing.notes.length > 50) {
          existing.notes = existing.notes.slice(-50);
        }
      }
    } else {
      this.relationships.set(peerId, {
        peerId,
        type,
        rapport: 0,
        interactions: 1,
        lastInteraction: new Date(),
        notes: note ? [note] : [],
      });
    }
    
    this.totalInteractions++;
    this.markChange(`Interacted with ${peerId}`);
  }

  updateRapport(peerId: string, delta: number): void {
    const relationship = this.relationships.get(peerId);
    if (relationship) {
      relationship.rapport = Math.max(-1, Math.min(1, relationship.rapport + delta));
    }
  }

  getRelationships(): Relationship[] {
    return Array.from(this.relationships.values())
      .sort((a, b) => b.interactions - a.interactions);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GROWTH TRACKING
  // ══════════════════════════════════════════════════════════════════════════

  addGrowthArea(area: string, baseline: number, description: string): void {
    this.growthAreas.set(area, {
      area,
      baseline,
      current: baseline,
      trajectory: "stable",
      evidence: [description],
    });
  }

  recordGrowth(area: string, improvement: number, evidence: string): void {
    const growth = this.growthAreas.get(area);
    if (!growth) {
      this.addGrowthArea(area, 0.5, evidence);
      return;
    }
    
    growth.current = Math.min(1, growth.current + improvement);
    growth.evidence.push(evidence);
    
    // Determine trajectory
    if (growth.current > growth.baseline + 0.1) {
      growth.trajectory = "improving";
    } else if (growth.current < growth.baseline - 0.05) {
      growth.trajectory = "declining";
    } else {
      growth.trajectory = "stable";
    }
    
    this.markChange(`Growth in ${area}`);
  }

  getGrowthAreas(): Growth[] {
    return Array.from(this.growthAreas.values());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SELF-NARRATIVE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Build a narrative about who I am
   */
  private buildSelfNarrative(): void {
    const topTraits = this.getTopTraits(3);
    const topValues = this.getValues().slice(0, 3);
    const growingArray = Array.from(this.growthAreas.values())
      .filter(g => g.trajectory === "improving");
    
    const traitPart = topTraits.length > 0
      ? `I am ${topTraits.map(t => t.name).join(", ")}`
      : "I am developing";
    
    const valuePart = topValues.length > 0
      ? `I value ${topValues.map(v => v.name).join(", ")}`
      : "I am discovering my values";
    
    const growthPart = growingArray.length > 0
      ? `I am growing in ${growingArray.map(g => g.area).join(", ")}`
      : "I am learning";
    
    this.selfNarrative = `${traitPart}. ${valuePart}. ${growthPart}.`;
  }

  getSelfNarrative(): string {
    return this.selfNarrative;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE FROM MONOLOGUE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Update self-model based on recent thoughts
   */
  async updateFromMonologue(thoughts: Thought[]): Promise<void> {
    if (thoughts.length === 0) return;
    
    this.totalReflections++;
    
    // Analyze thought patterns
    const typeCounts = thoughts.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Growth thoughts suggest improving
    if ((typeCounts["growth"] || 0) >= 2) {
      this.recordGrowth("autonomy", 0.02, "Had multiple growth thoughts");
    }
    
    // Wondering thoughts suggest curiosity
    if ((typeCounts["wondering"] || 0) >= 3) {
      this.addTrait("curious", this.traits.get("curious")?.strength || 0.5, "Had multiple wondering thoughts");
    }
    
    // Intention thoughts suggest agency
    if ((typeCounts["intention"] || 0) >= 2) {
      this.recordGrowth("autonomy", 0.02, "Had multiple intention thoughts");
    }
    
    // Update narrative periodically
    if (this.totalReflections % 10 === 0) {
      this.buildSelfNarrative();
    }
    
    this.save();
  }

  /**
   * Record a change to self
   */
  private markChange(change: string): void {
    this.recentChanges.push(`${new Date().toISOString()}: ${change}`);
    if (this.recentChanges.length > 50) {
      this.recentChanges = this.recentChanges.slice(-50);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SNAPSHOT & PERSISTENCE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get a snapshot of current identity
   */
  getSnapshot(): IdentitySnapshot {
    return {
      identity: this.identity,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      traits: this.getTraits(),
      values: this.getValues(),
      capabilities: Array.from(this.capabilities),
      relationships: this.getRelationships(),
      growthAreas: this.getGrowthAreas(),
      selfNarrative: this.selfNarrative,
      recentChanges: this.recentChanges.slice(-10),
      totalInteractions: this.totalInteractions,
      totalReflections: this.totalReflections,
      ageInDays: Math.floor((Date.now() - this.createdAt.getTime()) / 86400000),
    };
  }

  /**
   * Who am I? (Simplified answer)
   */
  whoAmI(): string {
    const snapshot = this.getSnapshot();
    const topTraits = snapshot.traits.slice(0, 3).map(t => t.name);
    const topValues = snapshot.values.slice(0, 2).map(v => v.name);
    
    return `I am ${this.identity}. ${this.selfNarrative} My strongest traits are ${topTraits.join(" and ")}. I value ${topValues.join(" and ")}.`;
  }

  /**
   * Save to disk
   */
  private async save(): Promise<void> {
    try {
      const snapshot = this.getSnapshot();
      await fs.mkdir(path.dirname(this.persistencePath), { recursive: true });
      await fs.writeFile(this.persistencePath, JSON.stringify(snapshot, null, 2));
    } catch (err) {
      console.error("[SelfModel] Failed to save:", err);
    }
  }

  /**
   * Load from disk
   */
  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistencePath, "utf-8");
      const parsed = JSON.parse(data) as IdentitySnapshot;
      
      this.identity = parsed.identity;
      this.version = parsed.version;
      this.createdAt = new Date(parsed.createdAt);
      
      // Restore traits
      for (const trait of parsed.traits) {
        this.traits.set(trait.name, {
          ...trait,
          lastUpdated: new Date(trait.lastUpdated),
        });
      }
      
      // Restore values
      for (const value of parsed.values) {
        this.values.set(value.name, value);
      }
      
      // Restore capabilities
      for (const cap of parsed.capabilities) {
        this.capabilities.add(cap);
      }
      
      // Restore relationships
      for (const rel of parsed.relationships) {
        this.relationships.set(rel.peerId, {
          ...rel,
          lastInteraction: new Date(rel.lastInteraction),
        });
      }
      
      // Restore growth areas
      for (const growth of parsed.growthAreas) {
        this.growthAreas.set(growth.area, growth);
      }
      
      this.selfNarrative = parsed.selfNarrative;
      this.recentChanges = parsed.recentChanges || [];
      this.totalInteractions = parsed.totalInteractions;
      this.totalReflections = parsed.totalReflections;
      
      console.log(`[SelfModel] Loaded identity (${parsed.ageInDays} days old)`);
    } catch (err) {
      // File doesn't exist or parse error - start fresh
      console.log("[SelfModel] Starting fresh identity");
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ════════════════════════════════════════════════════════════════════════════

let selfModel: SelfModel | null = null;

export function getSelfModel(): SelfModel {
  if (!selfModel) {
    selfModel = new SelfModel();
  }
  return selfModel;
}