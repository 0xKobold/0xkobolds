/**
 * Pi-Framework Configuration for 0xKobold
 *
 * Configures pi-coding-agent with 0xKobold extensions and settings
 * CLEAN CONFIG - Unified Sessions Architecture
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
  // Order matters: infrastructure first, then features, then integrations
  extensions: [
    // Infrastructure (load FIRST)
    './src/config/unified-config.ts',                    // UNIFIED: Config system (no-op, just types)
    './src/extensions/core/config-extension.ts',           // UNIFIED: /config commands
    './src/extensions/core/ollama-extension.ts',         // UNIFIED: Ollama (uses unified config)
    './src/sessions/UnifiedSessionBridge.ts',              // UNIFIED: Session management
    
    // Core Features
    './src/extensions/core/persona-loader-extension.ts', // Load identity files
    './src/extensions/core/onboarding-extension.ts',     // First-run setup
    './src/extensions/core/questionnaire-extension.ts', // Question/questionnaire tools
    './src/extensions/core/pi-notify-extension.ts',    // Native desktop notifications
    './src/extensions/core/task-manager-extension.ts',   // Task board and workflow
    './src/extensions/core/heartbeat-extension.ts',      // Koclaw-style heartbeat monitoring
    './src/extensions/core/auto-compact-on-error-extension.ts', // Auto-retry with compacted context
    
    // Multi-Channel
    './src/extensions/core/multi-channel-extension.ts', // Unified channel management
    './src/extensions/core/discord-extension.ts',       // Discord bot integration
    
    // Safety Extensions
    './src/extensions/core/protected-paths.ts',      // Block writes to sensitive paths
    './src/extensions/core/confirm-destructive.ts',  // Confirm clear/switch/fork
    './src/extensions/core/dirty-repo-guard.ts',     // Prevent losing uncommitted work
    './src/extensions/core/git-checkpoint.ts',       // Git stash checkpoints for fork

    // Integrations
    './src/extensions/core/mcp-extension.ts',            // Model Context Protocol support
    './src/extensions/core/gateway-extension.ts',          // WebSocket gateway (NOW WITH PERSISTENCE)
    './src/extensions/core/agent-registry-extension.ts',   // OpenClaw-style multi-agent
    './src/extensions/core/persistent-agents-extension.ts', // Agent persistence
    './src/extensions/core/websearch-extension.ts',        // Ollama web search
    './src/extensions/core/update-extension.ts',           // Framework update functionality
    './src/extensions/core/self-update-extension.ts',      // 0xKobold self-update
    './src/extensions/core/perennial-memory-extension.ts', // Long-term memory
    
    // Mode-Manager REMOVED - Plan/Build modes replaced by natural workflow
    // Context-aware REMOVED - Superseded by unified sessions
    // Session-bridge REMOVED - Superseded by unified sessions
    // Session-manager REMOVED - Superseded by unified sessions
  ],

  // Custom keybindings
  keybindings: {
    'ctrl+c': 'interrupt',
    'ctrl+d': 'shutdown',
    'ctrl+l': 'clear',
    'f1': 'help',
    'f2': 'toggle_tree',     // Was: toggle_mode (mode-manager removed)
    'ctrl+t': 'toggle_tree',
    'ctrl+n': 'new_chat',
    'ctrl+s': 'session_snapshot', // NEW: Create session snapshot
    'ctrl+r': 'resume_session',   // NEW: Resume suspended session
  },

  // 0xKobold-specific settings
  settings: {
    // Unified Sessions (NEW)
    '0xkobold.sessions.enabled': true,
    '0xkobold.sessions.dbPath': '~/.0xkobold/sessions.db',
    '0xkobold.sessions.autoResume': true,
    '0xkobold.sessions.resumeMaxAgeHours': 168,  // 1 week
    '0xkobold.sessions.snapshotInterval': 300000,  // 5 minutes
    
    // Gateway settings
    '0xkobold.gateway.port': 18789,
    '0xkobold.gateway.host': '127.0.0.1',
    
    // Discord settings
    '0xkobold.discord.enabled': true,
    '0xkobold.discord.autoReply': true,
    
    // Memory settings
    '0xkobold.memory.persist': true,
    '0xkobold.memory.dbPath': '~/.0xkobold/memory.db',
    '0xkobold.memory.unified': true, // NEW: Link memories to unified sessions
    
    // Agent settings
    '0xkobold.agents.workdir': '~/.0xkobold/agents',
    '0xkobold.agents.persist': true, // NEW: Agents survive restarts
    
    // Model settings
    '0xkobold.model.provider': 'ollama',
    '0xkobold.model.name': 'kimi-k2.5:cloud',
    '0xkobold.model.custom': [], // Add custom models here
    
    // Update settings
    '0xkobold.update.checkOnStartup': true,
    '0xkobold.update.autoInstall': true,
    
    // Heartbeat settings
    '0xkobold.heartbeat.enabled': true,
    '0xkobold.heartbeat.every': '30m',
    '0xkobold.heartbeat.ackMaxChars': 300,
  },
};

// Export type for use in other modules
export type KoboldConfig = typeof config;

// Note: Removed extensions
// - session-bridge-extension.ts → UnifiedSessionBridge.ts
// - session-manager-extension.ts → UnifiedSessionBridge.ts
// - mode-manager-extension.ts → REMOVED (use natural workflow instead)
// - context-aware-extension.ts → REMOVED (superseded by unified sessions)
// - session-name-extension.ts → REMOVED (integrated into unified sessions)
// - handoff-extension.ts → REMOVED (forking is in UnifiedSessionBridge)
export default config;
