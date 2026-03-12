/**
 * Pi-Framework Configuration - Testing Local Packages
 * 
 * Tests @0xkobold/pi-wallet, @0xkobold/pi-erc8004, @0xkobold/pi-ollama
 * as standalone packages in the 0xKobold project
 */

interface Config {
  ui?: 'tui' | 'cli';
  extensions?: string[];
  keybindings?: Record<string, string>;
  settings?: Record<string, unknown>;
}

export const config: Config = {
  ui: 'tui',
  
  extensions: [
    // Test our local packages (relative paths)
    '../packages/pi-wallet/dist/index.js',     // CDP Agentic Wallet + x402
    '../packages/pi-erc8004/dist/index.js',  // ERC-8004 identity + reputation
    '../packages/pi-ollama/dist/index.js',     // Ollama with /api/show
    
    // Core extensions (existing)
    '../src/extensions/core/heartbeat-extension.ts',
    '../src/extensions/core/obsidian-bridge-extension.ts',
  ],
  
  keybindings: {
    'wallet.status': 'Alt+W',
    'erc8004.status': 'Alt+E',
    'ollama.status': 'Alt+O',
  },
  
  settings: {
    // Wallet settings
    'wallet.defaultChain': 'sepolia',
    'wallet.requireConfirmation': true,
    
    // ERC-8004 settings
    'erc8004.defaultChain': 'sepolia',
    
    // Ollama settings
    'ollama.baseUrl': 'http://localhost:11434',
    'ollama.defaultModel': 'llama3.1',
  },
};

export default config;
