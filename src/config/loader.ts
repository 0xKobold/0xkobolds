/**
 * Config loader for Kobold
 * 
 * Similar to koclaw/openclaw's config/loader.js
 * Loads and validates kobold.json config files.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { 
  getConfigPath, 
  getLocalConfigPath, 
  getDefaultConfigPath, 
  resolveUserPath 
} from "./paths.js";
import type { KoboldConfig, ConfigFileSnapshot, ConfigValidationIssue } from "./types.js";
// Default configuration
const DEFAULT_CONFIG: KoboldConfig = {
  meta: {
    version: "1.0.0",
    description: "Kobold AI Assistant",
  },
  agents: {
    defaults: {
      name: "Kobold",
      model: "ollama/kimi-k2.5:cloud",
      workspace: "./",
      heartbeat: {
        enabled: true,
        every: "30m",
        prompt: "Read HEARTBEAT.md if it exists. Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.",
        ackMaxChars: 300,
        activeHours: null,
        lightContext: true,
        includeReasoning: false,
      },
      contextPruning: {
        mode: "cache-ttl",
        ttl: "30m",
        keepLastAssistants: 5,
        softTrimRatio: 0.3,
        hardClearRatio: 0.8,
      },
      thinkingDefault: "medium",
      verboseDefault: "off",
      timeoutSeconds: 300,
    },
    list: [
      {
        id: "default",
        name: "Kobold",
        default: true,
        skills: ["code", "analysis", "planning"],
      },
    ],
  },
  models: {
    catalog: {},
    envVarPriority: ["KOBOLD_MODEL", "OLLAMA_MODEL"],
  },
  memory: {
    enabled: true,
    backend: "sqlite",
    dbPath: "~/.config/kobold/memory.db",
    compressionThreshold: 100,
    search: {
      enabled: true,
      vectorStore: "faiss",
      dimensions: 1536,
    },
  },
  extensions: {
    enabled: [
      "persona-loader",
      "context-aware",
      "heartbeat",
      "task-manager",
      "mcp",
      "gateway",
    ],
    settings: {
      heartbeat: {
        autoInit: true,
        createTemplate: true,
      },
      gateway: {
        port: 18789,
        host: "127.0.0.1",
        cors: {
          origins: ["http://localhost:3000", "http://localhost:5173"],
        },
      },
      mcp: {
        autoDiscover: true,
        servers: ["filesystem", "github"],
      },
    },
  },
  discord: {
    enabled: false,
    autoReply: true,
    channels: {
      notify: {
        id: null,
        alertOnError: true,
      },
    },
  },
  gateway: {
    enabled: true,
    port: 18789,
    host: "127.0.0.1",
    heartbeat: {
      enabled: true,
      intervalSeconds: 30,
    },
    cors: {
      enabled: true,
      origins: ["*"],
    },
  },
  skills: {
    paths: ["./skills", "~/.config/kobold/skills"],
    autoLoad: ["core", "coding", "git"],
  },
  session: {
    storageDir: "~/.config/kobold/sessions",
    autoSave: true,
    maxSize: "100mb",
    backup: {
      enabled: true,
      retention: "7d",
      maxBackups: 10,
    },
  },
  update: {
    checkOnStartup: true,
    autoInstall: false,
    channel: "stable",
  },
  env: {
    KOBOLD_LOG_LEVEL: "info",
    KOBOLD_TEMP_DIR: "~/.config/kobold/tmp",
  },
  cli: {
    keybindings: {
      "ctrl+c": "interrupt",
      "ctrl+d": "shutdown",
      "ctrl+l": "clear",
      "f1": "help",
      "f2": "toggle_mode",
      "ctrl+t": "toggle_tree",
      "ctrl+n": "new_chat",
    },
    theme: "default",
    confirmDestructive: true,
  },
};

// Config cache
let configCache: ConfigFileSnapshot | null = null;

/**
 * Parse JSON5 (allowing comments)
 */
export function parseConfigJson(raw: string): unknown {
  // Simple JSON5-like parser - strips comments and parses JSON
  const withoutComments = raw
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,(\s*[}\]])/g, "$1"); // Remove trailing commas
  
  return JSON.parse(withoutComments);
}

/**
 * Deep merge objects
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        (result[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else {
      result[key] = source[key]!;
    }
  }
  
  return result;
}

/**
 * Resolve environment variable references like ${VAR} or ${VAR:-default}
 */
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    const [varName, defaultVal] = expr.split(":-");
    const envValue = process.env[varName];
    if (envValue !== undefined) return envValue;
    if (defaultVal !== undefined) return defaultVal;
    return match; // Keep original if not found and no default
  });
}

/**
 * Process config to resolve paths and env vars
 */
