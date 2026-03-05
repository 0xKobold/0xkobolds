import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const KOBOLD_DIR = join(homedir(), ".0xkobold");

describe("0xKobold Initialization", () => {
  test("should create global config directory", () => {
    expect(existsSync(KOBOLD_DIR)).toBe(true);
  });

  test("should have required global files", () => {
    expect(existsSync(join(KOBOLD_DIR, "config.json"))).toBe(true);
    expect(existsSync(join(KOBOLD_DIR, "MEMORY.md"))).toBe(true);
    expect(existsSync(join(KOBOLD_DIR, "kobold.db"))).toBe(true);
  });

  test("should create local workspace when run", () => {
    // This test verifies the local workspace was created
    // when we ran 'bun cli/index.ts init' earlier
    expect(existsSync(".0xkobold")).toBe(true);
    expect(existsSync(".0xkobold/workspace.db")).toBe(true);
    expect(existsSync(".0xkobold/MEMORY.md")).toBe(true);
  });
});
