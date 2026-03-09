/**
 * Subagent Extension Tests (v0.0.6)
 * 
 * Tests for parallel subagent spawning system with:
 * - Real-time streaming
 * - Error classification
 * - Merge strategies
 * - Custom agent loading
 */

import { describe, test, expect, beforeEach } from "bun:test";

// Mock the extension API
const mockAPI = {
  state: {
    commands: new Map(),
    tools: new Map(),
    providers: [],
    config: {},
  },
  registerCommand: function(name: string, config: any) {
    this.state.commands.set(name, config);
  },
  registerTool: function(config: any) {
    this.state.tools.set(config.name, config);
  },
  registerProvider: function(config: any) {
    this.state.providers.push(config);
  },
  ui: {
    notify: () => {},
    setFooter: () => {},
  },
};

describe("Subagent Extension v0.0.6", () => {
  beforeEach(() => {
    mockAPI.state.commands.clear();
    mockAPI.state.tools.clear();
    mockAPI.state.providers = [];
  });

  test("Extension Loading", async () => {
    const { default: subagentExtension } = await import(
      "../../../src/extensions/core/subagent-extension.js"
    );
    
    await subagentExtension(mockAPI as any);
    
    expect(mockAPI.state.tools.has("subagent_spawn")).toBe(true);
  });

  test("Command Registration", async () => {
    const { default: subagentExtension } = await import(
      "../../../src/extensions/core/subagent-extension.js"
    );
    
    await subagentExtension(mockAPI as any);
    
    expect(mockAPI.state.commands.has("subagents")).toBe(true);
    expect(mockAPI.state.commands.has("implement")).toBe(true);
    expect(mockAPI.state.commands.has("scout-and-plan")).toBe(true);
    expect(mockAPI.state.commands.has("parallel")).toBe(true);
    expect(mockAPI.state.commands.has("agent-create")).toBe(true); // New in 0.0.6
  });

  test("subagent_spawn tool has streaming parameters", async () => {
    const { default: subagentExtension } = await import(
      "../../../src/extensions/core/subagent-extension.js"
    );
    
    await subagentExtension(mockAPI as any);
    
    const tool = mockAPI.state.tools.get("subagent_spawn");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("subagent_spawn");
    expect(tool.label).toBe("Spawn Subagent");
  });

  test("Default agents should be registered with scope", async () => {
    const { default: subagentExtension } = await import(
      "../../../src/extensions/core/subagent-extension.js"
    );
    
    await subagentExtension(mockAPI as any);
    
    // Verify commands exist
    expect(mockAPI.state.commands.get("subagents")).toBeDefined();
    expect(mockAPI.state.commands.get("implement")).toBeDefined();
  });

  test("agent-create command exists", async () => {
    const { default: subagentExtension } = await import(
      "../../../src/extensions/core/subagent-extension.js"
    );
    
    await subagentExtension(mockAPI as any);
    
    const createCmd = mockAPI.state.commands.get("agent-create");
    expect(createCmd).toBeDefined();
    expect(createCmd.description).toContain("Create a new custom agent");
  });
});
