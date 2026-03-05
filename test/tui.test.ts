import { describe, test, expect } from "bun:test";
import { config } from "../src/pi-config";

describe("TUI Configuration", () => {
  test("should have TUI enabled in config", () => {
    expect(config.ui).toBe('tui');
  });

  test("should have Ollama provider extension configured", () => {
    expect(config.extensions).toContain('./src/extensions/core/ollama-provider-extension.ts');
  });

  test("should have gateway extension configured", () => {
    expect(config.extensions).toContain('./src/extensions/core/gateway-extension.ts');
  });

  test("should have update extension configured", () => {
    expect(config.extensions).toContain('./src/extensions/core/update-extension.ts');
  });

  test("should have Ollama provider configured in settings", () => {
    expect(config.settings?.['0xkobold.model.provider']).toBe('ollama');
  });

  test("should have auto-update enabled", () => {
    expect(config.settings?.['0xkobold.update.checkOnStartup']).toBe(true);
    expect(config.settings?.['0xkobold.update.autoInstall']).toBe(true);
  });

  test("should have gateway port configured", () => {
    expect(config.settings?.['0xkobold.gateway.port']).toBe(18789);
  });

  test("should have custom keybindings", () => {
    expect(config.keybindings).toBeDefined();
    expect(config.keybindings?.['ctrl+c']).toBe('interrupt');
    expect(config.keybindings?.['ctrl+t']).toBe('toggle_tree');
  });
});
