/**
 * Dialectic Reasoning Engine
 * 
 * Honcho-style reasoning: Thesis → Antithesis → Synthesis
 * 
 * Key insight: "Traditional RAG retrieves what was said,
 * but misses insights only accessible by rigorous reasoning."
 * 
 * This module:
 * 1. Observes raw events/messages
 * 2. Detects contradictions (antithesis)
 * 3. Synthesizes new understanding
 * 4. Extracts inferences (preferences, goals, constraints, values)
 */

import type {
  Observation,
  ObservationCategory,
  Peer,
  Contradiction,
  Synthesis,
  InferredPreference,
  InferredGoal,
  InferredConstraint,
  InferredValue,
} from "./types";
import { getDialecticStore, DialecticStore } from "./store";

// ═════════════════════════════════════════════════════════════════
// REASONING PROMPTS
// ═════════════════════════════════════════════════════════════════

const CONTRADICTION_DETECTION_PROMPT = `You are analyzing observations about a user to detect contradictions.

Observations:
{{observations}}

Look for pairs of observations that:
1. Directly contradict each other (A says X, B says not X)
2. Are incompatible in practice (A wants X, A cannot do X)
3. Reveal changed beliefs (A said X before, A says Y now)

For each contradiction found, provide:
- observation_a: The first observation (quote)
- observation_b: The second observation (quote)
- resolution: How to resolve it (newer_wins, context, refinement, correction, both_true)
- resolution_note: Why this resolution
- confidence: 0.0-1.0

Return JSON array. If no contradictions found, return empty array []`;

const SYNTHESIS_PROMPT = `You are synthesizing observations about a user into a coherent understanding.

Observations:
{{observations}}

Contradictions found:
{{contradictions}}

Previous syntheses:
{{previous_syntheses}}

Create a synthesis that:
1. Integrates all observations
2. Resolves any contradictions
3. Identifies patterns and themes
4. Highlights what's most important to understand about this user

Return JSON:
{
  "content": "The synthesized understanding...",
  "confidence": 0.0-1.0,
  "key_insights": ["insight1", "insight2"]
}`;

const PREFERENCE_EXTRACTION_PROMPT = `You are extracting user preferences from observations.

Observations:
{{observations}}

For each preference you can infer:
- topic: What domain (e.g., "programming_language", "architecture_style")
- preference: What they prefer (e.g., "TypeScript", "clean and minimal")
- confidence: How confident (0.0-1.0)
- evidence: Which observations support this (use quotes)

Only extract preferences that are clearly indicated by the evidence.
Be conservative with confidence - use 0.5+ only if strongly supported.

Return JSON array of preferences.`;

const GOAL_EXTRACTION_PROMPT = `You are extracting user goals from observations.

Observations:
{{observations}}

For each goal you can infer:
- description: What they're trying to achieve
- status: active, completed, abandoned, or unknown
- priority: high, medium, or low
- confidence: 0.0-1.0
- evidence: Which observations support this

Return JSON array of goals.`;

const CONSTRAINT_EXTRACTION_PROMPT = `You are extracting user constraints from observations.

Observations:
{{observations}}

For each constraint you can infer:
- description: What they cannot or will not do
- type: hard (cannot violate), soft (would prefer not to), preference (stated constraint)
- confidence: 0.0-1.0
- evidence: Which observations support this

Return JSON array of constraints.`;

const VALUE_EXTRACTION_PROMPT = `You are extracting user values from observations.

Observations:
{{observations}}

Values are what the user cares about intrinsically - not means to an end.

For each value:
- value: What they value (e.g., "family", "clean architecture", "autonomy")
- context: In what context (e.g., "when making technical decisions")
- confidence: 0.0-1.0
- evidence: Which observations support this

Return JSON array of values.`;

// ═════════════════════════════════════════════════════════════════
// REASONING ENGINE
// ═════════════════════════════════════════════════════════════════

export class DialecticReasoning {
  private store: DialecticStore;
  private ollamaUrl: string;

  constructor(store?: DialecticStore, ollamaUrl?: string) {
    this.store = store || getDialecticStore();
    this.ollamaUrl = ollamaUrl || process.env.OLLAMA_URL || "http://localhost:11434";
  }

  // ─────────────────────────────────────────────────────────────────
  // MAIN REASONING FLOW
  // ─────────────────────────────────────────────────────────────────

