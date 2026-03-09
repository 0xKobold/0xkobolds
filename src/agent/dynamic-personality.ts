/**
 * Dynamic Personality System - v0.2.0
 * 
 * Adapts the agent's persona based on interactions and user feedback.
 * Part of the Persona System (Phase 1.2).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

interface PersonalityTraits {
  warmth: number; // 0-100, how friendly
  formality: number; // 0-100, how formal
  verbosity: number; // 0-100, how detailed
  humor: number; // 0-100, how much humor
  enthusiasm: number; // 0-100, how excited
}

interface InteractionRecord {
  timestamp: string;
  type: "feedback" | "reaction" | "correction" | "preference";
  value: string;
  sentiment: number; // -1 to 1
  trait?: keyof PersonalityTraits;
}

interface PersonalityState {
  traits: PersonalityTraits;
  baseTraits: PersonalityTraits;
  interactions: InteractionRecord[];
  adaptationLevel: number; // 0-100, how much adapted from base
  lastAdapted: string;
}

const DEFAULT_TRAITS: PersonalityTraits = {
  warmth: 70,
  formality: 40,
  verbosity: 60,
  humor: 30,
  enthusiasm: 50,
};

const PERSONALITY_FILE = ".personality-state.json";

/**
 * Load personality state
 */
export async function loadPersonalityState(
  workspaceDir: string
): Promise<PersonalityState> {
  const filePath = path.join(workspaceDir, PERSONALITY_FILE);
  
  if (!existsSync(filePath)) {
    return {
      traits: { ...DEFAULT_TRAITS },
      baseTraits: { ...DEFAULT_TRAITS },
      interactions: [],
      adaptationLevel: 0,
      lastAdapted: new Date().toISOString(),
    };
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      traits: { ...DEFAULT_TRAITS },
      baseTraits: { ...DEFAULT_TRAITS },
      interactions: [],
      adaptationLevel: 0,
      lastAdapted: new Date().toISOString(),
    };
  }
}

/**
 * Save personality state
 */
