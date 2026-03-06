/**
 * Environment Loader Extension with SOPS Support
 * 
 * Loads configuration from encrypted files and environment variables.
 * Supports SOPS (Secrets OPerationS) for encrypted secrets.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

interface ConfigSource {
  name: string;
  path: string;
  encrypted: boolean;
  loaded: boolean;
}

interface SecretsVault {
  discord?: {
    botToken?: string;
    channelId?: string;
  };
  openai?: {
    apiKey?: string;
  };
  database?: {
    url?: string;
  };
  [key: string]: any;
}

const CONFIG_DIR = join(homedir(), ".0xkobold", "config");
const SECRETS_FILE = join(CONFIG_DIR, "secrets.enc.json");

export default function envLoaderExtension(pi: ExtensionAPI) {
  const loadedSources: ConfigSource[] = [];
  let secrets: SecretsVault = {};

  console.log("[EnvLoader] Initializing configuration system...");

  // ═══════════════════════════════════════════════════════════════
  // SECRETS MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Try to load SOPS-encrypted secrets
   */
  async function loadSopsSecrets(): Promise<{ success: boolean; secrets?: SecretsVault; error?: string }> {
    if (!existsSync(SECRETS_FILE)) {
      return { success: false, error: "No secrets file found" };
    }

    try {
      // Try SOPS decryption
      const proc = Bun.spawn(["sops", "-d", SECRETS_FILE], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        return { success: false, error: `SOPS failed: ${stderr}` };
      }

      const decrypted = await new Response(proc.stdout).text();
      const secrets = JSON.parse(decrypted);
      return { success: true, secrets };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Load plain .env file
   */
  function loadPlainEnv(): Record<string, string> {
    const envPath = join(CONFIG_DIR, ".env");
    const env: Record<string, string> = {};

    if (!existsSync(envPath)) {
      return env;
    }

    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        env[key] = value.replace(/^["']|["']$/g, ""); // Remove quotes
      }
    }

    return env;
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    console.log("[EnvLoader] Loading secrets and configuration...");

    // 1. Load SOPS-encrypted secrets (preferred)
    const sopsResult = await loadSopsSecrets();
    if (sopsResult.success) {
      secrets = sopsResult.secrets || {};
      loadedSources.push({
        name: "SOPS secrets.enc.json",
        path: SECRETS_FILE,
        encrypted: true,
        loaded: true,
      });

      // Set Discord token from secrets
      if (secrets.discord?.botToken) {
        process.env.DISCORD_BOT_TOKEN = secrets.discord.botToken;
      }
      if (secrets.discord?.channelId) {
        process.env.DISCORD_NOTIFY_CHANNEL_ID = secrets.discord.channelId;
      }

      console.log(`[EnvLoader] ✅ Loaded ${Object.keys(secrets).length} secret categories from SOPS`);
    } else {
      console.log(`[EnvLoader] ⚠️ SOPS not available: ${sopsResult.error}`);

      // 2. Fallback to plain .env
      const plainEnv = loadPlainEnv();
      if (Object.keys(plainEnv).length > 0) {
        for (const [key, value] of Object.entries(plainEnv)) {
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
        loadedSources.push({
          name: "Plain .env",
          path: join(CONFIG_DIR, ".env"),
          encrypted: false,
          loaded: true,
        });
        console.log(`[EnvLoader] ⚠️ Loaded ${Object.keys(plainEnv).length} vars from plain .env`);
      }
    }

    // Notify user of config status
    if (ctx.ui?.notify) {
      const discordStatus = process.env.DISCORD_BOT_TOKEN ? "✅" : "❌";
      ctx.ui.notify(
        `Config loaded: ${loadedSources.length} source(s)\nDiscord: ${discordStatus}`,
        "info"
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════════

  pi.registerCommand("env-status", {
    description: "Show configuration and secrets status",
    handler: async (_args, ctx) => {
      const lines = [
        "📁 Configuration Status",
        "",
        ...loadedSources.map(
          (s) => `${s.loaded ? "✅" : "❌"} ${s.name} ${s.encrypted ? "(encrypted)" : ""}`
        ),
        "",
        `Discord: ${process.env.DISCORD_BOT_TOKEN ? "✅ configured" : "❌ not set"}`,
        `SOPS vault: ${existsSync(SECRETS_FILE) ? "✅ exists" : "❌ not found"}`,
      ];

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("env-init", {
    description: "Initialize SOPS configuration",
    handler: async (_args, ctx) => {
      // Check if sops is installed
      try {
        const check = Bun.spawn(["which", "sops"], { stdout: "ignore", stderr: "ignore" });
        const exit = await check.exited;
        if (exit !== 0) {
          ctx.ui.notify(
            "❌ SOPS not installed.\n\nInstall: https://github.com/getsops/sops#11-installation",
            "error"
          );
          return;
        }
      } catch {
        ctx.ui.notify("❌ Cannot check SOPS installation", "error");
        return;
      }

      ctx.ui.notify(
        "📖 SOPS Setup Instructions:\n\n" +
        "1. Create age key:\n   age-keygen -o ~/.config/sops/age/keys.txt\n\n" +
        "2. Create secrets file:\n   sops ~/.0xkobold/config/secrets.enc.json\n\n" +
        "3. Add your secrets:\n   {\n     \"discord\": {\n       \"botToken\": \"your-token\"\n     }\n   }",
        "info"
      );
    },
  });

  console.log("[EnvLoader] Extension loaded");
}
