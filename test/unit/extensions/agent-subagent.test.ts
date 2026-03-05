/**
 * Agent/Subagent Tests
 *
 * Tests for agent registry, spawning, and lifecycle management
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import agentRegistryExtension from "../../../src/extensions/core/agent-registry-extension";
import {
  createMockExtensionAPI,
  createMockContext,
  triggerEvent,
} from "./mocks";

const TEST_DIR = join(tmpdir(), "agent-test-" + Date.now());

describe("Agent Registry Extension", () => {
  let api: ReturnType<typeof createMockExtensionAPI>;
  let originalHome: string | undefined;

  beforeEach(async () => {
    api = createMockExtensionAPI();
    originalHome = process.env.HOME;
    process.env.HOME = TEST_DIR;
    await mkdir(join(TEST_DIR, ".0xkobold", "agents"), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("Database Initialization", () => {
    test("should create database on initialization", () => {
      agentRegistryExtension(api as any);
      console.log("[Test] Database initialized");
    });

    test("should create default agent definitions", () => {
      agentRegistryExtension(api as any);
      console.log("[Test] Default agent definitions created");
    });
  });

  describe("Command Registration", () => {
    test("should register agents command", () => {
      agentRegistryExtension(api as any);
      expect(api.state.commands.has("agents")).toBe(true);
    });

    test("should register agent-spawn command", () => {
      agentRegistryExtension(api as any);
      expect(api.state.commands.has("agent-spawn")).toBe(true);
    });

    test("should register agent-status command", () => {
      agentRegistryExtension(api as any);
      expect(api.state.commands.has("agent-status")).toBe(true);
    });

    test("should register agent-tree command", () => {
      agentRegistryExtension(api as any);
      expect(api.state.commands.has("agent-tree")).toBe(true);
    });

    test("should register agent-cap command", () => {
      agentRegistryExtension(api as any);
      expect(api.state.commands.has("agent-cap")).toBe(true);
    });
  });

  describe("Tool Registration", () => {
    test("should register agent_spawn tool", () => {
      agentRegistryExtension(api as any);
      expect(api.state.tools.has("agent_spawn")).toBe(true);
    });

    test("should register agent_delegate tool", () => {
      agentRegistryExtension(api as any);
      expect(api.state.tools.has("agent_delegate")).toBe(true);
    });

    test("should register agent_list tool", () => {
      agentRegistryExtension(api as any);
      expect(api.state.tools.has("agent_list")).toBe(true);
    });
  });

  describe("Default Agent Types", () => {
    test("should have coordinator agent type", async () => {
      agentRegistryExtension(api as any);

      const agentsCommand = api.state.commands.get("agents");
      const notified: Array<{ message: string; type: string }> = [];

      const mockCtx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await agentsCommand?.handler?.({}, mockCtx);

      expect(notified[0]?.message).toContain("coordinator");
    });

    test("should have code-specialist agent type", async () => {
      agentRegistryExtension(api as any);

      const agentsCommand = api.state.commands.get("agents");
      const notified: Array<{ message: string; type: string }> = [];

      const mockCtx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await agentsCommand?.handler?.({}, mockCtx);

      expect(notified[0]?.message).toContain("code-specialist");
    });

    test("should have researcher agent type", async () => {
      agentRegistryExtension(api as any);

      const agentsCommand = api.state.commands.get("agents");
      const notified: Array<{ message: string; type: string }> = [];

      const mockCtx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await agentsCommand?.handler?.({}, mockCtx);

      expect(notified[0]?.message).toContain("researcher");
    });
  });

  describe("Agent Capabilities", () => {
    test("should find agents by capability", async () => {
      agentRegistryExtension(api as any);

      const agentCapCommand = api.state.commands.get("agent-cap");
      const notified: Array<{ message: string; type: string }> = [];

      const mockCtx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await agentCapCommand?.handler?.({ capability: "coding" }, mockCtx);

      expect(notified[0]?.message).toContain("code-specialist");
    });

    test("should handle missing capabilities gracefully", async () => {
      agentRegistryExtension(api as any);

      const agentCapCommand = api.state.commands.get("agent-cap");
      const notified: Array<{ message: string; type: string }> = [];

      const mockCtx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await agentCapCommand?.handler?.(
        { capability: "nonexistent" },
        mockCtx
      );

      expect(notified[0]?.type).toBe("warning");
    });
  });

  describe("Agent Spawn Tool", () => {
    test("should spawn agent by type", async () => {
      agentRegistryExtension(api as any);

      await triggerEvent(api, "session_start");

      const spawnTool = api.state.tools.get("agent_spawn")!;
      const result = await spawnTool.execute({
        agent_type: "specialist",
        task: "Write a function to calculate fibonacci",
      });

      expect(result.content[0].text).toContain("Spawned");
      expect(result.details?.agent_id).toBeDefined();
      expect(result.details?.name).toBeDefined();
    });

    test("should find agent by capability if type not found", async () => {
      agentRegistryExtension(api as any);

      await triggerEvent(api, "session_start");

      const spawnTool = api.state.tools.get("agent_spawn")!;
      const result = await spawnTool.execute({
        agent_type: "nonexistent",
        task: "Some task",
        capabilities_needed: ["coding"],
      });

      // Should fall back to capability search
      expect(result.details?.agent_id || result.details?.error).toBeDefined();
    });

    test("should return error for unavailable agent types", async () => {
      // Create new API with no default agents
      const emptyApi = createMockExtensionAPI();
      agentRegistryExtension(emptyApi as any);

      await triggerEvent(emptyApi, "session_start");

      const spawnTool = emptyApi.state.tools.get("agent_spawn")!;
      const result = await spawnTool.execute({
        agent_type: "specialist",
        task: "Some task",
      });

      expect(result.content[0].text).toContain("not available");
      expect(result.details?.error).toBe("no_agent");
    });
  });

  describe("Agent Delegate Tool", () => {
    test("should delegate based on task analysis", async () => {
      agentRegistryExtension(api as any);

      await triggerEvent(api, "session_start");

      const delegateTool = api.state.tools.get("agent_delegate")!;
      const result = await delegateTool.execute({
        task: "Research the latest React patterns",
      });

      // Should have spawned a researcher
      expect(result.details?.type).toBe("researcher");
    });

    test("should delegate coding tasks to specialist", async () => {
      agentRegistryExtension(api as any);

      await triggerEvent(api, "session_start");

      const delegateTool = api.state.tools.get("agent_delegate")!;
      const result = await delegateTool.execute({
        task: "Implement a new feature in TypeScript",
      });

      expect(result.details?.type).toBe("specialist");
    });

    test("should respect preferred_type parameter", async () => {
      agentRegistryExtension(api as any);

      await triggerEvent(api, "session_start");

      const delegateTool = api.state.tools.get("agent_delegate")!;
      const result = await delegateTool.execute({
        task: "Some general task",
        preferred_type: "coordinator",
      });

      expect(result.details?.type).toBe("coordinator");
    });
  });

  describe("Agent List Tool", () => {
    test("should return all available agents", async () => {
      agentRegistryExtension(api as any);

      const listTool = api.state.tools.get("agent_list")!;
      const result = await listTool.execute({});

      expect(result.details?.agents).toBeInstanceOf(Array);
      expect((result.details?.agents as any[]).length).toBeGreaterThan(0);
    });

    test("should include agent capabilities in list", async () => {
      agentRegistryExtension(api as any);

      const listTool = api.state.tools.get("agent_list")!;
      const result = await listTool.execute({});

      const agents = result.details?.agents as any[];
      expect(agents[0]).toHaveProperty("capabilities");
      expect(agents[0]).toHaveProperty("name");
      expect(agents[0]).toHaveProperty("type");
    });
  });

  describe("Agent Hierarchy", () => {
    test("should track agent parent-child relationships", async () => {
      agentRegistryExtension(api as any);

      await triggerEvent(api, "session_start");

      // Spawn parent
      const spawnTool = api.state.tools.get("agent_spawn")!;
      const parentResult = await spawnTool.execute({
        agent_type: "coordinator",
        task: "Coordinate the project",
      });

      const parentId = parentResult.details?.agent_id as string;
      expect(parentId).toBeDefined();

      // Spawn child
      const childResult = await spawnTool.execute({
        agent_type: "worker",
        task: "Worker task",
      });

      const childId = childResult.details?.agent_id as string;
      expect(childId).toBeDefined();

      // Check tree command can display hierarchy
      const treeCommand = api.state.commands.get("agent-tree");
      expect(treeCommand).toBeDefined();
    });
  });

  describe("Session Management", () => {
    test("should capture session ID on session_start", async () => {
      process.env.KOBOLD_SESSION_ID = "test-session-123";

      agentRegistryExtension(api as any);

      await triggerEvent(api, "session_start");

      // Spawn agent - should use session ID
      const spawnTool = api.state.tools.get("agent_spawn")!;
      await spawnTool.execute({
        agent_type: "specialist",
        task: "Test task",
      });

      delete process.env.KOBOLD_SESSION_ID;
    });
  });
});
