import { describe, it, expect, beforeEach } from "bun:test";
import { getMemoryIntegration } from "../src/memory/memory-integration";
import { getSessionMemoryBridge } from "../src/memory/session-memory-bridge";
import { getSessionStore, resetSessionStore } from "../src/memory/session-store";
import { eventBus } from "../src/event-bus";

describe("Memory Integration - Perennial + Generative", () => {
  let integration: ReturnType<typeof getMemoryIntegration>;
  let bridge: ReturnType<typeof getSessionMemoryBridge>;

  beforeEach(() => {
    resetSessionStore();
    integration = getMemoryIntegration();
    bridge = getSessionMemoryBridge();
  });

  it("should auto-enrich session with perennial context", async () => {
    // Create session
    await bridge.getMemoryContext("test-enrich-1");
    
    // Trigger enrichment (normally done by event listener)
    await integration.enrichSessionWithPerennial("test-enrich-1");
    
    // Session should exist
    const enriched = await bridge.getEnrichedSession("test-enrich-1");
    expect(enriched).toBeDefined();
    expect(enriched?.sessionKey).toBe("test-enrich-1");
  });

  it("should track observations for reflection triggering", () => {
    const sessionId = "test-obs-session";
    
    // Add observations up to threshold
    for (let i = 0; i < 20; i++) {
      integration.trackObservation(sessionId, "agent-1", `Observation ${i}`);
    }
    
    // Should trigger reflection at observation #20
    expect(integration.getObservationCount(sessionId)).toBe(20);
    
    // Reset and verify
    integration.resetObservationCount(sessionId);
    expect(integration.getObservationCount(sessionId)).toBe(0);
  });

  it("should emit perennial.save_session events on threshold", async () => {
    const events: any[] = [];
    const handler = (data: any) => events.push(data);
    eventBus.on("perennial.save_session", handler);

    try {
      // Create session and update it
      await bridge.getMemoryContext("test-perennial-emit");
      
      // Update 10 times to trigger threshold
      for (let i = 0; i < 10; i++) {
        await bridge.linkRunToSession("test-perennial-emit", `run-${i}`);
      }

      // Set summary so test passes  
      await bridge.updateSummary("test-perennial-emit", "Test summary");

      // Process completion
      await integration.processRunCompletion("test-perennial-emit", "run-10", "result");

      // Event should be emitted - events are wrapped with type/payload
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]?.payload?.sessionKey).toBe("test-perennial-emit");
      expect(events[0]?.payload?.category).toBe("context");
    } finally {
      eventBus.off("perennial.save_session", handler);
    }
  });

  it("should get session recap from generative", async () => {
    await bridge.getMemoryContext("test-recap-1");
    await bridge.updateSummary("test-recap-1", "We discussed API design");

    const recap = await integration.getSessionRecap("test-recap-1");
    
    // Should include summary
    expect(recap).toContain("Summary:");
    expect(recap).toContain("API design");
  });

  it("should emit events on generative recap processing", () => {
    let emittedCount = 0;
    eventBus.on("perennial.save", () => {
      emittedCount++;
    });

    // Process recaps with 3 memories
    integration.processGenerativeRecap("agent-1", "Pattern discovered", [
      { content: "Test 1", type: "observation" },
      { content: "Test 2", type: "thought" },
      { content: "Test 3", type: "observation" },
    ]);

    // Should emit for summary + up to 5 key memories
    // Summary = 1, memories = 2 (filtered to obs/thought)
    expect(emittedCount).toBeGreaterThanOrEqual(1);
  });

  it("should link gateway sessions to memory threads", async () => {
    const context = await bridge.getMemoryContext("test-thread-link");
    
    expect(context.memoryThreadId).toBeDefined();
    expect(context.memoryThreadId.startsWith("thread_")).toBe(true);

    // Can resume from thread
    const resumed = await bridge.resumeFromMemoryThread(context.memoryThreadId);
    expect(resumed?.sessionKey).toBe("test-thread-link");
  });
});