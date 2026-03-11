import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getSessionMemoryBridge, createSessionStore, resetSessionStore } from "../src/gateway/index";
import { getSessionStore } from "../src/memory/session-store";

describe("Phase 5: Session-Aware Memory", () => {
  let bridge: ReturnType<typeof getSessionMemoryBridge>;
  let store: ReturnType<typeof createSessionStore>;

  beforeEach(() => {
    bridge = getSessionMemoryBridge();
    store = getSessionStore();
  });

  afterEach(() => {
    resetSessionStore();
  });

  it("should create session with memory thread", async () => {
    const context = await bridge.getMemoryContext("test-session-1");
    
    expect(context.sessionKey).toBe("test-session-1");
    expect(context.memoryThreadId).toBeDefined();
    expect(context.memoryThreadId.startsWith("thread_")).toBe(true);
  });

  it("should retrieve existing session", async () => {
    // Create first
    const created = await bridge.getMemoryContext("test-session-2");
    
    // Get again - should be same
    const retrieved = await bridge.getMemoryContext("test-session-2");
    
    expect(retrieved.memoryThreadId).toBe(created.memoryThreadId);
  });

  it("should link run to session", async () => {
    const context = await bridge.getMemoryContext("test-session-link");
    
    const before = await bridge.getEnrichedSession("test-session-link");
    const initialCount = before?.messageCount || 0;
    
    await bridge.linkRunToSession("test-session-link", "run-123");
    
    const enriched = await bridge.getEnrichedSession("test-session-link");
    expect(enriched?.lastRunId).toBe("run-123");
    expect(enriched?.messageCount).toBe(initialCount + 1);
  });

  it("should update conversation summary", async () => {
    await bridge.getMemoryContext("test-session-4");
    
    await bridge.updateSummary("test-session-4", "Summary of conversation");
    
    const enriched = await bridge.getEnrichedSession("test-session-4");
    expect(enriched?.conversationSummary).toBe("Summary of conversation");
  });

  it("should resume from memory thread", async () => {
    // Create session
    const created = await bridge.getMemoryContext("test-session-5");
    const threadId = created.memoryThreadId;
    
    // Resume from thread
    const resumed = await bridge.resumeFromMemoryThread(threadId);
    
    expect(resumed?.sessionKey).toBe("test-session-5");
    expect(resumed?.memoryThreadId).toBe(threadId);
  });

  it("should get active sessions", async () => {
    await bridge.getMemoryContext("active-1");
    await bridge.getMemoryContext("active-2");
    
    const active = await bridge.getActiveMemorySessions();
    
    expect(active.length).toBeGreaterThanOrEqual(2);
    expect(active.some(s => s.sessionKey === "active-1")).toBe(true);
    expect(active.some(s => s.sessionKey === "active-2")).toBe(true);
  });

  it("should set user profile", async () => {
    await bridge.getMemoryContext("test-session-6");
    
    await bridge.setUserProfile("test-session-6", "user-123");
    
    const enriched = await bridge.getEnrichedSession("test-session-6");
    expect(enriched?.userProfileId).toBe("user-123");
  });
});