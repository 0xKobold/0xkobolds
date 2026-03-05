/**
 * Pi-Framework Configuration for 0xKobold
 *
 * Configures pi-coding-agent with 0xKobold extensions and settings
 */

// Local Config type since it's not exported from pi-coding-agent
interface Config {
  ui?: 'tui' | 'cli';
  extensions?: string[];
  keybindings?: Record<string, string>;
  settings?: Record<string, unknown>;
}

export const config: Config = {
  // Use pi-tui for terminal UI
  ui: 'tui',

  // Load extensions (paths resolved from project root)
  // Order matters: provider should be first, then other extensions
  extensions: [
    './src/extensions/core/ollama-provider-extension.ts', // Register Ollama models
    './src/extensions/core/persona-loader-extension.ts', // Load identity files
    './src/extensions/core/onboarding-extension.ts', // First-run setup
    './src/extensions/core/mode-manager-extension.ts',    // Plan/Build mode switching
    './src/extensions/core/gateway-extension.ts',          // WebSocket gateway
    './src/extensions/core/update-extension.ts',           // Framework update functionality
    './src/extensions/core/self-update-extension.ts',        // 0xKobold self-update
  ],

  // Custom keybindings
  keybindings: {
    'ctrl+c': 'interrupt',
    'ctrl+d': 'shutdown',
    'ctrl+l': 'clear',
    'f1': 'help',
    'ctrl+t': 'toggle_tree',
    'ctrl+n': 'new_chat',
  },

  // 0xKobold-specific settings
  settings: {
    // Gateway settings
    '0xkobold.gateway.port': 18789,
    '0xkobold.gateway.host': '127.0.0.1',
    // Discord settings
    '0xkobold.discord.enabled': true,
    '0xkobold.discord.autoReply': true,
    // Memory settings
    '0xkobold.memory.persist': true,
    '0xkobold.memory.dbPath': '~/.0xkobold/memory.db',
    // Agent settings
    '0xkobold.agents.workdir': '~/.0xkobold/agents',
    // Model settings
    '0xkobold.model.provider': 'ollama',
    '0xkobold.model.name': 'kimi-k2.5:cloud',
    // Update settings
    '0xkobold.update.checkOnStartup': true,
    '0xkobold.update.autoInstall': true,
  },
};

// Export type for use in other modules
export type KoboldConfig = typeof config;
