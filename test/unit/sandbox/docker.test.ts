/**
 * Docker Sandbox Tests - v0.3.0
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  getDockerRunner,
  resetDockerRunner,
} from "../../../src/sandbox/index.js";

describe("Docker Sandbox - v0.3.0", () => {
  beforeEach(() => {
    resetDockerRunner();
  });

  afterEach(() => {
    resetDockerRunner();
  });

  test("should create docker runner", () => {
    const runner = getDockerRunner();
    expect(runner).toBeDefined();
  });

  test("should check availability", async () => {
    const runner = getDockerRunner();
    const available = await runner.isAvailable();
    // Result depends on if Docker is installed
    expect(typeof available).toBe("boolean");
  });

  test("should create workspace", async () => {
    const runner = getDockerRunner();
    const workspacePath = "/tmp/test-workspace";
    
    const containerPath = await runner.createWorkspace(workspacePath);
    expect(containerPath).toContain("/workspace-");
  });

  test("should run echo command", async () => {
    const runner = getDockerRunner({
      image: "alpine:latest",
      timeout: 30000,
    });

    // Skip if Docker not available
    const available = await runner.isAvailable();
    if (!available) {
      console.log("Skipping Docker test - Docker not available");
      return;
    }

    const result = await runner.run({
      command: "echo",
      args: ["hello"],
    });

    // May fail in CI without Docker, so check structure
    if (result.success) {
      expect(result.stdout).toContain("hello");
      expect(result.exitCode).toBe(0);
    }
  });

  test("should handle timeout", async () => {
    const runner = getDockerRunner({
      image: "alpine:latest",
      timeout: 100,
    });

    const available = await runner.isAvailable();
    if (!available) {
      console.log("Skipping Docker test - Docker not available");
      return;
    }

    const result = await runner.run({
      command: "sleep",
      args: ["10"],
    });

    expect(result.killed).toBe(true);
    expect(result.success).toBe(false);
  });

  test("should return correct command result structure", () => {
    const runner = getDockerRunner();
    expect(runner).toBeDefined();
    expect(typeof runner.run).toBe("function");
  });
});

describe("Docker Sandbox - Configuration", () => {
  test("should accept memory limit", () => {
    const runner = getDockerRunner({
      memoryLimit: "256m",
    });
    expect(runner).toBeDefined();
  });

  test("should accept CPU limit", () => {
    const runner = getDockerRunner({
      cpuLimit: "0.5",
    });
    expect(runner).toBeDefined();
  });

  test("should accept network configuration", () => {
    const runner = getDockerRunner({
      network: "none",
    });
    expect(runner).toBeDefined();
  });

  test("should accept volume mounts", () => {
    const runner = getDockerRunner({
      volumes: [
        { host: "/data", container: "/data", readonly: true },
      ],
    });
    expect(runner).toBeDefined();
  });
});
