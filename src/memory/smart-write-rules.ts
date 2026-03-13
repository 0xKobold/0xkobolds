/**
 * Smart Write Rules for Memory
 * 
 * Determines whether content should be stored in perennial memory.
 * Prevents pollution from ephemeral conversations.
 * 
 * Principles from Rohit's article:
 * - Don't store raw conversations forever
 * - Extract facts, not transcripts
 * - Define explicit rules for what deserves to be remembered
 */

import type { MemoryEntry } from "./types";

export type MemoryWorthiness = "high" | "medium" | "low" | "ephemeral";

export interface WriteRuleConfig {
  // Threshold for auto-accept (0-1)
  autoStoreThreshold: number;
  // Minimum threshold to even consider
  minThreshold: number;
  // Categories that always get stored
  alwaysStoreCategories: string[];
  // Categories that never get stored
  neverStoreCategories: string[];
  // Keywords that boost score
  highValueKeywords: string[];
  // Keywords that reduce score
  lowValueKeywords: string[];
}

const DEFAULT_CONFIG: WriteRuleConfig = {
  autoStoreThreshold: 0.7,
  minThreshold: 0.3,
  alwaysStoreCategories: ["decision", "preference", "learning"],
  neverStoreCategories: ["greeting", "filler"],
  highValueKeywords: [
    // Preferences and config
    "prefer", "favorite", "like", "dislike", "always", "never",
    // Facts about user/project
    "work", "project", "goal", "deadline", "requirement",
    // Decisions
    "decided", "chose", "selected", "agreed", "rejected",
    // Errors/Learning
    "error", "bug", "fix", "solution", "workaround",
    // Technical
    "api", "config", "setup", "deploy", "architecture",
    // Domain knowledge
    "learned", "discovered", "important", "note",
  ],
  lowValueKeywords: [
    // Ephemeral
    "weather", "time", "joke", "hello", "hi", "bye",
    "thanks", "thank you", "please", "sorry",
    // Transitional
    "um", "uh", "like", "so", "anyway",
    // Filler
    "great", "nice", "interesting", "cool", "lol",
    // One-time
    "remind me in", "remind me to", "temporary",
  ],
};

/**
 * Analyze content to determine if it should be remembered
 */
export function analyzeMemoryWorthiness(
  content: string,
  category: MemoryEntry["category"],
  config: Partial<WriteRuleConfig> = {}
): { worthiness: MemoryWorthiness; score: number; reasons: string[] } {
  const rules = { ...DEFAULT_CONFIG, ...config };
  const reasons: string[] = [];
  let score = 0.5; // Base score

  // 1. Check category rules
  if (rules.alwaysStoreCategories.includes(category)) {
    return {
      worthiness: "high",
      score: 1.0,
      reasons: ["Category in always-store list"],
    };
  }

  if (rules.neverStoreCategories.includes(category)) {
    return {
      worthiness: "ephemeral",
      score: 0.0,
      reasons: ["Category in never-store list"],
    };
  }

  // 2. Content heuristics
  const lowerContent = content.toLowerCase();

  // Length check (too short = probably filler)
  if (content.length < 20) {
    score -= 0.2;
    reasons.push("Content too short (<20 chars)");
  }

  // Depth check (longer content with substance)
  if (content.length > 100) {
    score += 0.1;
    reasons.push("Substantive content (>100 chars)");
  }

  // Question detection (usually ephemeral)
  if (content.endsWith("?")) {
    score -= 0.15;
    reasons.push("Question format (usually ephemeral)");
  }

  // 3. Keyword analysis
  let highValueMatches = 0;
  let lowValueMatches = 0;

  for (const keyword of rules.highValueKeywords) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      highValueMatches++;
    }
  }

  for (const keyword of rules.lowValueKeywords) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      lowValueMatches++;
    }
  }

  // Boost for high-value keywords
  if (highValueMatches > 0) {
    const boost = Math.min(highValueMatches * 0.15, 0.4);
    score += boost;
    reasons.push(`${highValueMatches} high-value keywords`);
  }

  // Penalty for low-value keywords
  if (lowValueMatches > 0) {
    const penalty = Math.min(lowValueMatches * 0.1, 0.3);
    score -= penalty;
    reasons.push(`${lowValueMatches} low-value keywords`);
  }

  // 4. Pattern detection
  // Temporal references (usually ephemeral)
  if (/\b(today|tomorrow|yesterday|now|current)\b/i.test(lowerContent)) {
    score -= 0.1;
    reasons.push("Temporal reference (may be ephemeral)");
  }

  // User preferences stated explicitly
  if (/\b(i want|i need|i'd like|for me|my)\b/i.test(lowerContent)) {
    score += 0.2;
    reasons.push("User preference/personal statement");
  }

  // Commands/instructions (usually ephemeral)
  if (/^(run|execute|do|get|show|list|find|search)\b/i.test(content)) {
    score -= 0.15;
    reasons.push("Command format (usually ephemeral)");
  }

  // Decisions/conclusions
  if (/\b(decided|chose|agreed|settled|concluded)\b/i.test(lowerContent)) {
    score += 0.25;
    reasons.push("Decision/conclusion language");
  }

  // Clamp score
  score = Math.max(0, Math.min(1, score));

  // Determine worthiness
  let worthiness: MemoryWorthiness;
  if (score >= rules.autoStoreThreshold) {
    worthiness = "high";
  } else if (score >= rules.minThreshold) {
    worthiness = "medium";
  } else if (score >= 0.1) {
    worthiness = "low";
  } else {
    worthiness = "ephemeral";
  }

  return { worthiness, score, reasons };
}

/**
 * Quick check - should this be stored?
 */
export function shouldStore(
  content: string,
  category: MemoryEntry["category"],
  config?: Partial<WriteRuleConfig>
): boolean {
  const { worthiness, score } = analyzeMemoryWorthiness(content, category, config);
  const rules = { ...DEFAULT_CONFIG, ...config };
  return worthiness !== "ephemeral" && score >= rules.minThreshold;
}

/**
 * Get detailed reasoning for debugging
 */
export function explainDecision(
  content: string,
  category: MemoryEntry["category"],
  config?: Partial<WriteRuleConfig>
): string {
  const { worthiness, score, reasons } = analyzeMemoryWorthiness(content, category, config);
  const decision = worthiness === "ephemeral" ? "❌ REJECTED" : "✅ ACCEPTED";
  
  return `${decision} (${worthiness}, score: ${(score * 100).toFixed(1)}%)
Reasons:
${reasons.map(r => `  - ${r}`).join("\n")}`;
}