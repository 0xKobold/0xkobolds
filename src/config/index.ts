/**
 * Config System
 *
 * Simplified configuration system with:
 * - JSON5 config files
 * - Environment variable substitution
 * - Zod schema validation
 * - OpenClaw config migration
 */

import { z } from 'zod';
import JSON5 from 'json5';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ============== Zod Schemas ==============

// Agent Configuration
export const AgentConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().default('Kobold'),
  model: z.string().default('ollama/llama3.2'),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().default(4096),
  capabilities: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

// Discord Configuration
export const DiscordConfigSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().optional(),
  clientId: z.string().optional(),
  guildId: z.string().optional(),
  dmPolicy: z.enum(['allow', 'block', 'whitelist']).default('allow'),
  dmWhitelist: z.array(z.string()).default([]),
  autoReply: z.boolean().default(true),
  typingIndicator: z.boolean().default(true),
  presence: z.object({
    status: z.enum(['online', 'idle', 'dnd', 'invisible']).default('online'),
    activity: z.string().optional(),
  }).default({}),
  channels: z.record(z.object({
    enabled: z.boolean().default(true),
    agentId: z.string().optional(),
    autoReply: z.boolean().optional(),
  })).default({}),
});

// Gateway Configuration
export const GatewayConfigSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().positive().default(18789),
  host: z.string().default('127.0.0.1'),
  token: z.string().optional(),
  password: z.string().optional(),
  cors: z.object({
    enabled: z.boolean().default(true),
    origins: z.array(z.string()).default(['*']),
  }).default({}),
});

// TUI Configuration
export const TUIConfigSchema = z.object({
  enabled: z.boolean().default(true),
  theme: z.enum(['dark', 'light', 'system']).default('dark'),
  showTimestamps: z.boolean().default(true),
  showAgentTree: z.boolean().default(true),
  autoConnect: z.boolean().default(true),
  keybindings: z.object({
    quit: z.string().default('C-c'),
    toggleTree: z.string().default('C-t'),
    clear: z.string().default('C-l'),
  }).default({}),
});

// Session Configuration
export const SessionConfigSchema = z.object({
  scope: z.enum(['global', 'per-sender', 'per-channel']).default('per-sender'),
  mainKey: z.string().default('main'),
  historyLimit: z.number().int().positive().default(100),
  contextWindow: z.number().int().positive().default(8192),
});

// Tools Configuration
export const ToolsConfigSchema = z.object({
  enabled: z.array(z.string()).default(['shell', 'file', 'web']),
  shell: z.object({
    allowedCommands: z.array(z.string()).default(['ls', 'cat', 'grep', 'find']),
    blockedCommands: z.array(z.string()).default(['rm -rf /', 'dd']),
    workingDirectory: z.string().optional(),
  }).default({}),
  file: z.object({
    allowPaths: z.array(z.string()).default(['~/.0xkobold/workspace']),
    blockPaths: z.array(z.string()).default(['~/.ssh', '~/.aws']),
  }).default({}),
  web: z.object({
    allowedDomains: z.array(z.string()).default([]),
    timeout: z.number().int().positive().default(30000),
  }).default({}),
});

// Get version from package.json for defaults
async function getPackageVersion(): Promise<string> {
  try {
    const packageJson = await Bun.file(new URL('../../package.json', import.meta.url)).json();
    return packageJson.version;
  } catch {
    return '1.0.0';
  }
}

// Main Config Schema
export const KoboldConfigSchema = z.object({
  version: z.string().default(await getPackageVersion()),
  agents: z.record(AgentConfigSchema).default({}),
  discord: DiscordConfigSchema.default({}),
  gateway: GatewayConfigSchema.default({}),
  tui: TUIConfigSchema.default({}),
  session: SessionConfigSchema.default({}),
  tools: ToolsConfigSchema.default({}),
  hooks: z.record(z.any()).default({}),
  plugins: z.record(z.any()).default({}),
});

// Type exports
export type KoboldConfig = z.infer<typeof KoboldConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
export type TUIConfig = z.infer<typeof TUIConfigSchema>;
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

