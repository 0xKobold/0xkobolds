/**
 * Tests for Skill Manage Tool
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { skillManage, skillManageToolDefinition } from "../../src/skills/skill-manage.js";

const TEST_SKILLS_DIR = path.join(homedir(), ".0xkobold", "skills");

describe("Skill Manage Tool", () => {
  describe("Tool Definition", () => {
    test("should have correct name", () => {
      expect(skillManageToolDefinition.name).toBe("skill_manage");
    });

    test("should have all action types in enum", () => {
      const actions = skillManageToolDefinition.parameters.properties.action.enum;
      expect(actions).toContain("create");
      expect(actions).toContain("patch");
      expect(actions).toContain("edit");
      expect(actions).toContain("delete");
      expect(actions).toContain("view");
    });

    test("should require action and name", () => {
      const required = skillManageToolDefinition.parameters.required;
      expect(required).toContain("action");
      expect(required).toContain("name");
    });
  });

  describe("create action", () => {
    const testSkillName = `test-skill-${Date.now()}`;

    afterAll(async () => {
      // Clean up test skill
      try {
        await fs.rm(path.join(TEST_SKILLS_DIR, testSkillName), { recursive: true, force: true });
      } catch {}
    });

    test("should create a new skill", async () => {
      const result = await skillManage({
        action: "create",
        name: testSkillName,
        content: "# Test Skill\n\nThis is a test skill for unit testing.",
      });

      expect(result.success).toBe(true);
      expect(result.skill_path).toContain(testSkillName);
    });

    test("should fail if skill already exists", async () => {
      const result = await skillManage({
        action: "create",
        name: testSkillName,
        content: "Duplicate",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("already exists");
    });

    test("should fail with invalid skill name", async () => {
      const result = await skillManage({
        action: "create",
        name: "Invalid Name!",
        content: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid skill name");
    });
  });

  describe("patch action", () => {
    const testSkillName = `patch-test-${Date.now()}`;
    const skillPath = path.join(TEST_SKILLS_DIR, testSkillName);

    beforeAll(async () => {
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(
        path.join(skillPath, "SKILL.md"),
        "---\nname: patch-test\ndescription: Test\n---\n\n# Test\n\nOld content here.",
        "utf-8"
      );
    });

    afterAll(async () => {
      try {
        await fs.rm(skillPath, { recursive: true, force: true });
      } catch {}
    });

    test("should patch specific text in skill", async () => {
      const result = await skillManage({
        action: "patch",
        name: testSkillName,
        old_string: "Old content",
        new_string: "New content",
      });

      expect(result.success).toBe(true);

      // Verify change
      const content = await fs.readFile(path.join(skillPath, "SKILL.md"), "utf-8");
      expect(content).toContain("New content");
      expect(content).not.toContain("Old content");
    });

    test("should fail if old_string not found", async () => {
      const result = await skillManage({
        action: "patch",
        name: testSkillName,
        old_string: "nonexistent text",
        new_string: "replacement",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
    });
  });

  describe("view action", () => {
    const testSkillName = `view-test-${Date.now()}`;
    const skillPath = path.join(TEST_SKILLS_DIR, testSkillName);

    beforeAll(async () => {
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(
        path.join(skillPath, "SKILL.md"),
        "---\nname: view-test\ndescription: Test skill\n---\n\n# View Test\n\nView content.",
        "utf-8"
      );
    });

    afterAll(async () => {
      try {
        await fs.rm(skillPath, { recursive: true, force: true });
      } catch {}
    });

    test("should view skill content", async () => {
      const result = await skillManage({
        action: "view",
        name: testSkillName,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("View Test");
    });

    test("should fail if skill not found", async () => {
      const result = await skillManage({
        action: "view",
        name: "nonexistent-skill",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("delete action", () => {
    test("should delete existing skill", async () => {
      const skillName = `delete-test-${Date.now()}`;
      const skillPath = path.join(TEST_SKILLS_DIR, skillName);

      // Create skill
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(
        path.join(skillPath, "SKILL.md"),
        "---\nname: delete-test\n---\n\n# Delete Test",
        "utf-8"
      );

      // Delete skill
      const result = await skillManage({
        action: "delete",
        name: skillName,
      });

      expect(result.success).toBe(true);

      // Verify deleted
      const exists = await fs.access(skillPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe("write_file and remove_file actions", () => {
    const testSkillName = `file-test-${Date.now()}`;
    const skillPath = path.join(TEST_SKILLS_DIR, testSkillName);

    beforeAll(async () => {
      await fs.mkdir(skillPath, { recursive: true });
      await fs.writeFile(
        path.join(skillPath, "SKILL.md"),
        "---\nname: file-test\n---\n\n# File Test",
        "utf-8"
      );
    });

    afterAll(async () => {
      try {
        await fs.rm(skillPath, { recursive: true, force: true });
      } catch {}
    });

    test("should write file to skill", async () => {
      const result = await skillManage({
        action: "write_file",
        name: testSkillName,
        file_path: "references/api.md",
        file_content: "# API Reference\n\nAPI docs here.",
      });

      expect(result.success).toBe(true);
      expect(result.file_path).toContain("api.md");

      // Verify file exists
      const content = await fs.readFile(result.file_path!, "utf-8");
      expect(content).toContain("API Reference");
    });

    test("should remove file from skill", async () => {
      // First, verify file exists
      const filePath = path.join(skillPath, "references", "api.md");
      const existsBefore = await fs.access(filePath).then(() => true).catch(() => false);
      expect(existsBefore).toBe(true);

      // Remove file
      const result = await skillManage({
        action: "remove_file",
        name: testSkillName,
        file_path: "references/api.md",
      });

      expect(result.success).toBe(true);
    });
  });
});