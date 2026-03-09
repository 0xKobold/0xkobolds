/**
 * Heartbeat Scheduler Tests - v0.2.0
 */

import { describe, test, expect } from "bun:test";
import { HeartbeatScheduler, resetScheduler } from "../../../src/heartbeat/index.js";

describe("Heartbeat Scheduler - v0.2.0", () => {
  test("should create scheduler", () => {
    resetScheduler();
    const scheduler = new HeartbeatScheduler({
      morning: "09:00",
      evening: "18:00",
      idleThreshold: 5,
    });
    expect(scheduler).toBeDefined();
    expect(scheduler.start).toBeDefined();
    expect(scheduler.stop).toBeDefined();
    resetScheduler();
  });

  test("should check if running", () => {
    resetScheduler();
    const scheduler = new HeartbeatScheduler({});
    expect(scheduler.isRunning()).toBe(false);
    resetScheduler();
  });

  test("should track quiet hours", () => {
    resetScheduler();
    const scheduler = new HeartbeatScheduler({
      quietHoursStart: 22,
      quietHoursEnd: 8,
    });
    // Just verify the method works
    const isQuiet = scheduler.isQuietHours();
    expect(typeof isQuiet).toBe("boolean");
    resetScheduler();
  });
});
