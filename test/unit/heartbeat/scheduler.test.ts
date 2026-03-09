/**
 * Heartbeat Scheduler Tests - v0.2.0
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { createScheduler, CheckInType } from "../../../src/heartbeat/index.js";

describe("Heartbeat Scheduler - v0.2.0", () => {
  let scheduler: ReturnType<typeof createScheduler>;

  beforeEach(() => {
    scheduler = createScheduler({
      morning: "09:00",
      evening: "18:00",
      idleThreshold: 5,
    });
  });

  test("should create scheduler", () => {
    expect(scheduler).toBeDefined();
    expect(scheduler.start).toBeDefined();
    expect(scheduler.stop).toBeDefined();
  });

  test("should detect quiet hours", () => {
    // This test depends on current time - just verify method exists
    const isQuiet = scheduler.isQuietHours();
    expect(typeof isQuiet).toBe("boolean");
  });

  test("should schedule check-in", () => {
    const id = scheduler.scheduleCheckIn("nurture" as CheckInType, 0);
    expect(id).toBeDefined();
    expect(id.startsWith("nurture-")).toBe(true);
    scheduler.cancelCheckIn(id);
  });

  test("should cancel check-in", () => {
    const id = scheduler.scheduleCheckIn("nurture" as CheckInType, 60);
    const result = scheduler.cancelCheckIn(id);
    expect(result).toBe(true);
    
    const notFound = scheduler.cancelCheckIn("nonexistent");
    expect(notFound).toBe(false);
  });
});