function processConfig(config: KoboldConfig): KoboldConfig {
  const processed = JSON.parse(JSON.stringify(config)) as KoboldConfig;
  
  // Resolve paths
  if (processed.memory?.dbPath) {
    processed.memory.dbPath = resolveUserPath(processed.memory.dbPath);
  }
  if (processed.session?.storageDir) {
    processed.session.storageDir = resolveUserPath(processed.session.storageDir);
  }
  if (processed.skills?.paths) {
    processed.skills.paths = processed.skills.paths.map(resolveUserPath);
  }
  
  return processed;
}

/**
 * Validate config and return issues
 */
function validateConfig(config: KoboldConfig): ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  
  // Heartbeat validation
  if (config.agents?.defaults?.heartbeat?.every) {
    const every = config.agents.defaults.heartbeat.every;
    if (!/^\d+(m|h|s)$/.test(every) && !/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s?)?$/i.test(every)) {
      issues.push({
        path: "agents.defaults.heartbeat.every",
        message: `Invalid duration format: "${every}". Use like "30m", "1h", "2h30m"`,
      });
    }
  }
  
  // Gateway port validation
  if (config.gateway?.port) {
    if (config.gateway.port < 1024 || config.gateway.port > 65535) {
      if (config.gateway.port < 1 || config.gateway.port > 65535) {
        issues.push({
          path: "gateway.port",
          message: `Invalid port: ${config.gateway.port}. Must be 1-65535`,
        });
      }
    }
  }
  
  return issues;
}

/**
 * Load config from file
 */
export async function loadConfigFromFile(filePath: string): Promise<ConfigFileSnapshot> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = parseConfigJson(raw) as KoboldConfig;
    const resolved = deepMerge(DEFAULT_CONFIG, parsed);
    const issues = validateConfig(resolved);
    const config = processConfig(resolved);
    
    return {
      path: filePath,
      exists: true,
      raw,
      parsed,
      resolved,
      valid: issues.length === 0,
      config,
      issues,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    return {
      path: filePath,
      exists: false,
      raw: null,
      parsed: null,
      resolved: DEFAULT_CONFIG,
      valid: false,
      config: DEFAULT_CONFIG,
      issues: [{
        path: "",
        message: `Failed to load config: ${errorMessage}`,
      }],
    };
  }
}

/**
 * Load config with caching
 */
export async function loadConfig(): Promise<ConfigFileSnapshot> {
  if (configCache) {
    return configCache;
  }
  
  // Try local config first
  const localPath = getLocalConfigPath();
  const defaultPath = getDefaultConfigPath();
  
  // Check if local config exists
  try {
    await fs.access(localPath);
    configCache = await loadConfigFromFile(localPath);
    return configCache;
  } catch {
    // Try default config
    try {
      await fs.access(defaultPath);
      configCache = await loadConfigFromFile(defaultPath);
      return configCache;
    } catch {
      // Return default config if no file found
      configCache = {
        path: defaultPath,
        exists: false,
        raw: null,
        parsed: null,
        resolved: DEFAULT_CONFIG,
        valid: true,
        config: DEFAULT_CONFIG,
        issues: [{
          path: "",
          message: "No config file found, using defaults. Run `kobold init` to create one.",
        }],
      };
      return configCache;
    }
  }
}

/**
 * Get current config without reloading
 */
export function getConfig(): KoboldConfig {
  return configCache?.config || DEFAULT_CONFIG;
}

/**
 * Get config snapshot
 */
export function getConfigSnapshot(): ConfigFileSnapshot | null {
  return configCache;
}

/**
 * Clear config cache (forces reload)
 */
export function clearConfigCache(): void {
  configCache = null;
}

/**
 * Write config to file
 */
export async function writeConfig(config: KoboldConfig, filePath?: string): Promise<void> {
  const targetPath = filePath || getConfigPath();
  const configDir = path.dirname(targetPath);
  
  // Ensure directory exists
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch {
    // Directory might already exist
  }
  
  // Add meta timestamp
  const configWithMeta = {
    ...config,
    meta: {
      ...config.meta,
      lastTouchedAt: new Date().toISOString(),
    },
  };
  
  // Pretty print with comments template
  const json = JSON.stringify(configWithMeta, null, 2);
  await fs.writeFile(targetPath, json, "utf-8");
  
  // Clear cache to force reload
  clearConfigCache();
}

/**
 * Get a specific config value by path (e.g., "agents.defaults.heartbeat.every")
 */
export function getConfigValue<T>(path: string): T | undefined {
  const config = getConfig();
  const keys = path.split(".");
  let current: unknown = config;
  
  for (const key of keys) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  
  return current as T;
}

/**
 * Set a specific config value by path
 */
export function setConfigValue<T>(config: KoboldConfig, path: string, value: T): KoboldConfig {
  const keys = path.split(".");
  const newConfig = { ...config };
  let current: Record<string, unknown> = newConfig;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  
  current[keys[keys.length - 1]] = value;
  return newConfig;
}
