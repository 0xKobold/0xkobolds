/**
 * Unified Configuration System for 0xKobold
 *
 * Single source of truth for all extension configuration.
 * Extensions register their config schema and use the unified store.
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const CONFIG_DIR = join(homedir(), ".0xkobold");
const CONFIG_FILE = join(CONFIG_DIR, "0xkobold.json");

// ============================================================================
// Configuration Schema
// ============================================================================

export interface OllamaConfig {
  apiKey?: string;
  baseUrl?: string;
  cloudUrl?: string;
  customModels?: Array<{
    id: string;
    name: string;
    contextWindow?: number;
    maxTokens?: number;
  }>;
  lastUpdated?: number;
}

export interface GatewayConfig {
  port?: number;
  host?: string;
  autoStart?: boolean;
  persistAgents?: boolean;
}

export interface DiscordConfig {
  enabled?: boolean;
  token?: string;
  autoReply?: boolean;
}

export interface UnifiedConfig {
  version: string;
  updatedAt: number;
  
  // Logging configuration
  logging?: {
    level?: 'error' | 'warn' | 'info' | 'debug' | 'silent';
    extensionLogs?: boolean;
  };
  
  // Provider configs
  ollama?: OllamaConfig;
  
  // Service configs  
  gateway?: GatewayConfig;
  discord?: DiscordConfig;
  
  // Extension configs can be added here
  [key: string]: any;
}

// Default configuration
const DEFAULT_CONFIG: UnifiedConfig = {
  version: "1.0.0",
  updatedAt: Date.now(),
  
  ollama: {
    baseUrl: "http://localhost:11434",
    cloudUrl: "https://ollama.com/api",
  },
  
  gateway: {
    port: 18789,
    host: "127.0.0.1",
    autoStart: true,
    persistAgents: true,
  },
  
  discord: {
    enabled: false,
    autoReply: true,
  },
  
  // Logging configuration
  logging: {
    level: 'info',
    extensionLogs: true,
  },
};

// ============================================================================
// Config Manager
// ============================================================================

class ConfigManager {
  private config: UnifiedConfig;
  private loaded: boolean = false;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.load();
  }

  /**
   * Load config from disk
   */
  private load(): void {
    try {
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
      }

      if (existsSync(CONFIG_FILE)) {
        const data = readFileSync(CONFIG_FILE, "utf-8");
        const parsed = JSON.parse(data);
        this.config = this.mergeDeep(DEFAULT_CONFIG, parsed);
        this.loaded = true;
        console.log("[Config] Loaded from", CONFIG_FILE);
      } else {
        this.save(); // Create initial config
        console.log("[Config] Created new config at", CONFIG_FILE);
      }
    } catch (err) {
      console.error("[Config] Failed to load:", (err as Error).message);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Save config to disk
   */
  save(): void {
    try {
      this.config.updatedAt = Date.now();
      
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
      }
      
      writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error("[Config] Failed to save:", (err as Error).message);
    }
  }

  /**
   * Deep merge objects
   */
  private mergeDeep(target: any, source: any): any {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === "object" && !Array.isArray(item);
  }

  /**
   * Get full config or a section
   */
  get<T extends keyof UnifiedConfig>(section?: T): T extends undefined ? UnifiedConfig : UnifiedConfig[T] {
    if (section) {
      return this.config[section] as any;
    }
    return this.config as any;
  }

  /**
   * Update config section
   */
  set<T extends keyof UnifiedConfig>(section: T, value: Partial<UnifiedConfig[T]>): void {
    this.config[section] = this.mergeDeep(this.config[section] || {}, value);
    this.save();
  }

  /**
   * Update specific key path (e.g., "ollama.apiKey")
   */
  setPath(path: string, value: any): void {
    const keys = path.split(".");
    let current: any = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    this.save();
  }

  /**
   * Get specific key path
   */
  getPath(path: string): any {
    const keys = path.split(".");
    let current: any = this.config;
    
    for (const key of keys) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }

  /**
   * Check if config was loaded from disk
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Get config file path
   */
  getConfigPath(): string {
    return CONFIG_FILE;
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let configManager: ConfigManager | null = null;

export function getConfig(): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager();
  }
  return configManager;
}

export function resetConfig(): void {
  configManager = null;
}

// Convenience exports
export const config = {
  get: <T extends keyof UnifiedConfig>(section?: T) => getConfig().get(section),
  set: <T extends keyof UnifiedConfig>(section: T, value: Partial<UnifiedConfig[T]>) => getConfig().set(section, value),
  getPath: (path: string) => getConfig().getPath(path),
  setPath: (path: string, value: any) => getConfig().setPath(path, value),
  save: () => getConfig().save(),
  reset: () => getConfig().reset(),
  path: () => getConfig().getConfigPath(),
};

export default config;