// ============== Environment Substitution ==============

const ENV_VAR_PATTERN = /\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/gi;

export function substituteEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (match, braced, plain) => {
    const varName = braced ?? plain;
    const envValue = process.env[varName];
    if (envValue === undefined) {
      console.warn(`Warning: Environment variable ${varName} not found`);
      return match;
    }
    return envValue;
  });
}

export function deepSubstituteEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(deepSubstituteEnvVars);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepSubstituteEnvVars(value);
    }
    return result;
  }
  return obj;
}

// ============== Config Paths ==============

const CONFIG_DIR = join(homedir(), '.0xkobold');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json5');
const OPENCLAW_CONFIG_DIR = join(homedir(), '.openclaw');

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// ============== Config Loading ==============

export function loadConfigRaw(configPath?: string): unknown {
  const path = configPath ?? CONFIG_FILE;

  if (!existsSync(path)) {
    return {};
  }

  const content = readFileSync(path, 'utf-8');
  return JSON5.parse(content);
}

export function loadConfig(configPath?: string): KoboldConfig {
  const raw = loadConfigRaw(configPath);
  const withEnv = deepSubstituteEnvVars(raw);
  const result = KoboldConfigSchema.safeParse(withEnv);

  if (!result.success) {
    console.error('Config validation errors:');
    for (const error of result.error.errors) {
      console.error(`  ${error.path.join('.')}: ${error.message}`);
    }
    throw new Error('Invalid configuration');
  }

  return result.data;
}

export function loadConfigOrDefault(configPath?: string): KoboldConfig {
  try {
    return loadConfig(configPath);
  } catch {
    return KoboldConfigSchema.parse({});
  }
}

// ============== Config Saving ==============

export function saveConfig(config: KoboldConfig, configPath?: string): void {
  const path = configPath ?? CONFIG_FILE;
  ensureConfigDir();

  const content = JSON5.stringify(config, {
    space: 2,
    quote: '"',
  });

  writeFileSync(path, content, 'utf-8');
}

// ============== Default Config ==============

export function createDefaultConfig(): KoboldConfig {
  return KoboldConfigSchema.parse({
    version: '1.0.0',
    agents: {
      default: {
        name: 'Kobold',
        model: 'ollama/llama3.2',
        capabilities: ['chat', 'code', 'shell'],
      }
    },
    gateway: {
      enabled: true,
      port: 18789,
    },
    tui: {
      enabled: true,
      theme: 'dark',
    },
  });
}

export function initDefaultConfig(): void {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    const config = createDefaultConfig();
    saveConfig(config);
    console.log(`Created default config at ${CONFIG_FILE}`);
  }
}

// ============== OpenClaw Migration ==============

export interface MigrationResult {
  success: boolean;
  migrated: boolean;
  message: string;
  config?: KoboldConfig;
  errors?: string[];
}

export function detectOpenClawConfig(): boolean {
  const openclawConfigPath = join(OPENCLAW_CONFIG_DIR, 'config.json5');
  return existsSync(openclawConfigPath);
}

