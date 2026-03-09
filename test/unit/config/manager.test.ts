/**
 * Config Manager Tests - v0.3.0
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getConfigManager, resetConfigManager } from "../../../src/config/index.js";
import * as fs from "node:fs/promises";

describe("Config Manager - v0.3.0", () => {
  const testConfigPath = "/tmp/test-config.json";

  beforeEach(async () => {
    resetConfigManager();
    try {
      await fs.unlink(testConfigPath);
    } catch {}
  });

  afterEach(async () => {
    resetConfigManager();
    try {
      await fs.unlink(testConfigPath);
    } catch {}
  });

  test("should create config manager", () => {
    const config = getConfigManager(testConfigPath);
    expect(config).toBeDefined();
  });

  test("should return default config", () => {
    const config = getConfigManager(testConfigPath);
    const defaults = config.getConfig();

    expect(defaults.version).toBe("0.3.0");
    expect(defaults.persona.name).toBe("0xKobold");
    expect(defaults.persona.emoji).toBe("🐉");
    expect(defaults.gateway.port).toBe(7777);
    expect(defaults.llm.model).toBe("claude-3-sonnet-20240229");
  });

  test("should save and load config", async () => {
    const config = getConfigManager(testConfigPath);
    config.set("persona", { name: "TestBot", emoji: "🤖", description: "Test" });
    await config.save();

    resetConfigManager();
    const config2 = getConfigManager(testConfigPath);
    await config2.load();

    expect(config2.get("persona").name).toBe("TestBot");
    expect(config2.get("persona").emoji).toBe("🤖");
  });

  test("should set nested values", () => {
    const config = getConfigManager(testConfigPath);
    config.setNested("llm.model", "gpt-4");
    config.setNested("gateway.port", 8080);

    expect(config.get("llm").model).toBe("gpt-4");
    expect(config.get("gateway").port).toBe(8080);
  });

  test("should get nested values", () => {
    const config = getConfigManager(testConfigPath);
    const temperature = config.getNested("llm.temperature");

    expect(temperature).toBe(0.7);
  });

  test("should validate config", () => {
    const config = getConfigManager(testConfigPath);
    const validation = config.validate();

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test("should detect invalid temperature", () => {
    const config = getConfigManager(testConfigPath);
    config.setNested("llm.temperature", 3.0);
    const validation = config.validate();

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("llm.temperature must be between 0 and 2");
  });

  test("should reset to defaults", () => {
    const config = getConfigManager(testConfigPath);
    config.set("persona", { name: "Custom", emoji: "🔧" });
    config.reset();

    expect(config.get("persona").name).toBe("0xKobold");
    expect(config.get("persona").emoji).toBe("🐉");
  });

  test("should convert to env", async () => {
    const config = getConfigManager(testConfigPath);
    config.setNested("channels.telegram.token", "test-token-123");
    config.setNested("llm.apiKey", "sk-abc123");

    const env = await config.exportToEnv();
    expect(env).toContain("TELEGRAM_BOT_TOKEN=test-token-123");
    expect(env).toContain("LLM_API_KEY=sk-abc123");
  });
});
