#!/usr/bin/env node
/**
 * Doctor Command - v0.4.5
 *
 * Diagnostic tool to check system health and suggest fixes
 */

import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  fix?: string;
}

export const doctorCommand = new Command("doctor")
  .description("Run system diagnostics and health checks")
  .option("-f, --fix", "Attempt to auto-fix issues")
  .action(async (options) => {
    const results: CheckResult[] = [];
    
    console.log("🔍 0xKobold System Doctor\n");
    
    // Check 1: Bun installed
    try {
      execSync("which bun", { stdio: "pipe" });
      const version = execSync("bun --version", { encoding: "utf8" }).trim();
      results.push({ name: "Bun Runtime", status: "ok", message: `Found ${version}` });
    } catch {
      results.push({
        name: "Bun Runtime",
        status: "error",
        message: "Bun not found in PATH",
        fix: "Install Bun: curl -fsSL https://bun.sh/install | bash"
      });
    }
    
    // Check 2: 0xKobold installed
    try {
      const version = execSync("0xkobold --version 2>/dev/null || echo 'unknown'", { encoding: "utf8", shell: "bash" }).trim();
      results.push({ name: "0xKobold CLI", status: "ok", message: `Found ${version}` });
    } catch {
      results.push({
        name: "0xKobold CLI",
        status: "error",
        message: "0xkobold not in PATH",
        fix: "Install: bun install -g 0xkobold"
      });
    }
    
    // Check 3: Config directory exists
    const configDir = path.join(homedir(), ".0xkobold");
    if (fs.existsSync(configDir)) {
      results.push({ name: "Config Directory", status: "ok", message: `Found at ${configDir}` });
    } else {
      results.push({
        name: "Config Directory",
        status: "warn",
        message: "Not initialized",
        fix: "Run: 0xkobold init"
      });
    }
    
    // Check 4: Config file exists
    const configFile = path.join(configDir, "config.json");
    if (fs.existsSync(configFile)) {
      results.push({ name: "Config File", status: "ok", message: `Found at ${configFile}` });
      
      // Try to parse it
      try {
        const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
        if (config.identity?.default) {
          results.push({
            name: "Identity Config",
            status: "ok",
            message: `${config.identity.default} is default`
          });
        } else {
          results.push({
            name: "Identity Config",
            status: "warn",
            message: "No default identity set",
            fix: "Run: 0xkobold config set identity.default shalom"
          });
        }
      } catch {
        results.push({
          name: "Config File",
          status: "error",
          message: "config.json is invalid JSON",
          fix: "Run: 0xkobold init --force"
        });
      }
    } else {
      results.push({
        name: "Config File",
        status: "warn",
        message: "config.json not found",
        fix: "Run: 0xkobold init --quick"
      });
    }
    
    // Check 5: API Keys
    const envFile = path.join(configDir, ".env");
    const envExists = fs.existsSync(envFile);
    
    const envVars = process.env;
    const hasDiscord = !!envVars.DISCORD_BOT_TOKEN;
    const hasAnthropic = !!envVars.ANTHROPIC_API_KEY || !!envVars.CLOUD_API_KEY;
    
    if (hasDiscord && hasAnthropic) {
      results.push({ name: "API Keys", status: "ok", message: "Discord and LLM keys found" });
    } else if (envExists) {
      results.push({
        name: "API Keys",
        status: "warn",
        message: ".env file exists but keys not loaded",
        fix: "Add to ~/.bashrc: source ~/.0xkobold/.env"
      });
    } else {
      results.push({
        name: "API Keys",
        status: "error",
        message: "No API keys configured",
        fix: "Create ~/.0xkobold/.env with DISCORD_BOT_TOKEN and ANTHROPIC_API_KEY"
      });
    }
    
    // Check 6: systemd service
    const serviceExists = fs.existsSync("/etc/systemd/system/0xkobold.service");
    if (serviceExists) {
      results.push({ name: "Systemd Service", status: "ok", message: "Service file installed" });
      
      // Check if running
      try {
        const status = execSync("systemctl is-active 0xkobold", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
        if (status === "active") {
          results.push({ name: "Service Status", status: "ok", message: "Running" });
        } else {
          results.push({
            name: "Service Status",
            status: "warn",
            message: `Status: ${status}`,
            fix: "Run: sudo systemctl start 0xkobold"
          });
        }
      } catch {
        results.push({
          name: "Service Status",
          status: "warn",
          message: "Not running or not enabled",
          fix: "Run: sudo systemctl enable --now 0xkobold"
        });
      }
    } else {
      results.push({
        name: "Systemd Service",
        status: "warn",
        message: "Service file not installed",
        fix: "Run: 0xkobold system install"
      });
    }
    
    // Check 7: OpenClaw legacy
    const openclawDir = path.join(homedir(), ".openclaw");
    if (fs.existsSync(openclawDir)) {
      results.push({
        name: "OpenClaw Migration",
        status: "warn",
        message: "OpenClaw data found at ~/.openclaw",
        fix: "Run: 0xkobold migrate --live to migrate"
      });
    }
    
    // Display results
    console.log("\n📊 System Health Check\n");
    console.log("═══════════════════════════════════════════════════\n");
    
    const okCount = results.filter(r => r.status === "ok").length;
    const warnCount = results.filter(r => r.status === "warn").length;
    const errorCount = results.filter(r => r.status === "error").length;
    
    for (const result of results) {
      const icon = result.status === "ok" ? "✅" : result.status === "warn" ? "⚠️" : "❌";
      console.log(`${icon} ${result.name}`);
      console.log(`   ${result.message}`);
      if (result.fix) {
        console.log(`   🔧 Fix: ${result.fix}`);
      }
      console.log();
    }
    
    console.log("═══════════════════════════════════════════════════\n");
    console.log(`Summary: ${okCount} OK, ${warnCount} Warning, ${errorCount} Error\n`);
    
    // Auto-fix if requested
    if (options.fix && warnCount + errorCount > 0) {
      console.log("🛠️  Auto-fix suggestions:\n");
      for (const result of results) {
        if (result.fix) {
          console.log(`${result.name}:`);
          console.log(`  ${result.fix}`);
        }
      }
      console.log();
    }
    
    process.exit(errorCount > 0 ? 1 : 0);
  });
