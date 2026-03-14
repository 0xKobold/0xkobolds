/**
 * Nudge Engine
 * 
 * Scheduled reflections and actions for autonomous improvement.
 * 
 * Triggers:
 * - Time-based: Daily, weekly, monthly
 * - Event-based: Skill used, error occurred, pattern detected
 * - Threshold-based: 100 observations, 10 skill uses, 5 contradictions
 * 
 * Actions:
 * - Reflection: "What did I learn about this peer?"
 * - Skill creation: "Should I create a skill for this pattern?"
 * - Skill refinement: "How can I improve this skill?"
 * - Archive: "What knowledge is outdated?"
 */

import type { Nudge, NudgeTrigger, NudgeAction } from "./types";
import { getDialecticStore, DialecticStore } from "./store";
import { getDialecticReasoning, DialecticReasoning } from "./reasoning";

// ═════════════════════════════════════════════════════════════════
// DEFAULT NUDGES
// ═════════════════════════════════════════════════════════════════

const DEFAULT_NUDGES: Array<{
  trigger: NudgeTrigger;
  question: string;
  action: NudgeAction;
  priority: "low" | "medium" | "high";
}> = [
  // Daily reflection on user
  {
    trigger: { type: "time", interval: "daily" },
    question: "What did I learn about the user today?",
    action: { type: "reflection", targetPeerId: "user:default" },
    priority: "medium",
  },
  
  // Weekly pattern analysis
  {
    trigger: { type: "time", interval: "weekly" },
    question: "What patterns am I seeing in user interactions?",
    action: { type: "reflection", targetPeerId: "user:default" },
    priority: "high",
  },
  
  // Monthly archive review
  {
    trigger: { type: "time", interval: "monthly" },
    question: "What knowledge is now outdated and should be archived?",
    action: { type: "archive", targetType: "old", criteria: "last_updated < 90 days" },
    priority: "low",
  },
  
  // Skill refinement after 10 uses
  {
    trigger: { type: "threshold", metric: "skill_uses", value: 10 },
    question: "This skill has been used 10 times. How can I improve it?",
    action: { type: "skill_refine", skillId: "*" },  // * = any skill
    priority: "medium",
  },
  
  // Skill creation when pattern detected
  {
    trigger: { type: "event", event: "pattern_detected" },
    question: "Should I create a skill for this recurring pattern?",
    action: { type: "skill_create", pattern: "*" },  // * = detected pattern
    priority: "medium",
  },
  
  // Contradiction check when 5+ contradictions
  {
    trigger: { type: "threshold", metric: "contradictions", value: 5 },
    question: "There are unresolved contradictions. Should I reconcile them?",
    action: { type: "contradiction_check", peerId: "*" },
    priority: "high",
  },
];

// ═════════════════════════════════════════════════════════════════
// NUDGE ENGINE
// ═════════════════════════════════════════════════════════════════

export class NudgeEngine {
  private store: DialecticStore;
  private reasoning: DialecticReasoning;
  private ollamaUrl: string;
  private lastRun: Map<string, Date>;
  private counters: Map<string, number>;

  constructor(store?: DialecticStore, ollamaUrl?: string) {
    this.store = store || getDialecticStore();
    this.reasoning = getDialecticReasoning();
    this.ollamaUrl = ollamaUrl || process.env.OLLAMA_URL || "http://localhost:11434";
    this.lastRun = new Map();
    this.counters = new Map();
  }

  // ─────────────────────────────────────────────────────────────────
  // CHECK FOR NUDGES
  // ─────────────────────────────────────────────────────────────────

  /**
   * Check if any nudges should be triggered.
   * Returns list of nudges that need to run.
   */
  async checkNudges(): Promise<Nudge[]> {
    const now = new Date();
    const triggered: Nudge[] = [];

    for (const nudgeDef of DEFAULT_NUDGES) {
      if (await this.shouldTrigger(nudgeDef.trigger, now)) {
        // Create the nudge
        const nudge = this.store.addNudge(
          nudgeDef.trigger,
          nudgeDef.question,
          nudgeDef.action,
          nudgeDef.priority
        );
        triggered.push(nudge);
      }
    }

    return triggered;
  }

  /**
   * Check if a trigger should fire.
   */
  private async shouldTrigger(trigger: NudgeTrigger, now: Date): Promise<boolean> {
    switch (trigger.type) {
      case "time":
        return this.checkTimeTrigger(trigger, now);
      
      case "event":
        // Event triggers are checked separately via recordEvent()
        return false;
      
      case "threshold":
        return this.checkThresholdTrigger(trigger);
      
      default:
        return false;
    }
  }

  private checkTimeTrigger(trigger: { type: "time"; interval: "daily" | "weekly" | "monthly" }, now: Date): boolean {
    const key = `time_${trigger.interval}`;
    const last = this.lastRun.get(key);

    if (!last) {
      // First run - schedule for next interval
      this.lastRun.set(key, now);
      return true;
    }

    const diff = now.getTime() - last.getTime();
    const intervals = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
    };

    if (diff >= intervals[trigger.interval]) {
      this.lastRun.set(key, now);
      return true;
    }

