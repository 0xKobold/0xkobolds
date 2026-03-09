/**
 * Agent Types Tests - v0.2.0
 *
 * Tests for the agent type system and task router.
 */

import { describe, test, expect } from "bun:test";
import {
  AGENT_TYPES,
  getAgentType,
  getAllAgentTypes,
  getAgentTypesForTask,
  routeTask,
  quickRoute,
  shouldUseSubagents,
} from "../../../src/agent/index.js";

describe("Agent Types - v0.2.0", () => {
  describe("Agent Type Definitions", () => {
    test("should have all 5 agent types", () => {
      const types = getAllAgentTypes();
      expect(types.length).toBe(5);
      expect(types.map((t) => t.id).sort()).toEqual([
        "coordinator",
        "researcher",
        "reviewer",
        "specialist",
        "worker",
      ]);
    });

    test("should have valid agent properties", () => {
      for (const agent of getAllAgentTypes()) {
        expect(agent.id).toBeDefined();
        expect(agent.name).toBeDefined();
        expect(agent.emoji).toBeDefined();
        expect(agent.description).toBeDefined();
        expect(agent.systemPrompt).toBeDefined();
        expect(agent.capabilities).toBeDefined();
        expect(agent.tools).toBeDefined();
        expect(agent.maxIterations).toBeGreaterThan(0);
        expect(agent.thinkLevel).toBeDefined();
      }
    });

    test("should get agent by ID", () => {
      const worker = getAgentType("worker");
      expect(worker).toBeDefined();
      expect(worker?.id).toBe("worker");
      expect(worker?.emoji).toBe("⚒️");

      const researcher = getAgentType("researcher");
      expect(researcher).toBeDefined();
      expect(researcher?.id).toBe("researcher");
      expect(researcher?.emoji).toBe("🔍");
    });

    test("should return undefined for unknown agent type", () => {
      expect(getAgentType("unknown")).toBeUndefined();
      expect(getAgentType("")).toBeUndefined();
    });

    test("should have unique emojis", () => {
      const emojis = getAllAgentTypes().map((t) => t.emoji);
      const unique = new Set(emojis);
      expect(unique.size).toBe(emojis.length);
    });
  });

  describe("Task Routing", () => {
    test("should route research tasks to researcher", () => {
      const result = routeTask({ task: "Research the best practices for API design" });
      expect(result.recommendedAgent.id).toBe("researcher");
      expect(result.confidence).toBeGreaterThan(0);
    });

    test("should route review tasks to reviewer", () => {
      const result = routeTask({
        task: "Review this code for security issues",
      });
      expect(result.recommendedAgent.id).toBe("reviewer");
    });

    test("should route implementation tasks to worker", () => {
      const result = routeTask({
        task: "Implement a new feature for user authentication",
      });
      expect(result.recommendedAgent.id).toBe("worker");
    });

    test("should route complex tasks to coordinator", () => {
      const result = routeTask({
        task: "Plan and coordinate the migration of our database system",
      });
      expect(result.recommendedAgent.id).toBe("coordinator");
    });

    test("should provide routing reasoning", () => {
      const result = routeTask({
        task: "Search for documentation about React hooks",
      });
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.reasoning).toContain("Researcher");
    });

    test("should provide alternative agents", () => {
      const result = routeTask({
        task: "Implement a REST API for user management",
      });
      expect(result.alternativeAgents.length).toBeGreaterThanOrEqual(0);
    });

    test("should estimate complexity", () => {
      const simple = routeTask({ task: "Fix a typo in the README" });
      expect(["simple", "medium"]).toContain(simple.estimatedComplexity);

      const complex = routeTask({
        task: "Design and implement a complete authentication system",
      });
      expect(complex.estimatedComplexity).toBe("complex");
    });
  });

  describe("Quick Route", () => {
    test("should quickly route tasks", () => {
      const agent = quickRoute("Research TypeScript decorators");
      expect(agent).toBeDefined();
      expect(agent.id).toBe("researcher");

      const worker = quickRoute("Implement login button");
      expect(worker.id).toBe("worker");
    });
  });

  describe("Subagent Detection", () => {
    test("should identify complex tasks needing subagents", () => {
      const result = shouldUseSubagents(
        "Design and implement a complete user authentication system with OAuth",
      );
      expect(result.useSubagents).toBe(true);
      expect(result.complexity).toBe("complex");
    });

    test("should identify simple tasks not needing subagents", () => {
      const result = shouldUseSubagents("Fix typo in readme");
      expect(result.useSubagents).toBe(false);
      expect(result.complexity).toBe("simple");
    });
  });

  describe("Agent Type Capabilities", () => {
    test("coordinator should have planning capabilities", () => {
      const coordinator = getAgentType("coordinator");
      expect(coordinator?.capabilities).toContain("task-decomposition");
      expect(coordinator?.capabilities).toContain("agent-delegation");
    });

    test("worker should have implementation capabilities", () => {
      const worker = getAgentType("worker");
      expect(worker?.capabilities).toContain("implementation");
      expect(worker?.capabilities).toContain("code-generation");
    });

    test("researcher should have research capabilities", () => {
      const researcher = getAgentType("researcher");
      expect(researcher?.capabilities).toContain("information-gathering");
    });

    test("reviewer should have validation capabilities", () => {
      const reviewer = getAgentType("reviewer");
      expect(reviewer?.capabilities).toContain("code-review");
      expect(reviewer?.capabilities).toContain("validation");
    });

    test("specialist should have expert capabilities", () => {
      const specialist = getAgentType("specialist");
      expect(specialist?.capabilities).toContain("deep-domain-knowledge");
    });
  });
});
