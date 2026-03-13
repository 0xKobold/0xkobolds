/**
 * Pi Obsidian Bridge Tests
 * 
 * Tests for Obsidian vault integration
 * @version 0.1.0
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { ObsidianBridge, type ObsidianBridgeConfig } from "../src/index";

const TEST_DIR = join(homedir(), ".pi", "test-obsidian-" + Date.now());

describe("pi-obsidian-bridge v0.1.0", () => {
  beforeEach(() => {
    process.env.PI_OBSIDIAN_ENABLED = "true";
    process.env.PI_OBSIDIAN_STORAGE = join(TEST_DIR, "storage");
    process.env.PI_OBSIDIAN_VAULT = join(TEST_DIR, "vault");
    
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    delete process.env.PI_OBSIDIAN_VAULT;
    delete process.env.PI_OBSIDIAN_STORAGE;
    delete process.env.PI_OBSIDIAN_ENABLED;
  });

  test("creates vault structure on init", async () => {
    const config: ObsidianBridgeConfig = {
      enabled: true,
      vaultPath: join(TEST_DIR, "vault"),
      tasksFilePath: "10-Action/Tasks.md",
      storagePath: join(TEST_DIR, "storage"),
    };

    const bridge = new ObsidianBridge(config);
    await bridge.init();

    expect(existsSync(join(TEST_DIR, "vault", ".obsidian"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "vault", "10-Action", "Tasks.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "vault", "00-Inbox", "Welcome.md"))).toBe(true);
  });

  test("loads existing vault", async () => {
    const vaultPath = join(TEST_DIR, "existing-vault");
    mkdirSync(join(vaultPath, ".obsidian"), { recursive: true });
    
    const config: ObsidianBridgeConfig = {
      enabled: true,
      vaultPath,
      tasksFilePath: "10-Action/Tasks.md",
      storagePath: join(TEST_DIR, "storage"),
    };

    const bridge = new ObsidianBridge(config);
    await bridge.init();

    const status = await bridge.getStatus();
    expect(status.connected).toBe(true);
  });

  test("pollForTasks finds #kobold tasks", async () => {
    const config: ObsidianBridgeConfig = {
      enabled: true,
      vaultPath: join(TEST_DIR, "vault"),
      tasksFilePath: "10-Action/Tasks.md",
      storagePath: join(TEST_DIR, "storage"),
    };

    const bridge = new ObsidianBridge(config);
    await bridge.init();

    // Create tasks
    const tasksPath = join(TEST_DIR, "vault", "10-Action", "Tasks.md");
    writeFileSync(tasksPath, `# Tasks\n\n- [ ] Task one #kobold\n- [ ] Task two #other\n- [ ] Task three #kobold #urgent\n`);

    const tasks = await bridge.pollForTasks();

    expect(tasks.length).toBe(2);
    expect(tasks[0].title).toBe("Task one");
    expect(tasks[0].tags).toContain("kobold");
    expect(tasks[1].tags).toContain("urgent");
  });

  test("completeTask marks task done in vault", async () => {
    const config: ObsidianBridgeConfig = {
      enabled: true,
      vaultPath: join(TEST_DIR, "vault"),
      tasksFilePath: "10-Action/Tasks.md",
      storagePath: join(TEST_DIR, "storage"),
    };

    const bridge = new ObsidianBridge(config);
    await bridge.init();

    const tasksPath = join(TEST_DIR, "vault", "10-Action", "Tasks.md");
    writeFileSync(tasksPath, `# Tasks\n\n- [ ] Complete this #kobold\n- [ ] Leave this #kobold\n`);

    await bridge.pollForTasks();
    const tasks = await bridge.getPendingTasks();
    expect(tasks.length).toBe(2);

    const success = await bridge.completeTask(tasks[0].id);
    expect(success).toBe(true);

    const content = readFileSync(tasksPath, "utf-8");
    expect(content).toContain("- [x] Complete this");
    expect(content).toContain("- [ ] Leave this");
  });

  test("getStatus returns correct info", async () => {
    const config: ObsidianBridgeConfig = {
      enabled: true,
      vaultPath: join(TEST_DIR, "vault"),
      tasksFilePath: "10-Action/Tasks.md",
      storagePath: join(TEST_DIR, "storage"),
    };

    const bridge = new ObsidianBridge(config);
    await bridge.init();

    const status = await bridge.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.connected).toBe(true);
    expect(status.vault).toBe(config.vaultPath);
    expect(status.pendingCount).toBe(0);
  });
});

console.log("✅ pi-obsidian-bridge tests loaded");