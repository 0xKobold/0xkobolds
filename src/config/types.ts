/**
 * Kobold Configuration Types
 * 
 * Similar to koclaw/openclaw's config system but tailored for 0xKobold.
 * Supports JSON5 config file at ~/.config/kobold/kobold.json
 */

// ============================================================================
// Meta
// ============================================================================

export type MetaConfig = {
  version?: string;
  lastTouchedAt?: string | null;
  description?: string;
};

// ============================================================================
// Agents
// ============================================================================

export type AgentHeartbeatConfig = {
  enabled?: boolean;
  every?: string; // Duration like "30m", "1h", "2h30m"
  prompt?: string;
  ackMaxChars?: number;
  activeHours?: {
    start: string; // "09:00"
    end: string;   // "22:00"
    timezone?: string;
  } | null;
  lightContext?: boolean;
  includeReasoning?: boolean;
};

export type AgentContextPruningConfig = {
  mode?: "off" | "cache-ttl";
  ttl?: string;
  keepLastAssistants?: number;
  softTrimRatio?: number;
  hardClearRatio?: number;
};

export type AgentConfig = {
  id: string;
  name?: string;
  model?: string;
  workspace?: string;
  skills?: string[];
  default?: boolean;
  heartbeat?: AgentHeartbeatConfig;
  contextPruning?: AgentContextPruningConfig;
  thinkingDefault?: string;
  verboseDefault?: string;
  timeoutSeconds?: number;
};

export type AgentsConfig = {
  defaults: {
    name?: string;
    model?: string;
    workspace?: string;
    heartbeat?: AgentHeartbeatConfig;
    contextPruning?: AgentContextPruningConfig;
    thinkingDefault?: string;
    verboseDefault?: string;
    timeoutSeconds?: number;
  };
  list?: AgentConfig[];
};

// ============================================================================
// Models
// ============================================================================

export type ModelEntryConfig = {
  alias?: string;
  streaming?: boolean;
  params?: Record<string, unknown>;
};

export type ModelsConfig = {
  catalog?: Record<string, ModelEntryConfig>;
  envVarPriority?: string[];
};

// ============================================================================
// Memory
// ============================================================================

export type MemorySearchConfig = {
  enabled?: boolean;
  vectorStore?: string;
  dimensions?: number;
};

export type MemoryConfig = {
  enabled?: boolean;
  backend?: "sqlite" | "json" | "memory";
  dbPath?: string;
  compressionThreshold?: number;
  search?: MemorySearchConfig;
};

// ============================================================================
// Extensions
// ============================================================================

export type ExtensionSettings = {
  heartbeat?: {
    autoInit?: boolean;
    createTemplate?: boolean;
  };
  gateway?: {
    port?: number;
    host?: string;
    cors?: {
      origins?: string[];
    };
  };
  mcp?: {
    autoDiscover?: boolean;
    servers?: string[];
  };
};

export type ExtensionsConfig = {
  enabled?: string[];
  settings?: ExtensionSettings;
};

// ============================================================================
// Discord
// ============================================================================

export type DiscordChannelConfig = {
  id?: string | null;
  alertOnError?: boolean;
};

export type DiscordConfig = {
  enabled?: boolean;
  token?: string;
  autoReply?: boolean;
  dmPolicy?: "allow" | "block" | "whitelist";
  dmWhitelist?: string[];
  typingIndicator?: boolean;
  presence?: {
    status?: "online" | "idle" | "dnd" | "invisible";
    activity?: string;
  };
  channels?: {
    notify?: DiscordChannelConfig;
  };
};

// ============================================================================
// Gateway
// ============================================================================

export type GatewayConfig = {
  enabled?: boolean;
  port?: number;
  host?: string;
  heartbeat?: {
    enabled?: boolean;
    intervalSeconds?: number;
  };
  cors?: {
    enabled?: boolean;
    origins?: string[];
  };
};

// ============================================================================
// Skills
// ============================================================================

export type SkillsConfig = {
  paths?: string[];
  autoLoad?: string[];
};

// ============================================================================
// Session
// ============================================================================

export type SessionBackupConfig = {
  enabled?: boolean;
  retention?: string;
  maxBackups?: number;
};

export type SessionConfig = {
  storageDir?: string;
  autoSave?: boolean;
  maxSize?: string | number;
  backup?: SessionBackupConfig;
};

// ============================================================================
// Update
// ============================================================================

export type UpdateConfig = {
  checkOnStartup?: boolean;
  autoInstall?: boolean;
  channel?: "stable" | "beta" | "dev";
};

// ============================================================================
// CLI
// ============================================================================

export type CliConfig = {
  keybindings?: Record<string, string>;
  theme?: string;
  confirmDestructive?: boolean;
};

// ============================================================================
// Main Config
// ============================================================================

export type KoboldConfig = {
  meta?: MetaConfig;
  agents?: AgentsConfig;
  models?: ModelsConfig;
  memory?: MemoryConfig;
  extensions?: ExtensionsConfig;
  discord?: DiscordConfig;
  gateway?: GatewayConfig;
  skills?: SkillsConfig;
  session?: SessionConfig;
  update?: UpdateConfig;
  env?: Record<string, string>;
  cli?: CliConfig;
  // Provider configs for auth profiles
  anthropic?: {
    apiKey?: string;
    baseUrl?: string;
  };
  openai?: {
    apiKey?: string;
    baseUrl?: string;
  };
  ollama?: {
    apiKey?: string;
    baseUrl?: string;
    host?: string;
  };
};

export type ConfigValidationIssue = {
  path: string;
  message: string;
};

export type ConfigFileSnapshot = {
  path: string;
  exists: boolean;
  raw: string | null;
  parsed: unknown;
  resolved: KoboldConfig;
  valid: boolean;
  config: KoboldConfig;
  issues: ConfigValidationIssue[];
};