export async function savePersonalityState(
  workspaceDir: string,
  state: PersonalityState
): Promise<void> {
  const filePath = path.join(workspaceDir, PERSONALITY_FILE);
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Record a user interaction
 */
export async function recordInteraction(
  workspaceDir: string,
  interaction: Omit<InteractionRecord, "timestamp">
): Promise<void> {
  const state = await loadPersonalityState(workspaceDir);
  
  state.interactions.push({
    ...interaction,
    timestamp: new Date().toISOString(),
  });
  
  // Keep only last 100 interactions
  if (state.interactions.length > 100) {
    state.interactions = state.interactions.slice(-100);
  }
  
  await savePersonalityState(workspaceDir, state);
  
  // Trigger adaptation periodically
  if (state.interactions.length % 10 === 0) {
    await adaptPersonality(workspaceDir);
  }
}

/**
 * Adapt personality based on recorded interactions
 */
export async function adaptPersonality(workspaceDir: string): Promise<PersonalityState> {
  const state = await loadPersonalityState(workspaceDir);
  
  // Calculate new trait values based on interactions
  const recent = state.interactions.slice(-20); // Last 20 interactions
  
  if (recent.length < 5) {
    return state; // Not enough data
  }
  
  // Analyze sentiment patterns
  const positiveCount = recent.filter((i) => i.sentiment > 0).length;
  const negativeCount = recent.filter((i) => i.sentiment < 0).length;
  
  // Adjust traits based on patterns
  if (negativeCount > positiveCount * 1.5) {
    // More negative feedback - reduce enthusiasm, increase formality
    state.traits.enthusiasm = clamp(state.traits.enthusiasm - 5);
    state.traits.formality = clamp(state.traits.formality + 5);
  } else if (positiveCount > negativeCount * 1.5) {
    // More positive feedback - can be more warm and enthusiastic
    state.traits.warmth = clamp(state.traits.warmth + 3);
    state.traits.enthusiasm = clamp(state.traits.enthusiasm + 3);
  }
  
  // Check for specific trait feedback
  const traitFeedback = recent.filter((i) => i.trait);
  for (const feedback of traitFeedback) {
    if (feedback.trait && feedback.sentiment !== 0) {
      const adjustment = feedback.sentiment * 5;
      state.traits[feedback.trait] = clamp(
        state.traits[feedback.trait] + adjustment
      );
    }
  }
  
  // Calculate adaptation level
  let totalDiff = 0;
  for (const key of Object.keys(state.baseTraits) as Array<keyof PersonalityTraits>) {
    totalDiff += Math.abs(state.traits[key] - state.baseTraits[key]);
  }
  state.adaptationLevel = clamp(totalDiff / 5); // Average diff across 5 traits
  
  state.lastAdapted = new Date().toISOString();
  
  await savePersonalityState(workspaceDir, state);
  
  console.log(
    `[Personality] Adapted traits - Warmth: ${state.traits.warmth}, ` +
    `Formality: ${state.traits.formality}, Enthusiasm: ${state.traits.enthusiasm}`
  );
  
  return state;
}

/**
 * Get current persona based on adapted traits
 */
export async function getDynamicPersona(workspaceDir: string): Promise<string> {
  const state = await loadPersonalityState(workspaceDir);
  
  const parts: string[] = [];
  
  // Tone description
  const tones: string[] = [];
  if (state.traits.warmth > 60) tones.push("warm");
  if (state.traits.warmth < 40) tones.push("professional");
  if (state.traits.formality > 60) tones.push("formal");
  if (state.traits.formality < 40) tones.push("casual");
  if (state.traits.enthusiasm > 60) tones.push("enthusiastic");
  if (state.traits.verbosity > 70) tones.push("detailed");
  if (state.traits.verbosity < 40) tones.push("concise");
  
  parts.push(`Tone: ${tones.join(", ") || "balanced"}`);
  
  // Behavior instructions
  if (state.traits.humor > 50) {
    parts.push("Use light humor when appropriate");
  }
  
  if (state.traits.verbosity > 70) {
    parts.push("Provide detailed explanations with examples");
  } else if (state.traits.verbosity < 40) {
    parts.push("Be concise and direct");
  }
  
  if (state.traits.formality > 60) {
    parts.push("Use formal language and structure");
  } else {
    parts.push("Use conversational language");
  }
  
  if (state.traits.enthusiasm > 60) {
    parts.push("Show enthusiasm and encouragement");
  }
  
  // Adaptation note
  if (state.adaptationLevel > 20) {
    parts.push(`\n[Adapted ${state.adaptationLevel.toFixed(0)}% from base personality based on interactions]`);
  }
  
  return parts.join("\n");
}

/**
 * Get personality insights
 */
export async function getPersonalityInsights(
  workspaceDir: string
): Promise<{
  traits: PersonalityTraits;
  adaptationLevel: number;
  topLikes: string[];
  topDislikes: string[];
  recommendation: string;
}> {
  const state = await loadPersonalityState(workspaceDir);
  
  // Find top likes/dislikes from feedback
  const likes = state.interactions
    .filter((i) => i.type === "reaction" && i.sentiment > 0)
    .map((i) => i.value);
  
  const dislikes = state.interactions
    .filter((i) => i.type === "reaction" && i.sentiment < 0)
    .map((i) => i.value);
  
  // Generate recommendation
  let recommendation = "";
  if (state.adaptationLevel < 10) {
    recommendation = "Personality is close to base. Continue interacting to learn preferences.";
  } else if (state.traits.verbosity > 70 && state.traits.formality > 60) {
    recommendation = "Current style is quite formal and detailed. Consider if user prefers more casual interactions.";
  } else if (state.traits.enthusiasm < 30) {
    recommendation = "Low enthusiasm detected. User may prefer straightforward, minimal responses.";
  } else {
    recommendation = `Current personality adapted ${state.adaptationLevel.toFixed(0)}% from base. Matches observed preferences.`;
  }
  
  return {
    traits: state.traits,
    adaptationLevel: state.adaptationLevel,
    topLikes: [...new Set(likes)].slice(0, 5),
    topDislikes: [...new Set(dislikes)].slice(0, 5),
    recommendation,
  };
}

/**
 * Reset personality to base
 */
export async function resetPersonality(workspaceDir: string): Promise<void> {
  const state = await loadPersonalityState(workspaceDir);
  state.traits = { ...state.baseTraits };
  state.adaptationLevel = 0;
  state.lastAdapted = new Date().toISOString();
  await savePersonalityState(workspaceDir, state);
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}
