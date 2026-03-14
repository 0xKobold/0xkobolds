/**
 * Dialectic Memory Types
 * 
 * Honcho-style reasoning about observations.
 * Thesis-Antithesis-Synthesis pattern for extracting insights.
 * 
 * Key concept: Traditional RAG retrieves what was said, 
 * but misses insights only accessible by rigorous reasoning.
 */

/**
 * A peer is any entity that persists and changes over time.
 * Users, agents, projects, ideas - all are peers.
 */
export type PeerType = "user" | "agent" | "project" | "idea";

export interface Peer {
  id: string;
  type: PeerType;
  name: string;
  createdAt: string;
  lastUpdated: string;
  
  // Metadata specific to peer type
  metadata?: Record<string, unknown>;
}

/**
 * An observation is something that happened or was said.
 * Raw input to the dialectic reasoning process.
 */
export interface Observation {
  id: string;
  peerId: string;
  content: string;
  category: ObservationCategory;
  timestamp: string;
  
  // Source traceability
  sourceType: "message" | "tool_call" | "event" | "reflection";
  sourceId: string;  // Link to memory_item or session_event
  
  // Context
  sessionId?: string;
  projectId?: string;
}

export type ObservationCategory = 
  | "behavior"     // "User selected TypeScript over Python"
  | "statement"    // "I want this to outlast me"
  | "preference"   // "I prefer clean architecture"
  | "goal"         // "The goal is to migrate to Raspberry Pi"
  | "constraint"   // "We can't use cloud services"
  | "value"        // "What matters is family, not perfection"
  | "error"        // "The extraction failed"
  | "success";     // "The fix worked"

/**
 * A contradiction is when two observations conflict.
 * The dialectic method requires identifying these.
 */
export interface Contradiction {
  id: string;
  peerId: string;
  
  // The two conflicting observations
  observationA: string;
  observationB: string;
  
  // How we resolved it
  resolution: ContradictionResolution;
  resolutionNote: string;
  
  // Confidence in this resolution
  confidence: number;
  
  // When detected and resolved
  detectedAt: string;
  resolvedAt?: string;
}

export type ContradictionResolution = 
  | "newer_wins"      // More recent observation is correct
  | "context"         // Both true in different contexts
  | "refinement"      // B refines A, not contradicts
  | "correction"      // A was error, B is correction
  | "both_true"       // Actually not a contradiction
  | "unknown";        // Not yet resolved

/**
 * A synthesis is the reconciled understanding.
 * The "thesis" is an observation, "antithesis" is contradiction,
 * and "synthesis" is the new, deeper understanding.
 */
export interface Synthesis {
  id: string;
  peerId: string;
  
  // The synthesized understanding
  content: string;
  
  // What observations contributed
  derivedFrom: string[];  // observation IDs
  
  // What contradictions were resolved
  resolvedContradictions: string[];  // contradiction IDs
  
  // Confidence in this synthesis
  confidence: number;
  
  // When synthesized
  timestamp: string;
  
  // When this synthesis becomes outdated
  supersededBy?: string;  // synthesis ID that replaced this
}

/**
 * Inferred preference about a peer.
 * Not directly stated, but deduced from behavior.
 */
export interface InferredPreference {
  id: string;
  peerId: string;
  
  topic: string;        // "programming_language"
  preference: string;   // "TypeScript"
  
  // Supporting evidence
  evidence: string[];   // observation IDs
  confidence: number;   // 0.0 - 1.0
  
  // When last updated
  lastUpdated: string;
  
  // If this preference has been contradicted
  contradicted?: boolean;
  contradictedBy?: string;  // observation ID that contradicts
}

/**
 * Inferred goal about a peer.
 * What they're trying to achieve.
 */
export interface InferredGoal {
  id: string;
  peerId: string;
  
  description: string;
  
  // Goal metadata
  status: "active" | "completed" | "abandoned" | "unknown";
  priority: "high" | "medium" | "low";
  
  // Supporting evidence
  evidence: string[];
  confidence: number;
  
  // Timeline
  firstObserved: string;
  lastUpdated: string;
}

/**
 * Inferred constraint about a peer.
 * What they cannot or will not do.
 */
export interface InferredConstraint {
  id: string;
  peerId: string;
  
  description: string;
  
  // Constraint type
  type: "hard" | "soft" | "preference";
  // hard: Cannot be violated (technical, legal)
  // soft: Would prefer not to (resources, time)
  // preference: Stated constraint, could change
  
  evidence: string[];
  confidence: number;
  
  lastUpdated: string;
}

/**
 * Inferred value about a peer.
 * What they care about intrinsically.
 */
export interface InferredValue {
  id: string;
  peerId: string;
  
  value: string;        // "clean architecture"
  context: string;      // "in all code decisions"
  
  evidence: string[];
  confidence: number;
  
  lastUpdated: string;
}

/**
 * A representation is the complete model of a peer.
 * The sum of all inferences about an entity.
 */
export interface Representation {
  id: string;
  peerId: string;
  peerType: PeerType;
  
  // Core inferences
  preferences: InferredPreference[];
  goals: InferredGoal[];
  constraints: InferredConstraint[];
  values: InferredValue[];
  
  // Dialectic components
  observations: Observation[];
  contradictions: Contradiction[];
  synthesis: Synthesis[];
  
  // Metadata
  confidence: number;   // Overall confidence in this representation
  lastUpdated: string;
  
  // Summarized view (for quick access)
  summary?: string;     // LLM-generated summary of what we know
}

/**
 * A nudge is a prompt for reflection or action.
 * Triggers periodic reasoning about the peer.
 */
export interface Nudge {
  id: string;
  
  // What triggered this nudge
  trigger: NudgeTrigger;
  
  // What to ask
  question: string;
  
  // What to do with the answer
  action: NudgeAction;
  
  // Priority
  priority: "low" | "medium" | "high";
  
  // When created and when run
  createdAt: string;
  runAt?: string;
  completedAt?: string;
  
  // Result
  result?: string;
}

export type NudgeTrigger = 
  | { type: "time"; interval: "daily" | "weekly" | "monthly" }
  | { type: "event"; event: string; data?: Record<string, unknown> }
  | { type: "threshold"; metric: string; value: number };

export type NudgeAction = 
  | { type: "reflection"; targetPeerId: string }
  | { type: "skill_create"; pattern: string }
  | { type: "skill_refine"; skillId: string }
  | { type: "archive"; targetType: string; criteria: string }
  | { type: "contradiction_check"; peerId: string };