/**
 * Config Extension
 *
 * Unified configuration management for 0xKobold.
 * All extensions use ~/.0xkobold/0xkobold.json
 * Following OpenClaw convention (openclaw.json)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { config } from "../../config/unified-config.js";

export default function configExtension(pi: ExtensionAPI) {
  console.log("[Config] Extension loaded");

  // Show config
  pi.registerCommand("config", {
    description: "Show unified configuration",
    handler: async (_args, ctx) => {
      const cfg = config.get();
      const path = config.path();
      
      const lines = [
        "⚙️ 0xKobold Configuration",
        "───────────────────────────────",
        `File: ${path}`,
        `Version: ${cfg.version}`,
        `Updated: ${new Date(cfg.updatedAt).toLocaleString()}`,
        "",
        "Sections:",
        "  • /config-ollama  - Ollama settings",
        "  • /config-gateway - Gateway settings",
        "  • /config-discord - Discord settings",
        "",
        "Commands:",
        "  /config-edit      - Open config in editor",
        "  /config-reset     - Reset to defaults",
      ];

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  // Show raw config
  pi.registerCommand("config-show", {
    description: "Show raw config file contents",
    handler: async (_args, ctx) => {
      const cfg = config.get();
      const json = JSON.stringify(cfg, null, 2);
      
      ctx.ui?.notify?.(
        [
          "📄 Config File Contents:",
          "────────────────────────",
          json.slice(0, 1000) + (json.length > 1000 ? "\n..." : ""),
        ].join("\n"),
        "info"
      );
    },
  });

  // Ollama config
  pi.registerCommand("config-ollama", {
    description: "Show Ollama configuration",
    handler: async (_args, ctx) => {
      const ollama = config.get("ollama") || {};
      
      ctx.ui?.notify?.(
        [
          "🤖 Ollama Configuration",
          "────────────────────────",
          `Base URL: ${ollama.baseUrl || "http://localhost:11434"}`,
          `Cloud URL: ${ollama.cloudUrl || "https://ollama.com/api"}`,
          `API Key: ${ollama.apiKey ? "••••" + ollama.apiKey.slice(-4) : "Not set"}`,
          `Custom Models: ${ollama.customModels?.length || 0}`,
          "",
          "To change:",
          "  Edit ~/.0xkobold/config.json",
          "  Or use: /ollama-config",
        ].join("\n"),
        "info"
      );
    },
  });

  // Gateway config
  pi.registerCommand("config-gateway", {
    description: "Show Gateway configuration",
    handler: async (_args, ctx) => {
      const gateway = config.get("gateway") || {};
      
      ctx.ui?.notify?.(
        [
          "🌐 Gateway Configuration",
          "────────────────────────",
          `Port: ${gateway.port || 18789}`,
          `Host: ${gateway.host || "127.0.0.1"}`,
          `Auto-start: ${gateway.autoStart ?? true}`,
          `Persist agents: ${gateway.persistAgents ?? true}`,
          "",
          "To change:",
          "  Edit ~/.0xkobold/config.json",
        ].join("\n"),
        "info"
      );
    },
  });

  // Discord config (safe version - no token shown)
  pi.registerCommand("config-discord", {
    description: "Show Discord configuration (safe)",
    handler: async (_args, ctx) => {
      const discord = config.get("discord") || {};
      
      ctx.ui?.notify?.(
        [
          "💬 Discord Configuration",
          "────────────────────────",
          `Enabled: ${discord.enabled ? "✅ Yes" : "❌ No"}`,
          `Token: ${discord.token ? "✅ Configured" : "❌ Not set"}`,
          `Auto-reply: ${discord.autoReply ?? true}`,
          "",
          "To configure:",
          "  Edit ~/.0xkobold/config.json",
          '  Add: { "discord": { "token": "YOUR_TOKEN" } }',
        ].join("\n"),
        "info"
      );
    },
  });

  // Reset config
  pi.registerCommand("config-reset", {
    description: "Reset configuration to defaults",
    handler: async (_args, ctx) => {
      ctx.ui?.notify?.(
        "⚠️ This will reset ALL settings to defaults. Continue?",
        "warning"
      );
      
      // Note: In a real implementation, you'd prompt for confirmation
      // For now, just show instructions
      ctx.ui?.notify?.(
        [
          "To reset config:",
          "  rm ~/.0xkobold/config.json",
          "  /reload",
          "",
          "Or manually edit the file.",
        ].join("\n"),
        "info"
      );
    },
  });

  console.log("[Config] Commands: /config, /config-show, /config-ollama, /config-gateway, /config-discord");
}
