import { describe, it, expect, beforeEach } from "bun:test";
import { getSessionResumeSystem } from "../src/memory/session-resume";
import { getSessionStore, resetSessionStore } from "../src/memory/session-store";
import { getSessionMemoryBridge } from "../src/memory/session-memory-bridge";

describe("Session Resume System", () => {
  let resumeSystem: ReturnType<typeof getSessionResumeSystem>;

  beforeEach(() => {
    resetSessionStore();
    resumeSystem = getSessionResumeSystem();
  });

  it("should track current session", () => {
    // Initial state
    const stats = resumeSystem.getCurrentSessionStats();
    expect(stats.currentSession).toBeUndefined();
  });

  it("should get resume suggestions", async () => {
    // Create some sessions with messages
    const bridge = getSessionMemoryBridge();
    await bridge.getMemoryContext("session-1");
    await bridge.updateSummary("session-1", "Working on API design");
    
    await bridge.getMemoryContext("session-2");
    await bridge.updateSummary("session-2", "Database schema");

    const suggestions = await resumeSystem.getResumeSuggestions();
    
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0]).toHaveProperty("sessionKey");
    expect(suggestions[0]).toHaveProperty("reason");
    expect(suggestions[0]).toHaveProperty("timeAgo");
  });

  it("should search sessions by query", async () => {
    // Create sessions
    const bridge = getSessionMemoryBridge();
    await bridge.getMemoryContext("api-session");
    await bridge.updateSummary("api-session", "Working on REST API design");
    
    await bridge.getMemoryContext("ui-session");
    await bridge.updateSummary("ui-session", "React component styling");

    // Search for API-related sessions
    const results = await resumeSystem.searchSessions("API");
    
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].relevanceScore).toBeGreaterThan(0);
  });

  it("should resume a session", async () => {
    const bridge = getSessionMemoryBridge();
    const context = await bridge.getMemoryContext("resume-test");
    await bridge.updateSummary("resume-test", "Previous conversation about auth");

    const result = await resumeSystem.resumeSession(context.sessionKey);
    
    expect(result.success).toBe(true);
    expect(result.sessionKey).toBe(context.sessionKey);
    expect(result.context).toContain("Previous conversation");
  });

  it("should fail to resume unknown session", async () => {
    const result = await resumeSystem.resumeSession("non-existent-key");
    
    expect(result.success).toBe(false);
    expect(result.error).toBe("Session not found");
  });

  it("should get session stats", () => {
    const stats = resumeSystem.getCurrentSessionStats();
    
    expect(stats).toHaveProperty("activeSessions");
    expect(stats).toHaveProperty("currentSession");
    expect(stats).toHaveProperty("totalMessages");
  });
});
