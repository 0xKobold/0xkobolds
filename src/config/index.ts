/**
 * Config module for Kobold
 * 
 * Similar to koclaw/openclaw's config module
 * Provides types, paths, and loader for kobold.json
 */

export * from "./types.js";
export * from "./paths.js";
export {
  loadConfig,
  loadConfigFromFile,
  getConfig,
  getConfigSnapshot,
  clearConfigCache,
  writeConfig,
  getConfigValue,
  setConfigValue,
  parseConfigJson,
} from "./loader.js";
