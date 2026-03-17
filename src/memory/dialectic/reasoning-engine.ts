/**
 * Dialectic Reasoning Engine - Research-Based Implementation
 * 
 * This implements multiple reasoning strategies based on research:
 * 
 * 1. Chain-of-Thought (CoT) - Wei et al. 2022
 *    - Step-by-step reasoning before conclusion
 *    - Effective for complex deductions
 * 
 * 2. Self-Consistency - Wang et al. 2022
 *    - Sample multiple reasoning paths
 *    - Vote on final answer
 *    - Reduces hallucination
 * 
 * 3. Tree-of-Thoughts (ToT) - Yao et al. 2023
 *    - Branch multiple reasoning paths
 *    - Evaluate each branch
 *    - Backtrack from dead ends
 * 
 * 4. Formal Logic - Classic approach
 *    - Convert to logical propositions
 *    - Apply inference rules
 *    - Prove or disprove
 * 
 * 5. Dialectic - Hegel's approach
 *    - Thesis: Initial claim
 *    - Antithesis: Contradiction
 *    - Synthesis: Resolution
 */

import type {
  Observation,
  Contradiction,
  Synthesis,
  InferredPreference,
  InferredGoal,
  InferredConstraint,
  InferredValue,
} from "./types";
import { getDialecticStore, DialecticStore } from "./store";

// ═════════════════════════════════════════════════════════════════
// REASONING STRATEGIES
// ═════════════════════════════════════════════════════════════════

export type ReasoningStrategy = 
  | "chain-of-thought"
  | "self-consistency"
  | "tree-of-thought"
  | "formal-logic"
  | "dialectic";

export interface ReasoningConfig {
  strategy: ReasoningStrategy;
  model: string;
  ollamaUrl: string;
  samples: number;  // For self-consistency
  branchingFactor: number;  // For tree-of-thought
  maxDepth: number;  // For tree-of-thought
}

const DEFAULT_CONFIG: ReasoningConfig = {
  strategy: "dialectic",
  model: "nemotron-3-super:cloud",  // Fastest cloud model (42s, 100% accuracy)
  ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
  samples: 3,
  branchingFactor: 3,
  maxDepth: 4,
};

// ═════════════════════════════════════════════════════════════════
// CHAIN-OF-THOUGHT PROMPTS
// ═════════════════════════════════════════════════════════════════

const COT_CONTRADICTION_PROMPT = `Analyze these observations to find contradictions.

Observations:
{{observations}}

Think step by step:
1. First, identify the core claims in each observation
2. Look for pairs where claims cannot both be true
3. Consider context that might explain apparent contradictions
4. For each real contradiction found:
   - State the contradiction clearly
   - Explain why it's a contradiction
   - Suggest how to resolve it (newer_wins, context, refinement, correction, both_true)

Return JSON array: [{"observation_a": "...", "observation_b": "...", "reasoning": "...", "resolution": "...", "confidence": 0.0-1.0}]`;

const COT_PREFERENCE_PROMPT = `Extract preferences from these observations.

Observations:
{{observations}}

Think step by step:
1. Identify statements about what the user likes/dislikes
2. Note the domain (programming language, architecture, tools, etc.)
3. Assess confidence based on evidence
4. Be conservative - only extract preferences clearly supported

Return JSON array: [{"topic": "...", "preference": "...", "confidence": 0.0-1.0, "evidence": ["..."]}]`;

// ═════════════════════════════════════════════════════════════════
// SELF-CONSISTENCY (MULTIPLE SAMPLES + VOTING)
// ═════════════════════════════════════════════════════════════════

const SC_VOTE_PROMPT = `You are analyzing extracted preferences.

Extractions from multiple reasoning paths:
{{extractions}}

For each preference topic:
1. Count how many paths extracted the same preference
2. Weight by confidence scores
3. Select the consensus preference(s)

Return JSON array of consensus preferences: [{"topic": "...", "preference": "...", "confidence": 0.0-1.0, "votes": N}]`;

// ═════════════════════════════════════════════════════════════════
// TREE-OF-THOUGHTS (BRANCHING + EVALUATION)
// ═════════════════════════════════════════════════════════════════

