/**
 * Subagent Extension Tests
 * 
 * Tests for parallel subagent spawning system
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

describe("Subagent Extension", () => {
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
    
    expect(mockAPI.state.tools.has("agent_spawn")).toBe(true);
  });

  test("Command Registration", async () => {
    const { default: subagentExtension } = await import(
      "../../../src/extensions/core/subagent-extension.js"
    );
    
    await subagentExtension(mockAPI as any);
    
    expect(mockAPI.state.commands.has("agents")).toBe(true);
    expect(mockAPI.state.commands.has("implement")).toBe(true);
    expect(mockAPI.state.commands.has("scout-and-plan")).toBe(true);
    expect(mockAPI.state.commands.has("parallel")).toBe(true);
  });

  test("agent_spawn tool has correct parameters", async () => {
    const { default: subagentExtension } = await import(
      "../../../src/extensions/core/subagent-extension.js"
    );
    
    await subagentExtension(mockAPI as any);
    
    const tool = mockAPI.state.tools.get("agent_spawn");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("agent_spawn");
    expect(tool.label).toBe("Spawn Subagent");
  });

  test("Default agents should be registered", async () => {
    const { default: subagentExtension } = await import(
      "../../../src/extensions/core/subagent-extension.js"
    );
    
    // Clear then reload
    await subagentExtension(mockAPI as any);
    
    // Verify commands exist
    expect(mockAPI.state.commands.get("agents")).toBeDefined();
    expect(mockAPI.state.commands.get("implement")).toBeDefined();
  });
});
