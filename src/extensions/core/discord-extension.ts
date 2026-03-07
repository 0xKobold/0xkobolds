/**
 * Discord Extension for 0xKobold
 *
 * Integrates Discord.js with pi-coding-agent
 * Ported from src/discord/index.ts
 * 
 * Note: Discord tools (discord_send_message, discord_send_dm) are provided by
 * discord-channel-extension.ts. This extension provides Discord.js client
 * connection and event handling.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Message,
  Channel,
} from 'discord.js';

// Discord client instance
let client: Client | null = null;
let connected = false;

// Message processing state
const processingMessages = new Set<string>();
const recentMessages = new Map<string, number>();

// Cleanup interval for recent messages (1 minute)
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, timestamp] of recentMessages) {
    if (now - timestamp > 60000) {
      recentMessages.delete(id);
    }
  }
}, 60000);

export default function discordExtension(pi: ExtensionAPI) {
  // Discord tools (discord_send_message, discord_send_dm) are provided by
  // discord-channel-extension.ts to avoid conflicts. This extension provides
  // the Discord.js client connection and event handling.

  pi.registerCommand('discord:connect', {
    description: 'Connect to Discord',
    handler: async (args, ctx) => {
      const token = process.env.DISCORD_BOT_TOKEN;
      if (!token) {
        ctx.ui?.notify('❌ DISCORD_BOT_TOKEN not set', 'error');
        return;
      }

      if (client && connected) {
        ctx.ui?.notify('Already connected to Discord', 'info');
        return;
      }

      try {
        client = new Client({
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages,
          ],
          partials: [Partials.Channel],
        });

        client.once(Events.ClientReady, () => {
          connected = true;
          console.log(`[Discord] Connected as ${client?.user?.tag}`);
          ctx.ui?.notify(`🟢 Discord connected: ${client?.user?.tag}`, 'info');
        });

        client.on(Events.MessageCreate, async (message: Message) => {
          // Ignore own messages and bot messages
          if (message.author.bot) return;
          if (message.author.id === client?.user?.id) return;

          // Skip if already processing
          if (processingMessages.has(message.id)) return;

          // DM handling
          if (message.channel.type === 1) { // DM
            console.log(`[Discord] DM from ${message.author.tag}: ${message.content}`);
            // DM handling logic here
          }
        });

        await client.login(token);
      } catch (err) {
        console.error('[Discord] Connection failed:', err);
        ctx.ui?.notify(`🔴 Discord connection failed: ${err}`, 'error');
        client = null;
        connected = false;
      }
    },
  });

  pi.registerCommand('discord:disconnect', {
    description: 'Disconnect from Discord',
    handler: async (_args, ctx) => {
      if (!client || !connected) {
        ctx.ui?.notify('Not connected to Discord', 'warning');
        return;
      }

      try {
        await client.destroy();
        client = null;
        connected = false;
        ctx.ui?.notify('🔴 Discord disconnected', 'info');
      } catch (err) {
        ctx.ui?.notify(`Failed to disconnect: ${err}`, 'error');
      }
    },
  });

  pi.registerCommand('discord:status', {
    description: 'Show Discord connection status',
    handler: async (_args, ctx) => {
      if (connected && client?.user) {
        ctx.ui?.notify(`🟢 Discord: ${client.user.tag}\nGuilds: ${client.guilds.cache.size}`, 'info');
      } else {
        ctx.ui?.notify('🔴 Discord: Not connected', 'warning');
      }
    },
  });

  // Handle shutdown gracefully
  pi.on('session_shutdown', async () => {
    if (client) {
      console.log('[Discord] Disconnecting on shutdown...');
      await client.destroy();
      client = null;
      connected = false;
    }
  });

  console.log('[Discord] Extension loaded');
}

// Helper function to chunk messages
function chunkMessage(content: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > maxLength) {
    // Try to find a good break point
    let breakPoint = remaining.lastIndexOf('\n', maxLength);
    if (breakPoint === -1) breakPoint = remaining.lastIndexOf(' ', maxLength);
    if (breakPoint === -1) breakPoint = maxLength;

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
