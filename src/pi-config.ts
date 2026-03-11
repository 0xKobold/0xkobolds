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
    './src/extensions/core/memory-bootstrap-extension.ts', // 🧠 Auto-load memories on startup (CLAWS-style)
    './src/extensions/core/persona-loader-extension.ts', // Load identity files
    './src/extensions/core/onboarding-extension.ts',     // First-run setup
    './src/extensions/core/task-manager-extension.ts',   // Task board and workflow
    './src/extensions/core/heartbeat-extension.ts',      // Koclaw-style heartbeat monitoring
    './src/extensions/core/compaction-safeguard-v2.ts', // FIXED: Uses session_before_compact event
    
    // Multi-Channel
    './src/extensions/core/multi-channel-extension.ts', // Unified channel management
    './src/extensions/core/discord-extension.ts',       // Discord bot integration
    
    // 🐉 DRACONIC SYSTEMS (Superior agent management)
    './src/extensions/core/agent-orchestrator-extension.ts',  // Agent orchestration
    './src/extensions/core/gateway-extension.ts',            // WebSocket gateway
    './src/extensions/core/fileops-extension.ts',            // File operations
    './src/extensions/core/git-commit-extension.ts',       // Git commit helper
    './src/extensions/core/draconic-lair-extension.ts',      // Project workspaces
    './src/extensions/core/draconic-hoard-extension.ts',     // Code snippets

    // Safety Extensions (CONSOLIDATED into draconic-safety)
    './src/extensions/core/draconic-safety-extension.ts',  // 🛡️ Replaces: protected-paths, confirm-destructive, dirty-repo-guard, git-checkpoint

    // Developer Tools
    './src/extensions/core/extension-scaffold-extension.ts', // Scaffold new extensions
    './src/extensions/core/diagnostics-extension.ts',        // Telemetry and health monitoring

    // Tool Integrations
    './src/extensions/core/mcp-extension.ts',            // Model Context Protocol support
    // NOTE: Using gateway-extension.ts above
    // agent-registry-extension.ts REMOVED - file does not exist
    // persistent-agents-extension.ts REMOVED - file does not exist
    './src/extensions/core/websearch-enhanced-extension.ts',        // Ollama web search
    './src/extensions/core/update-extension.ts',           // Framework update functionality
    './src/extensions/core/self-update-extension.ts',      // 0xKobold self-update
    './src/extensions/core/perennial-memory-extension.ts', // Long-term memory
    './src/extensions/core/generative-agents-extension.ts', // 🧠 Memory stream, reflection, planning
    
    // Mode-Manager REMOVED - Plan/Build modes replaced by natural workflow
    // Context-aware REMOVED - Superseded by unified sessions
    // Session-bridge REMOVED - Superseded by unified sessions
    // Session-manager REMOVED - Superseded by unified sessions
    
    // 🐉 Community Extensions (PI Ecosystem Wrappers)
    './src/extensions/community/draconic-subagents-wrapper.ts',  // pi-subagents bridge
    './src/extensions/community/draconic-messenger-wrapper.ts',  // pi-messenger bridge
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
