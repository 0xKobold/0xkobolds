/**
 * Configuration Manager - v0.3.0
 * 
 * Centralized config management with validation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface ConfigSchema {
  // Core settings
  version: string;
  
  // Persona
  persona: {
    name: string;
    emoji: string;
    description?: string;
  };
  
  // Heartbeat
  heartbeat: {
    enabled: boolean;
    morning: string;
    evening: string;
    idleMinutes: number;
  };
  
  // Gateway
  gateway: {
    enabled: boolean;
    port: number;
    host: string;
    cors: string[];
    // Remote/VPS gateway configuration
    remote?: {
      enabled: boolean;
      url?: string;           // e.g., "wss://vps.example.com:7777"
      token?: string;         // Auth token for remote
      password?: string;      // Password auth (optional)
      autoReconnect?: boolean;
      reconnectDelay?: number;
    };
  };

  // Auto-update settings
  autoUpdate?: {
    enabled: boolean;
    checkInterval: string;    // Cron expression, e.g., "0 2 * * *" (daily at 2am)
    autoInstall: boolean;     // Auto-install if update available
    notifyOnUpdate: boolean;  // Send notification when updated
  };
  
  // Channels
  channels: {
    discord?: { enabled: boolean; token?: string };
    whatsapp?: { enabled: boolean; sessionPath: string };
    telegram?: { enabled: boolean; token?: string; mode: "polling" | "webhook" };
    slack?: { enabled: boolean; webhookUrl?: string };
  };
  
  // Security
  security: {
    deviceAuth: boolean;
    dockerSandbox: boolean;
    tokenExpiryHours: number;
  };
  
  // Media
  media: {
    vision: { enabled: boolean; provider: "claude" | "openai"; apiKey?: string };
    audio: { enabled: boolean; provider: "openai"; apiKey?: string };
    pdf: { enabled: boolean; maxPages: number };
  };
  
  // LLM
  llm: {
    provider: "claude" | "openai" | "ollama";
    model: string;
    apiKey?: string;
    baseUrl?: string;
    maxTokens: number;
    temperature: number;
  };
}

const DEFAULT_CONFIG: ConfigSchema = {
  version: "0.3.0",
  
  persona: {
    name: "0xKobold",
    emoji: "🐉",
    description: "Your personal AI assistant",
  },
  
  heartbeat: {
    enabled: true,
    morning: "09:00",
    evening: "18:00",
    idleMinutes: 30,
  },
  
  gateway: {
    enabled: true,
    port: 7777,
    host: "localhost",
    cors: ["http://localhost:3000"],
    remote: {
      enabled: false,
      url: undefined,
      token: undefined,
      password: undefined,
      autoReconnect: true,
      reconnectDelay: 1000,
    },
  },
  
  channels: {
    discord: { enabled: false },
    whatsapp: { enabled: false, sessionPath: "~/.0xkobold/whatsapp-session" },
    telegram: { enabled: false, mode: "polling" },
    slack: { enabled: false },
  },
  
  security: {
    deviceAuth: true,
    dockerSandbox: true,
    tokenExpiryHours: 168,
  },
  
  media: {
    vision: { enabled: false, provider: "claude" },
    audio: { enabled: false, provider: "openai" },
    pdf: { enabled: true, maxPages: 100 },
  },
  
  llm: {
    provider: "claude",
    model: "claude-3-sonnet-20240229",
    maxTokens: 4000,
    temperature: 0.7,
  },

  autoUpdate: {
    enabled: false,
    checkInterval: "0 2 * * *",  // Daily at 2 AM
    autoInstall: false,
    notifyOnUpdate: true,
  },
};

class ConfigManager {
  private config: ConfigSchema;
  private configPath: string;

  constructor(configPath = path.join(process.env.HOME || "~", ".0xkobold", "config.json")) {
    this.configPath = configPath;
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<ConfigSchema> {
    try {
      const content = await fs.readFile(this.configPath, "utf-8");
      const loaded = JSON.parse(content);
      this.config = this.mergeConfig(DEFAULT_CONFIG, loaded);
      return this.config;
    } catch {
      // No config file yet, use defaults
      return this.config;
    }
  }

  /**
   * Save configuration to file
   */
  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      "utf-8"
    );
  }

  /**
   * Get config value
   */
  get<K extends keyof ConfigSchema>(key: K): ConfigSchema[K] {
    return this.config[key];
  }

  /**
   * Set config value
   */
  set<K extends keyof ConfigSchema>(key: K, value: ConfigSchema[K]): void {
    this.config[key] = value;
  }

  /**
   * Get nested config
   */
  getNested(path: string): unknown {
    return path.split(".").reduce((obj: any, key) => obj?.[key], this.config);
  }

  /**
   * Set nested config
   */
  setNested(path: string, value: unknown): void {
    const keys = path.split(".");
    const lastKey = keys.pop()!;
    const target = keys.reduce((obj: any, key) => {
      if (!obj[key]) obj[key] = {};
      return obj[key];
    }, this.config);
    target[lastKey] = value;
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!this.config.version) errors.push("version is required");
    if (!this.config.persona.name) errors.push("persona.name is required");

    // Check LLM config
    if (!this.config.llm.model) errors.push("llm.model is required");
    if (this.config.llm.temperature < 0 || this.config.llm.temperature > 2) {
      errors.push("llm.temperature must be between 0 and 2");
    }

    // Check port range
    if (this.config.gateway.port < 1 || this.config.gateway.port > 65535) {
      errors.push("gateway.port must be between 1 and 65535");
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get full config
   */
  getConfig(): ConfigSchema {
    return { ...this.config };
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Merge configs (deep merge)
   */
  private mergeConfig(defaults: any, loaded: any): any {
    const result = { ...defaults };
    
    for (const key in loaded) {
      if (loaded[key] !== null && typeof loaded[key] === "object" && !Array.isArray(loaded[key])) {
        result[key] = this.mergeConfig(defaults[key] || {}, loaded[key]);
      } else {
        result[key] = loaded[key];
      }
    }
    
    return result;
  }

  /**
   * Export as environment variables
   */
  async exportToEnv(): Promise<string> {
    const lines: string[] = [];
    
    if (this.config.channels.telegram?.token) {
      lines.push(`TELEGRAM_BOT_TOKEN=${this.config.channels.telegram.token}`);
    }
    if (this.config.channels.discord?.token) {
      lines.push(`DISCORD_BOT_TOKEN=${this.config.channels.discord.token}`);
    }
    if (this.config.channels.slack?.webhookUrl) {
      lines.push(`SLACK_WEBHOOK_URL=${this.config.channels.slack.webhookUrl}`);
    }
    if (this.config.llm.apiKey) {
      lines.push(`LLM_API_KEY=${this.config.llm.apiKey}`);
    }
    
    return lines.join("\n");
  }

  /**
   * Import from environment
   */
  importFromEnv(): void {
    if (process.env.TELEGRAM_BOT_TOKEN) {
      this.config.channels.telegram ??= { enabled: true, mode: "polling" };
      this.config.channels.telegram.token = process.env.TELEGRAM_BOT_TOKEN;
      this.config.channels.telegram.enabled = true;
    }
    
    if (process.env.DISCORD_BOT_TOKEN) {
      this.config.channels.discord ??= { enabled: true };
      this.config.channels.discord.token = process.env.DISCORD_BOT_TOKEN;
      this.config.channels.discord.enabled = true;
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      this.config.llm.apiKey = process.env.ANTHROPIC_API_KEY;
    }
    
    if (process.env.OPENAI_API_KEY) {
      this.config.media.audio ??= { enabled: false, provider: "openai" };
      this.config.media.audio.apiKey = process.env.OPENAI_API_KEY;
    }
  }
}

// Singleton
let instance: ConfigManager | null = null;

export function getConfigManager(configPath?: string): ConfigManager {
  if (!instance) {
    instance = new ConfigManager(configPath);
  }
  return instance;
}

export function resetConfigManager(): void {
  instance = null;
}

export { ConfigManager, DEFAULT_CONFIG };
export default ConfigManager;
