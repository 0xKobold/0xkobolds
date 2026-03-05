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

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

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
    '--extension', resolve(packageRoot, 'src/extensions/core/session-manager-extension.ts'),
    
    // Core Features
    '--extension', resolve(packageRoot, 'src/extensions/core/persona-loader-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/context-aware-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/onboarding-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/mode-manager-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/task-manager-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/session-pruning-extension.ts'),
    
    // Multi-Channel
    '--extension', resolve(packageRoot, 'src/extensions/core/multi-channel-extension.ts'),
    '--extension', resolve(packageRoot, 'src/extensions/core/discord-extension.ts'),
    
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
