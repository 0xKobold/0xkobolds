/**
 * 0xKobold - PI Framework Architecture
 *
 * Main entry point using @mariozechner/pi-coding-agent
 * - Agent-based architecture
 * - Extension system
 * - Graceful shutdown handling
 *
 * Extension Loading Strategy:
 * - When running from source (development): loads .ts files from src/
 * - When running from dist (production/global): loads .js files from dist/src/
 * - This allows `bun link` global installs to work correctly
 */

import {
  main as piMain,
} from '@mariozechner/pi-coding-agent';
import { fileURLToPath } from 'url';
import { resolve, dirname, join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

// Detect if we're running from dist/ or src/
// If __dirname contains 'dist/src', we're running compiled code
const isRunningFromDist = __dirname.includes('dist');
// For dist: __dirname is .../dist/src, packageRoot is .../dist
// So we just need src/extensions/core from packageRoot
const extensionDir = isRunningFromDist 
  ? join(packageRoot, 'src/extensions/core')  // Production: .js files (packageRoot is already dist/)
  : join(packageRoot, 'src/extensions/core');  // Development: .ts files
const extensionExt = isRunningFromDist ? '.js' : '.ts';

// Use 0xKobold directory for pi-coding-agent data (sessions, settings, auth)
// This keeps everything in ~/.0xkobold instead of ~/.pi
process.env.PI_CODING_AGENT_DIR = process.env.PI_CODING_AGENT_DIR || resolve(homedir(), '.0xkobold');

// Disable pi-coding-agent's built-in update notifications
// (we manage our own updates via self-update-extension)
process.env.PI_SKIP_VERSION_CHECK = process.env.PI_SKIP_VERSION_CHECK || '1';

// Helper to resolve extension paths
function ext(name: string): string {
  // Handle subdirectory paths like 'context-pruning/extension'
  if (name.includes('/')) {
    return resolve(extensionDir, name) + extensionExt;
  }
  return resolve(extensionDir, name + extensionExt);
}

// Verify extensions exist (for debugging)
function verifyExtensions(): string[] {
  const extensions: string[] = [
    // Infrastructure
    '--extension', ext('ollama-provider-extension'),
    '--extension', ext('ollama-cloud-extension'),
    '--extension', ext('ollama-router-extension'),
    '--extension', ext('session-bridge-extension'),
    
    // Core Features
    '--extension', ext('persona-loader-extension'),
    '--extension', ext('context-aware-extension'),
    '--extension', ext('onboarding-extension'),
    '--extension', ext('mode-manager-extension'),
    '--extension', ext('questionnaire-extension'),
    '--extension', ext('session-name-extension'),
    '--extension', ext('handoff-extension'),
    '--extension', ext('pi-notify-extension'),
    '--extension', ext('env-loader-extension'),
    '--extension', ext('heartbeat-extension'),
    '--extension', ext('discord-channel-extension'),
    '--extension', ext('task-manager-extension'),
    // Context management (OpenClaw-style)
    '--extension', ext('context-pruning/extension'),
    '--extension', ext('compaction-safeguard'),
    
    // Multi-Channel
    '--extension', ext('multi-channel-extension'),
    '--extension', ext('discord-extension'),
    
    // Safety extensions (pi-mono)
    '--extension', ext('protected-paths'),
    '--extension', ext('confirm-destructive'),
    '--extension', ext('dirty-repo-guard'),
    '--extension', ext('git-checkpoint'),

    // Integrations
    '--extension', ext('mcp-extension'),
    '--extension', ext('gateway-extension'),
    '--extension', ext('agent-registry-extension'),
    '--extension', ext('websearch-extension'),
    // Note: pi-coding-agent updates disabled - user manages dependencies manually
    // '--extension', ext('update-extension'),
    // Self-update for 0xKobold only (shows in dev mode)
    '--extension', ext('self-update-extension'),
  ];

  // Check that extensions exist
  const testExt = ext('ollama-provider-extension');
  if (!existsSync(testExt)) {
    console.error(`⚠️  Warning: Extensions not found at ${extensionDir}`);
    console.error(`   Expected: ${testExt}`);
    console.error(`   Running from: ${isRunningFromDist ? 'dist (production)' : 'src (development)'}`);
    console.error(`   Package root: ${packageRoot}`);
  } else {
    // Count valid extensions
    let validCount = 0;
    for (let i = 1; i < extensions.length; i += 2) {
      if (existsSync(extensions[i])) validCount++;
    }
    console.log(`   Loaded ${validCount} extensions from ${isRunningFromDist ? 'dist' : 'src'}`);
  }

  return extensions;
}

async function main(): Promise<void> {
  // Check if we should run in CLI mode (with args) or programmatic mode
  const args = process.argv.slice(2);
  // TUI mode: no args, or 'tui' command, or '--local' flag
  const isTuiMode = args.length === 0 || args.includes('tui') || args.includes('--local');

  // Check for --local flag to enable per-project mode
  const localMode = args.includes('--local');
  if (localMode) {
    // Set local mode env var for extensions to detect
    process.env.KOBOLD_LOCAL_MODE = 'true';
    console.log('🐉 0xKobold starting in LOCAL mode...');
    console.log(`   Project: ${process.cwd()}`);
    console.log(`   Extensions: ${isRunningFromDist ? 'production' : 'development'}`);
  } else {
    console.log('🐉 0xKobold starting with PI Framework...');
    if (isRunningFromDist) {
      console.log('   Mode: Production (from dist)');
    } else {
      console.log('   Mode: Development (from source)');
    }
  }

  // If not in TUI mode, pass through to pi-coding-agent CLI
  if (!isTuiMode) {
    return piMain(args);
  }

  // TUI Mode: Load with all extensions
  const extensions = verifyExtensions();
  
  // Build argv for pi-coding-agent: [node, script, ...extensions]
  // We must modify process.argv because pi-coding-agent reads it directly
  const originalArgv = process.argv;
  process.argv = [originalArgv[0], originalArgv[1], ...extensions];
  
  console.log(''); // newline before pi-coding-agent starts
  
  try {
    return await piMain(extensions);
  } finally {
    // Restore original argv
    process.argv = originalArgv;
  }
}

// Run if this is the main module
if (import.meta.main) {
  main();
}

export { main };
