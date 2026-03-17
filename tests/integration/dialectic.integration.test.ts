/**
 * Integration Tests for Dialectic Reasoning
 * 
 * Tests the full workflow of dialectic reasoning with real LLM calls.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { 
  getDialecticStore, 
  getDialecticReasoningEngine,
  setReasoningModel,
  type ReasoningStrategy 
} from "../../src/memory/dialectic/index.js";
import type { Peer } from "../../src/memory/dialectic/types.js";

// Skip LLM tests if OLLAMA_URL not available
const ollamaAvailable = process.env.OLLAMA_URL || process.env.CI ? true : false;

describe.skipIf(!ollamaAvailable)("Dialectic Reasoning Integration", () => {
  let store: ReturnType<typeof getDialecticStore>;
  let testPeer: Peer;

  beforeAll(() => {
    store = getDialecticStore();
    testPeer = store.createPeer("user", `integration-test-${Date.now()}`);
  });

  describe("Full Reasoning Workflow", () => {
    test("should create peer and add observations", async () => {
      // Add multiple observations
      store.addObservation(testPeer.id, "I prefer TypeScript for infrastructure", "preference", "message", "1");
      store.addObservation(testPeer.id, "I value simplicity over complexity", "value", "message", "2");
      store.addObservation(testPeer.id, "I'm building an AI agent system", "goal", "message", "3");
      store.addObservation(testPeer.id, "SQLite is fine for single-user apps", "preference", "message", "4");

      const observations = store.getObservations(testPeer.id);
      expect(observations.length).toBe(4);
    });

    test("should run dialectic reasoning end-to-end", async () => {
      // Use fastest model for tests
      setReasoningModel("nemotron-3-super:cloud");
      
      const engine = getDialecticReasoningEngine({ strategy: "dialectic" });
      const result = await engine.reason(testPeer.id);

      // Should have extracted something
      expect(result.preferences.length + result.goals.length + result.values.length).toBeGreaterThan(0);
      
      // Should have a synthesis
      expect(result.synthesis).toBeDefined();
      expect(result.synthesis?.content).toBeDefined();
      
      // Should have reasoning path
      expect(result.reasoningPath).toContain("dialectic");
    });

    test("should persist representation after reasoning", async () => {
      const repr = store.getRepresentation(testPeer.id);
      
      expect(repr).toBeDefined();
      expect(repr?.peerId).toBe(testPeer.id);
    });
  });

  describe("Strategy Comparison", () => {
    const strategies: ReasoningStrategy[] = ["dialectic", "chain-of-thought", "formal-logic"];

    for (const strategy of strategies) {
      test(`${strategy} should extract inferences`, async () => {
        const peer = store.createPeer("user", `test-${strategy}-${Date.now()}`);
        
        store.addObservation(peer.id, "I prefer code over configuration", "preference", "message", "1");
        store.addObservation(peer.id, "I'm building a Kobold agent", "goal", "message", "2");
        store.addObservation(peer.id, "I dislike JavaScript", "preference", "message", "3");

        const engine = getDialecticReasoningEngine({ strategy, model: "nemotron-3-super:cloud" });
        const result = await engine.reason(peer.id);

        // Each strategy should produce valid output
        expect(result).toBeDefined();
        expect(result.reasoningPath.length).toBeGreaterThan(0);
      });
    }
  });

  describe("Error Recovery", () => {
    test("should handle empty observations gracefully", async () => {
      const emptyPeer = store.createPeer("user", `empty-${Date.now()}`);
      
      const engine = getDialecticReasoningEngine({ strategy: "dialectic" });
      const result = await engine.reason(emptyPeer.id);

      // Should return empty result, not throw
      expect(result.preferences).toEqual([]);
      expect(result.goals).toEqual([]);
      expect(result.synthesis).toBeNull();
    });

    test("should handle malformed LLM response", async () => {
      const peer = store.createPeer("user", `malformed-${Date.now()}`);
      
      // Add weird observations
      store.addObservation(peer.id, "asdfghjkl", "statement", "message", "1");
      store.addObservation(peer.id, "qwertyuiop", "statement", "message", "2");
      store.addObservation(peer.id, "zxcvbnm", "statement", "message", "3");

      const engine = getDialecticReasoningEngine({ strategy: "dialectic" });
      
      // Should not throw
      const result = await engine.reason(peer.id);
      expect(result).toBeDefined();
    });
  });

  describe("Cross-Session Persistence", () => {
    test("should persist peer across sessions", async () => {
      // Create peer in this "session"
      const peer = store.createPeer("user", `persist-test-${Date.now()}`);
      store.addObservation(peer.id, "Test observation", "statement", "message", "1");

      // Simulate new session by getting store again
      const newStore = getDialecticStore();
      
      // Should find the same peer
      const found = newStore.getPeerByName("persist-test-" + peer.id.split("-").pop());
      
      // Peer should persist (or we can find by ID)
      const byId = newStore.getRepresentation(peer.id);
      expect(byId).toBeDefined();
    });
  });

  describe("Model Swapping", () => {
    test("should work with different models", async () => {
      const models = ["nemotron-3-super:cloud", "glm-5:cloud"];
      
      for (const model of models) {
        const peer = store.createPeer("user", `model-test-${model.split(":")[0]}-${Date.now()}`);
        
        store.addObservation(peer.id, "Model test observation 1", "statement", "message", "1");
        store.addObservation(peer.id, "Model test observation 2", "statement", "message", "2");
        store.addObservation(peer.id, "Model test observation 3", "statement", "message", "3");

        setReasoningModel(model);
        const engine = getDialecticReasoningEngine({ strategy: "dialectic", model });
        const result = await engine.reason(peer.id);

        expect(result).toBeDefined();
        expect(result.reasoningPath.length).toBeGreaterThan(0);
      }
    });
  });
});