const TOT_GENERATE_PROMPT = `Generate {{n}} possible interpretations of these observations.

Observations:
{{observations}}

Each interpretation should:
1. Identify a possible understanding
2. Note gaps or conflicts
3. Suggest what to infer

Return JSON array: [{"interpretation": "...", "gaps": ["..."], "possible_inferences": ["..."]}]`;

const TOT_EVALUATE_PROMPT = `Evaluate this interpretation for correctness and completeness.

Interpretation: {{interpretation}}
Original observations: {{observations}}

Rate each aspect 1-10:
- Coherence: Does this interpretation make sense?
- Evidence: Is it well-supported by observations?
- Completeness: Does it explain all observations?

Return JSON: {"coherence": N, "evidence": N, "completeness": N, "issues": ["..."]}`;

// ═════════════════════════════════════════════════════════════════
// FORMAL LOGIC (PROPOSITIONAL REASONING)
// ═════════════════════════════════════════════════════════════════

const FORMAL_LOGIC_PROMPT = `Convert these observations to logical propositions and check for contradictions.

Observations:
{{observations}}

Step 1: Convert to propositional logic
- "I prefer TypeScript" → P1: prefers(user, typescript)
- "I dislike Python for large projects" → P2: ¬prefers(user, python_large_projects)

Step 2: Identify potential conflicts
- P1 ∧ ¬P1 → contradiction

Step 3: Apply inference rules
- Modus ponens: If P→Q and P, then Q
- Resolution: Find contradictions using resolution rule

Return JSON: {"propositions": [...], "conflicts": [...], "inferences": [...]}`;

// ═════════════════════════════════════════════════════════════════
// DIALECTIC (THESIS-ANTITHESIS-SYNTHESIS)
// ═════════════════════════════════════════════════════════════════

const DIALECTIC_PROMPT = `Perform dialectic reasoning on these observations.

Observations:
{{observations}}

THESIS: What is the initial understanding?
- Identify core beliefs stated
- Note preferences and goals

ANTITHESIS: What contradicts or challenges the thesis?
- Find conflicting statements
- Note changes over time
- Identify edge cases

SYNTHESIS: Resolve the contradictions.
- What remains true in all contexts?
- What changes based on context?
- What is the unified understanding?

Return JSON: {
  "thesis": {"claims": [...], "preferences": [...], "goals": [...]},
  "antithesis": {"contradictions": [...], "challenges": [...]},
  "synthesis": {"unified": "...", "contextual": [...], "confidence": 0.0-1.0}
}`;

// ═════════════════════════════════════════════════════════════════
// REASONING ENGINE
// ═════════════════════════════════════════════════════════════════

export class DialecticReasoningEngine {
  private store: DialecticStore;
  private config: ReasoningConfig;

