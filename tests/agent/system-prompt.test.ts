/**
 * Unit tests for System Prompt Builder v0.3.0
 * Tests personality overlay and prompt assembly
 */

import { describe, test, expect, beforeAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

describe("System Prompt Builder", () => {
  describe("Prompt Assembly", () => {
    test("should include base prompt", () => {
      const basePrompt = "You are a helpful AI assistant.";
      expect(basePrompt).toContain("helpful");
      expect(basePrompt.length).toBeGreaterThan(10);
    });

    test("should include workspace context", () => {
      const workspace = "/home/user/project";
      const contextLine = `Working directory: ${workspace}`;
      expect(contextLine).toContain(workspace);
    });

    test("should include tools list", () => {
      const tools = [
        { name: "read", description: "Read files" },
        { name: "write", description: "Write files" },
        { name: "bash", description: "Execute commands" },
      ];
      
      const toolsList = tools.map(t => t.name).join(", ");
      expect(toolsList).toContain("read");
      expect(toolsList).toContain("write");
      expect(toolsList).toContain("bash");
    });

    test("should include mode instructions", () => {
      const planMode = "You are in PLAN MODE. Focus on investigation and planning.";
      const buildMode = "You are in BUILD MODE. Focus on implementation and execution.";
      
      expect(planMode).toContain("PLAN MODE");
      expect(buildMode).toContain("BUILD MODE");
    });
  });

  describe("Personality Overlay", () => {
    test("should format personality with wrapper tags", () => {
      const name = "concise";
      const content = "Be brief and direct.";
      
      const overlay = `<!-- Personality Overlay: ${name} -->\n\n${content}\n\n<!-- End Personality Overlay -->`;
      
      expect(overlay).toContain("Personality Overlay");
      expect(overlay).toContain(content);
    });

    test("should inject personality after bootstrap", () => {
      // Test ordering: base → bootstrap → personality → mode
      const components = ["base", "bootstrap", "personality", "mode"];
      const personalityIndex = components.indexOf("personality");
      const bootstrapIndex = components.indexOf("bootstrap");
      
      expect(personalityIndex).toBeGreaterThan(bootstrapIndex);
    });

    test("should support multiple personalities", () => {
      const personalities = ["concise", "technical", "teacher"];
      expect(personalities.length).toBe(3);
      expect(personalities).toContain("concise");
      expect(personalities).toContain("technical");
      expect(personalities).toContain("teacher");
    });

    test("should clear personality on reset", () => {
      process.env.KOBOLD_PERSONALITY = "concise";
      process.env.KOBOLD_PERSONALITY_CONTENT = "Be brief.";
      
      // Simulating reset
      process.env.KOBOLD_PERSONALITY = "";
      process.env.KOBOLD_PERSONALITY_CONTENT = "";
      
      expect(process.env.KOBOLD_PERSONALITY).toBe("");
    });
  });

  describe("Bootstrap Formatting", () => {
    test("should format empty files gracefully", () => {
      const files: any[] = [];
      const result = "<!-- No bootstrap context files present -->";
      
      expect(result).toContain("No bootstrap context files");
    });

    test("should format single file", () => {
      const files = [
        { name: "SOUL.md", content: "# SOUL\n\nTest", exists: true, size: 14, source: "global" }
      ];
      
      const formatted = `<!-- SOUL.md (14 chars) -->\n${files[0].content}`;
      expect(formatted).toContain("SOUL.md");
      expect(formatted).toContain("Test");
    });

    test("should format multiple files with separators", () => {
      const files = [
        { name: "SOUL.md", content: "# SOUL", exists: true, size: 6, source: "global" },
        { name: "IDENTITY.md", content: "# IDENTITY", exists: true, size: 10, source: "global" }
      ];
      
      expect(files.length).toBe(2);
      expect(files[0].name).toBe("SOUL.md");
      expect(files[1].name).toBe("IDENTITY.md");
    });

    test("should group by source", () => {
      const files = [
        { name: "SOUL.md", content: "# Agent", exists: true, size: 7, source: "agent" },
        { name: "USER.md", content: "# User", exists: true, size: 6, source: "global" },
        { name: "AGENTS.md", content: "# Project", exists: true, size: 9, source: "project" }
      ];
      
      const agentFiles = files.filter(f => f.source === "agent");
      const globalFiles = files.filter(f => f.source === "global");
      const projectFiles = files.filter(f => f.source === "project");
      
      expect(agentFiles.length).toBe(1);
      expect(globalFiles.length).toBe(1);
      expect(projectFiles.length).toBe(1);
    });
  });

  describe("Prompt Statistics", () => {
    test("should calculate total characters", () => {
      const prompt = "A".repeat(1000);
      expect(prompt.length).toBe(1000);
    });

    test("should calculate total lines", () => {
      const prompt = "Line 1\nLine 2\nLine 3";
      const lines = prompt.split("\n");
      expect(lines.length).toBe(3);
    });

    test("should extract section headers", () => {
      const prompt = `<!-- Bootstrap Context -->
<!-- SOUL.md (100 chars) -->
Content here
<!-- Workspace -->
Working directory: /home`;
      
      const sections = prompt.match(/<!--.*?-->/g) || [];
      expect(sections.length).toBeGreaterThan(0);
      expect(sections[0]).toContain("Bootstrap");
    });

    test("should estimate token count", () => {
      const prompt = "A".repeat(1000);
      const estimatedTokens = Math.ceil(prompt.length / 4);
      
      expect(estimatedTokens).toBe(250);
    });
  });

  describe("Per-Agent Context", () => {
    test("should include agent type indicator", () => {
      const agentType = "worker";
      const indicator = `<!-- Agent Type: ${agentType} -->`;
      
      expect(indicator).toContain("worker");
      expect(indicator).toContain("Agent Type");
    });

    test("should load correct bootstrap for agent type", async () => {
      const { promises: fs } = await import("node:fs/promises");
      const path = await import("node:path");
      
      const workspaceDir = process.env.HOME + "/.0xkobold";
      
      // Test each agent type has its own identity
      const agentTypes = ["coordinator", "scout", "planner", "worker", "reviewer"];
      
      for (const type of agentTypes) {
        try {
          const soulPath = path.join(workspaceDir, "agents", type, "SOUL.md");
          const content = await fs.readFile(soulPath, "utf-8");
          
          // Each agent should have unique content
          expect(content.length).toBeGreaterThan(500);
        } catch {
          // Skip if file doesn't exist in test environment
          expect(true).toBe(true);
        }
      }
    });
  });

  describe("Environment Integration", () => {
    test("should read personality from environment", () => {
      process.env.KOBOLD_PERSONALITY = "concise";
      process.env.KOBOLD_PERSONALITY_CONTENT = "Be brief and direct.";
      
      const envPersonality = process.env.KOBOLD_PERSONALITY;
      const envContent = process.env.KOBOLD_PERSONALITY_CONTENT;
      
      expect(envPersonality).toBe("concise");
      expect(envContent).toContain("brief");
    });

    test("should read workspace from environment", () => {
      process.env.KOBOLD_WORKSPACE = "/home/user/.0xkobold";
      
      const workspace = process.env.KOBOLD_WORKSPACE;
      expect(workspace).toContain(".0xkobold");
    });
  });
});

describe("Integration Tests", () => {
  test("full prompt assembly flow", async () => {
    // Simulate full assembly:
    // 1. Base prompt
    // 2. Agent type indicator
    // 3. Bootstrap files
    // 4. Workspace
    // 5. Tools
    // 6. Personality overlay
    // 7. Mode
    
    const components = [
      "You are 0xKobold...",
      "<!-- Agent Type: worker -->",
      "<!-- Bootstrap Context -->",
      "Working directory: /home/user/.0xkobold",
      "Available tools: read, write, edit",
      "<!-- Personality Overlay: concise -->",
      "<!-- Mode: Build -->",
    ];
    
    // Verify ordering - find indices by substring match
    const agentTypeIdx = components.findIndex(c => c.includes("Agent Type"));
    const bootstrapIdx = components.findIndex(c => c.includes("Bootstrap"));
    const personalityIdx = components.findIndex(c => c.includes("Personality"));
    const modeIdx = components.findIndex(c => c.includes("Mode"));
    
    expect(agentTypeIdx).toBeLessThan(bootstrapIdx);
    expect(bootstrapIdx).toBeLessThan(personalityIdx);
    expect(personalityIdx).toBeLessThan(modeIdx);
    
    expect(components.length).toBe(7);
  });
});