/**
 * Twitch Extension for 0xKobold
 *
 * Integrates Twitch IRC chat with the agent:
 * - Connects to Twitch chat for real-time messages
 * - Bridges messages to the agent via event bus
 * - Supports commands (!command) and whispers
 * - Rate limited for Twitch requirements
 * 
 * Configuration in ~/.0xkobold/config.json:
 * {
 *   "twitch": {
 *     "username": "KoboldBot",
 *     "oauthToken": "oauth:xxx",
 *     "channels": ["#channel1"],
 *     "prefix": "!",
 *     "enabled": true
 *   }
 * }
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

// Twitch client state (lazy loaded)
let client: any = null;
let config: {
  username: string;
  oauthToken: string;
  channels: string[];
  prefix: string;
  enabled: boolean;
  rateLimit?: number;
  isMod?: boolean;
} | null = null;

export default function twitchExtension(pi: ExtensionAPI) {
  // Register commands
  pi.registerCommand('twitch:connect', {
    description: 'Connect to Twitch IRC',
    handler: async (args, ctx) => {
      if (client) {
        ctx.ui?.notify('Already connected to Twitch', 'info');
        return;
      }

      // Load config
      const configPath = require('path').join(require('os').homedir(), '.0xkobold', 'config.json');
      try {
        const configData = require('fs').readFileSync(configPath, 'utf-8');
        const fullConfig = JSON.parse(configData);
        config = fullConfig.twitch;
      } catch (error) {
        ctx.ui?.notify('Failed to load Twitch config', 'error');
        return;
      }

      if (!config || !config.enabled) {
        ctx.ui?.notify('Twitch not enabled in config', 'error');
        return;
      }

      if (!config.username || !config.oauthToken) {
        ctx.ui?.notify('Missing username or oauthToken in config', 'error');
        return;
      }

      try {
        // Dynamic import to avoid bundling issues
        const { TwitchIRIClient } = await import('../../twitch/irc-client');
        
        client = new TwitchIRIClient({
          username: config.username,
          oauthToken: config.oauthToken,
          rateLimit: config.isMod ? 100 : config.rateLimit || 20,
        });

        // Set up event handlers
        client.on('message', (msg: any) => {
          // Emit to event bus
          (pi as any).eventBus?.emit('twitch:message', msg);
          
          // Log
          console.log(`[Twitch] ${msg.channel} ${msg.displayName}: ${msg.message}`);
          
          // Check for commands
          if (msg.message.startsWith(config!.prefix)) {
            handleCommand(msg);
          }
        });

        client.on('whisper', (whisper: any) => {
          (pi as any).eventBus?.emit('twitch:whisper', whisper);
          console.log(`[Twitch] Whisper from ${whisper.displayName}: ${whisper.message}`);
        });

        client.on('error', (error: Error) => {
          console.error('[Twitch] Error:', error.message);
          ctx.ui?.notify(`Twitch error: ${error.message}`, 'error');
        });

        // Connect
        await client.connect();
        
        // Join channels
        for (const channel of config.channels) {
          await client.join(channel);
        }

        ctx.ui?.notify(`Connected to Twitch: ${config.channels.join(', ')}`, 'info');
      } catch (error) {
        ctx.ui?.notify(`Failed to connect: ${(error as Error).message}`, 'error');
      }
    },
  });

  pi.registerCommand('twitch:disconnect', {
    description: 'Disconnect from Twitch IRC',
    handler: async (args, ctx) => {
      if (!client) {
        ctx.ui?.notify('Not connected to Twitch', 'info');
        return;
      }

      try {
        await client.disconnect();
        client = null;
        ctx.ui?.notify('Disconnected from Twitch', 'info');
      } catch (error) {
        ctx.ui?.notify(`Failed to disconnect: ${(error as Error).message}`, 'error');
      }
    },
  });

  pi.registerCommand('twitch:say', {
    description: 'Send a message to a Twitch channel',
    handler: async (args, ctx) => {
      if (!client) {
        ctx.ui?.notify('Not connected to Twitch', 'error');
        return;
      }

      const channel = typeof args === 'object' && args !== null ? (args as any).channel : undefined;
      const message = typeof args === 'object' && args !== null ? (args as any).message : undefined;
      
      if (!channel || !message) {
        ctx.ui?.notify('Usage: twitch:say channel="#channel" message="text"', 'info');
        return;
      }
      
      try {
        await client.say(channel, message);
        ctx.ui?.notify(`Sent message to ${channel}`, 'info');
      } catch (error) {
        ctx.ui?.notify(`Failed to send: ${(error as Error).message}`, 'error');
      }
    },
  });

  pi.registerCommand('twitch:status', {
    description: 'Get Twitch connection status',
    handler: async (args, ctx) => {
      if (!client) {
        ctx.ui?.notify('Not connected to Twitch', 'info');
        return;
      }

      const status = client.getStatus();
      ctx.ui?.notify(`Connected: ${status.connected}, Channels: ${status.channels.join(', ')}`, 'info');
    },
  });

  // Register tools for agent use
  pi.registerTool({
    name: 'twitch_say',
    description: 'Send a message to a Twitch channel',
    // @ts-ignore TSchema mismatch
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel to send to (e.g., #channel)' },
        message: { type: 'string', description: 'Message to send' },
      },
      required: ['channel', 'message'],
    },
    async execute(_toolCallId: string, args: Record<string, unknown>) {
      if (!client) {
        return { content: [{ type: 'text' as const, text: 'Not connected to Twitch' }], details: { success: false } };
      }

      const channel = args.channel as string | undefined;
      const message = args.message as string | undefined;
      
      if (!channel || !message) {
        return { content: [{ type: 'text' as const, text: 'channel and message required' }], details: { success: false } };
      }

      try {
        await client.say(channel, message);
        return { content: [{ type: 'text' as const, text: `Sent message to ${channel}` }], details: { success: true } };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], details: { success: false } };
      }
    },
  });

  pi.registerTool({
    name: 'twitch_whisper',
    description: 'Send a whisper (private message) to a Twitch user',
    // @ts-ignore TSchema mismatch
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username to whisper' },
        message: { type: 'string', description: 'Message to send' },
      },
      required: ['username', 'message'],
    },
    async execute(_toolCallId: string, args: Record<string, unknown>) {
      if (!client) {
        return { content: [{ type: 'text' as const, text: 'Not connected to Twitch' }], details: { success: false } };
      }

      const username = args.username as string | undefined;
      const message = args.message as string | undefined;
      
      if (!username || !message) {
        return { content: [{ type: 'text' as const, text: 'username and message required' }], details: { success: false } };
      }

      try {
        await client.whisper(username, message);
        return { content: [{ type: 'text' as const, text: `Sent whisper to ${username}` }], details: { success: true } };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], details: { success: false } };
      }
    },
  });

  pi.registerTool({
    name: 'twitch_status',
    description: 'Get Twitch connection status and connected channels',
    // @ts-ignore TSchema mismatch
    parameters: { type: 'object', properties: {} },
    async execute(_toolCallId: string, _args: Record<string, unknown>) {
      if (!client) {
        return { 
          content: [{ type: 'text' as const, text: 'Not connected to Twitch' }], 
          details: { status: { connected: false, authenticated: false, channels: [] } }
        };
      }
      const status = client.getStatus();
      return { 
        content: [{ type: 'text' as const, text: `Connected: ${status.connected}, Channels: ${status.channels.join(', ')}` }], 
        details: { status } 
      };
    },
  });

  /**
   * Handle chat commands
   */
  function handleCommand(msg: any): void {
    if (!config) return;
    
    const parts = msg.message.slice(config.prefix.length).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'ping':
        client?.say(msg.channel, `@${msg.displayName} Pong!`);
        break;
        
      case 'status':
        const status = client?.getStatus();
        client?.say(msg.channel, `@${msg.displayName} Connected: ${status?.connected}, Channels: ${status?.channels.length}`);
        break;
        
      case 'help':
        client?.say(msg.channel, `@${msg.displayName} Commands: ${config.prefix}ping, ${config.prefix}status, ${config.prefix}help`);
        break;
        
      default:
        // Forward unknown commands to agent via event bus
        (pi as any).eventBus?.emit('twitch:command', {
          channel: msg.channel,
          username: msg.username,
          displayName: msg.displayName,
          command,
          args,
          rawMessage: msg.message,
          timestamp: msg.timestamp,
          badges: msg.badges,
          isMod: msg.isMod,
          isSubscriber: msg.isSubscriber,
          isBroadcaster: msg.isBroadcaster,
        });
    }
  }
}