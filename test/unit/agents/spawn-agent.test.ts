/**
 * Spawn Agent Tool Tests - v0.2.0
 *
 * Tests for the spawn_agent tool functionality.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  spawnAgent,
  spawnAgents,
  executeSpawnAgent,
} from "../../../src/agent/index.js";
import { type AgentType } from "../../../src/agent/index.js";

describe("Spawn Agent Tool - v0.2.0", () => {
  describe("spawnAgent", () => {
    test("should spawn a worker agent by default", async () => {
      const result = await spawnAgent({
        task: "Implement a login form",
      });

      expect(result.success).toBe(true);
      expect(result.agentType.id).toBe("worker");
      expect(result.agentId).toBeDefined();
      expect(result.systemPrompt).toContain("⚒️");
    });

    test("should spawn specific agent types", async () => {
      const coordinator = await spawnAgent({
        task: "Plan the project",
        agentType: "coordinator",
        autoRoute: false,
      });
      expect(coordinator.agentType.id).toBe("coordinator");
      expect(coordinator.systemPrompt).toContain("🎯");

      const researcher = await spawnAgent({
        task: "Research options",
        agentType: "researcher",
        autoRoute: false,
      });
      expect(researcher.agentType.id).toBe("researcher");
      expect(researcher.systemPrompt).toContain("🔍");

      const reviewer = await spawnAgent({
        task: "Review code",
        agentType: "reviewer",
        autoRoute: false,
      });
      expect(reviewer.agentType.id).toBe("reviewer");
      expect(reviewer.systemPrompt).toContain("👁️");

      const specialist = await spawnAgent({
        task: "Optimize database",
        agentType: "specialist",
        autoRoute: false,
      });
      expect(specialist.agentType.id).toBe("specialist");
      expect(specialist.systemPrompt).toContain("🧠");
    });

    test("should auto-route when autoRoute is true", async () => {
      const result = await spawnAgent({
        task: "Research the best practices for React hooks",
        autoRoute: true,
      });

      expect(result.success).toBe(true);
      expect(result.agentType.id).toBe("researcher");
      expect(result.routingInfo).toBeDefined();
      expect(result.routingInfo?.recommendedAgent.id).toBe("researcher");
    });

    test("should handle unknown agent types", async () => {
      const result = await spawnAgent({
        task: "Do something",
        agentType: "unknown-type",
        autoRoute: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown agent type");
    });

    test("should respect agent type maxIterations", async () => {
      const worker = await spawnAgent({
        task: "Implement feature",
        agentType: "worker",
        autoRoute: false,
      });
      expect(worker.maxIterations).toBe(15); // worker default

      const coordinator = await spawnAgent({
        task: "Plan project",
        agentType: "coordinator",
        autoRoute: false,
      });
      expect(coordinator.maxIterations).toBe(20); // coordinator default
    });

    test("should override maxIterations when specified", async () => {
      const result = await spawnAgent({
        task: "Quick task",
        agentType: "worker",
        maxIterations: 5,
        autoRoute: false,
      });
      expect(result.maxIterations).toBe(5);
    });

    test("should generate unique agent IDs", async () => {
      const result1 = await spawnAgent({ task: "Task 1", autoRoute: false, agentType: "worker" });
      const result2 = await spawnAgent({ task: "Task 2", autoRoute: false, agentType: "worker" });

      expect(result1.agentId).not.toBe(result2.agentId);
      expect(result1.agentId).toMatch(/^worker-/);
      expect(result2.agentId).toMatch(/^worker-/);
    });

    test("should include context in system prompt", async () => {
      const result = await spawnAgent({
        task: "Implement login",
        agentType: "worker",
        context: "This is for an admin dashboard",
        autoRoute: false,
      });

      expect(result.systemPrompt).toContain("admin dashboard");
    });
  });

  describe("spawnAgents (parallel)", () => {
    test("should spawn multiple agents", async () => {
      const tasks = [
        { task: "Research React", agentType: "researcher" },
        { task: "Implement login", agentType: "worker" },
        { task: "Review code", context: "Check security" },
      ];

      const results = await spawnAgents(tasks);

      expect(results.length).toBe(3);
      expect(results[0].agentType.id).toBe("researcher");
      expect(results[1].agentType.id).toBe("worker");
      expect(results[2].success).toBe(true); // auto-routed
    });
  });

  describe("executeSpawnAgent (tool interface)", () => {
    test("should return tool-compatible result", async () => {
      const result = await executeSpawnAgent({
        task: "Implement feature",
        agentType: "worker",
        autoRoute: false,
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("worker");
      expect(result.details).toBeDefined();
      expect(result.details.agentId).toBeDefined();
    });

    test("should include routing info when auto-routed", async () => {
      const result = await executeSpawnAgent({
        task: "Research React hooks",
        autoRoute: true,
      });

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("Auto-routing");
      expect(result.details.routingInfo).toBeDefined();
    });

    test("should handle errors", async () => {
      const result = await executeSpawnAgent({
        task: "Do something",
        agentType: "invalid-type",
        autoRoute: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
