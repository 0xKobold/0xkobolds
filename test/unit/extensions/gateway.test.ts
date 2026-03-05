/**
 * Gateway Extension Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import gatewayExtension from "../../../src/extensions/core/gateway-extension";
import { createMockExtensionAPI, triggerEvent, findMessageByType } from "./mocks";

describe("Gateway Extension", () => {
  let api: ReturnType<typeof createMockExtensionAPI>;
  let originalHome: string | undefined;
  let testHome: string;

  beforeEach(async () => {
    api = createMockExtensionAPI();
    testHome = join(tmpdir(), "gateway-test-" + Date.now());
    originalHome = process.env.HOME;
    process.env.HOME = testHome;
    await mkdir(join(testHome, ".0xkobold", "agents"), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await rm(testHome, { recursive: true, force: true });
    delete process.env.KOBOLD_SUBAGENT;
    delete process.env.PI_SESSION_PARENT;
  });

  describe("Initialization", () => {
    test("should register gateway_broadcast tool", () => {
      gatewayExtension(api as any);
      expect(api.state.tools.has("gateway_broadcast")).toBe(true);
    });

    test("should register gateway:start command", () => {
      gatewayExtension(api as any);
      expect(api.state.commands.has("gateway:start")).toBe(true);
    });

    test("should register gateway:stop command", () => {
      gatewayExtension(api as any);
      expect(api.state.commands.has("gateway:stop")).toBe(true);
    });

    test("should register gateway:status command", () => {
      gatewayExtension(api as any);
      expect(api.state.commands.has("gateway:status")).toBe(true);
    });

    test("should register gateway-port flag", () => {
      gatewayExtension(api as any);
      expect(api.state.flags.has("gateway-port")).toBe(true);
      expect(api.getFlag("gateway-port")).toBe("18789");
    });

    test("should register gateway-host flag", () => {
      gatewayExtension(api as any);
      expect(api.state.flags.has("gateway-host")).toBe(true);
      expect(api.getFlag("gateway-host")).toBe("127.0.0.1");
    });
  });

  describe("Session Start Handling", () => {
    test("should skip gateway start in subagent mode (KOBOLD_SUBAGENT)", async () => {
      process.env.KOBOLD_SUBAGENT = "true";
      gatewayExtension(api as any);

      await triggerEvent(api, "session_start");

      // Should not send gateway.started message
      const startedMsg = findMessageByType(api, "gateway.started");
      expect(startedMsg).toBeUndefined();
    });

    test("should skip gateway start when PI_SESSION_PARENT is set", async () => {
      process.env.PI_SESSION_PARENT = "some-parent-id";
      gatewayExtension(api as any);

      await triggerEvent(api, "session_start");

      const startedMsg = findMessageByType(api, "gateway.started");
      expect(startedMsg).toBeUndefined();
    });

    test("should skip gateway start with --command flag", async () => {
      // Simulate command line args
      const originalArgv = process.argv;
      process.argv = ["bun", "index.ts", "--command", "gateway:start"];

      gatewayExtension(api as any);
      await triggerEvent(api, "session_start");

      const startedMsg = findMessageByType(api, "gateway.started");
      expect(startedMsg).toBeUndefined();

      process.argv = originalArgv;
    });

    test("should skip gateway start with -c flag", async () => {
      const originalArgv = process.argv;
      process.argv = ["bun", "index.ts", "-c", "status"];

      gatewayExtension(api as any);
      await triggerEvent(api, "session_start");

      const startedMsg = findMessageByType(api, "gateway.started");
      expect(startedMsg).toBeUndefined();

      process.argv = originalArgv;
    });

    test("should not start multiple times (hasAttemptedStart flag)", async () => {
      const originalArgv = process.argv;
      process.argv = ["bun", "index.ts"]; // Normal mode

      gatewayExtension(api as any);

      // First session_start attempt
      await triggerEvent(api, "session_start");

      // Check if attempted (might fail to actually start due to port in use)
      // The point is it shouldn't try again
      const firstAttemptMessages = api.state.messages.length;

      // Second session_start should be skipped
      await triggerEvent(api, "session_start");

      // No additional messages should be sent
      expect(api.state.messages.length).toBe(firstAttemptMessages);

      process.argv = originalArgv;
    });
  });

  describe("gateway:status command", () => {
    test("should return status when not running", async () => {
      gatewayExtension(api as any);

      // The command uses console.log and handler, not execute
      // Instead, verify the command exists and has correct properties
      const command = api.state.commands.get("gateway:status");
      expect(command).toBeDefined();
      expect(command?.description).toBe("Get gateway server status");
      
      // Verify handler exists and is a function
      expect(typeof command?.handler).toBe("function");
      
      // Calling handler should work
      await command?.handler?.({}, {});
      
      // Message should be sent
      const statusMsg = findMessageByType(api, "gateway.status");
      expect(statusMsg).toBeDefined();
      expect((statusMsg?.details as any)?.running).toBe(false);
    });
  });

  describe("Tools", () => {
    test("gateway_broadcast should return error when not running", async () => {
      gatewayExtension(api as any);

      const tool = api.state.tools.get("gateway_broadcast")!;
      const result = await tool.execute({ event: "test", payload: {} });

      expect(result.content[0].text).toContain("not running");
      expect(result.details?.error).toBe("not_running");
    });

    test("gateway_broadcast should require event parameter", async () => {
      gatewayExtension(api as any);
      const tool = api.state.tools.get("gateway_broadcast")!;
      expect(tool.parameters?.required).toContain("event");
    });

    test("gateway_broadcast should require payload parameter", async () => {
      gatewayExtension(api as any);
      const tool = api.state.tools.get("gateway_broadcast")!;
      expect(tool.parameters?.required).toContain("payload");
    });
  });

  describe("Port Configuration", () => {
    test("should use custom port from flag", () => {
      gatewayExtension(api as any);

      api.setFlag("gateway-port", "18800");
      expect(api.getFlag("gateway-port")).toBe("18800");
    });

    test("should use custom host from flag", () => {
      gatewayExtension(api as any);

      api.setFlag("gateway-host", "0.0.0.0");
      expect(api.getFlag("gateway-host")).toBe("0.0.0.0");
    });
  });

  describe("Cleanup", () => {
    test("should registers shutdown handler", async () => {
      gatewayExtension(api as any);

      expect(api.state.eventHandlers.has("shutdown")).toBe(true);
      const handlers = api.state.eventHandlers.get("shutdown");
      expect(handlers?.length).toBeGreaterThan(0);
    });
  });
});
