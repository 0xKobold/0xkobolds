/**
 * Environment CLI Extension
 * 
 * Registers Environment subcommands under 0xkobold CLI
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".0xkobold", "config");

export function registerEnvCli(program: Command): void {
  const env = program
    .command("env")
    .description("Environment and secrets management");

  env
    .command("status")
    .description("Show environment status")
    .action(async () => {
      console.log("📁 Environment Status");
      console.log("═════════════════════\n");
      
      // Check config directory
      const configExists = existsSync(CONFIG_DIR);
      console.log(`${configExists ? "✅" : "❌"} Config directory: ${CONFIG_DIR}`);
      
      // Check .env file
      const envPath = join(CONFIG_DIR, ".env");
      const envExists = existsSync(envPath);
      console.log(`${envExists ? "✅" : "⚠️"} .env file: ${envExists ? "exists" : "not found"}`);
      
      // Check SOPS secrets
      const secretsPath = join(CONFIG_DIR, "secrets.enc.json");
      const secretsExist = existsSync(secretsPath);
      console.log(`${secretsExist ? "✅" : "⚠️"} SOPS secrets: ${secretsExist ? "exists" : "not found"}`);
      
      // Check environment variables
      console.log("\nEnvironment Variables:");
      const vars = ["DISCORD_BOT_TOKEN", "DISCORD_NOTIFY_CHANNEL_ID", "NODE_ENV"];
      vars.forEach(v => {
        const set = !!process.env[v];
        console.log(`  ${set ? "✅" : "❌"} ${v}${set ? "" : " (not set)"}`);
      });
      
      // Check Discord token (masked)
      if (process.env.DISCORD_BOT_TOKEN) {
        console.log("\n🟢 Discord: Configured");
      } else {
        console.log("\n🔴 Discord: Not configured");
      }
    });

  env
    .command("show")
    .description("Show environment variables (safe mode)")
    .action(async () => {
      console.log("📊 Environment Variables (Safe View)");
      console.log("══════════════════════════════════\n");
      
      const vars = [
        "NODE_ENV",
        "GATEWAY_PORT",
        "DISCORD_NOTIFY_CHANNEL_ID",
      ];
      
      vars.forEach(v => {
        const val = process.env[v];
        if (val) {
          console.log(`${v}=${val}`);
        } else {
          console.log(`${v}=<not set>`);
        }
      });
      
      console.log("\nDISCORD_BOT_TOKEN=<hidden>");
    });

  env
    .command("secrets")
    .description("Manage encrypted secrets")
    .action(async () => {
      console.log("🔐 Secrets Management");
      console.log("═══════════════════\n");
      
      const secretsPath = join(CONFIG_DIR, "secrets.enc.json");
      
      if (!existsSync(secretsPath)) {
        console.log("No secrets file found.");
        console.log("\nTo initialize SOPS:");
        console.log("  1. Install SOPS: https://github.com/getsops/sops#11-installation");
        console.log("  2. Create age key: age-keygen -o ~/.config/sops/age/keys.txt");
        console.log(`  3. Create secrets: sops ${secretsPath}`);
        return;
      }
      
      console.log("✅ Secrets file exists");
      console.log(`   Path: ${secretsPath}`);
      console.log("\nTo edit secrets:");
      console.log(`  sops ${secretsPath}`);
      console.log("\nTo decrypt:");
      console.log(`  sops -d ${secretsPath}`);
    });
}
