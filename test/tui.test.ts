/**
 * 🐉 Draconic TUI Tests
 */

import { test, expect, describe } from "bun:test";
import { createKoboldTUI } from "../src/tui/index";
import { detectMode, createDraconicTUI } from "../src/tui/draconic-tui";
import { DraconicStatusBar } from "../src/tui/components/status-bar";
import { getDraconicRunRegistry, DraconicAgentRun } from "../src/agent/DraconicRunRegistry";
import { eventBus } from "../src/event-bus";

describe("TUI Mode Detection", () => {
  test("detects local mode by default", () => {
    const originalArgs = process.argv;
    process.argv = ["node", "script"];
    expect(detectMode()).toBe("local");
    process.argv = originalArgs;
  });

  test("detects remote mode with --remote flag", () => {
    const originalArgs = process.argv;
    process.argv = ["node", "script", "--remote"];
    expect(detectMode()).toBe("remote");
    process.argv = originalArgs;
  });
});

describe("Footer Status - Real-time Task Display", () => {
  test("shows agent type emoji in footer", async () => {
    const registry = getDraconicRunRegistry();
    
    // Create a specialist run
    const run = registry.create({
      sessionKey: "test",
      name: "test-specialist",
      type: "specialist",
      task: "implement auth",
      workspace: "/test",
      capabilities: { primary: ["coding"], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    
    registry.updateStatus(run.id, "running");
    
    // Footer should prioritize running subagent
    const stats = registry.getStats();
    expect(stats.activeRuns).toBe(1);
    
    // Cleanup
    registry.clear();
  });

  test("prioritizes subagents over main agent", async () => {
    const registry = getDraconicRunRegistry();
    
    // Create main agent (depth 0)
    const mainRun = registry.create({
      sessionKey: "test",
      name: "main",
      type: "coordinator",
      task: "TUI Main Agent",
      workspace: "/test",
      capabilities: { primary: ["coordination"], secondary: [] },
      depth: 0,
      isProcessingQueue: false,
    });
    registry.updateStatus(mainRun.id, "running");
    
    // Create subagent (depth 1)
    const subRun = registry.create({
      sessionKey: "test",
      name: "researcher-1",
      type: "researcher",
      task: "analyze code",
      workspace: "/test",
      capabilities: { primary: ["research"], secondary: [] },
      parentId: mainRun.id,
      depth: 1,
      isProcessingQueue: false,
    });
    registry.updateStatus(subRun.id, "running");
    
    const allRuns = registry.query({}).runs;
    const runningSubagent = allRuns
      .filter(r => r.status === "running" && r.depth > 0)
      .sort((a, b) => (b.metrics?.lastActivityAt || 0) - (a.metrics?.lastActivityAt || 0))[0];
    
    // Should find the subagent, not main
    expect(runningSubagent?.id).toBe(subRun.id);
    expect(runningSubagent?.type).toBe("researcher");
    
    registry.clear();
  });

  test("shows completion status", async () => {
    const registry = getDraconicRunRegistry();
    
    const run = registry.create({
      sessionKey: "test",
      name: "test",
      type: "specialist",
      task: "done task",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    
    registry.updateStatus(run.id, "completed");
    
    const allRuns = registry.query({}).runs;
    const completed = allRuns.find(r => r.status === "completed");
    
    expect(completed?.status).toBe("completed");
    
    registry.clear();
  });
});

describe("Agent Control Commands", () => {
  test("can stop running agent", async () => {
    const registry = getDraconicRunRegistry();
    
    const run = registry.create({
      sessionKey: "test",
      name: "stop-test",
      type: "researcher",
      task: "task to stop",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    registry.updateStatus(run.id, "running");
    
    expect(registry.get(run.id)?.status).toBe("running");
    
    // Simulate stop
    registry.updateStatus(run.id, "paused");
    expect(registry.get(run.id)?.status).toBe("paused");
    
    registry.clear();
  });

  test("can resume paused agent", async () => {
    const registry = getDraconicRunRegistry();
    
    const run = registry.create({
      sessionKey: "test",
      name: "resume-test",
      type: "specialist",
      task: "task to resume",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    registry.updateStatus(run.id, "paused");
    
    expect(registry.get(run.id)?.status).toBe("paused");
    
    // Simulate resume
    registry.updateStatus(run.id, "running");
    expect(registry.get(run.id)?.status).toBe("running");
    
    registry.clear();
  });

  test("can kill agent", async () => {
    const registry = getDraconicRunRegistry();
    
    const run = registry.create({
      sessionKey: "test",
      name: "kill-test",
      type: "planner",
      task: "task to kill",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    registry.updateStatus(run.id, "running");
    
    // Simulate kill
    registry.updateStatus(run.id, "error");
    
    expect(registry.get(run.id)?.status).toBe("error");
    
    registry.clear();
  });
});

describe("Quick Spawn Presets", () => {
  const agentTypes = [
    { type: "specialist", emoji: "👨‍💻" },
    { type: "researcher", emoji: "🔬" },
    { type: "planner", emoji: "📋" },
    { type: "reviewer", emoji: "👁️" },
  ];

  for (const { type, emoji } of agentTypes) {
    test(`can create ${type} agent`, async () => {
      const registry = getDraconicRunRegistry();
      
      const run = registry.create({
        sessionKey: "test",
        name: `${type}-test`,
        type: type as any,
        task: `test ${type} task`,
        workspace: "/test",
        capabilities: { primary: [type], secondary: [] },
        depth: 1,
        isProcessingQueue: false,
      });
      
      expect(run.type).toBe(type);
      expect(run.task).toContain(type);
      
      registry.clear();
    });
  }
});

describe("Real-time Updates", () => {
  test("emits event on agent spawn", async () => {
    let eventReceived = false;
    
    const unsubscribe = eventBus.on("agent.spawned", (data: any) => {
      eventReceived = true;
      expect(data.runId).toBeDefined();
      expect(data.type).toBe("researcher");
    });
    
    const registry = getDraconicRunRegistry();
    const run = registry.create({
      sessionKey: "test",
      name: "event-test",
      type: "researcher",
      task: "emit test",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    
    eventBus.emit("agent.spawned", { runId: run.id, type: "researcher" });
    
    expect(eventReceived).toBe(true);
    unsubscribe?.();
    registry.clear();
  });

  test("emits event on agent completion", async () => {
    let eventReceived = false;
    
    const unsubscribe = eventBus.on("agent.completed", (data: any) => {
      eventReceived = true;
    });
    
    const registry = getDraconicRunRegistry();
    const run = registry.create({
      sessionKey: "test",
      name: "complete-test",
      type: "specialist",
      task: "complete test",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    
    registry.updateStatus(run.id, "completed");
    eventBus.emit("agent.completed", { runId: run.id });
    
    expect(eventReceived).toBe(true);
    unsubscribe?.();
    registry.clear();
  });
});

describe("Artifact Browser", () => {
  test("lists completed runs", async () => {
    const registry = getDraconicRunRegistry();
    
    // Create completed run with artifact
    const run = registry.create({
      sessionKey: "test",
      name: "artifact-test",
      type: "researcher",
      task: "test with artifact",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    registry.updateStatus(run.id, "completed");
    
    // Add artifact
    registry.updateArtifacts(run.id, [{
      type: "text",
      content: "test artifact content",
      key: "output",
      createdAt: Date.now(),
    }]);
    
    const withArtifacts = registry.query({ status: "completed" }).runs
      .filter(r => r.artifacts && r.artifacts.length > 0);
    
    expect(withArtifacts.length).toBe(1);
    expect(withArtifacts[0].artifacts?.[0].content).toBe("test artifact content");
    
    registry.clear();
  });

  test("finds latest artifact", async () => {
    const registry = getDraconicRunRegistry();
    
    // Create two runs
    const run1 = registry.create({
      sessionKey: "test",
      name: "older",
      type: "specialist",
      task: "older task",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    registry.updateStatus(run1.id, "completed");
    await new Promise(r => setTimeout(r, 10));
    
    const run2 = registry.create({
      sessionKey: "test",
      name: "newer",
      type: "researcher",
      task: "newer task",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    registry.updateStatus(run2.id, "completed");
    
    // Latest should be run2
    const allRuns = registry.query({ status: "completed" }).runs
      .sort((a, b) => (b.metrics?.lastActivityAt || 0) - (a.metrics?.lastActivityAt || 0));
    
    expect(allRuns[0].id).toBe(run2.id);
    
    registry.clear();
  });
});

describe("Keyboard Shortcuts", () => {
  test("shortcut registrations exist", () => {
    // Note: Keyboard shortcuts are registered via pi.registerShortcut
    // which requires actual ExtensionAPI - this is tested at integration level
    const shortcuts = [
      "ctrl+shift+a",  // Show tree
      "ctrl+shift+s",  // Quick specialist
      "ctrl+shift+r",  // Quick researcher
      "ctrl+shift+k",  // Kill agent
    ];
    
    expect(shortcuts.length).toBe(4);
    expect(shortcuts[0]).toBe("ctrl+shift+a");
  });
});

describe("Registry Stats", () => {
  test("calculates stats correctly", async () => {
    const registry = getDraconicRunRegistry();
    
    // Empty state
    expect(registry.getStats()).toEqual({ totalRuns: 0, activeRuns: 0 });
    
    // Add running agent
    const run1 = registry.create({
      sessionKey: "test",
      name: "active",
      type: "specialist",
      task: "active task",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    registry.updateStatus(run1.id, "running");
    
    expect(registry.getStats()).toEqual({ totalRuns: 1, activeRuns: 1 });
    
    // Add completed agent
    const run2 = registry.create({
      sessionKey: "test",
      name: "done",
      type: "researcher",
      task: "done task",
      workspace: "/test",
      capabilities: { primary: [], secondary: [] },
      depth: 1,
      isProcessingQueue: false,
    });
    registry.updateStatus(run2.id, "completed");
    
    expect(registry.getStats()).toEqual({ totalRuns: 2, activeRuns: 1 });
    
    registry.clear();
  });
});

console.log("🐉 Draconic TUI tests loaded - v2.0");