export function migrateFromOpenClaw(
  openclawPath: string = join(OPENCLAW_CONFIG_DIR, 'config.json5')
): MigrationResult {
  if (!existsSync(openclawPath)) {
    return {
      success: true,
      migrated: false,
      message: `No OpenClaw config found at ${openclawPath}`
    };
  }

  try {
    const raw = loadConfigRaw(openclawPath);
    const migrated = transformOpenClawConfig(raw);
    const validated = KoboldConfigSchema.safeParse(migrated);

    if (!validated.success) {
      return {
        success: false,
        migrated: false,
        message: 'Config validation failed',
        errors: validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }

    // Save migrated config
    saveConfig(validated.data);

    return {
      success: true,
      migrated: true,
      message: `Successfully migrated config from ${openclawPath}`,
      config: validated.data
    };
  } catch (err) {
    return {
      success: false,
      migrated: false,
      message: `Migration failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function transformOpenClawConfig(openclaw: Record<string, unknown>): Record<string, unknown> {
  const kobold: Record<string, unknown> = {
    version: '1.0.0-migrated',
  };

  // Migrate agents
  if (openclaw.agents && typeof openclaw.agents === 'object') {
    const agents: Record<string, unknown> = {};
    for (const [id, agent] of Object.entries(openclaw.agents)) {
      if (typeof agent === 'object' && agent !== null) {
        agents[id] = {
          name: (agent as Record<string, unknown>).name ?? id,
          model: (agent as Record<string, unknown>).model ?? 'ollama/llama3.2',
          systemPrompt: (agent as Record<string, unknown>).systemPrompt,
          temperature: (agent as Record<string, unknown>).temperature,
          maxTokens: (agent as Record<string, unknown>).maxTokens,
          capabilities: (agent as Record<string, unknown>).capabilities ?? [],
          tools: (agent as Record<string, unknown>).tools ?? [],
          enabled: (agent as Record<string, unknown>).enabled ?? true,
        };
      }
    }
    kobold.agents = agents;
  }

  // Migrate Discord config
  if (openclaw.channels && typeof openclaw.channels === 'object') {
    const channels = openclaw.channels as Record<string, unknown>;
    if (channels.discord && typeof channels.discord === 'object') {
      const discord = channels.discord as Record<string, unknown>;
      kobold.discord = {
        enabled: discord.enabled ?? false,
        token: discord.token,
        clientId: discord.clientId,
        guildId: discord.guildId,
        dmPolicy: discord.dmPolicy ?? 'allow',
        autoReply: discord.autoReply ?? true,
        typingIndicator: discord.typingIndicator ?? true,
        presence: discord.presence,
        channels: discord.channels,
      };
    }
  }

  // Migrate gateway config
  if (openclaw.gateway && typeof openclaw.gateway === 'object') {
    const gateway = openclaw.gateway as Record<string, unknown>;
    kobold.gateway = {
      enabled: gateway.enabled ?? true,
      port: gateway.port ?? 18789,
      host: gateway.host ?? '127.0.0.1',
      token: gateway.token,
      password: gateway.password,
      cors: gateway.cors,
    };
  }

  // Migrate session config
  if (openclaw.session && typeof openclaw.session === 'object') {
    const session = openclaw.session as Record<string, unknown>;
    kobold.session = {
      scope: session.scope ?? 'per-sender',
      mainKey: session.mainKey ?? 'main',
      historyLimit: session.historyLimit ?? 100,
      contextWindow: session.contextWindow ?? 8192,
    };
  }

  // Migrate tools config
  if (openclaw.tools && typeof openclaw.tools === 'object') {
    kobold.tools = openclaw.tools;
  }

  // Migrate hooks
  if (openclaw.hooks && typeof openclaw.hooks === 'object') {
    kobold.hooks = openclaw.hooks;
  }

  // Migrate plugins
  if (openclaw.plugins && typeof openclaw.plugins === 'object') {
    kobold.plugins = openclaw.plugins;
  }

  return kobold;
}

// ============== Config Helpers ==============

export function getAgentConfig(config: KoboldConfig, agentId?: string): AgentConfig {
  if (agentId && config.agents[agentId]) {
    return config.agents[agentId];
  }
  // Return first enabled agent or default
  const agents = Object.values(config.agents);
  return agents.find(a => a.enabled) ?? AgentConfigSchema.parse({});
}

export function getActiveAgents(config: KoboldConfig): Array<{ id: string; config: AgentConfig }> {
  return Object.entries(config.agents)
    .filter(([, agent]) => agent.enabled)
    .map(([id, config]) => ({ id, config }));
}

export function updateAgentConfig(
  config: KoboldConfig,
  agentId: string,
  updates: Partial<AgentConfig>
): KoboldConfig {
  const existing = config.agents[agentId] ?? AgentConfigSchema.parse({});
  return {
    ...config,
    agents: {
      ...config.agents,
      [agentId]: { ...existing, ...updates }
    }
  };
}
