/**
 * Environment CLI Extension
 * 
 * Registers Environment subcommands under 0xkobold CLI
 * 
 * Secret Redaction:
 * - Automatically detects secret keys ( TOKEN, KEY, SECRET, PASSWORD, etc.)
 * - Masks values like "sk-abc123***xyz" (shows first/last 4 chars only)
 * - Use --show-secrets flag to reveal actual values
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".0xkobold", "config");

/** Patterns that indicate a secret key */
const SECRET_KEY_PATTERNS = [
  /token/i,
  /password/i,
  /secret/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private/i,
  /webhook[_-]?url/i,
];

/** Environment variable names that are known secrets */
const SECRET_ENV_NAMES = [
  'DISCORD_BOT_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'LLM_API_KEY',
  'KOBOLD_REMOTE_TOKEN',
  'KOBOLD_API_KEY',
  'SOPS_AGE_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'GITHUB_TOKEN',
  'GITLAB_TOKEN',
  'SLACK_TOKEN',
  'STRIPE_SECRET_KEY',
  'JWT_SECRET',
  'SESSION_SECRET',
  'COOKIE_SECRET',
];

/**
 * Check if a key looks like it could be a secret
 */
function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Check if an environment variable name is a known secret
 */
function isSecretEnvVar(name: string): boolean {
  return SECRET_ENV_NAMES.some(secret => 
    name.toUpperCase() === secret || 
    name.toUpperCase().startsWith(secret + '_')
  );
}

/**
 * Redact a secret value, showing only first/last 4 chars
 * e.g., "sk-abc123***xyz" -> "sk-a************xyz"
 */
function redactValue(value: string, visibleChars = 4): string {
  if (!value || value.length <= visibleChars * 2) {
    return '<redacted>';
  }
  
  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  const middleLength = value.length - (visibleChars * 2);
  return `${start}${'•'.repeat(Math.min(middleLength, 8))}${end}`;
}

/**
 * Check if a value looks like a token/key
 */
function looksLikeToken(value: string): boolean {
  const tokenPatterns = [
    /^sk-/, /^pk_/, /^sk_/, /^ghp_/, /^gho_/, /^xoxb-/, /^xoxp-/, /^bot/,
    /^eyJ/, /^Bearer /, /^Basic /,
    /[a-f0-9]{32,}/i, // Hex tokens
  ];
  
  return value.length > 20 && tokenPatterns.some(p => p.test(value));
}

/**
 * Format an env var value with optional redaction
 */
function formatEnvValue(key: string, value: string, showSecrets: boolean): string {
  if (!value) return '<not set>';
  
  if (showSecrets) return value;
  
  // Check if this is a secret
  const isSecret = isSecretKey(key) || isSecretEnvVar(key) || looksLikeToken(value);
  
  if (isSecret) {
    return redactValue(value, 4);
  }
  
  return value;
}

/**
 * Redact secrets in .env file content
 */
function redactEnvFile(content: string, showSecrets: boolean): string {
  if (showSecrets) return content;
  
  return content.split('\n').map(line => {
    // Skip comments and empty lines
    if (!line.trim() || line.startsWith('#')) return line;
    
    // Match KEY=VALUE patterns
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return line;
    
    const [, key, rawValue] = match;
    
    // Strip quotes if present
    const value = rawValue.replace(/^["']|["']$/g, '');
    
    // Check if this is a secret
    const isSecret = isSecretKey(key) || isSecretEnvVar(key);
    
    if (isSecret && value) {
      return `${key}=${redactValue(value, 4)}`;
    }
    
    return line;
  }).join('\n');
}

export function registerEnvCli(program: Command): void {
  const env = program
    .command("env")
    .description("Environment and secrets management");

  env
    .command("status")
    .description("Show environment status")
    .option("--show-secrets", "Reveal secret values (careful!)")
    .action(async (opts) => {
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
        const displayValue = process.env[v] 
          ? formatEnvValue(v, process.env[v]!, opts.showSecrets)
          : null;
        const status = set 
          ? (opts.showSecrets ? `=${displayValue}` : `: ${displayValue}`)
          : " (not set)";
        console.log(`  ${set ? "✅" : "❌"} ${v}${status}`);
      });
      
      if (!opts.showSecrets) {
        console.log("\n🛡️  Secrets are redacted. Use --show-secrets to reveal (careful!)");
      }
      
      // Check Discord token status
      if (process.env.DISCORD_BOT_TOKEN) {
        console.log("\n🟢 Discord: Configured");
      } else {
        console.log("\n🔴 Discord: Not configured");
      }
    });

  env
    .command("show")
    .description("Show environment variables (secrets redacted by default)")
    .option("--show-secrets", "Reveal secret values (careful!)")
    .option("--file", "Show entire .env file content")
    .action(async (opts) => {
      if (opts.file) {
        const envPath = join(CONFIG_DIR, ".env");
        if (!existsSync(envPath)) {
          console.log("⚠️  No .env file found");
          return;
        }
        
        console.log("📄 .env file contents");
        console.log("════════════════════\n");
        
        const content = readFileSync(envPath, "utf-8");
        const redacted = redactEnvFile(content, opts.showSecrets);
        console.log(redacted);
        
        if (!opts.showSecrets && content !== redacted) {
          console.log("\n🛡️  Some values are redacted. Use --show-secrets to reveal (careful!)");
        }
        return;
      }
      
      console.log("📊 Environment Variables");
      console.log(opts.showSecrets 
        ? "⚠️  WARNING: Secrets are visible!\n" 
        : "🛡️  (Secrets automatically redacted)\n");
      console.log("══════════════════════════════════\n");
      
      // Get all env vars sorted
      const sortedVars = Object.keys(process.env).sort();
      
      // Known safe vars to always show first
      const safeVars = [
        "NODE_ENV",
        "GATEWAY_PORT",
        "KOBOLD_GATEWAY_HOST",
        "KOBOLD_GATEWAY_PORT",
        "DISCORD_NOTIFY_CHANNEL_ID",
      ];
      
      // Show known safe vars
      const shown = new Set<string>();
      for (const v of safeVars) {
        const val = process.env[v];
        if (val !== undefined) {
          console.log(`${v}=${val}`);
          shown.add(v);
        }
      }
      
      // Show other vars (redacted if secret)
      const otherVars = sortedVars.filter(v => !shown.has(v) && !v.startsWith('_'));
      if (otherVars.length > 0) {
        console.log("\n# Other variables:");
        for (const v of otherVars) {
          const val = process.env[v] || '<not set>';
          const display = formatEnvValue(v, val, opts.showSecrets);
          console.log(`${v}=${display}`);
        }
      }
      
      if (!opts.showSecrets) {
        console.log("\n🛡️  Secrets are redacted. Use --show-secrets to reveal (careful!)");
      }
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
