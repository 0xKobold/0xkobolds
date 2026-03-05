import { describe, test, expect } from "bun:test";
import { HeartbeatSystem } from "../../daemon/heartbeat";

describe("Heartbeat System", () => {
  test("should create heartbeat system", () => {
    const heartbeat = new HeartbeatSystem();
    expect(heartbeat).toBeDefined();
    expect(heartbeat.getState().beatCount).toBe(0);
  });

  test("should schedule tasks", () => {
    const heartbeat = new HeartbeatSystem();
    const taskId = heartbeat.schedule("test-task", 5, () => {});
    expect(taskId).toBeDefined();
    expect(heartbeat.getState().tasks.has(taskId)).toBe(true);
  });

  test("should track uptime", () => {
    const heartbeat = new HeartbeatSystem();
    heartbeat.start();
    const uptime = heartbeat.getUptime();
    expect(uptime).toBeGreaterThanOrEqual(0);
    heartbeat.stop();
  });
});
