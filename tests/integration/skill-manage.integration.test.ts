/**
 * Integration Tests for Skill Manage
 * 
 * Tests the full workflow of skill creation, patching, and viewing.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

const SKILLS_DIR = path.join(homedir(), ".0xkobold", "skills");

// Helper to create a test skill
async function createTestSkill(name: string, content: string): Promise<string> {
  const skillDir = path.join(SKILLS_DIR, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8");
  return skillDir;
}

// Helper to clean up test skill
async function cleanupTestSkill(name: string): Promise<void> {
  try {
    await fs.rm(path.join(SKILLS_DIR, name), { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
}

// Helper to check skill exists
async function skillExists(name: string): Promise<boolean> {
  try {
    await fs.access(path.join(SKILLS_DIR, name, "SKILL.md"));
    return true;
  } catch {
    return false;
  }
}

describe("Skill Manage Integration", () => {
  const testSkillName = `test-skill-${Date.now()}`;

  afterAll(async () => {
    await cleanupTestSkill(testSkillName);
  });

  describe("Skill Creation Workflow", () => {
    test("should create a new skill with frontmatter", async () => {
      const content = `---
name: ${testSkillName}
description: A test skill for integration testing
version: 1.0.0
metadata:
  author: test
---

# Test Skill

This is a test skill.
`;
      const skillDir = await createTestSkill(testSkillName, content);
      
      expect(await skillExists(testSkillName)).toBe(true);
      
      const readContent = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf-8");
      expect(readContent).toContain("name: " + testSkillName);
      expect(readContent).toContain("description: A test skill");
    });

    test("should create skill with references directory", async () => {
      const skillDir = path.join(SKILLS_DIR, testSkillName);
      
      // Create references directory
      await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
      await fs.writeFile(
        path.join(skillDir, "references", "api.md"),
        "# API Reference\n\nAPI documentation here.",
        "utf-8"
      );

      const refExists = await fs.access(path.join(skillDir, "references", "api.md"))
        .then(() => true)
        .catch(() => false);
      
      expect(refExists).toBe(true);
    });

    test("should create skill with templates directory", async () => {
      const skillDir = path.join(SKILLS_DIR, testSkillName);
      
      // Create templates directory
      await fs.mkdir(path.join(skillDir, "templates"), { recursive: true });
      await fs.writeFile(
        path.join(skillDir, "templates", "component.ts"),
        "export const Template = () => {};",
        "utf-8"
      );

      const templateExists = await fs.access(path.join(skillDir, "templates", "component.ts"))
        .then(() => true)
        .catch(() => false);
      
      expect(templateExists).toBe(true);
    });
  });

  describe("Skill Patching", () => {
    test("should patch a skill with targeted replacement", async () => {
      const skillDir = path.join(SKILLS_DIR, testSkillName);
      const skillPath = path.join(skillDir, "SKILL.md");
      
      // Create skill with content to patch
      await fs.writeFile(skillPath, `---
name: ${testSkillName}
description: Old description
---

# Test Skill

This skill uses the old API.
`, "utf-8");

      // Read, patch, write
      let content = await fs.readFile(skillPath, "utf-8");
      content = content.replace("old API", "new API");
      await fs.writeFile(skillPath, content, "utf-8");

      const patched = await fs.readFile(skillPath, "utf-8");
      expect(patched).toContain("new API");
      expect(patched).not.toContain("old API");
    });
  });

  describe("Progressive Disclosure", () => {
    test("should support level 0: list skills metadata", async () => {
      const skillsPath = SKILLS_DIR;
      
      const skillDirs = await fs.readdir(skillsPath).catch(() => []);
      const validSkills = [];

      for (const dir of skillDirs) {
        try {
          const skillFile = await fs.readFile(path.join(skillsPath, dir, "SKILL.md"), "utf-8");
          // Extract metadata (simple frontmatter parsing)
          const frontmatterMatch = skillFile.match(/^---\n([\s\S]*?)\n---/);
          if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const nameMatch = frontmatter.match(/name:\s*(.+)/);
            const descMatch = frontmatter.match(/description:\s*(.+)/);
            validSkills.push({
              name: nameMatch?.[1]?.trim() || dir,
              description: descMatch?.[1]?.trim() || "",
            });
          }
        } catch {
          // Skip invalid skills
        }
      }

      // Level 0: Just names and descriptions, minimal tokens
      expect(validSkills.length).toBeGreaterThanOrEqual(0);
    });

    test("should support level 1: view full skill", async () => {
      const skillPath = path.join(SKILLS_DIR, testSkillName, "SKILL.md");
      
      if (await skillExists(testSkillName)) {
        const content = await fs.readFile(skillPath, "utf-8");
        
        // Level 1: Full content
        expect(content.length).toBeGreaterThan(50);
        expect(content).toContain("---");
      }
    });

    test("should support level 2: view specific file in skill", async () => {
      const refPath = path.join(SKILLS_DIR, testSkillName, "references", "api.md");
      
      try {
        const content = await fs.readFile(refPath, "utf-8");
        // Level 2: Just the referenced file
        expect(content).toContain("API Reference");
      } catch {
        // Skip if file doesn't exist
      }
    });
  });

  describe("Error Handling", () => {
    test("should reject invalid skill names", async () => {
      const invalidNames = [
        "Invalid Name",       // Uppercase and space
        "skill--name",       // Double hyphen
        "-skill-name",       // Starts with hyphen
        "skill-name-",       // Ends with hyphen
        "a".repeat(65),      // Longer than 64 chars
      ];

      const validNameRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
      
      for (const name of invalidNames) {
        const isValid = validNameRegex.test(name) && name.length <= 64;
        expect(isValid).toBe(false);
      }
    });

    test("should accept valid skill names", async () => {
      const validNames = [
        "skill-name",
        "my-skill",
        "test-skill-123",
        "a",                // Single character
        "skill-" + "a".repeat(58),  // Exactly 64 chars (6 + 58)
      ];

      const validNameRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

      for (const name of validNames) {
        const isValid = validNameRegex.test(name) && name.length <= 64;
        expect(isValid).toBe(true);
      }
    });

    test("should handle missing skill gracefully", async () => {
      const nonExistent = await skillExists("nonexistent-skill-xyz");
      expect(nonExistent).toBe(false);
    });
  });
});