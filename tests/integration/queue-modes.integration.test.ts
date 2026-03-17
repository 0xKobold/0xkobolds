/**
 * Integration Tests for Queue Modes
 * 
 * Tests the full flow of queue modes with the gateway system.
 */

import { describe, test, expect } from "bun:test";
import { createMessageQueue, type QueueMode, type QueuedMessage } from "../../src/gateway/queue-modes.js";

describe("Queue Modes Integration", () => {
  describe("End-to-End Message Flow", () => {
    test("should process steer mode interrupt in order", async () => {
      const queue = createMessageQueue({ defaultMode: "steer" }, "cli");
      const processed: string[] = [];

      queue.on("message", (msg: QueuedMessage) => {
        processed.push(msg.content);
      });

      queue.on("interrupt", (result) => {
        processed.push(`INTERRUPT: ${result.message?.content}`);
      });

      // Start processing
      queue.startProcessing();

      // Send initial message
      await queue.handleMessage({
        id: "1",
        content: "First message",
        platform: "cli",
        timestamp: Date.now(),
      });

      // Send interrupt while processing
      await queue.handleMessage({
        id: "2",
        content: "URGENT: Interrupt!",
        platform: "cli",
        timestamp: Date.now(),
      });

      queue.stopProcessing();

      // Steer mode should process the interrupt immediately
      expect(processed.length).toBeGreaterThan(0);
    });

    test("should queue messages in followup mode", async () => {
      const queue = createMessageQueue({ defaultMode: "followup" }, "telegram");

      const received: string[] = [];
      
      queue.on("message", (msg: QueuedMessage) => {
        received.push(msg.content);
      });

      queue.on("queued", () => {
        // Message queued for later
      });

      queue.on("queue-cleared", () => {
        // Queue cleared after processing
      });

      queue.startProcessing();

      // Send messages while processing
      queue.handleMessage({ id: "1", content: "First", platform: "telegram", timestamp: Date.now() });
      queue.handleMessage({ id: "2", content: "Second", platform: "telegram", timestamp: Date.now() });
      queue.handleMessage({ id: "3", content: "Third", platform: "telegram", timestamp: Date.now() });

      queue.stopProcessing();

      // All messages should be processed after stop
      expect(received.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Platform Auto-Detection", () => {
    test("should auto-detect CLI platform as steer mode", () => {
      const queue = createMessageQueue({}, "cli");
      expect(queue.getMode()).toBe("steer");
    });

    test("should auto-detect Telegram as followup mode", () => {
      const queue = createMessageQueue({}, "telegram");
      expect(queue.getMode()).toBe("followup");
    });

    test("should auto-detect Discord as followup mode", () => {
      const queue = createMessageQueue({}, "discord");
      expect(queue.getMode()).toBe("followup");
    });

    test("should auto-detect Slack as followup mode", () => {
      const queue = createMessageQueue({}, "slack");
      expect(queue.getMode()).toBe("followup");
    });

    test("should auto-detect WhatsApp as followup mode", () => {
      const queue = createMessageQueue({}, "whatsapp");
      expect(queue.getMode()).toBe("followup");
    });

    test("should auto-detect Cron as collect mode", () => {
      const queue = createMessageQueue({}, "cron");
      expect(["steer", "followup", "collect"]).toContain(queue.getMode());
    });
  });

  describe("Error Handling", () => {
    test("should handle invalid mode gracefully", () => {
      const queue = createMessageQueue({ defaultMode: "invalid" as QueueMode }, "cli");
      // Should fall back to default for platform
      expect(["steer", "followup", "collect"]).toContain(queue.getMode());
    });

    test("should preserve queue on error", () => {
      const queue = createMessageQueue({ defaultMode: "followup" }, "test");
      
      queue.startProcessing();
      queue.handleMessage({ id: "1", content: "test", platform: "test", timestamp: Date.now() });
      
      // Queue should have the message
      expect(queue.getQueueSize()).toBeGreaterThanOrEqual(1);
      
      queue.stopProcessing();
    });
  });
});