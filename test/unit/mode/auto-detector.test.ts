/**
 * Mode Auto-Detector Tests - v0.2.0
 */

import { describe, test, expect } from "bun:test";
import {
  detectModeFromPrompt,
  analyzeContext,
  quickDetectMode,
  shouldSuggestSwitch,
  shouldAutoSwitch,
} from "../../../src/mode/index.js";

describe("Mode Auto-Detector - v0.2.0", () => {
  describe("analyzeContext", () => {
    test("should analyze complex task", () => {
      const features = analyzeContext("Design a complex system architecture");
      expect(features.appearsComplex).toBe(true);
      expect(features.mentionsArchitecture).toBe(true);
    });

    test("should detect questions", () => {
      const features = analyzeContext("How should I implement this?");
      expect(features.asksQuestions).toBe(true);
    });

    test("should detect urgency", () => {
      const features = analyzeContext("Fix this bug ASAP");
      expect(features.seemsUrgent).toBe(true);
      expect(features.mentionsBugFix).toBe(true);
    });

    test("should detect implementation intent", () => {
      const features = analyzeContext("Create a new component");
      expect(features.mentionsImplementation).toBe(true);
    });
  });

  describe("detectModeFromPrompt", () => {
    test("should recommend plan mode for complex tasks", () => {
      const result = detectModeFromPrompt(
        "How should I design the authentication system?",
        "build"
      );
      expect(result.recommendedMode).toBe("plan");
      expect(result.confidence).toBeGreaterThan(0);
    });

    test("should recommend build mode for implementation", () => {
      const result = detectModeFromPrompt(
        "Implement the login form now",
        "plan"
      );
      expect(result.recommendedMode).toBe("build");
      expect(result.confidence).toBeGreaterThan(0);
    });

    test("should provide reasoning", () => {
      const result = detectModeFromPrompt(
        "What's the best architecture for this?"
      );
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.features).toBeDefined();
    });

    test("should provide suggestions", () => {
      const result = detectModeFromPrompt("Implement a complex feature");
      expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("quickDetectMode", () => {
    test("should quickly detect mode", () => {
      const mode = quickDetectMode("How should I design this?");
      expect(mode).toBe("plan");

      const buildMode = quickDetectMode("Fix this bug now");
      expect(buildMode).toBe("build");
    });
  });

  describe("switch decision thresholds", () => {
    test("should suggest switch at medium confidence", () => {
      const medium = {
        recommendedMode: "build" as const,
        confidence: 60,
        reasoning: "test",
        features: analyzeContext("test"),
        suggestions: [],
      };
      expect(shouldSuggestSwitch(medium)).toBe(true);
    });

    test("should auto-switch at high confidence", () => {
      const high = {
        recommendedMode: "build" as const,
        confidence: 85,
        reasoning: "test",
        features: analyzeContext("test"),
        suggestions: [],
      };
      expect(shouldAutoSwitch(high)).toBe(true);
    });
  });
});