  /**
   * Process observations for a peer and update their representation.
   * This is the main entry point for dialectic reasoning.
   */
  async reason(peerId: string, newObservations?: Observation[]): Promise<{
    contradictions: Contradiction[];
    synthesis: Synthesis | null;
    preferences: InferredPreference[];
    goals: InferredGoal[];
    constraints: InferredConstraint[];
    values: InferredValue[];
  }> {
    // Get all observations for this peer
    const observations = newObservations 
      ? [...newObservations, ...this.store.getObservations(peerId, 50)]
      : this.store.getObservations(peerId, 100);

    if (observations.length < 3) {
      // Not enough data to reason
      return {
        contradictions: [],
        synthesis: null,
        preferences: [],
        goals: [],
        constraints: [],
        values: [],
      };
    }

    // Step 1: Detect contradictions
    const contradictions = await this.detectContradictions(peerId, observations);

    // Step 2: Synthesize understanding
    const synthesis = await this.synthesize(peerId, observations, contradictions);

    // Step 3: Extract inferences
    const preferences = await this.extractPreferences(peerId, observations);
    const goals = await this.extractGoals(peerId, observations);
    const constraints = await this.extractConstraints(peerId, observations);
    const values = await this.extractValues(peerId, observations);

    return {
      contradictions,
      synthesis,
      preferences,
      goals,
      constraints,
      values,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // CONTRADICTION DETECTION
  // ─────────────────────────────────────────────────────────────────

  /**
   * Detect contradictions between observations.
   * Uses LLM for sophisticated detection.
   */
  private async detectContradictions(
    peerId: string,
    observations: Observation[]
  ): Promise<Contradiction[]> {
    // Quick heuristic check: are there potential contradictions?
    const potentialPairs = this.findPotentialContradictions(observations);
    
    if (potentialPairs.length === 0) {
      return [];
    }

    // Use LLM for deeper analysis
    const prompt = CONTRADICTION_DETECTION_PROMPT.replace(
      "{{observations}}",
      observations.map(o => `- [${o.category}] ${o.content}`).join("\n")
    );

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);
      // Handle both array and object responses
      const detected = Array.isArray(parsed) ? parsed : (parsed.contradictions || []);

      // Store contradictions
      const stored: Contradiction[] = [];
      for (const c of detected.slice(0, 5)) {  // Limit to 5
        const contradiction = this.store.addContradiction(
          peerId,
          c.observation_a,
          c.observation_b,
          c.resolution || "unknown",
          c.resolution_note || "",
          c.confidence || 0.5
        );
        stored.push(contradiction);
      }

      return stored;
    } catch (err) {
      console.warn("[DialecticReasoning] Contradiction detection failed:", err);
      return [];
    }
  }

  /**
   * Find pairs of observations that might contradict.
   * Quick heuristic before LLM analysis.
   */
  private findPotentialContradictions(observations: Observation[]): [Observation, Observation][] {
    const pairs: [Observation, Observation][] = [];
    
    // Look for:
    // - Same topic, different values (preference vs preference)
    // - Goal vs constraint (goal: do X, constraint: cannot do X)
    // - Success vs error about same thing
    
    for (let i = 0; i < observations.length; i++) {
      for (let j = i + 1; j < observations.length; j++) {
        const a = observations[i];
        const b = observations[j];
        
        // Same category, might conflict
        if (a.category === b.category && a.category === "preference") {
          pairs.push([a, b]);
        }
        
        // Goal vs constraint
        if ((a.category === "goal" && b.category === "constraint") ||
            (a.category === "constraint" && b.category === "goal")) {
          pairs.push([a, b]);
        }
        
        // Success vs error
        if ((a.category === "success" && b.category === "error") ||
            (a.category === "error" && b.category === "success")) {
          pairs.push([a, b]);
        }
      }
    }
    
    return pairs.slice(0, 10);  // Limit
  }

