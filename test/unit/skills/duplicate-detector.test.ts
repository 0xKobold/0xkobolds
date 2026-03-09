/**
 * Duplicate Detector Tests - v0.3.0
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDuplicateDetector } from "../../../src/skills/builtin/duplicate-detector.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

describe("Duplicate Detector - v0.3.0", () => {
  const testDir = "/tmp/test-duplicate-scan";

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test files
    await fs.writeFile(
      path.join(testDir, "existing.ts"),
      `export function calculateSum(a: number, b: number): number {
  return a + b;
}

export async function fetchUserData(id: string) {
  return { id, name: "Test" };
}`
    );

    await fs.writeFile(
      path.join(testDir, "similar.ts"),
      `export function calculateTotal(x: number, y: number): number {
  return x + y;
}

class UserManager {
  async fetchData(userId: string) {
    return { id: userId };
  }
}`
    );
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("should detect existing function by description", async () => {
    const detector = getDuplicateDetector({
      scanPaths: [testDir],
      similarityThreshold: 0.5,
    });

    const result = await detector.checkFunction(
      "calculateSum",
      "(a: number, b: number): number"
    );

    expect(result.exists).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.matches.length).toBeGreaterThan(0);
  });

  test("should not find non-existent function", async () => {
    const detector = getDuplicateDetector({
      scanPaths: [testDir],
      similarityThreshold: 0.9,
    });

    const result = await detector.checkFunction(
      "nonExistentFunction",
      "(x: string): void"
    );

    expect(result.exists).toBe(false);
    expect(result.matches.length).toBe(0);
  });

  test("should suggest using existing implementation", async () => {
    const detector = getDuplicateDetector({
      scanPaths: [testDir],
      similarityThreshold: 0.5,
    });

    const result = await detector.check("sum calculation function");

    expect(result.suggestion).toContain("EXISTING");
    expect(result.matches.some(m => m.file.includes("existing.ts"))).toBe(true);
  });

  test("should check for existing class", async () => {
    const detector = getDuplicateDetector({
      scanPaths: [testDir],
      similarityThreshold: 0.5,
    });

    const result = await detector.checkClass("UserManager", ["fetchData"]);

    expect(result.exists).toBe(true);
    expect(result.matches.some(m => m.file.includes("similar.ts"))).toBe(true);
  });

  test("should detect file by purpose", async () => {
    await fs.writeFile(
      path.join(testDir, "user-calculations.ts"),
      "export const VERSION = '1.0.0';"
    );

    const detector = getDuplicateDetector({
      scanPaths: [testDir],
      similarityThreshold: 0.5,
    });

    const result = await detector.checkFile("user calculations");

    expect(result.matches.some(m => m.file.includes("user-calculations"))).toBe(true);
  });
});

describe("Duplicate Detector - Integration", () => {
  test("should work with actual codebase", async () => {
    const detector = getDuplicateDetector({
      scanPaths: ["src"],
      similarityThreshold: 0.8,
      maxResults: 3,
    });

    // Check for existing WhatsApp integration
    const result = await detector.check("WhatsApp integration");

    expect(result).toBeDefined();
    expect(result).toHaveProperty("exists");
    expect(result).toHaveProperty("matches");
    expect(result).toHaveProperty("suggestion");
  });
});

describe("Duplicate Detector - Edge Cases", () => {
  test("should handle empty scan paths", async () => {
    const detector = getDuplicateDetector({
      scanPaths: ["/nonexistent"],
      similarityThreshold: 0.5,
    });

    const result = await detector.check("something");

    expect(result.exists).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  test("should respect similarity threshold", async () => {
    const testDir = "/tmp/test-threshold-scan";
    await fs.mkdir(testDir, { recursive: true });
    
    try {
      const detector = getDuplicateDetector({
        scanPaths: [testDir],
        similarityThreshold: 0.95, // Very high
      });

      const result = await detector.check("completely different thing");

      expect(result.exists).toBe(false);
    } finally {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });
});
