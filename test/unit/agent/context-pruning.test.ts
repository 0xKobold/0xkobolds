/**
 * Context Pruning Tests - v0.2.0
 *
 * Tests for context management and pruning strategies.
 */

import { describe, test, expect } from "bun:test";
import {
  calculateTokenUsage,
  shouldPrune,
  pruneContext,
  autoPrune,
  estimateTokens,
  oldestFirstStrategy,
  importanceStrategy,
  smartCompactionStrategy,
  DEFAULT_BUDGET,
  BUDGET_PRESETS,
  type ContextItem,
} from "../../../src/agent/index.js";

describe("Context Pruning - v0.2.0", () => {
  const createMockItems = (count: number, tokenSize: number = 100): ContextItem[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      type: i % 2 === 0 ? "user" : "assistant",
      content: "x".repeat(tokenSize * 4),
      tokens: tokenSize,
      importance: 50 + (i % 50),
      timestamp: Date.now() - i * 1000,
    }));
  };

  describe("Token Estimation", () => {
    test("should estimate tokens from text", () => {
      expect(estimateTokens("hello")).toBeGreaterThan(0);
      expect(estimateTokens("hello world")).toBeGreaterThan(estimateTokens("hello"));
    });

    test("should estimate proportionally to length", () => {
      const short = estimateTokens("short");
      const long = estimateTokens("this is a much longer piece of text");
      expect(long).toBeGreaterThan(short);
    });
  });

  describe("Token Calculation", () => {
    test("should calculate total tokens", () => {
      const items = createMockItems(3, 100);
      expect(calculateTokenUsage(items)).toBe(300);
    });

    test("should handle empty array", () => {
      expect(calculateTokenUsage([])).toBe(0);
    });
  });

  describe("Pruning Decision", () => {
    test("should not prune when under threshold", () => {
      const items = createMockItems(500, 100); // 50k tokens
      const result = shouldPrune(items, DEFAULT_BUDGET);
      expect(result.needed).toBe(false);
      expect(result.percentage).toBeLessThan(80);
    });

    test("should prune when over threshold", () => {
      const items = createMockItems(1100, 100); // 110k tokens
      const result = shouldPrune(items, DEFAULT_BUDGET);
      expect(result.needed).toBe(true);
      expect(result.percentage).toBeGreaterThan(80);
    });

    test("should respect conservative budget", () => {
      const items = createMockItems(300, 100); // 30k tokens
      const result = shouldPrune(items, BUDGET_PRESETS.conservative);
      expect(result.percentage).toBeGreaterThanOrEqual(90);
    });
  });

  describe("Pruning Strategies", () => {
    test("oldest-first should remove oldest items", () => {
      const items: ContextItem[] = [
        { id: "1", type: "user", content: "oldest", tokens: 100, importance: 50, timestamp: 1000 },
        { id: "2", type: "user", content: "middle", tokens: 100, importance: 50, timestamp: 2000 },
        { id: "3", type: "user", content: "newest", tokens: 100, importance: 50, timestamp: 3000 },
      ];

      const budget = { maxTokens: 200, warningThreshold: 80, criticalThreshold: 95 };
      const result = pruneContext(items, oldestFirstStrategy, budget);

      expect(result.pruned.length).toBeGreaterThan(0);
      // Oldest item should be pruned (or among pruned items)
      const prunedIds = result.pruned.map(i => i.id);
      expect(prunedIds).toContain("1");
      // Newest should be kept
      expect(result.kept.some((i) => i.id === "3")).toBe(true);
    });

    test("importance-based should remove least important items", () => {
      const items: ContextItem[] = [
        { id: "1", type: "user", content: "low", tokens: 100, importance: 10, timestamp: 1000 },
        { id: "2", type: "user", content: "medium", tokens: 100, importance: 50, timestamp: 1000 },
        { id: "3", type: "user", content: "high", tokens: 100, importance: 90, timestamp: 1000 },
      ];

      const budget = { maxTokens: 200, warningThreshold: 80, criticalThreshold: 95 };
      const result = pruneContext(items, importanceStrategy, budget);

      // Least important item should be pruned
      const prunedIds = result.pruned.map(i => i.id);
      expect(prunedIds).toContain("1");
      // Highest importance should be kept
      expect(result.kept.some((i) => i.id === "3")).toBe(true);
    });

    test("smart-compaction should summarize old content", () => {
      const oldTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const items: ContextItem[] = [
        { id: "1", type: "user", content: "old", tokens: 100, importance: 50, timestamp: oldTime },
        { id: "2", type: "assistant", content: "old", tokens: 100, importance: 50, timestamp: oldTime - 1000 },
      ];

      const budget = { maxTokens: 150, warningThreshold: 80, criticalThreshold: 95 };
      const result = pruneContext(items, smartCompactionStrategy, budget);

      // Should have summary item
      const summary = result.kept.find((i) => i.type === "system");
      expect(summary).toBeDefined();
      expect(summary?.content).toContain("Summary");
    });

    test("should keep essential items", () => {
      const items: ContextItem[] = [
        { id: "1", type: "system", content: "essential", tokens: 1000, importance: 100, timestamp: 1000, isEssential: true },
        { id: "2", type: "user", content: "normal", tokens: 100, importance: 50, timestamp: 2000 },
      ];

      const budget = { maxTokens: 500, warningThreshold: 80, criticalThreshold: 95 };
      const result = pruneContext(items, oldestFirstStrategy, budget);

      expect(result.kept.some((i) => i.isEssential)).toBe(true);
    });
  });

  describe("Auto Pruning", () => {
    test("should not prune when under budget", () => {
      const items = createMockItems(5, 100);
      const result = autoPrune(items, DEFAULT_BUDGET);

      expect(result.wasPruned).toBe(false);
      expect(result.result).toBeNull();
    });

    test("should prune automatically when over budget", () => {
      const items = createMockItems(1200, 100); // 120k tokens
      const result = autoPrune(items, DEFAULT_BUDGET);

      expect(result.wasPruned).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.metrics.after).toBeLessThan(result.metrics.before);
    });

    test("should return metrics", () => {
      const items = createMockItems(1200, 100);
      const result = autoPrune(items, DEFAULT_BUDGET);

      expect(result.metrics.before).toBeGreaterThan(0);
      expect(result.metrics.after).toBeGreaterThan(0);
      expect(result.metrics.percentage).toBeGreaterThan(0);
    });
  });

  describe("Budget Presets", () => {
    test("should have conservative preset", () => {
      expect(BUDGET_PRESETS.conservative.maxTokens).toBe(32000);
      expect(BUDGET_PRESETS.conservative.warningThreshold).toBe(70);
    });

    test("should have aggressive preset", () => {
      expect(BUDGET_PRESETS.aggressive.maxTokens).toBe(200000);
      expect(BUDGET_PRESETS.aggressive.warningThreshold).toBe(90);
    });
  });
});
