/**
 * Dialectic Reasoning Benchmark
 * 
 * Compares different reasoning strategies against known test cases.
 * Measures accuracy, latency, and quality of extracted information.
 * 
 * Usage:
 *   bun test tests/memory/dialectic-benchmark.test.ts
 * 
 * Or run directly:
 *   bun run src/memory/dialectic/benchmark.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { 
  getDialecticStore, 
  getDialecticReasoningEngine,
  setReasoningModel,
  type ReasoningStrategy 
} from "../../src/memory/dialectic/index.js";
import type { Peer } from "../../src/memory/dialectic/types.js";

// ═════════════════════════════════════════════════════════════════
// BENCHMARK TEST CASES
// ═════════════════════════════════════════════════════════════════

interface BenchmarkCase {
  name: string;
  observations: Array<{ content: string; category: string }>;
  expectedPreferences: Array<{ topic: string; preference: string }>;
  expectedGoals: string[];
  expectedContradictions: string[];
  expectedSynthesis: string[];
}

const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    name: "Simple Preference",
    observations: [
      { content: "I prefer TypeScript over JavaScript", category: "preference" },
      { content: "I use TypeScript for all new projects", category: "behavior" },
      { content: "I think static typing reduces bugs", category: "statement" },
    ],
    expectedPreferences: [
      { topic: "programming_language", preference: "TypeScript" },
    ],
    expectedGoals: [],
    expectedContradictions: [],
    expectedSynthesis: ["TypeScript", "static typing"],
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
    expectedSynthesis: ["context", "use case"],
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
    expectedSynthesis: ["AI agent", "memory", "learn"],
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
      { topic: "frameworks", preference: "simple" },
    ],
    expectedGoals: ["multi-agent", "memory"],
    expectedContradictions: [],
    expectedSynthesis: ["TypeScript", "memory", "local"],
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
    expectedPreferences: [
      { topic: "database", preference: "SQLite" },
    ],
    expectedGoals: [],
    expectedContradictions: [],
    expectedSynthesis: ["SQLite", "simpler"],
  },
];

// ═════════════════════════════════════════════════════════════════
// STRATEGIES TO COMPARE
// ═════════════════════════════════════════════════════════════════

const STRATEGIES: ReasoningStrategy[] = [
  "dialectic",
  "chain-of-thought",
  "self-consistency",
  "formal-logic",
  // Note: tree-of-thought is slower, use separately
];

// ═════════════════════════════════════════════════════════════════
// BENCHMARK RUNNER
// ═════════════════════════════════════════════════════════════════

interface BenchmarkResult {
  strategy: ReasoningStrategy;
  case: string;
  duration: number;
  preferencesFound: number;
  goalsFound: number;
  contradictionsFound: number;
  synthesisQuality: number;  // 0-1 score
  expectedPreferences: number;
  expectedGoals: number;
  expectedContradictions: number;
  accuracy: number;  // 0-1 score
}

async function runBenchmarkCase(
  testCase: BenchmarkCase,
  strategy: ReasoningStrategy,
  model: string = "glm-5:cloud"
): Promise<BenchmarkResult> {
  const store = getDialecticStore();
  const peer = store.createPeer("user", `bench-${testCase.name}-${Date.now()}`);
  
  // Add observations
  for (const obs of testCase.observations) {
    store.addObservation(
      peer.id,
      obs.content,
      obs.category as any,
      "message",
      `bench-${Date.now()}`
    );
  }
  
  // Run reasoning
  const engine = getDialecticReasoningEngine({ strategy, model });
  const startTime = Date.now();
  const result = await engine.reason(peer.id);
  const duration = Date.now() - startTime;
  
  // Calculate accuracy
  let preferenceMatches = 0;
  for (const expected of testCase.expectedPreferences) {
    // Check if preference contains the expected value (topic matching is secondary)
    const found = result.preferences.some(
      p => p.preference.toLowerCase().includes(expected.preference.toLowerCase()) ||
           // Also check for reversed form: "TypeScript over JavaScript" matches "TypeScript"
           expected.preference.toLowerCase().includes(p.preference.toLowerCase().split(" over ")[0])
    );
    if (found) preferenceMatches++;
  }
  
  let goalMatches = 0;
  for (const expected of testCase.expectedGoals) {
    const found = result.goals.some(
      g => g.description.toLowerCase().includes(expected.toLowerCase())
    );
    if (found) goalMatches++;
  }
  
  let contradictionMatches = 0;
  if (testCase.expectedContradictions.length > 0) {
    for (const expected of testCase.expectedContradictions) {
      const found = result.contradictions.some(
        c => c.observationA.toLowerCase().includes(expected.toLowerCase()) ||
             c.observationB.toLowerCase().includes(expected.toLowerCase())
      );
      if (found) contradictionMatches++;
    }
  } else {
    // No contradictions expected - check if we found false positives
    contradictionMatches = result.contradictions.length === 0 ? 1 : 0;
  }
  
  // Calculate synthesis quality
  let synthesisScore = 0;
  if (result.synthesis) {
    for (const expected of testCase.expectedSynthesis) {
      if (result.synthesis.content.toLowerCase().includes(expected.toLowerCase())) {
        synthesisScore++;
      }
    }
    synthesisScore = synthesisScore / Math.max(testCase.expectedSynthesis.length, 1);
  }
  
  // Total accuracy
  const totalExpected = 
    testCase.expectedPreferences.length +
    testCase.expectedGoals.length +
    testCase.expectedContradictions.length;
  const totalFound = preferenceMatches + goalMatches + contradictionMatches;
  const accuracy = totalExpected > 0 ? totalFound / totalExpected : 0.5;
  
  return {
    strategy,
    case: testCase.name,
    duration,
    preferencesFound: result.preferences.length,
    goalsFound: result.goals.length,
    contradictionsFound: result.contradictions.length,
    synthesisQuality: synthesisScore,
    expectedPreferences: testCase.expectedPreferences.length,
    expectedGoals: testCase.expectedGoals.length,
    expectedContradictions: testCase.expectedContradictions.length,
    accuracy,
  };
}

// ═════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════

describe("Dialectic Reasoning Benchmark", () => {
  // Skip benchmarks if Ollama not available
  const ollamaAvailable = process.env.OLLAMA_URL || process.env.CI ? true : false;
  
  describe.skipIf(!ollamaAvailable)("Dialectic Strategy", () => {
    test("dialectic strategy should extract preferences", async () => {
      const testCase = BENCHMARK_CASES[0];
      const result = await runBenchmarkCase(testCase, "dialectic");
      
      expect(result.accuracy).toBeGreaterThan(0.3);
      expect(result.duration).toBeLessThan(30000); // Under 30 seconds
    });
    
    test("chain-of-thought strategy should extract preferences", async () => {
      const testCase = BENCHMARK_CASES[0];
      const result = await runBenchmarkCase(testCase, "chain-of-thought");
      
      expect(result.accuracy).toBeGreaterThan(0.3);
      expect(result.duration).toBeLessThan(30000);
    });
    
    test("self-consistency should handle contradictions", async () => {
      const testCase = BENCHMARK_CASES[1]; // Contradictory preferences
      const result = await runBenchmarkCase(testCase, "self-consistency");
      
      expect(result.accuracy).toBeGreaterThan(0.3);
      expect(result.contradictionsFound).toBeGreaterThan(0);
    });
  });
  
  describe("Model Comparison", () => {
    test.skipIf(!ollamaAvailable)("should compare models on same case", async () => {
      const testCase = BENCHMARK_CASES[0];
      
      const models = ["glm-5:cloud", "deepseek-r1:7b", "llama3.2"];
      const results: BenchmarkResult[] = [];
      
      for (const model of models) {
        try {
          setReasoningModel(model);
          const result = await runBenchmarkCase(testCase, "dialectic", model);
          results.push(result);
        } catch (e) {
          console.log(`Model ${model} not available: ${e}`);
        }
      }
      
      // At least one model should work
      expect(results.length).toBeGreaterThan(0);
      
      // Log comparison
      console.log("\n=== Model Comparison ===");
      for (const r of results) {
        console.log(`${r.case} @ ${r.strategy} (${r.duration}ms)`);
        console.log(`  Accuracy: ${(r.accuracy * 100).toFixed(1)}%`);
        console.log(`  Synthesis Quality: ${(r.synthesisQuality * 100).toFixed(1)}%`);
      }
    });
  });
  
  describe("Performance", () => {
    test.skipIf(!ollamaAvailable)("should complete within time limit", async () => {
      const testCase = BENCHMARK_CASES[3]; // Complex case
      
      const startTime = Date.now();
      const result = await runBenchmarkCase(testCase, "dialectic");
      const duration = Date.now() - startTime;
      
      // Should complete within 60 seconds
      expect(duration).toBeLessThan(60000);
    });
  });
});

// ═════════════════════════════════════════════════════════════════
// BENCHMARK REPORT
// ═════════════════════════════════════════════════════════════════

async function generateBenchmarkReport(): Promise<string> {
  const store = getDialecticStore();
  const results: BenchmarkResult[] = [];
  
  console.log("\n🧠 Dialectic Reasoning Benchmark\n");
  console.log("=".repeat(60));
  
  for (const testCase of BENCHMARK_CASES) {
    console.log(`\n📊 Test Case: ${testCase.name}`);
    console.log("-".repeat(40));
    
    for (const strategy of STRATEGIES) {
      try {
        const result = await runBenchmarkCase(testCase, strategy);
        results.push(result);
        
        console.log(`  ${strategy}:`);
        console.log(`    Duration: ${result.duration}ms`);
        console.log(`    Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);
        console.log(`    Synthesis: ${(result.synthesisQuality * 100).toFixed(1)}%`);
        console.log(`    Found: ${result.preferencesFound} prefs, ${result.goalsFound} goals`);
      } catch (e) {
        console.log(`  ${strategy}: ERROR - ${e}`);
      }
    }
  }
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY\n");
  
  const strategyStats = new Map<ReasoningStrategy, { total: number; avgAccuracy: number; avgDuration: number }>();
  
  for (const strategy of STRATEGIES) {
    const strategyResults = results.filter(r => r.strategy === strategy);
    if (strategyResults.length > 0) {
      const avgAccuracy = strategyResults.reduce((sum, r) => sum + r.accuracy, 0) / strategyResults.length;
      const avgDuration = strategyResults.reduce((sum, r) => sum + r.duration, 0) / strategyResults.length;
      
      console.log(`${strategy}:`);
      console.log(`  Avg Accuracy: ${(avgAccuracy * 100).toFixed(1)}%`);
      console.log(`  Avg Duration: ${avgDuration.toFixed(0)}ms`);
      console.log(`  Cases Run: ${strategyResults.length}`);
    }
  }
  
  return "Benchmark complete";
}

// Export for CLI usage
export { runBenchmarkCase, generateBenchmarkReport, BENCHMARK_CASES, STRATEGIES };