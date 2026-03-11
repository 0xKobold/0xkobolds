/**
 * Minimal Config for Testing
 * Loads only essential extensions (no heavy ones)
 */

import type { Config } from '@mariozechner/pi-coding-agent';

export const config: Config = {
  ui: 'cli', // Use CLI instead of TUI for faster startup
  
  extensions: [
    // Core only (removed: discord, cron, websearch, etc.)
    './src/config/unified-config.ts',
    './src/extensions/core/config-extension.ts',
    './src/extensions/core/ollama-extension.ts',
    './src/sessions/UnifiedSessionBridge.ts',
    './src/extensions/core/gateway-extension.ts',
    './src/extensions/core/agent-orchestrator-extension.ts',
    // Skip: discord, cron, notifications, websearch, etc.
  ],

  keybindings: {
    'ctrl+c': 'interrupt',
  },
};

export default config;
