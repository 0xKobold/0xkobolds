/**
 * Twitch Configuration
 * 
 * Configuration for Twitch IRC and PubSub integration.
 */

export interface TwitchConfig {
  /** Twitch username (lowercase) */
  username: string;
  
  /** OAuth token from Twitch (oauth:xxx format) */
  oauthToken: string;
  
  /** Channels to join (with # prefix) */
  channels: string[];
  
  /** Command prefix (default: !) */
  prefix: string;
  
  /** Enable Twitch integration */
  enabled: boolean;
  
  /** IRC server (default: irc.chat.twitch.tv) */
  ircServer?: string;
  
  /** IRC port (default: 6667) */
  ircPort?: number;
  
  /** Use SSL (default: true) */
  useSSL?: boolean;
  
  /** Rate limit messages per 30 seconds (default: 20 for mods, 100 for VIPs) */
  rateLimit?: number;
  
  /** Bot is moderator in channels (higher rate limit) */
  isMod?: boolean;
}

export const DEFAULT_CONFIG: Partial<TwitchConfig> = {
  prefix: '!',
  enabled: true,
  ircServer: 'irc.chat.twitch.tv',
  ircPort: 6667,
  useSSL: false, // Port 6667 is non-SSL, 6697 is SSL
  rateLimit: 20, // Default for non-mod bots
  isMod: false,
};

/**
 * Load Twitch config from ~/.0xkobold/config.json
 */
export function loadTwitchConfig(): TwitchConfig | null {
  try {
    const configPath = require('path').join(require('os').homedir(), '.0xkobold', 'config.json');
    const fs = require('fs');
    
    if (!fs.existsSync(configPath)) {
      return null;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const twitchConfig = config.twitch;
    
    if (!twitchConfig || !twitchConfig.enabled) {
      return null;
    }
    
    return {
      ...DEFAULT_CONFIG,
      ...twitchConfig,
    };
  } catch (error) {
    console.error('[Twitch] Failed to load config:', error);
    return null;
  }
}

/**
 * Validate Twitch config
 */
export function validateTwitchConfig(config: TwitchConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config.username) {
    errors.push('username is required');
  }
  
  if (!config.oauthToken) {
    errors.push('oauthToken is required');
  }
  
  if (!config.oauthToken.startsWith('oauth:')) {
    errors.push('oauthToken must start with "oauth:"');
  }
  
  if (!config.channels || config.channels.length === 0) {
    errors.push('at least one channel is required');
  }
  
  // Validate channel format
  for (const channel of config.channels) {
    if (!channel.startsWith('#')) {
      errors.push(`channel "${channel}" must start with #`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}