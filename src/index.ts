/**
 * 0xKobold - PI Framework Architecture
 *
 * Main entry point using @mariozechner/pi-coding-agent
 * - Agent-based architecture
 * - Extension system
 * - Graceful shutdown handling
 */

import {
  main as piMain,
} from '@mariozechner/pi-coding-agent';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

// Use 0xKobold directory for pi-coding-agent data (sessions, settings, auth)
// This keeps everything in ~/.0xkobold instead of ~/.pi
process.env.PI_CODING_AGENT_DIR = process.env.PI_CODING_AGENT_DIR || resolve(homedir(), '.0xkobold');

async function main(): Promise<void> {
  // Check if we should run in CLI mode (with args) or programmatic mode
  const args = process.argv.slice(2);

  // If there are CLI arguments, use the pi-coding-agent main
  if (args.length > 0) {
    return piMain(args);
  }

  // Otherwise run in interactive TUI mode using pi-coding-agent's built-in TUI
  console.log('🐉 0xKobold starting with PI Framework...\n');

  // Launch pi-coding-agent's built-in TUI with all 0xKobold extensions
  // Extensions are loaded in order: infrastructure first, then features, then integrations
  // Use absolute paths so extensions load correctly regardless of cwd
  return piMain([
    // Infrastructure
    '--extension', resolve(packageRoot, 'src/extensions/core/ollama-provider-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/session-bridge-extension.ts'),
    
    // Core Features
    '--extension', resolve(packageRoot, 'src/extensions/core/persona-loader-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/context-aware-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/onboarding-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/mode-manager-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/questionnaire-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/session-name-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/handoff-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/pi-notify-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/env-loader-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/heartbeat-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/discord-channel-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/task-manager-extension.ts'),
    // Context management (OpenClaw-style)
    '--extension', resolve(packageRoot, 'src/extensions/core/context-pruning/extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/compaction-safeguard.ts'),
    // Note: pi-coding-agent has built-in compaction via /compact command
    
    // Multi-Channel
    '--extension', resolve(packageRoot, 'src/extensions/core/multi-channel-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/discord-extension.ts'),
    
    // Safety extensions (pi-mono)
    '--extension', resolve(packageRoot, 'src/extensions/core/protected-paths.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/confirm-destructive.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/dirty-repo-guard.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/git-checkpoint.ts'),

    // Integrations
    '--extension', resolve(packageRoot, 'src/extensions/core/mcp-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/gateway-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/agent-registry-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/websearch-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/update-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/self-update-extension.ts'),
  ]);
}

// Run if this is the main module
if (import.meta.main) {
  main();
}

export { main };