    return false;
  }

  private checkThresholdTrigger(trigger: { type: "threshold"; metric: string; value: number }): boolean {
    const count = this.counters.get(trigger.metric) || 0;
    if (count >= trigger.value) {
      // Reset counter after triggering
      this.counters.set(trigger.metric, 0);
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────
  // RECORD EVENTS (for event-based triggers)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Record an event that might trigger nudges.
   */
  recordEvent(event: string, data?: Record<string, unknown>): void {
    // Increment counters
    switch (event) {
      case "skill_used":
        this.incrementCounter("skill_uses");
        break;
      case "contradiction_detected":
        this.incrementCounter("contradictions");
        break;
      case "observation_added":
        this.incrementCounter("observations");
        break;
    }

    // Check for pattern detection
    if (event === "pattern_detected" && data?.pattern) {
      // Create nudge for pattern
      this.store.addNudge(
        { type: "event", event: "pattern_detected", data },
        `A pattern was detected: "${data.pattern}". Should I create a skill for this?`,
        { type: "skill_create", pattern: data.pattern as string },
        "medium"
      );
    }
  }

  private incrementCounter(metric: string): void {
    const current = this.counters.get(metric) || 0;
    this.counters.set(metric, current + 1);
  }

  // ─────────────────────────────────────────────────────────────────
  // EXECUTE NUDGES
  // ─────────────────────────────────────────────────────────────────

  /**
   * Execute a pending nudge.
   */
  async executeNudge(nudge: Nudge): Promise<string> {
    let result: string;

    switch (nudge.action.type) {
      case "reflection":
        result = await this.executeReflection(nudge.action.targetPeerId);
        break;
      
      case "skill_create":
        result = await this.executeSkillCreation(nudge.action.pattern);
        break;
      
      case "skill_refine":
        result = await this.executeSkillRefinement(nudge.action.skillId);
        break;
      
      case "archive":
        result = await this.executeArchive(nudge.action.targetType, nudge.action.criteria);
        break;
      
      case "contradiction_check":
        result = await this.executeContradictionCheck(nudge.action.peerId);
        break;
      
      default:
        result = "Unknown action type";
    }

    // Mark nudge as completed
    this.store.completeNudge(nudge.id, result);

    return result;
  }

  private async executeReflection(peerId: string): Promise<string> {
    if (peerId === "*") {
      // Reflect on all peers
      const peers = this.store.listPeers();
      const results: string[] = [];
      
      for (const peer of peers) {
        const reasoning = await this.reasoning.reason(peer.id);
        results.push(`Peer ${peer.name}: ${reasoning.synthesis?.content || "No synthesis"}`);
      }
      
      return results.join("\n");
    }

    // Reflect on specific peer
    const reasoning = await this.reasoning.reason(peerId);
    return reasoning.synthesis?.content || "No new insights";
  }

  private async executeSkillCreation(pattern: string): Promise<string> {
    // TODO: Integrate with skill auto-creator
    // For now, just log the suggestion
    console.log(`[NudgeEngine] Suggested skill creation for pattern: ${pattern}`);
    return `Suggested skill creation for pattern: ${pattern}`;
  }

  private async executeSkillRefinement(skillId: string): Promise<string> {
    // TODO: Integrate with skill self-improver
    console.log(`[NudgeEngine] Suggested skill refinement for: ${skillId}`);
    return `Suggested skill refinement for: ${skillId}`;
  }

  private async executeArchive(targetType: string, criteria: string): Promise<string> {
    // TODO: Archive old knowledge
    console.log(`[NudgeEngine] Archive suggested for ${targetType} where ${criteria}`);
    return `Archive suggested for ${targetType} where ${criteria}`;
  }

  private async executeContradictionCheck(peerId: string): Promise<string> {
    if (peerId === "*") {
      // Check all peers
      const peers = this.store.listPeers();
      const results: string[] = [];
      
      for (const peer of peers) {
        const contradictions = this.store.getUnresolvedContradictions(peer.id);
        if (contradictions.length > 0) {
          results.push(`Peer ${peer.name}: ${contradictions.length} unresolved contradictions`);
        }
      }
      
      return results.join("\n") || "No unresolved contradictions";
    }

    const contradictions = this.store.getUnresolvedContradictions(peerId);
    return `${contradictions.length} unresolved contradictions for ${peerId}`;
  }

  // ─────────────────────────────────────────────────────────────────
  // PROCESS PENDING NUDGES
  // ─────────────────────────────────────────────────────────────────

  /**
   * Process all pending nudges.
   */
  async processPending(): Promise<Nudge[]> {
    const pending = this.store.getPendingNudges(5);
    const results: Nudge[] = [];

    for (const nudge of pending) {
      try {
        await this.executeNudge(nudge);
        results.push(nudge);
      } catch (err) {
        console.error(`[NudgeEngine] Failed to execute nudge ${nudge.id}:`, err);
      }
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────────────
  // USER MODEL QUERY
  // ─────────────────────────────────────────────────────────────────

  /**
   * Ask a question about a peer using the dialectic representation.
   */
  async askAboutPeer(peerId: string, question: string): Promise<string> {
    const representation = this.store.getRepresentation(peerId);
    if (!representation) {
      return `No representation found for ${peerId}`;
    }

    // Use LLM to answer based on representation
    const prompt = `You are answering questions about a user based on your understanding of them.

User representation:
- Preferences: ${representation.preferences.map(p => `${p.topic}: ${p.preference}`).join(", ")}
- Goals: ${representation.goals.map(g => g.description).join(", ")}
- Constraints: ${representation.constraints.map(c => c.description).join(", ")}
- Values: ${representation.values.map(v => v.value).join(", ")}
- Recent observations: ${representation.observations.slice(0, 10).map(o => o.content).join("; ")}
- Synthesis: ${representation.synthesis[0]?.content || "No synthesis yet"}

Question: ${question}

Answer based on the representation. If you don't have enough information, say so.`;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2",
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM error: ${response.status}`);
      }

      const data = await response.json() as { response: string };
      return data.response;
    } catch (err) {
      console.error("[NudgeEngine] LLM error:", err);
      return "Unable to answer at this time";
    }
  }
}

// Singleton
let nudgeEngine: NudgeEngine | null = null;

export function getNudgeEngine(): NudgeEngine {
  if (!nudgeEngine) {
    nudgeEngine = new NudgeEngine();
  }
  return nudgeEngine;
}