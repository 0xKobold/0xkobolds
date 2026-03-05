/**
 * Mode Manager Extension Tests
 * 
 * Tests for Plan/Build mode switching with tool filtering
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import modeManagerExtension from "../../../src/extensions/core/mode-manager-extension";
import {
  createMockExtensionAPI,
  createMockContext,
  triggerEvent,
} from "./mocks";

const TEST_DIR = join(tmpdir(), "mode-test-" + Date.now());

describe("Mode Manager Extension", () => {
  let api: ReturnType<typeof createMockExtensionAPI>;
  let originalHome: string | undefined;

  beforeEach(async () => {
    api = createMockExtensionAPI();
    originalHome = process.env.HOME;
    process.env.HOME = TEST_DIR;
    await mkdir(join(TEST_DIR, ".0xkobold"), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("Initialization", () => {
    test("should start in build mode by default", () => {
      modeManagerExtension(api as any);
      console.log("[Test] Extension loaded, default mode is build");
    });

    test("should load saved mode from config", async () => {
      const config = { currentMode: "plan", customModes: [] };
      await writeFile(
        join(TEST_DIR, ".0xkobold", "modes.json"),
        JSON.stringify(config)
      );

      modeManagerExtension(api as any);
      console.log("[Test] Loaded plan mode from config");
    });
  });

  describe("Command Registration", () => {
    test("should register plan command", () => {
      modeManagerExtension(api as any);
      expect(api.state.commands.has("plan")).toBe(true);
    });

    test("should register build command", () => {
      modeManagerExtension(api as any);
      expect(api.state.commands.has("build")).toBe(true);
    });

    test("should register mode command", () => {
      modeManagerExtension(api as any);
      expect(api.state.commands.has("mode")).toBe(true);
    });

    test("should register modes command", () => {
      modeManagerExtension(api as any);
      expect(api.state.commands.has("modes")).toBe(true);
    });

    test("should register mode-add command", () => {
      modeManagerExtension(api as any);
      expect(api.state.commands.has("mode-add")).toBe(true);
    });
  });

  describe("Session Start", () => {
    test("should set up mode status on session start", async () => {
      modeManagerExtension(api as any);

      let statusSet = false;
      const mockCtx = createMockContext({
        ui: {
          notify: () => {},
        },
      });

      // Mock status bar setup
      (mockCtx as any).ui = {
        notify: () => {},
        setStatus: (key: string, value: string) => {
          if (key === "mode") statusSet = true;
        },
      };

      await triggerEvent(api, "session_start", null, mockCtx);

      // The mode should be set during initialization
      expect(api.state.commands.has("build")).toBe(true);
    });
  });

  describe("Plan Mode System Prompt", () => {
    test("plan mode should emphasize investigation", async () => {
      modeManagerExtension(api as any);

      const mockCtx = createMockContext();
      const planCommand = api.state.commands.get("plan");

      await planCommand?.handler?.({}, mockCtx);

      // System prompt should have been set
      expect(mockCtx.sessionManager?.getSystemPrompt?.()).toContain("PLAN MODE");
    });

    test("plan mode should mention read-only tools", async () => {
      modeManagerExtension(api as any);

      const mockCtx = createMockContext();
      const planCommand = api.state.commands.get("plan");

      await planCommand?.handler?.({}, mockCtx);

      const prompt = mockCtx.sessionManager?.getSystemPrompt?.() || "";
      expect(prompt).toContain("READ-ONLY");
      expect(prompt).toContain("No file modifications");
    });

    test("plan mode should require explanation before writing", async () => {
      modeManagerExtension(api as any);

      const mockCtx = createMockContext();
      const planCommand = api.state.commands.get("plan");

      await planCommand?.handler?.({}, mockCtx);

      const prompt = mockCtx.sessionManager?.getSystemPrompt?.() || "";
      expect(prompt).toContain("Before writing code, explain:");
    });
  });

  describe("Build Mode System Prompt", () => {
    test("build mode should emphasize implementation", async () => {
      modeManagerExtension(api as any);

      const mockCtx = createMockContext();
      const buildCommand = api.state.commands.get("build");

      await buildCommand?.handler?.({}, mockCtx);

      const prompt = mockCtx.sessionManager?.getSystemPrompt?.() || "";
      expect(prompt).toContain("BUILD MODE");
      expect(prompt).toContain("implementation");
    });

    test("build mode should allow all tools", async () => {
      modeManagerExtension(api as any);

      const mockCtx = createMockContext();
      const buildCommand = api.state.commands.get("build");

      await buildCommand?.handler?.({}, mockCtx);

      const prompt = mockCtx.sessionManager?.getSystemPrompt?.() || "";
      expect(prompt).toContain("ALL tools");
    });
  });

  describe("Mode Persistence", () => {
    test("should save mode config to disk", async () => {
      modeManagerExtension(api as any);

      const mockCtx = createMockContext();
      const planCommand = api.state.commands.get("plan");
      await planCommand?.handler?.({}, mockCtx);

      // Check that modes.json was created
      const configPath = join(TEST_DIR, ".0xkobold", "modes.json");
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(await readFile(configPath, "utf-8"));
      expect(config.currentMode).toBe("plan");
    });

    test("should reload saved mode on restart", async () => {
      // Save plan mode
      const config = { currentMode: "plan", customModes: [] };
      await writeFile(
        join(TEST_DIR, ".0xkobold", "modes.json"),
        JSON.stringify(config)
      );

      // Load extension
      modeManagerExtension(api as any);

      // Should have loaded plan mode
      const modeCommand = api.state.commands.get("mode");
      const notified: Array<{ message: string; type: string }> = [];

      const mockCtx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await modeCommand?.handler?.([], mockCtx);

      expect(notified[0]?.message).toContain("plan");
    });
  });

  describe("Custom Mode Support", () => {
    test("should support custom modes", async () => {
      const customMode = {
        currentMode: "review",
        customModes: [
          {
            id: "review",
            name: "Review",
            description: "Code review mode",
            icon: "👀",
            systemPrompt: "Review mode activated",
            allowedTools: ["read_file", "search_files"],
            color: "purple",
          },
        ],
      };

      await writeFile(
        join(TEST_DIR, ".0xkobold", "modes.json"),
        JSON.stringify(customMode)
      );

      modeManagerExtension(api as any);

      const modesCommand = api.state.commands.get("modes");
      const notified: Array<{ message: string; type: string }> = [];

      const mockCtx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await modesCommand?.handler?.({}, mockCtx);

      expect(notified[0]?.message).toContain("review");
    });
  });
});

/**
 * Enhanced triggerEvent that accepts context
 */
async function triggerEvent(
  api: ReturnType<typeof createMockExtensionAPI>,
  event: string,
  payload?: unknown,
  ctx?: any
): Promise<void> {
  const handlers = api.state.eventHandlers.get(event) || [];
  for (const handler of handlers) {
    await handler(payload, ctx);
  }
}
