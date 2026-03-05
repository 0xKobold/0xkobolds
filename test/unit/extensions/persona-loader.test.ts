/**
 * Persona Loader Extension Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import personaLoaderExtension from "../../../src/extensions/core/persona-loader-extension";
import {
  createMockExtensionAPI,
  createMockContext,
  triggerEvent,
  getMessages,
  findMessageByType,
} from "./mocks";

const TEST_DIR = join(tmpdir(), "0xkobold-persona-test-" + Date.now());

describe("Persona Loader Extension", () => {
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
    test("should handle missing persona files gracefully", () => {
      personaLoaderExtension(api as any);
      // Should not throw and should log helpful message
      console.log("[Test] Extension loaded without persona files");
    });

    test("should log persona files when they exist", async () => {
      const koboldDir = join(TEST_DIR, ".0xkobold");
      await writeFile(join(koboldDir, "IDENTITY.md"), "I am a helpful assistant");
      await writeFile(join(koboldDir, "USER.md"), "User is a developer");

      personaLoaderExtension(api as any);
    });
  });

  describe("Commands", () => {
    test("should register persona command", async () => {
      personaLoaderExtension(api as any);
      expect(api.state.commands.has("persona")).toBe(true);
    });

    test("should register identity command", async () => {
      personaLoaderExtension(api as any);
      expect(api.state.commands.has("identity")).toBe(true);
    });

    test("should register user-profile command", async () => {
      personaLoaderExtension(api as any);
      expect(api.state.commands.has("user-profle")).toBe(true);
    });

    test("should register memory command", async () => {
      personaLoaderExtension(api as any);
      expect(api.state.commands.has("memory")).toBe(true);
    });

    test("should register persona-reload command", async () => {
      personaLoaderExtension(api as any);
      expect(api.state.commands.has("persona-reload")).toBe(true);
    });
  });

  describe("Session Start", () => {
    test("should inject persona into system prompt", async () => {
      const koboldDir = join(TEST_DIR, ".0xkobold");
      await writeFile(join(koboldDir, "IDENTITY.md"), "I am a helpful coding assistant");
      await writeFile(join(koboldDir, "AGENT.md"), "I write clean, well-tested code");

      personaLoaderExtension(api as any);

      const mockCtx = createMockContext();
      await triggerEvent(api, "session_start", null, mockCtx);

      // Verify context was injected
      const systemPrompt = mockCtx.sessionManager?.getSystemPrompt?.();
      expect(systemPrompt).toContain("I am a helpful coding assistant");
      expect(systemPrompt).toContain("I write clean, well-tested code");
      expect(systemPrompt).toContain("=== PERSONA CONTEXT ===");
    });

    test("should not duplicate persona context", async () => {
      const koboldDir = join(TEST_DIR, ".0xkobold");
      await writeFile(join(koboldDir, "IDENTITY.md"), "I am a helpful assistant");

      personaLoaderExtension(api as any);

      const mockCtx = createMockContext({
        sessionManager: {
          getSystemPrompt: () => "=== PERSONA CONTEXT === Existing context === END PERSONA ===",
          setSystemPrompt: () => {},
        },
      });

      await triggerEvent(api, "session_start", null, mockCtx);

      // Should not contain duplicate markers
      const systemPrompt = mockCtx.sessionManager?.getSystemPrompt?.();
      const matches = (systemPrompt?.match(/=== PERSONA CONTEXT ===/g) || []).length;
      expect(matches).toBe(1);
    });

    test("should handle missing sessionManager gracefully", async () => {
      const koboldDir = join(TEST_DIR, ".0xkobold");
      await writeFile(join(koboldDir, "IDENTITY.md"), "Test identity");

      personaLoaderExtension(api as any);

      const mockCtx = {
        ui: { notify: () => {} },
        // sessionManager is missing
      };

      // Should not throw
      await triggerEvent(api, "session_start", null, mockCtx as any);
    });
  });

  describe("Persona Command Handler", () => {
    test("should show loaded persona files", async () => {
      const koboldDir = join(TEST_DIR, ".0xkobold");
      await writeFile(join(koboldDir, "IDENTITY.md"), "I am a test");
      await writeFile(join(koboldDir, "MEMORY.md"), "I remember things");

      personaLoaderExtension(api as any);

      const command = api.state.commands.get("persona");
      expect(command).toBeDefined();

      const notified: Array<{ message: string; type: string }> = [];
      const ctx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await command?.handler?.({}, ctx);

      expect(notified.length).toBeGreaterThan(0);
      expect(notified[0].message).toContain("IDENTITY.md");
      expect(notified[0].message).toContain("MEMORY.md");
      expect(notified[0].type).toBe("info");
    });

    test("should indicate when no persona files found", async () => {
      personaLoaderExtension(api as any);

      const command = api.state.commands.get("persona");
      const notified: Array<{ message: string; type: string }> = [];
      const ctx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await command?.handler?.({}, ctx);

      expect(notified[0].message).toContain("none");
    });
  });

  describe("Persona File Content", () => {
    test("should load IDENTITY.md correctly", async () => {
      const koboldDir = join(TEST_DIR, ".0xkobold");
      const identityContent = "I am Claude, an AI assistant";
      await writeFile(join(koboldDir, "IDENTITY.md"), identityContent);

      personaLoaderExtension(api as any);

      const command = api.state.commands.get("identity");
      const notified: Array<{ message: string; type: string }> = [];
      const ctx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await command?.handler?.({}, ctx);

      expect(notified[0].message).toContain(identityContent);
    });

    test("should load MEMORY.md correctly", async () => {
      const koboldDir = join(TEST_DIR, ".0xkobold");
      const memoryContent = "Project uses TypeScript and Bun";
      await writeFile(join(koboldDir, "MEMORY.md"), memoryContent);

      personaLoaderExtension(api as any);

      const command = api.state.commands.get("memory");
      const notified: Array<{ message: string; type: string }> = [];
      const ctx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await command?.handler?.({}, ctx);

      expect(notified[0].message).toContain(memoryContent);
    });

    test("should truncate long content", async () => {
      const koboldDir = join(TEST_DIR, ".0xkobold");
      const longContent = "a".repeat(2000);
      await writeFile(join(koboldDir, "IDENTITY.md"), longContent);

      personaLoaderExtension(api as any);

      const command = api.state.commands.get("identity");
      const notified: Array<{ message: string; type: string }> = [];
      const ctx = createMockContext({
        ui: {
          notify: (msg: string, type: any) => {
            notified.push({ message: msg, type });
          },
        },
      });

      await command?.handler?.({}, ctx);

      expect(notified[0].message).toContain("...");
      expect(notified[0].message.length).toBeLessThan(longContent.length);
    });
  });

  describe("Persona Building", () => {
    test("should build persona with correct sections", async () => {
      const koboldDir = join(TEST_DIR, ".0xkobold");
      await writeFile(join(koboldDir, "IDENTITY.md"), "I am an AI");
      await writeFile(join(koboldDir, "SOUL.md"), "I have depth");
      await writeFile(join(koboldDir, "AGENT.md"), "I work methodically");
      await writeFile(join(koboldDir, "USER.md"), "User is a developer");
      await writeFile(join(koboldDir, "MEMORY.md"), "We worked on React");

      personaLoaderExtension(api as any);

      const mockCtx = createMockContext();
      await triggerEvent(api, "session_start", null, mockCtx);

      const systemPrompt = mockCtx.sessionManager?.getSystemPrompt?.() || "";

      expect(systemPrompt).toContain("## Your Identity");
      expect(systemPrompt).toContain("## Your Being");
      expect(systemPrompt).toContain("## How You Work");
      expect(systemPrompt).toContain("## Who You're Helping");
      expect(systemPrompt).toContain("## Context You Remember");
    });

    test("should skip missing sections", async () => {
      const koboldDir = join(TEST_DIR, ".0xkobold");
      await writeFile(join(koboldDir, "IDENTITY.md"), "Only identity");

      personaLoaderExtension(api as any);

      const mockCtx = createMockContext();
      await triggerEvent(api, "session_start", null, mockCtx);

      const systemPrompt = mockCtx.sessionManager?.getSystemPrompt?.() || "";

      expect(systemPrompt).not.toContain("## Your Being");
      expect(systemPrompt).not.toContain("## How You Work");
    });
  });
});

/**
 * Override triggerEvent to accept context
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
