#!/usr/bin/env bun
/**
 * Dialectic Reasoning Benchmark CLI
 * 
 * Run reasoning benchmarks to compare strategies and models.
 * 
 * Usage:
 *   bun run src/memory/dialectic/benchmark-cli.ts
 *   bun run src/memory/dialectic/benchmark-cli.ts --strategy chain-of-thought
 *   bun run src/memory/dialectic/benchmark-cli.ts --model deepseek-r1:7b
 *   bun run src/memory/dialectic/benchmark-cli.ts --full
 */

import { 
  getDialecticStore, 
  getDialecticReasoningEngine,
  setReasoningModel,
  type ReasoningStrategy 
} from "./index.js";
import type { Peer } from "./types.js";

// ═════════════════════════════════════════════════════════════════
// BENCHMARK TEST CASES
// ═════════════════════════════════════════════════════════════════

interface BenchmarkCase {
  name: string;
  observations: Array<{ content: string; category: string }>;
  expectedPreferences: Array<{ topic: string; preference: string }>;
  expectedGoals: string[];
  expectedContradictions: string[];
}

const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    name: "Simple Preference",
    observations: [
      { content: "I prefer TypeScript over JavaScript", category: "preference" },
      { content: "I use TypeScript for all new projects", category: "behavior" },
      { content: "I think static typing reduces bugs", category: "statement" },
    ],
    expectedPreferences: [{ topic: "programming_language", preference: "TypeScript" }],
    expectedGoals: [],
    expectedContradictions: [],
  },
  {
    name: "Contradictory Preferences",
    observations: [
      { content: "I love Python for data science", category: "preference" },
      { content: "I think Python is too slow for production", category: "statement" },
      { content: "I prefer Go for backend services", category: "preference" },
      { content: "I use Python for all my prototypes", category: "behavior" },
    ],
    expectedPreferences: [
      { topic: "data_science", preference: "Python" },
      { topic: "backend", preference: "Go" },
    ],
    expectedGoals: [],
    expectedContradictions: ["Python"],
  },
  {
    name: "Goal Extraction",
    observations: [
      { content: "I want to build an AI agent", category: "goal" },
      { content: "The agent should learn from conversations", category: "goal" },
      { content: "I'm working on memory systems", category: "behavior" },
      { content: "I value simplicity in architecture", category: "value" },
    ],
    expectedPreferences: [],
    expectedGoals: ["AI agent", "learn", "memory"],
    expectedContradictions: [],
  },
  {
    name: "Complex User Profile",
    observations: [
      { content: "I prefer TypeScript for infrastructure", category: "preference" },
      { content: "I like Python for data science", category: "preference" },
      { content: "I'm building a multi-agent system", category: "goal" },
      { content: "I want the agents to have memory", category: "goal" },
      { content: "I dislike complex frameworks", category: "preference" },
      { content: "I value clean code over clever code", category: "value" },
      { content: "I use SQLite for single-user apps", category: "behavior" },
      { content: "I prefer local over cloud services", category: "preference" },
    ],
    expectedPreferences: [
      { topic: "infrastructure", preference: "TypeScript" },
      { topic: "data_science", preference: "Python" },
    ],
    expectedGoals: ["multi-agent", "memory"],
    expectedContradictions: [],
  },
  {
    name: "Learning from Mistakes",
    observations: [
      { content: "I tried using PostgreSQL for embeddings", category: "behavior" },
      { content: "It was overkill for a single user", category: "statement" },
      { content: "I switched to SQLite with Ollama embeddings", category: "behavior" },
      { content: "The performance is acceptable", category: "success" },
      { content: "I learned that simpler is often better", category: "statement" },
    ],
    expectedPreferences: [{ topic: "database", preference: "SQLite" }],
    expectedGoals: [],
    expectedContradictions: [],
  },
];

const STRATEGIES: ReasoningStrategy[] = [
  "dialectic",
  "chain-of-thought",
  "self-consistency",
  "formal-logic",
  "tree-of-thought",
];

// ═════════════════════════════════════════════════════════════════
// RUNNER
// ═════════════════════════════════════════════════════════════════

interface Result {
  strategy: ReasoningStrategy;
  testCase: string;
  duration: number;
  accuracy: number;
  synthesisQuality: number;
  preferencesFound: number;
  goalsFound: number;
  contradictionsFound: number;
}