  // ─────────────────────────────────────────────────────────────────
  // SYNTHESIS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Synthesize observations into coherent understanding.
   */
  private async synthesize(
    peerId: string,
    observations: Observation[],
    contradictions: Contradiction[]
  ): Promise<Synthesis | null> {
    if (observations.length < 5) {
      return null;  // Not enough to synthesize
    }

    const previousSyntheses = this.store.getSyntheses(peerId, 3);
    
    const prompt = SYNTHESIS_PROMPT
      .replace("{{observations}}", observations.map(o => `- [${o.category}] ${o.content}`).join("\n"))
      .replace("{{contradictions}}", contradictions.length > 0 
        ? contradictions.map(c => `- ${c.observationA} vs ${c.observationB} (${c.resolution})`).join("\n")
        : "None detected"
      )
      .replace("{{previous_syntheses}}", previousSyntheses.length > 0
        ? previousSyntheses.map(s => `- ${s.content}`).join("\n")
        : "First synthesis"
      );

    try {
      const response = await this.callLLM(prompt);
      const result = JSON.parse(response);

      const synthesis = this.store.addSynthesis(
        peerId,
        result.content,
        observations.slice(0, 20).map(o => o.id),  // Link to observations
        contradictions.map(c => c.id),
        result.confidence || 0.7
      );

      return synthesis;
    } catch (err) {
      console.warn("[DialecticReasoning] Synthesis failed:", err);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // INFERENCE EXTRACTION
  // ─────────────────────────────────────────────────────────────────

  private async extractPreferences(
    peerId: string,
    observations: Observation[]
  ): Promise<InferredPreference[]> {
    const prompt = PREFERENCE_EXTRACTION_PROMPT.replace(
      "{{observations}}",
      observations.map(o => `- [${o.category}] ${o.content}`).join("\n")
    );

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);
      // Handle both array and object responses
      const preferences = Array.isArray(parsed) ? parsed : (parsed.preferences || []);

      const stored: InferredPreference[] = [];
      for (const p of preferences.slice(0, 10)) {  // Limit
        if (p.topic && p.preference && p.confidence >= 0.5) {
          const pref = this.store.addPreference(
            peerId,
            p.topic,
            p.preference,
            p.evidence || [],
            p.confidence
          );
          stored.push(pref);
        }
      }

      return stored;
    } catch (err) {
      console.warn("[DialecticReasoning] Preference extraction failed:", err);
      return [];
    }
  }

  private async extractGoals(
    peerId: string,
    observations: Observation[]
  ): Promise<InferredGoal[]> {
    const prompt = GOAL_EXTRACTION_PROMPT.replace(
      "{{observations}}",
      observations.map(o => `- [${o.category}] ${o.content}`).join("\n")
    );

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);
      // Handle both array and object responses
      const goals = Array.isArray(parsed) ? parsed : (parsed.goals || []);

      const stored: InferredGoal[] = [];
      for (const g of goals.slice(0, 5)) {  // Limit to 5 goals
        if (g.description && g.confidence >= 0.5) {
          const goal = this.store.addGoal(
            peerId,
            g.description,
            g.status || "active",
            g.priority || "medium",
            g.evidence || [],
            g.confidence
          );
          stored.push(goal);
        }
      }

      return stored;
    } catch (err) {
      console.warn("[DialecticReasoning] Goal extraction failed:", err);
      return [];
    }
  }

  private async extractConstraints(
    peerId: string,
    observations: Observation[]
  ): Promise<InferredConstraint[]> {
    const prompt = CONSTRAINT_EXTRACTION_PROMPT.replace(
      "{{observations}}",
      observations.map(o => `- [${o.category}] ${o.content}`).join("\n")
    );

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);
      // Handle both array and object responses
      const constraints = Array.isArray(parsed) ? parsed : (parsed.constraints || []);

      const stored: InferredConstraint[] = [];
      for (const c of constraints.slice(0, 10)) {
        if (c.description && c.confidence >= 0.5) {
          const constraint = this.store.addConstraint(
            peerId,
            c.description,
            c.type || "soft",
            c.evidence || [],
            c.confidence
          );
          stored.push(constraint);
        }
      }

      return stored;
    } catch (err) {
      console.warn("[DialecticReasoning] Constraint extraction failed:", err);
      return [];
    }
  }

  private async extractValues(
    peerId: string,
    observations: Observation[]
  ): Promise<InferredValue[]> {
    const prompt = VALUE_EXTRACTION_PROMPT.replace(
      "{{observations}}",
      observations.map(o => `- [${o.category}] ${o.content}`).join("\n")
    );

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);
      // Handle both array and object responses
      const values = Array.isArray(parsed) ? parsed : (parsed.values || []);

      const stored: InferredValue[] = [];
      for (const v of values.slice(0, 10)) {
        if (v.value && v.confidence >= 0.5) {
          const value = this.store.addValue(
            peerId,
            v.value,
            v.context || "",
            v.evidence || [],
            v.confidence
          );
          stored.push(value);
        }
      }

      return stored;
    } catch (err) {
      console.warn("[DialecticReasoning] Value extraction failed:", err);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // LLM CALL
  // ─────────────────────────────────────────────────────────────────

  private async callLLM(prompt: string): Promise<string> {
    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM error: ${response.status}`);
    }

    const data = await response.json() as { response: string };
    return data.response;
  }
}

// ═════════════════════════════════════════════════════════════════
// SINGLETON
// ═════════════════════════════════════════════════════════════════

let reasoning: DialecticReasoning | null = null;

export function getDialecticReasoning(): DialecticReasoning {
  if (!reasoning) {
    reasoning = new DialecticReasoning();
  }
  return reasoning;
}