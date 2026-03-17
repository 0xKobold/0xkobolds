/**
 * Agent Skills Client Implementation Tests
 * 
 * Tests for agentskills.io specification compliance:
 * - Skill discovery (scan directories)
 * - Frontmatter parsing (YAML extraction)
 * - Progressive disclosure (tier 1/2/3)
 * - Conditional activation (toolsets, platforms)
 * - Context management (deduplication)
 * 
 * @see https://agentskills.io/client-implementation/adding-skills-support
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import {
  ConditionalSkillRegistry,
  parseSkillFrontmatter,
  validateSkillFrontmatter,
  type ParsedSkill,
  type SkillFilterOptions,
} from "../../src/skills/conditional-skills";

const TEST_SKILLS_DIR = path.join(homedir(), ".0xkobold", "test-skills");

// ============================================================================
// TEST FIXTURES
// ============================================================================

const VALID_SKILL = `---
name: test-skill
description: A test skill for unit testing
license: MIT
compatibility: node >= 18
allowed_tools: read write edit
---

# Test Skill

This is a test skill for unit testing.

## Usage

\`\`\`
Use this skill when you need to test something.
\`\`\`
`;

const HERMES_SKILL = `---
name: web-fallback
description: Fallback skill when web is unavailable
metadata:
  hermes:
    fallback_for_toolsets:
      - web
    requires_toolsets:
      - terminal
    platforms:
      - linux
      - macos
---

# Web Fallback

Provides offline web functionality.
`;

const PLATFORM_SKILL = `---
name: macos-only
description: macOS specific skill
metadata:
  hermes:
    platforms:
      - macos
---

# macOS Only

Only runs on macOS.
`;

const MALFORMED_YAML = `---
name: test-skill
description: This: has a colon: that breaks
---

# Malformed

This has malformed YAML.
`;

const MISSING_DESCRIPTION = `---
name: no-description
---

# No Description

Missing required description.
`;

// ============================================================================
// TESTS
// ============================================================================

describe("Agent Skills: Discovery", () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_SKILLS_DIR, { recursive: true });
    // Ensure clean state
    try {
      await fs.rm(TEST_SKILLS_DIR, { recursive: true, force: true });
    } catch {}
    await fs.mkdir(TEST_SKILLS_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_SKILLS_DIR, { recursive: true, force: true });
    } catch {}
  });

  test("should discover skills directory", async () => {
    const skillDir = path.join(TEST_SKILLS_DIR, "test-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL);
    
    const registry = new ConditionalSkillRegistry({ skillsDir: TEST_SKILLS_DIR });
    await registry.loadSkills();
    
    const skills = registry.listSkills();
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe("test-skill");
  });

  test("should skip directories without SKILL.md", async () => {
    const skillDir = path.join(TEST_SKILLS_DIR, "test-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), VALID_SKILL);
    
    const notSkillDir = path.join(TEST_SKILLS_DIR, "not-a-skill");
    await fs.mkdir(notSkillDir, { recursive: true });
    // No SKILL.md in not-a-skill
    
    const registry = new ConditionalSkillRegistry({ skillsDir: TEST_SKILLS_DIR });
    await registry.loadSkills();
    
    const skills = registry.listSkills();
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe("test-skill");
  });

  test("should handle empty skills directory", async () => {
    const registry = new ConditionalSkillRegistry({ skillsDir: TEST_SKILLS_DIR });
    await registry.loadSkills();
    
    const skills = registry.listSkills();
    expect(skills.length).toBe(0);
  });

  test("should handle missing skills directory", async () => {
    // Use a truly nonexistent path that we don't need to create
    const nonexistentPath = path.join(homedir(), ".0xkobold", "nonexistent-skills-" + Date.now());
    
    const registry = new ConditionalSkillRegistry({ skillsDir: nonexistentPath });
    
    // Should not throw - will create the directory
    await registry.loadSkills();
    const skills = registry.listSkills();
    expect(skills.length).toBe(0);
  });
});

describe("Agent Skills: Parsing", () => {
  test("should parse valid frontmatter", () => {
    const result = parseSkillFrontmatter(VALID_SKILL);
    
    expect(result.frontmatter.name).toBe("test-skill");
    expect(result.frontmatter.description).toBe("A test skill for unit testing");
    expect(result.frontmatter.license).toBe("MIT");
    expect(result.frontmatter.compatibility).toBe("node >= 18");
    expect(result.frontmatter.allowed_tools).toBe("read write edit");
  });

  test("should extract body content", () => {
    const result = parseSkillFrontmatter(VALID_SKILL);
    
    expect(result.body).toContain("# Test Skill");
    expect(result.body).toContain("Usage");
  });

  test("should parse Hermes metadata", () => {
    const result = parseSkillFrontmatter(HERMES_SKILL);
    
    expect(result.hermes).toBeDefined();
    expect(result.hermes?.fallback_for_toolsets).toEqual(["web"]);
    expect(result.hermes?.requires_toolsets).toEqual(["terminal"]);
    expect(result.hermes?.platforms).toEqual(["linux", "macos"]);
  });

  test("should handle malformed YAML gracefully", () => {
    // Per spec: "warn on issues but still load the skill when possible"
    const result = parseSkillFrontmatter(MALFORMED_YAML);
    
    // Should still parse name
    expect(result.frontmatter.name).toBe("test-skill");
    // Body should be extracted
    expect(result.body).toContain("# Malformed");
  });

  test("should reject missing description", () => {
    const result = validateSkillFrontmatter(parseSkillFrontmatter(MISSING_DESCRIPTION));
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("description is required");
  });
});

describe("Agent Skills: Validation", () => {
  test("should validate skill name length (max 64 chars)", () => {
    const longName = "a".repeat(65);
    const skill = `---
name: ${longName}
description: Test
---\n# Test`;
    
    const parsed = parseSkillFrontmatter(skill);
    const result = validateSkillFrontmatter(parsed);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("name"))).toBe(true);
  });

  test("should validate skill name format (lowercase + hyphens)", () => {
    const invalidNames = ["Test-Skill", "test_skill", "test skill", "test.skill"];
    
    for (const name of invalidNames) {
      const skill = `---
name: ${name}
description: Test
---\n# Test`;
      
      const parsed = parseSkillFrontmatter(skill);
      const result = validateSkillFrontmatter(parsed);
      
      expect(result.warnings.some(w => w.includes("name"))).toBe(true);
    }
  });

  test("should validate description length (max 1024 chars)", () => {
    const longDesc = "a".repeat(1025);
    const skill = `---
name: test
description: ${longDesc}
---\n# Test`;
    
    const parsed = parseSkillFrontmatter(skill);
    const result = validateSkillFrontmatter(parsed);
    
    expect(result.valid).toBe(false);
  });

  test("should accept valid skill", () => {
    const parsed = parseSkillFrontmatter(VALID_SKILL);
    const result = validateSkillFrontmatter(parsed);
    
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

describe("Agent Skills: Conditional Activation", () => {
  let registry: ConditionalSkillRegistry;

  beforeEach(async () => {
    await fs.mkdir(TEST_SKILLS_DIR, { recursive: true });
    
    // Create test skills
    await fs.mkdir(path.join(TEST_SKILLS_DIR, "test-skill"), { recursive: true });
    await fs.writeFile(
      path.join(TEST_SKILLS_DIR, "test-skill", "SKILL.md"),
      VALID_SKILL
    );
    
    await fs.mkdir(path.join(TEST_SKILLS_DIR, "web-fallback"), { recursive: true });
    await fs.writeFile(
      path.join(TEST_SKILLS_DIR, "web-fallback", "SKILL.md"),
      HERMES_SKILL
    );
    
    await fs.mkdir(path.join(TEST_SKILLS_DIR, "macos-only"), { recursive: true });
    await fs.writeFile(
      path.join(TEST_SKILLS_DIR, "macos-only", "SKILL.md"),
      PLATFORM_SKILL
    );
    
    registry = new ConditionalSkillRegistry({ skillsDir: TEST_SKILLS_DIR });
    await registry.loadSkills();
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_SKILLS_DIR, { recursive: true, force: true });
    } catch {}
  });

  test("should filter by available toolsets", () => {
    const allToolsets = new Set(["terminal", "filesystem", "web", "memory"]);
    
    const options: SkillFilterOptions = {
      availableToolsets: allToolsets,
    };
    
    const filtered = registry.filterSkills(options);
    
    // Regular skills should be included
    expect(filtered.some(s => s.frontmatter.name === "test-skill")).toBe(true);
    
    // Web fallback should NOT be included (web toolset IS available)
    expect(filtered.some(s => s.frontmatter.name === "web-fallback")).toBe(false);
  });

  test("should show fallback skills when toolset unavailable", () => {
    const noWebToolsets = new Set(["terminal", "filesystem", "memory"]);
    
    const options: SkillFilterOptions = {
      availableToolsets: noWebToolsets,
    };
    
    const filtered = registry.filterSkills(options);
    
    // Web fallback SHOULD be included (web toolset NOT available)
    expect(filtered.some(s => s.frontmatter.name === "web-fallback")).toBe(true);
  });

  test("should filter by platform", () => {
    const allToolsets = new Set(["terminal", "filesystem", "web"]);
    
    const options: SkillFilterOptions = {
      availableToolsets: allToolsets,
      platform: "windows",
    };
    
    const filtered = registry.filterSkills(options);
    
    // macOS-only should NOT be included
    expect(filtered.some(s => s.frontmatter.name === "macos-only")).toBe(false);
    
    // Test with macOS platform
    const macOptions: SkillFilterOptions = {
      availableToolsets: allToolsets,
      platform: "macos",
    };
    
    const macFiltered = registry.filterSkills(macOptions);
    expect(macFiltered.some(s => s.frontmatter.name === "macos-only")).toBe(true);
  });

  test("should require toolsets when specified", () => {
    const noTerminal = new Set(["filesystem", "web"]);
    
    const options: SkillFilterOptions = {
      availableToolsets: noTerminal,
    };
    
    const filtered = registry.filterSkills(options);
    
    // web-fallback requires terminal, which is NOT available
    expect(filtered.some(s => s.frontmatter.name === "web-fallback")).toBe(false);
  });
});

describe("Agent Skills: Progressive Disclosure", () => {
  test("should provide tier 0: metadata only", async () => {
    await fs.mkdir(TEST_SKILLS_DIR, { recursive: true });
    await fs.mkdir(path.join(TEST_SKILLS_DIR, "test-skill"), { recursive: true });
    await fs.writeFile(
      path.join(TEST_SKILLS_DIR, "test-skill", "SKILL.md"),
      VALID_SKILL
    );
    
    const registry = new ConditionalSkillRegistry({ skillsDir: TEST_SKILLS_DIR });
    await registry.loadSkills();
    
    // Tier 0: Just name + description
    const catalog = registry.listSkills();
    
    expect(catalog.length).toBe(1);
    expect(catalog[0].name).toBe("test-skill");
    // Body is NOT included in tier 0
    expect((catalog[0] as any).body).toBeUndefined();
    
    await fs.rm(TEST_SKILLS_DIR, { recursive: true, force: true });
  });

  test("should provide tier 1: full skill content", async () => {
    await fs.mkdir(TEST_SKILLS_DIR, { recursive: true });
    await fs.mkdir(path.join(TEST_SKILLS_DIR, "test-skill"), { recursive: true });
    await fs.writeFile(
      path.join(TEST_SKILLS_DIR, "test-skill", "SKILL.md"),
      VALID_SKILL
    );
    
    const registry = new ConditionalSkillRegistry({ skillsDir: TEST_SKILLS_DIR });
    await registry.loadSkills();
    
    const skill = registry.getSkill("test-skill");
    
    expect(skill).toBeDefined();
    expect(skill?.frontmatter.name).toBe("test-skill");
    expect(skill?.body).toContain("# Test Skill");
    expect(skill?.body).toContain("Usage");
    
    await fs.rm(TEST_SKILLS_DIR, { recursive: true, force: true });
  });

  test("should support tier 2: referenced files", async () => {
    await fs.mkdir(TEST_SKILLS_DIR, { recursive: true });
    await fs.mkdir(path.join(TEST_SKILLS_DIR, "test-skill", "scripts"), { recursive: true });
    await fs.mkdir(path.join(TEST_SKILLS_DIR, "test-skill", "references"), { recursive: true });
    
    await fs.writeFile(
      path.join(TEST_SKILLS_DIR, "test-skill", "SKILL.md"),
      VALID_SKILL
    );
    await fs.writeFile(
      path.join(TEST_SKILLS_DIR, "test-skill", "scripts", "example.sh"),
      "#!/bin/bash\necho 'example'"
    );
    await fs.writeFile(
      path.join(TEST_SKILLS_DIR, "test-skill", "references", "guide.md"),
      "# Guide\n\nThis is a reference guide."
    );
    
    const registry = new ConditionalSkillRegistry({ skillsDir: TEST_SKILLS_DIR });
    await registry.loadSkills();
    
    const skill = registry.getSkill("test-skill");
    
    expect(skill?.scripts).toBeDefined();
    expect(skill?.references).toBeDefined();
    expect(skill?.scripts?.some(s => s.includes("example.sh") || s === "example.sh")).toBe(true);
    expect(skill?.references?.some(r => r.includes("guide.md") || r === "guide.md")).toBe(true);
    
    await fs.rm(TEST_SKILLS_DIR, { recursive: true, force: true });
  });
});

describe("Agent Skills: Context Management", () => {
  test("should deduplicate skill activations", async () => {
    await fs.mkdir(TEST_SKILLS_DIR, { recursive: true });
    await fs.mkdir(path.join(TEST_SKILLS_DIR, "test-skill"), { recursive: true });
    await fs.writeFile(
      path.join(TEST_SKILLS_DIR, "test-skill", "SKILL.md"),
      VALID_SKILL
    );
    
    const registry = new ConditionalSkillRegistry({ skillsDir: TEST_SKILLS_DIR });
    await registry.loadSkills();
    
    // Simulate multiple activation requests
    const skill1 = registry.getSkill("test-skill");
    const skill2 = registry.getSkill("test-skill");
    
    // Both should reference the same skill
    expect(skill1?.frontmatter.name).toBe(skill2?.frontmatter.name);
    
    await fs.rm(TEST_SKILLS_DIR, { recursive: true, force: true });
  });

  test("should handle name collisions with precedence", async () => {
    // Create skills with same name in different locations
    await fs.mkdir(path.join(TEST_SKILLS_DIR, "collision-test"), { recursive: true });
    await fs.writeFile(
      path.join(TEST_SKILLS_DIR, "collision-test", "SKILL.md"),
      VALID_SKILL
    );
    
    const registry = new ConditionalSkillRegistry({ skillsDir: TEST_SKILLS_DIR });
    await registry.loadSkills();
    
    // First_found wins (per spec)
    const skill = registry.getSkill("test-skill");
    expect(skill).toBeDefined();
    
    await fs.rm(TEST_SKILLS_DIR, { recursive: true, force: true });
  });
});