async function runCase(
  testCase: BenchmarkCase,
  strategy: ReasoningStrategy,
  model: string
): Promise<Result> {
  const store = getDialecticStore();
  const peer = store.createPeer("user", `bench-${Date.now()}`);
  
  // Add observations
  for (const obs of testCase.observations) {
    store.addObservation(peer.id, obs.content, obs.category as any, "message", `bench-${Date.now()}`);
  }
  
  // Run reasoning
  const engine = getDialecticReasoningEngine({ strategy, model });
  const start = Date.now();
  const result = await engine.reason(peer.id);
  const duration = Date.now() - start;
  
  // Calculate accuracy
  let prefMatches = 0;
  for (const exp of testCase.expectedPreferences) {
    // Check if preference contains the expected value
    if (result.preferences.some(p => 
      p.preference.toLowerCase().includes(exp.preference.toLowerCase()) ||
      exp.preference.toLowerCase().includes(p.preference.toLowerCase().split(" over ")[0])
    )) prefMatches++;
  }
  
  let goalMatches = 0;
  for (const exp of testCase.expectedGoals) {
    if (result.goals.some(g => g.description.toLowerCase().includes(exp.toLowerCase()))) goalMatches++;
  }
  
  const totalExpected = testCase.expectedPreferences.length + testCase.expectedGoals.length;
  const totalFound = prefMatches + goalMatches;
  const accuracy = totalExpected > 0 ? totalFound / totalExpected : 0.5;
  
  // Calculate synthesis quality based on confidence and presence
  const synthesisQuality = result.synthesis 
    ? result.synthesis.confidence 
    : 0;
  
  return {
    strategy,
    testCase: testCase.name,
    duration,
    accuracy,
    synthesisQuality,
    preferencesFound: result.preferences.length,
    goalsFound: result.goals.length,
    contradictionsFound: result.contradictions.length,
  };
}

// ═════════════════════════════════════════════════════════════════
// CLI
// ═════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  
  let strategy: ReasoningStrategy | "all" = "all";
  let model = "glm-5:cloud";
  let full = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--strategy" && args[i + 1]) {
      strategy = args[i + 1] as ReasoningStrategy;
      i++;
    } else if (args[i] === "--model" && args[i + 1]) {
      model = args[i + 1];
      setReasoningModel(model);
      i++;
    } else if (args[i] === "--full") {
      full = true;
    }
  }
  
  console.log("\n🧠 Dialectic Reasoning Benchmark\n");
  console.log(`Model: ${model}`);
  console.log(`Strategy: ${strategy}`);
  console.log(`Full: ${full}`);
  console.log("=".repeat(60));
  
  const results: Result[] = [];
  const strategies = strategy === "all" ? STRATEGIES : [strategy];
  const cases = full ? BENCHMARK_CASES : BENCHMARK_CASES.slice(0, 2);
  
  for (const testCase of cases) {
    console.log(`\n📊 ${testCase.name}`);
    console.log("-".repeat(40));
    
    for (const strat of strategies) {
      try {
        console.log(`  Running ${strat}...`);
        const result = await runCase(testCase, strat, model);
        results.push(result);
        
        console.log(`    ✓ Duration: ${result.duration}ms`);
        console.log(`    ✓ Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);
        console.log(`    ✓ Found: ${result.preferencesFound} prefs, ${result.goalsFound} goals, ${result.contradictionsFound} contradictions`);
      } catch (e) {
        console.log(`    ✗ Error: ${e}`);
      }
    }
  }
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY\n");
  
  for (const strat of strategies) {
    const stratResults = results.filter(r => r.strategy === strat);
    if (stratResults.length === 0) continue;
    
    const avgAccuracy = stratResults.reduce((s, r) => s + r.accuracy, 0) / stratResults.length;
    const avgDuration = stratResults.reduce((s, r) => s + r.duration, 0) / stratResults.length;
    
    console.log(`${strat}:`);
    console.log(`  Average Accuracy: ${(avgAccuracy * 100).toFixed(1)}%`);
    console.log(`  Average Duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Cases Run: ${stratResults.length}`);
  }
  
  console.log("\n✅ Benchmark complete\n");
}

main().catch(console.error);