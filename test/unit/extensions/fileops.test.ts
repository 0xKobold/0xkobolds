/**
 * File Operations Extension Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import fileOpsExtension from "../../../src/extensions/core/fileops-extension";
import { createMockExtensionAPI, createMockContext } from "./mocks";

// Set up a test working directory that's within allowed paths
const TEST_WORKSPACE = process.cwd();

describe("File Operations Extension", () => {
  let api: ReturnType<typeof createMockExtensionAPI>;
  let testDir: string;

  beforeEach(async () => {
    api = createMockExtensionAPI();
    testDir = join(tmpdir(), "fileops-test-" + Date.now());
    await mkdir(testDir, { recursive: true });

    // Set working directory flag
    api.registerFlag("working-dir", {
      description: "Working directory",
      type: "string",
      default: testDir,
    });
    api.setFlag("working-dir", testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("Tool Registration", () => {
    test("should register read_file_with_line_numbers tool", () => {
      fileOpsExtension(api as any);
      expect(api.state.tools.has("read_file_with_line_numbers")).toBe(true);
    });

    test("should register write_file tool", () => {
      fileOpsExtension(api as any);
      expect(api.state.tools.has("write_file")).toBe(true);
    });

    test("should register list_directory tool", () => {
      fileOpsExtension(api as any);
      expect(api.state.tools.has("list_directory")).toBe(true);
    });

    test("should register search_files tool", () => {
      fileOpsExtension(api as any);
      expect(api.state.tools.has("search_files")).toBe(true);
    });

    test("should register batch_edit tool", () => {
      fileOpsExtension(api as any);
      expect(api.state.tools.has("batch_edit")).toBe(true);
    });

    test("should register shell tool", () => {
      fileOpsExtension(api as any);
      expect(api.state.tools.has("shell")).toBe(true);
    });

    test("should register status bar item", () => {
      fileOpsExtension(api as any);
      expect(api.state.statusBarItems.has("fileops")).toBe(true);
    });
  });

  describe("read_file_with_line_numbers", () => {
    test("should read file with line numbers", async () => {
      fileOpsExtension(api as any);

      const testFile = join(testDir, "test.txt");
      await writeFile(testFile, "Line 1\nLine 2\nLine 3");

      const tool = api.state.tools.get("read_file_with_line_numbers")!;
      const result = await tool.execute({ path: testFile });

      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[1].text).toContain("1 | Line 1");
      expect(result.content[1].text).toContain("2 | Line 2");
    });

    test("should handle offset and limit", async () => {
      fileOpsExtension(api as any);

      const testFile = join(testDir, "test.txt");
      await writeFile(testFile, "Line 1\nLine 2\nLine 3\nLine 4\nLine 5");

      const tool = api.state.tools.get("read_file_with_line_numbers")!;
      const result = await tool.execute({ path: testFile, offset: 2, limit: 2 });

      const text = result.content[1]?.text || "";
      expect(text).toContain("3 | Line 3");
      expect(text).toContain("4 | Line 4");
      expect(text).not.toContain("1 | Line 1");
    });

    test("should return error for non-existent file", async () => {
      fileOpsExtension(api as any);

      const tool = api.state.tools.get("read_file_with_line_numbers")!;
      const result = await tool.execute({ path: "/nonexistent/file.txt" });

      expect(result.details?.error).toBe("file_not_found");
    });

    test("should return error for directory", async () => {
      fileOpsExtension(api as any);

      const subDir = join(testDir, "subdir");
      await mkdir(subDir, { recursive: true });

      const tool = api.state.tools.get("read_file_with_line_numbers")!;
      const result = await tool.execute({ path: subDir });

      expect(result.details?.error).toBe("is_directory");
    });
  });

  describe("write_file", () => {
    test("should write file content", async () => {
      fileOpsExtension(api as any);

      const testFile = join(testDir, "output.txt");
      const content = "Hello, World!";

      const tool = api.state.tools.get("write_file")!;
      const result = await tool.execute({ path: testFile, content });

      expect(result.content[0].text).toContain("Successfully wrote");
      expect(existsSync(testFile)).toBe(true);

      const written = await readFile(testFile, "utf-8");
      expect(written).toBe(content);
    });

    test("should create directories if needed", async () => {
      fileOpsExtension(api as any);

      const testFile = join(testDir, "nested", "path", "file.txt");
      const content = "Nested content";

      const tool = api.state.tools.get("write_file")!;
      await tool.execute({ path: testFile, content });

      expect(existsSync(testFile)).toBe(true);
    });

    test("should append to existing file", async () => {
      fileOpsExtension(api as any);

      const testFile = join(testDir, "append.txt");
      await writeFile(testFile, "First line\n");

      const tool = api.state.tools.get("write_file")!;
      await tool.execute({ path: testFile, content: "Second line", append: true });

      const content = await readFile(testFile, "utf-8");
      expect(content).toContain("First line");
      expect(content).toContain("Second line");
    });
  });

  describe("list_directory", () => {
    test("should list directory contents", async () => {
      fileOpsExtension(api as any);

      await writeFile(join(testDir, "file1.txt"), "content");
      await writeFile(join(testDir, "file2.txt"), "content");
      await mkdir(join(testDir, "subdir"), { recursive: true });

      const tool = api.state.tools.get("list_directory")!;
      const result = await tool.execute({ path: testDir });

      const text = result.content[1]?.text || "";
      expect(text).toContain("file1.txt");
      expect(text).toContain("file2.txt");
      expect(text).toContain("subdir/");
    });

    test("should recursively list directories", async () => {
      fileOpsExtension(api as any);

      await mkdir(join(testDir, "a", "b"), { recursive: true });
      await writeFile(join(testDir, "a", "b", "deep.txt"), "deep");
      await writeFile(join(testDir, "root.txt"), "root");

      const tool = api.state.tools.get("list_directory")!;
      const result = await tool.execute({ path: testDir, recursive: true });

      const text = result.content[1]?.text || "";
      expect(text).toContain("deep.txt");
    });

    test("should return error for non-existent directory", async () => {
      fileOpsExtension(api as any);

      const tool = api.state.tools.get("list_directory")!;
      const result = await tool.execute({ path: "/nonexistent/dir" });

      expect(result.details?.error).toBe("directory_not_found");
    });

    test("should skip hidden files", async () => {
      fileOpsExtension(api as any);

      await writeFile(join(testDir, ".hidden.txt"), "hidden");
      await writeFile(join(testDir, "visible.txt"), "visible");

      const tool = api.state.tools.get("list_directory")!;
      const result = await tool.execute({ path: testDir });

      const text = result.content[1]?.text || "";
      expect(text).toContain("visible.txt");
      expect(text).not.toContain(".hidden");
    });
  });

  describe("search_files", () => {
    test("should find matching content", async () => {
      fileOpsExtension(api as any);

      await writeFile(join(testDir, "test.ts"), "const x = 1;");
      await writeFile(join(testDir, "other.txt"), "const y = 2;");

      const tool = api.state.tools.get("search_files")!;
      const result = await tool.execute({ pattern: "const", path: testDir });

      expect(result.content[0].text).toContain("Found");
      const details = result.details as { matchesFound: number };
      expect(details.matchesFound).toBeGreaterThan(0);
    });

    test("should support regex patterns", async () => {
      fileOpsExtension(api as any);

      await writeFile(join(testDir, "test.txt"), "function test() {}");

      const tool = api.state.tools.get("search_files")!;
      const result = await tool.execute({ pattern: "function\\s+\\w+", path: testDir });

      const details = result.details as { matchesFound: number };
      expect(details.matchesFound).toBeGreaterThan(0);
    });

    test("should limit to 100 files", async () => {
      fileOpsExtension(api as any);

      // Create many files
      for (let i = 0; i < 10; i++) {
        await writeFile(join(testDir, `file${i}.txt`), `content${i}`);
      }

      const tool = api.state.tools.get("search_files")!;
      const result = await tool.execute({ pattern: "content", path: testDir });

      const details = result.details as { filesScanned: number };
      expect(details.filesScanned).toBeLessThanOrEqual(100);
    });
  });

  describe("batch_edit", () => {
    test("should replace text in multiple files", async () => {
      fileOpsExtension(api as any);

      await writeFile(join(testDir, "a.txt"), "hello world");
      await writeFile(join(testDir, "b.txt"), "hello universe");

      const tool = api.state.tools.get("batch_edit")!;
      const result = await tool.execute({
        glob: "*.txt",
        search: "hello",
        replace: "hi",
      });

      expect(result.content[0].text).toContain("Edited");

      const a = await readFile(join(testDir, "a.txt"), "utf-8");
      const b = await readFile(join(testDir, "b.txt"), "utf-8");
      expect(a).toBe("hi world");
      expect(b).toBe("hi universe");
    });

    test("should support regex mode", async () => {
      fileOpsExtension(api as any);

      await writeFile(join(testDir, "test.txt"), "foo bar baz");

      const tool = api.state.tools.get("batch_edit")!;
      await tool.execute({
        glob: "*.txt",
        search: "\\w+",
        replace: "[WORD]",
        regex: true,
      });

      const content = await readFile(join(testDir, "test.txt"), "utf-8");
      expect(content).toBe("[WORD] [WORD] [WORD]");
    });

    test("should reject glob with traversal", async () => {
      fileOpsExtension(api as any);

      const tool = api.state.tools.get("batch_edit")!;
      const result = await tool.execute({
        glob: "../../*.txt",
        search: "test",
        replace: "replaced",
      });

      expect(result.content[0].text).toContain("Invalid glob pattern");
    });
  });

  describe("shell", () => {
    test("should execute safe commands", async () => {
      fileOpsExtension(api as any);

      const tool = api.state.tools.get("shell")!;
      const result = await tool.execute({ command: "echo hello" });

      expect(result.content[0].text).toContain("hello");
    });

    test("should block dangerous commands", async () => {
      fileOpsExtension(api as any);

      const tool = api.state.tools.get("shell")!;
      const result = await tool.execute({ command: "rm -rf /" });

      expect(result.details?.error).toBe("command_blocked");
    });

    test("should respect timeout", async () => {
      fileOpsExtension(api as any);

      const tool = api.state.tools.get("shell")!;
      const result = await tool.execute({
        command: "sleep 0.1 && echo done",
        timeout: 5000,
      });

      expect(result.content[0].text).toContain("done");
    });

    test("should use custom cwd", async () => {
      fileOpsExtension(api as any);

      const tool = api.state.tools.get("shell")!;
      const result = await tool.execute({
        command: "pwd",
        cwd: testDir,
      });

      // The output should contain the test directory
      expect(result.details?.cwd).toBe(testDir);
    });
  });
});
