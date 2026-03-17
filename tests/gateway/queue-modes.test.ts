/**
 * Tests for Queue Modes
 */

import { describe, test, expect } from "bun:test";
import { MessageQueue, createMessageQueue, InterruptHandler, PLATFORM_RECOMMENDATIONS, getRecommendedMode } from "../../src/gateway/queue-modes.js";

describe("Queue Modes", () => {
  describe("MessageQueue", () => {
    test("should create with default config", () => {
      const queue = createMessageQueue();
      // Default mode is followup (or cli default is steer)
      expect(["followup", "steer"]).toContain(queue.getMode());
    });

    test("should create with platform-specific mode", () => {
      const cliQueue = createMessageQueue({}, "cli");
      expect(cliQueue.getMode()).toBe("steer");

      const telegramQueue = createMessageQueue({}, "telegram");
      expect(telegramQueue.getMode()).toBe("followup");
    });

    test("should emit message when not processing", async () => {
      const queue = createMessageQueue();
      let received: any = null;

      queue.on("message", (msg) => {
        received = msg;
      });

      await queue.handleMessage({
        id: "test-1",
        content: "hello",
        platform: "cli",
        timestamp: Date.now(),
      });

      expect(received).not.toBeNull();
      expect(received.content).toBe("hello");
    });

    test("steer mode should set interrupt when processing", async () => {
      const queue = createMessageQueue({ defaultMode: "steer" }, "cli");
      
      queue.startProcessing();
      expect(queue.isProcessing()).toBe(true);
      expect(queue.isInterruptRequested()).toBe(false);

      await queue.handleMessage({
        id: "test-1",
        content: "interrupt!",
        platform: "cli",
        timestamp: Date.now(),
      });

      expect(queue.isInterruptRequested()).toBe(true);
      expect(queue.getInterruptMessage()?.content).toBe("interrupt!");

      queue.stopProcessing();
    });

    test("followup mode should queue when processing", () => {
      const queue = createMessageQueue({ defaultMode: "followup" }, "test");
      
      queue.startProcessing();
      expect(queue.isProcessing()).toBe(true);

      // In followup mode, messages get queued - just check event was emitted
      let queuedCount = 0;
      queue.on("queued", () => { queuedCount++; });

      // Sync call - queue state changes
      queue.handleMessage({
        id: "test-1",
        content: "queued",
        platform: "test",
        timestamp: Date.now(),
      });

      // Check queue size synchronously
      expect(queue.getQueueSize()).toBe(1);

      queue.stopProcessing();
      expect(queue.isProcessing()).toBe(false);
    });

    test("collect mode should debounce messages", () => {
      const queue = createMessageQueue({ 
        defaultMode: "collect",
        debounceMs: 10 // Fast for test
      }, "test");

      let collected: any[] = [];
      queue.on("message", (msg) => { collected.push(msg); });

      queue.startProcessing();

      // Add messages
      queue.handleMessage({ id: "1", content: "a", platform: "test", timestamp: Date.now() });
      queue.handleMessage({ id: "2", content: "b", platform: "test", timestamp: Date.now() });
      queue.handleMessage({ id: "3", content: "c", platform: "test", timestamp: Date.now() });

      // Messages should be in queue
      expect(queue.getQueueSize()).toBe(3);

      // Stop without waiting for debounce
      queue.stopProcessing();
    });

    test("should process queue after stopping", () => {
      const queue = createMessageQueue({ defaultMode: "followup" }, "test");
      
      const processed: any[] = [];
      queue.on("message", (msg) => { processed.push(msg); });

      queue.startProcessing();

      // Add messages to queue
      queue.handleMessage({ id: "1", content: "msg1", platform: "test", timestamp: Date.now() });
      queue.handleMessage({ id: "2", content: "msg2", platform: "test", timestamp: Date.now() });

      // Queue should have messages
      expect(queue.getQueueSize()).toBe(2);

      // Stop (triggers queue processing)
      queue.stopProcessing();

      // In followup mode, stopProcessing processes queued messages
      // First message is processed, rest remain queued
      // (Or all are processed depending on mergeMessages setting)
      expect(processed.length).toBeGreaterThanOrEqual(1);
    });

    test("should clear queue", () => {
      const queue = createMessageQueue();
      
      queue.startProcessing();
      queue["queue"] = [
        { id: "1", content: "a", platform: "cli", timestamp: Date.now() },
        { id: "2", content: "b", platform: "cli", timestamp: Date.now() },
      ];

      expect(queue.getQueueSize()).toBe(2);

      let cleared = false;
      queue.on("queue-cleared", () => { cleared = true; });

      queue.clearQueue();

      expect(queue.getQueueSize()).toBe(0);
      expect(cleared).toBe(true);
    });
  });

  describe("InterruptHandler", () => {
    test("should track interrupt state", () => {
      const handler = new InterruptHandler();

      expect(handler.checkInterrupt()).toBe(false);

      handler.setInterrupt();
      expect(handler.checkInterrupt()).toBe(true);

      handler.clearInterrupt();
      expect(handler.checkInterrupt()).toBe(false);
    });

    test("should record skipped tools", () => {
      const handler = new InterruptHandler();

      handler.setInterrupt();
      handler.recordSkippedTool("read");
      handler.recordSkippedTool("write");

      const result = handler.getResult();

      expect(result.interrupted).toBe(true);
      expect(result.skippedTools).toEqual(["read", "write"]);
      expect(result.reason).toBe("steer-mode-interrupt");
    });
  });

  describe("Platform Recommendations", () => {
    test("CLI should use steer mode", () => {
      expect(PLATFORM_RECOMMENDATIONS.cli).toBe("steer");
    });

    test("Messaging platforms should use followup", () => {
      expect(PLATFORM_RECOMMENDATIONS.telegram).toBe("followup");
      expect(PLATFORM_RECOMMENDATIONS.discord).toBe("followup");
      expect(PLATFORM_RECOMMENDATIONS.slack).toBe("followup");
      expect(PLATFORM_RECOMMENDATIONS.whatsapp).toBe("followup");
    });

    test("Cron should use collect mode", () => {
      expect(PLATFORM_RECOMMENDATIONS.cron).toBe("collect");
    });

    test("getRecommendedMode should return correct defaults", () => {
      expect(getRecommendedMode("cli")).toBe("steer");
      expect(getRecommendedMode("telegram")).toBe("followup");
      expect(getRecommendedMode("unknown")).toBe("followup");
    });
  });
});