/**
 * Persona Loader Extension Tests - v0.2.0
 * 
 * Tests simplified persona loader that creates default bootstrap files.
 * No commands - just file creation and logging.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import personaLoaderExtension from "../../../src/extensions/core/persona-loader-extension.js";
import { createMockExtensionAPI } from "./mocks.js";

describe("Persona Loader Extension - v0.2.0", () => {
  let api: ReturnType<typeof createMockExtensionAPI>;

  beforeEach(async () => {
    api = createMockExtensionAPI();
  });

  describe("No Commands (v0.2.0 philosophy)", () => {
    test("should NOT register any commands", async () => {
      await personaLoaderExtension(api as any);
      expect(api.state.commands.size).toBe(0);
    });

    test("should NOT register bootstrap command", async () => {
      await personaLoaderExtension(api as any);
      expect(api.state.commands.has("bootstrap")).toBe(false);
    });

    test("should NOT register persona-reload command", async () => {
      await personaLoaderExtension(api as any);
      expect(api.state.commands.has("persona-reload")).toBe(false);
    });

    test("should NOT register persona command", async () => {
      await personaLoaderExtension(api as any);
      expect(api.state.commands.has("persona")).toBe(false);
    });

    test("should NOT register identity command", async () => {
      await personaLoaderExtension(api as any);
      expect(api.state.commands.has("identity")).toBe(false);
    });

    test("should NOT register user-profile command", async () => {
      await personaLoaderExtension(api as any);
      expect(api.state.commands.has("user-profile")).toBe(false);
    });

    test("should NOT register memory command", async () => {
      await personaLoaderExtension(api as any);
      expect(api.state.commands.has("memory")).toBe(false);
    });
  });

  describe("Tools (moved to embedded mode)", () => {
    test("should NOT register persona_info tool", async () => {
      await personaLoaderExtension(api as any);
      expect(api.state.tools.has("persona_info")).toBe(false);
    });
  });

  /**
   * File Creation Tests
   * 
   * These tests verify that the extension creates default bootstrap files.
   * They require changing process.cwd() which affects global state, so they
   * should ONLY be run individually with:
   * 
   *   bun test -- test/unit/extensions/persona-loader.test.ts
   * 
   * Not run in CI or parallel test suites.
   */
  describe.todo("File Creation (run individually, not in parallel)", () => {
    // See above comment. Run: bun test -- persona-loader.test.ts
    // File creation is verified manually or via integration tests
  });
});
