/**
 * Dialectic Memory Module
 * 
 * Honcho-style reasoning for extracting insights from observations.
 * 
 * Usage:
 *   import { getDialecticStore, getDialecticReasoning, getNudgeEngine } from "./memory/dialectic";
 *   
 *   // Create a peer (user, agent, project, or idea)
 *   const store = getDialecticStore();
 *   const user = store.createPeer("user", "moika", { email: "..." });
 *   
 *   // Add observations
 *   store.addObservation(user.id, "I prefer TypeScript over Python", "preference", "message", msgId);
 *   store.addObservation(user.id, "The goal is memory that evolves with me", "goal", "message", msgId);
 *   
 *   // Run dialectic reasoning
 *   const reasoning = getDialecticReasoning();
 *   const result = await reasoning.reason(user.id);
 *   console.log(result.synthesis?.content);
 *   
 *   // Get representation
 *   const repr = store.getRepresentation(user.id);
 *   console.log("Preferences:", repr.preferences);
 *   console.log("Goals:", repr.goals);
 *   
 *   // Ask questions
 *   const engine = getNudgeEngine();
 *   const answer = await engine.askAboutPeer(user.id, "What does this user value?");
 */

export * from "./types";
export { DialecticStore, getDialecticStore } from "./store";
export { DialecticReasoning, getDialecticReasoning } from "./reasoning";
export { NudgeEngine, getNudgeEngine } from "./nudges";
export {
  detectPatterns,
  generateSkill,
  writeSkill,
  validateSkill,
  autoCreateSkills,
  setSkillCreationStore,
  getSkillCreationStore,
  type Pattern,
  type SkillSuggestion,
} from "./skill-creation";

// New: Reasoning Engine with multiple strategies
export {
  DialecticReasoningEngine,
  getDialecticReasoningEngine,
  setReasoningModel,
  type ReasoningStrategy,
  type ReasoningConfig,
} from "./reasoning-engine";

// ═════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═════════════════════════════════════════════════════════════════

import type { Peer, PeerType, Observation, ObservationCategory, Representation, Nudge } from "./types";
import { getDialecticStore } from "./store";
import { getDialecticReasoning } from "./reasoning";
import { getNudgeEngine } from "./nudges";

/**
 * Quick helper to create a user peer.
 */
export function createUser(name: string, metadata?: Record<string, unknown>): Peer {
  return getDialecticStore().createPeer("user", name, metadata);
}

/**
 * Quick helper to create an agent peer.
 */
export function createAgent(name: string, metadata?: Record<string, unknown>): Peer {
  return getDialecticStore().createPeer("agent", name, metadata);
}

/**
 * Quick helper to create a project peer.
 */
export function createProject(name: string, metadata?: Record<string, unknown>): Peer {
  return getDialecticStore().createPeer("project", name, metadata);
}

/**
 * Quick helper to add an observation and trigger reasoning.
 */
export async function observe(
  peerId: string,
  content: string,
  category: ObservationCategory,
  sourceType: "message" | "tool_call" | "event" | "reflection" = "message",
  sourceId: string = ""
): Promise<Observation> {
  const observation = getDialecticStore().addObservation(
    peerId,
    content,
    category,
    sourceType,
    sourceId || `auto_${Date.now()}`
  );

  // Update counters for threshold triggers
  const engine = getNudgeEngine();
  engine.recordEvent("observation_added");

  return observation;
}

/**
 * Quick helper to get a peer's representation.
 */
export function getRepresentation(peerId: string): Representation | undefined {
  return getDialecticStore().getRepresentation(peerId);
}

/**
 * Quick helper to get or create the default user peer.
 */
export function getOrCreateUser(name: string = "default"): Peer {
  const store = getDialecticStore();
  let user = store.getPeerByName(name, "user");
  if (!user) {
    user = store.createPeer("user", name);
  }
  return user;
}

/**
 * Quick helper to run reasoning on a peer.
 */
export async function reason(peerId: string): Promise<{
  synthesis: string | null;
  preferences: number;
  goals: number;
  constraints: number;
  values: number;
}> {
  const reasoning = getDialecticReasoning();
  const result = await reasoning.reason(peerId);
  
  return {
    synthesis: result.synthesis?.content || null,
    preferences: result.preferences.length,
    goals: result.goals.length,
    constraints: result.constraints.length,
    values: result.values.length,
  };
}

/**
 * Quick helper to ask a question about a peer.
 */
export async function ask(peerId: string, question: string): Promise<string> {
  const engine = getNudgeEngine();
  return engine.askAboutPeer(peerId, question);
}

/**
 * Quick helper to trigger reflection on a peer.
 */
export async function reflect(peerId: string): Promise<string> {
  const reasoning = getDialecticReasoning();
  const result = await reasoning.reason(peerId);
  return result.synthesis?.content || "No new insights";
}

/**
 * Quick helper to check for pending nudges.
 */
export async function checkNudges(): Promise<Nudge[]> {
  const engine = getNudgeEngine();
  return engine.checkNudges();
}

/**
 * Quick helper to process pending nudges.
 */
export async function processNudges(): Promise<Nudge[]> {
  const engine = getNudgeEngine();
  return engine.processPending();
}

/**
 * Get statistics about the dialectic store.
 */
export function getStats(): {
  peers: number;
  observations: number;
  contradictions: number;
  syntheses: number;
  preferences: number;
  goals: number;
  constraints: number;
  values: number;
  nudges: number;
} {
  return getDialecticStore().getStats();
}