// Config Module - v0.3.0
export {
  ConfigManager,
  getConfigManager,
  resetConfigManager,
  DEFAULT_CONFIG,
  type ConfigSchema,
} from "./manager.js";

// Re-export existing types
export type { DiscordConfig } from "./types.js";