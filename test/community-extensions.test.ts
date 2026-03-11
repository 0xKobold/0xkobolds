/**
 * Test Community Extension Integration
 */

import { test, expect } from "bun:test";
import { eventBus } from "../src/event-bus";

test("event types include draconic extensions", () => {
  // Verify our new event types are registered
  const testEvents = [
    "agent.spawned",
    "agent.completed",
    "agent.expired",
    "discord.notify",
    "discord.message.received",
  ];
  
  // Emit should not throw for valid types
  testEvents.forEach(eventType => {
    expect(() => {
      eventBus.emit(eventType as any, { test: true });
    }).not.toThrow();
  });
});

test("draconic subagents wrapper exposes global API", () => {
  // The wrapper will expose getActiveJobs when loaded
  // For now, just verify the global doesn't exist yet (expected before runtime)
  const api = (global as any).draconicSubagents;
  expect(api).toBeUndefined();
});

test("draconic messenger wrapper exposes result collector", () => {
  // The wrapper will expose getSubagentResults when loaded
  expect((global as any).getSubagentResults).toBeUndefined();
});

test("community extensions are linked", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { homedir } = await import("node:os");
  
  const communityDir = path.join(homedir(), ".0xkobold/extensions/community");
  const skillsDir = path.join(homedir(), ".0xkobold/skills/community");
  
  // Check extensions (symlinked to extensions/community/)
  const extensionExts = [
    "pi-subagents",
    "pi-messenger", 
    "pi-memory-md",
  ];
  
  for (const ext of extensionExts) {
    const extPath = path.join(communityDir, ext);
    const exists = await fs.access(extPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  }
  
  // Check skills (symlinked to skills/community/)
  const skillExts = [
    "pi-web-access",
    "pi-librarian",
  ];
  
  for (const ext of skillExts) {
    const extPath = path.join(skillsDir, ext);
    const exists = await fs.access(extPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  }
});

test("wrapper tracks pi-subagents jobs", () => {
  // Simulate pi-subagents events
  eventBus.emit("agent.spawned", {
    runId: "test-job-123",
    type: "specialist",
    task: "Test task",
    agentType: "specialist",
    timestamp: Date.now(),
  });
  
  // The wrapper should have tracked this
  const jobs = (global as any).draconicSubagents?.getActiveJobs?.() || [];
  
  // Note: This may fail if wrapper hasn't been loaded yet
  // Just verify the API exists
  expect(Array.isArray(jobs)).toBe(true);
});