  constructor(config?: Partial<ReasoningConfig>, store?: DialecticStore) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store || getDialecticStore();
  }

  // ─────────────────────────────────────────────────────────────────
  // MAIN REASONING ENTRY POINT
  // ─────────────────────────────────────────────────────────────────

  async reason(peerId: string): Promise<{
    contradictions: Contradiction[];
    synthesis: Synthesis | null;
    preferences: InferredPreference[];
    goals: InferredGoal[];
    constraints: InferredConstraint[];
    values: InferredValue[];
    reasoningPath: string[];
  }> {
    const observations = this.store.getObservations(peerId, 100);
    
    if (observations.length < 3) {
      return this.emptyResult();
    }

    const reasoningPath: string[] = [];

    switch (this.config.strategy) {
      case "chain-of-thought":
        return this.chainOfThoughtReasoning(peerId, observations);
      
      case "self-consistency":
        return this.selfConsistencyReasoning(peerId, observations);
      
      case "tree-of-thought":
        return this.treeOfThoughtReasoning(peerId, observations);
      
      case "formal-logic":
        return this.formalLogicReasoning(peerId, observations);
      
      case "dialectic":
      default:
        return this.dialecticReasoning(peerId, observations);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CHAIN-OF-THOUGHT REASONING
  // ─────────────────────────────────────────────────────────────────

  private async chainOfThoughtReasoning(
    peerId: string,
    observations: Observation[]
  ): Promise<ReturnType<typeof this.reason>> {
    const obsText = observations.map(o => `[${o.category}] ${o.content}`).join("\n");

    // Step-by-step contradiction detection
    const contradictions = await this.cotDetectContradictions(peerId, obsText);
    
    // Step-by-step preference extraction
    const preferences = await this.cotExtractPreferences(peerId, obsText);
    
    // Step-by-step goal extraction
    const goals = await this.cotExtractGoals(peerId, obsText);
    
    // Step-by-step constraint extraction
    const constraints = await this.cotExtractConstraints(peerId, obsText);
    
    // Step-by-step value extraction
    const values = await this.cotExtractValues(peerId, obsText);

    // Synthesize
    const synthesis = await this.cotSynthesize(peerId, obsText, contradictions);

    return { contradictions, synthesis, preferences, goals, constraints, values, reasoningPath: ["chain-of-thought"] };
  }

  // ─────────────────────────────────────────────────────────────────
  // SELF-CONSISTENCY REASONING
  // ─────────────────────────────────────────────────────────────────

  private async selfConsistencyReasoning(
    peerId: string,
    observations: Observation[]
  ): Promise<ReturnType<typeof this.reason>> {
    const obsText = observations.map(o => `[${o.category}] ${o.content}`).join("\n");
    
    // Sample multiple reasoning paths
    const pathPromises = Array(this.config.samples).fill(null).map(() =>
      this.extractSingle(obsText, "preferences")
    );

    const paths = await Promise.all(pathPromises);
    
    // Vote on preferences
    const preferences = await this.voteOnPreferences(paths, peerId);

    // Similar for other types
    const [contradictions, goals, constraints, values] = await Promise.all([
      this.cotDetectContradictions(peerId, obsText),
      this.cotExtractGoals(peerId, obsText),
      this.cotExtractConstraints(peerId, obsText),
      this.cotExtractValues(peerId, obsText),
    ]);

    const synthesis = await this.cotSynthesize(peerId, obsText, contradictions);

    return { 
      contradictions, 
      synthesis, 
      preferences, 
      goals, 
      constraints, 
      values, 
      reasoningPath: [`self-consistency:${this.config.samples}x`] 
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // TREE-OF-THOUGHTS REASONING
  // ─────────────────────────────────────────────────────────────────

  private async treeOfThoughtReasoning(
    peerId: string,
    observations: Observation[]
  ): Promise<ReturnType<typeof this.reason>> {
    const obsText = observations.map(o => `[${o.category}] ${o.content}`).join("\n");

    // Generate initial branches
    const branches = await this.generateBranches(obsText, this.config.branchingFactor);
    
    // Evaluate each branch
    const evaluatedBranches = await Promise.all(
      branches.map(b => this.evaluateBranch(b, obsText))
    );

    // Sort by score and pick best
    evaluatedBranches.sort((a, b) => b.score - a.score);
    const bestBranch = evaluatedBranches[0];

    // Extract from best branch
    const [contradictions, preferences, goals, constraints, values] = await Promise.all([
      this.cotDetectContradictions(peerId, obsText),
      this.cotExtractPreferences(peerId, obsText),
      this.cotExtractGoals(peerId, obsText),
      this.cotExtractConstraints(peerId, obsText),
      this.cotExtractValues(peerId, obsText),
    ]);

    const synthesis = await this.cotSynthesize(peerId, obsText, contradictions);

    return {
      contradictions,
      synthesis,
      preferences,
      goals,
      constraints,
      values,
      reasoningPath: [`tree-of-thought:depth${this.config.maxDepth}`],
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // FORMAL LOGIC REASONING
  // ─────────────────────────────────────────────────────────────────

  private async formalLogicReasoning(
    peerId: string,
    observations: Observation[]
  ): Promise<ReturnType<typeof this.reason>> {
    const obsText = observations.map(o => `[${o.category}] ${o.content}`).join("\n");

    // Convert to propositions and apply inference rules
    const result = await this.callLLM(FORMAL_LOGIC_PROMPT.replace("{{observations}}", obsText));
    
    // Parse results
    const parsed = JSON.parse(result);
    
    // Convert to our types
    const contradictions: Contradiction[] = (parsed.conflicts || []).map((c: any) =>
      this.store.addContradiction(peerId, c.p1, c.p2, "both_true", c.resolution || "", 0.8)
    );

    // Standard extraction for preferences/goals
    const [preferences, goals, constraints, values] = await Promise.all([
      this.cotExtractPreferences(peerId, obsText),
      this.cotExtractGoals(peerId, obsText),
      this.cotExtractConstraints(peerId, obsText),
      this.cotExtractValues(peerId, obsText),
    ]);

    const synthesis = await this.cotSynthesize(peerId, obsText, contradictions);

    return {
      contradictions,
      synthesis,
      preferences,
      goals,
      constraints,
      values,
      reasoningPath: ["formal-logic", ...parsed.propositions?.slice(0, 5) || []],
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // DIALECTIC REASONING (DEFAULT)
  // ─────────────────────────────────────────────────────────────────

  private async dialecticReasoning(
    peerId: string,
    observations: Observation[]
  ): Promise<ReturnType<typeof this.reason>> {
    const obsText = observations.map(o => `[${o.category}] ${o.content}`).join("\n");

    // Perform dialectic analysis
    const result = await this.callLLM(DIALECTIC_PROMPT.replace("{{observations}}", obsText));
    
    let dialecticResult;
    try {
      dialecticResult = JSON.parse(result);
    } catch (e) {
      // Try harder to parse
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        dialecticResult = JSON.parse(jsonMatch[0]);
      } else {
        // Return empty result if parsing fails
        dialecticResult = { thesis: {}, antithesis: {}, synthesis: { unified: "Could not parse LLM response" } };
      }
    }

    // Extract from the synthesis
    const synthesis = this.store.addSynthesis(
      peerId,
      dialecticResult.synthesis?.unified || "No synthesis",
      observations.slice(0, 20).map(o => o.id),
      [],
      dialecticResult.synthesis?.confidence || 0.7
    );

    // Extract preferences, goals, etc. from thesis/antithesis
    const [preferences, goals, constraints, values, contradictions] = await Promise.all([
      this.extractFromDialectic(dialecticResult.thesis, "preferences", peerId),
      this.cotExtractGoals(peerId, obsText),
      this.cotExtractConstraints(peerId, obsText),
      this.cotExtractValues(peerId, obsText),
      this.extractContradictionsFromDialectic(dialecticResult.antithesis, peerId),
    ]);

    return {
      contradictions,
      synthesis,
      preferences,
      goals,
      constraints,
      values,
      reasoningPath: ["dialectic:thesis→antithesis→synthesis"],
    };
  }

  // ═════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═════════════════════════════════════════════════════════════════

  private async cotDetectContradictions(peerId: string, obsText: string): Promise<Contradiction[]> {
    const prompt = COT_CONTRADICTION_PROMPT.replace("{{observations}}", obsText);
    const result = await this.callLLM(prompt);
    const detected = JSON.parse(result);

    const stored: Contradiction[] = [];
    for (const c of (Array.isArray(detected) ? detected : detected.contradictions || []).slice(0, 5)) {
      stored.push(this.store.addContradiction(
        peerId, c.observation_a, c.observation_b,
        c.resolution || "unknown", c.reasoning || "", c.confidence || 0.5
      ));
    }
    return stored;
  }

  private async cotExtractPreferences(peerId: string, obsText: string): Promise<InferredPreference[]> {
    const prompt = COT_PREFERENCE_PROMPT.replace("{{observations}}", obsText);
    const result = await this.callLLM(prompt);
    const parsed = JSON.parse(result);
    const prefs = Array.isArray(parsed) ? parsed : parsed.preferences || [];

    const stored: InferredPreference[] = [];
    for (const p of prefs.slice(0, 10)) {
      if (p.topic && p.preference && p.confidence >= 0.5) {
        stored.push(this.store.addPreference(peerId, p.topic, p.preference, p.evidence || [], p.confidence));
      }
    }
    return stored;
  }

  private async cotExtractGoals(peerId: string, obsText: string): Promise<InferredGoal[]> {
    const prompt = `Extract goals from these observations. Think step by step.

Observations:
${obsText}

For each goal:
1. Identify what the user wants to achieve
2. Assess status (active, completed, abandoned)
3. Assign priority (high, medium, low)
4. Note confidence level

Return JSON array: [{"description": "...", "status": "active|completed|abandoned", "priority": "high|medium|low", "confidence": 0.0-1.0}]`;

    const result = await this.callLLM(prompt);
    const parsed = JSON.parse(result);
    const goals = Array.isArray(parsed) ? parsed : parsed.goals || [];

    const stored: InferredGoal[] = [];
    for (const g of goals.slice(0, 5)) {
      if (g.description && g.confidence >= 0.5) {
        stored.push(this.store.addGoal(
          peerId, g.description, g.status || "active", g.priority || "medium", [], g.confidence
        ));
      }
    }
    return stored;
  }

  private async cotExtractConstraints(peerId: string, obsText: string): Promise<InferredConstraint[]> {
    const prompt = `Extract constraints from these observations. Think step by step.

Observations:
${obsText}

Constraints are what the user cannot or will not do.

For each:
1. Identify the constraint
2. Classify as: hard (cannot violate), soft (prefer not to), preference (stated)
3. Note confidence

Return JSON array: [{"description": "...", "type": "hard|soft|preference", "confidence": 0.0-1.0}]`;

    const result = await this.callLLM(prompt);
    const parsed = JSON.parse(result);
    const constraints = Array.isArray(parsed) ? parsed : parsed.constraints || [];

    const stored: InferredConstraint[] = [];
    for (const c of constraints.slice(0, 10)) {
      if (c.description && c.confidence >= 0.5) {
        stored.push(this.store.addConstraint(peerId, c.description, c.type || "soft", [], c.confidence));
      }
    }
    return stored;
  }

  private async cotExtractValues(peerId: string, obsText: string): Promise<InferredValue[]> {
    const prompt = `Extract intrinsic values from these observations. Think step by step.

Observations:
${obsText}

Values are what the user cares about for its own sake, not as a means to an end.

For each:
1. Identify the value
2. Note the context
3. Assess confidence

Return JSON array: [{"value": "...", "context": "...", "confidence": 0.0-1.0}]`;

    const result = await this.callLLM(prompt);
    const parsed = JSON.parse(result);
    const values = Array.isArray(parsed) ? parsed : parsed.values || [];

    const stored: InferredValue[] = [];
    for (const v of values.slice(0, 10)) {
      if (v.value && v.confidence >= 0.5) {
        stored.push(this.store.addValue(peerId, v.value, v.context || "", [], v.confidence));
      }
    }
    return stored;
  }

  private async cotSynthesize(
    peerId: string,
    obsText: string,
    contradictions: Contradiction[]
  ): Promise<Synthesis | null> {
    const synthesis = await this.callLLM(`Synthesize a coherent understanding from these observations.

Observations:
${obsText}

Contradictions found: ${contradictions.length > 0 ? contradictions.map(c => `${c.observationA} vs ${c.observationB}`).join("; ") : "None"}

Create a unified understanding that:
1. Integrates all observations
2. Resolves contradictions
3. Identifies key themes

Return JSON: {"content": "...", "confidence": 0.0-1.0, "key_insights": ["..."]}`);

    const parsed = JSON.parse(synthesis);
    return this.store.addSynthesis(
      peerId,
      parsed.content,
      [],
      contradictions.map(c => c.id),
      parsed.confidence || 0.7
    );
  }

  private async generateBranches(obsText: string, n: number): Promise<string[]> {
    const result = await this.callLLM(TOT_GENERATE_PROMPT
      .replace("{{n}}", String(n))
      .replace("{{observations}}", obsText));
    const parsed = JSON.parse(result);
    return Array.isArray(parsed) ? parsed.map((p: any) => p.interpretation) : [];
  }

  private async evaluateBranch(branch: string, obsText: string): Promise<{ branch: string; score: number }> {
    const result = await this.callLLM(TOT_EVALUATE_PROMPT
      .replace("{{interpretation}}", branch)
      .replace("{{observations}}", obsText));
    const parsed = JSON.parse(result);
    const score = (parsed.coherence + parsed.evidence + parsed.completeness) / 3;
    return { branch, score };
  }

  private async extractFromBranch(
    branch: { branch: string; score: number },
    type: string,
    peerId: string
  ): Promise<InferredPreference[]> {
    // Extract using the branch as context
    return this.cotExtractPreferences(peerId, branch.branch);
  }

  private async extractSingle(obsText: string, type: string): Promise<any[]> {
    return this.cotExtractPreferences("temp", obsText);
  }

  private async voteOnPreferences(
    paths: any[][],
    peerId: string
  ): Promise<InferredPreference[]> {
    // Group by topic and vote
    const topicCounts = new Map<string, Map<string, number>>();
    
    for (const pathPrefs of paths) {
      for (const pref of pathPrefs) {
        if (!topicCounts.has(pref.topic)) {
          topicCounts.set(pref.topic, new Map());
        }
        const topicPrefs = topicCounts.get(pref.topic)!;
        topicPrefs.set(pref.preference, (topicPrefs.get(pref.preference) || 0) + 1);
      }
    }

    const stored: InferredPreference[] = [];
    for (const [topic, prefs] of topicCounts) {
      let maxCount = 0;
      let winner = "";
      for (const [pref, count] of prefs) {
        if (count > maxCount) {
          maxCount = count;
          winner = pref;
        }
      }
      if (maxCount >= Math.ceil(paths.length / 2)) {
        stored.push(this.store.addPreference(
          peerId, topic, winner, [], maxCount / paths.length
        ));
      }
    }
    return stored;
  }

  private async extractFromDialectic(
    dialecticPart: any,
    type: string,
    peerId: string
  ): Promise<InferredPreference[]> {
    if (!dialecticPart) return [];
    
    // thesis might have { preferences: ["TypeScript over JavaScript"], goals: [...] }
    // or it might have { preferences: [{ topic: "lang", preference: "TS" }] }
    const items = dialecticPart[type] || dialecticPart.preferences || [];
    
    if (!Array.isArray(items) || items.length === 0) return [];
    
    const stored: InferredPreference[] = [];
    
    for (const item of items.slice(0, 10)) {
      if (typeof item === 'string') {
        // String format: "TypeScript over JavaScript"
        // Parse it into topic/preference
        const parts = item.split(/ over | vs | versus | more than /i);
        if (parts.length === 2) {
          stored.push(this.store.addPreference(
            peerId, 
            "general", 
            item, // Use whole string as preference
            [], 
            0.7
          ));
        } else {
          // Just a preference statement
          stored.push(this.store.addPreference(peerId, "general", item, [], 0.6));
        }
      } else if (item.topic && item.preference) {
        // Object format: { topic: "lang", preference: "TS" }
        stored.push(this.store.addPreference(peerId, item.topic, item.preference, [], 0.7));
      }
    }
    
    return stored;
  }

  private async extractContradictionsFromDialectic(
    antithesis: any,
    peerId: string
  ): Promise<Contradiction[]> {
    if (!antithesis || !antithesis.contradictions) return [];
    
    const stored: Contradiction[] = [];
    for (const c of antithesis.contradictions.slice(0, 5)) {
      // Ensure required fields exist
      if (!c.a && !c.observation_a) continue;
      if (!c.b && !c.observation_b) continue;
      
      stored.push(this.store.addContradiction(
        peerId, 
        c.a || c.observation_a || "unknown", 
        c.b || c.observation_b || "unknown", 
        c.resolution || "unknown", 
        c.reason || c.reasoning || "", 
        c.confidence || 0.7
      ));
    }
    return stored;
  }

  private emptyResult(): ReturnType<typeof this.reason> extends Promise<infer R> ? R : never {
    return {
      contradictions: [],
      synthesis: null,
      preferences: [],
      goals: [],
      constraints: [],
      values: [],
      reasoningPath: [],
    } as any;
  }

  // ═════════════════════════════════════════════════════════════════
  // LLM CALL
  // ═════════════════════════════════════════════════════════════════

  private async callLLM(prompt: string): Promise<string> {
    const response = await fetch(`${this.config.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM error: ${response.status}`);
    }

    const data = await response.json() as { response: string };
    let result = data.response;
    
    // Handle markdown code blocks - extract JSON from ```json ... ```
    if (result.includes("```")) {
      // Try to extract JSON from code block
      const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        result = jsonMatch[1].trim();
      } else {
        // Remove ``` markers
        result = result.replace(/```json?/g, "").replace(/```/g, "").trim();
      }
    }
    
    return result;
  }
}

// ═════════════════════════════════════════════════════════════════
// SINGLETON
// ═════════════════════════════════════════════════════════════════

let engine: DialecticReasoningEngine | null = null;

export function getDialecticReasoningEngine(
  config?: Partial<ReasoningConfig>
): DialecticReasoningEngine {
  if (!engine || config) {
    engine = new DialecticReasoningEngine(config);
  }
  return engine;
}

export function setReasoningModel(model: string): void {
  engine = new DialecticReasoningEngine({ model });
  console.log(`[DialecticReasoning] Model set to: ${model}`);
}