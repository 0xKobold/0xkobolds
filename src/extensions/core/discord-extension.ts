/**
 * Discord Extension for 0xKobold
 *
 * Integrates Discord.js with pi-coding-agent
 * Ported from src/discord/index.ts
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
  // Register Discord tools
  pi.registerTool({
    name: 'discord_send_message',
    description: 'Send a message to a Discord channel',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Discord channel ID' },
        content: { type: 'string', description: 'Message content' },
        codeBlock: { type: 'string', description: 'Language for code block formatting' },
      },
      required: ['channelId', 'content'],
    },
    async execute(args) {
      const { channelId, content, codeBlock } = args;

      if (!client || !connected) {
        return {
          content: [{ type: 'text', text: 'Discord client not connected' }],
          details: { error: 'not_connected' },
        };
      }

      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !('send' in channel)) {
          return {
            content: [{ type: 'text', text: `Channel not found: ${channelId}` }],
            details: { error: 'channel_not_found' },
          };
        }

        let formattedContent = content;
        if (codeBlock) {
          formattedContent = `\`\`\`${codeBlock}\n${content}\n\`\`\``;
        }

        const chunks = chunkMessage(formattedContent, 2000);
        for (const chunk of chunks) {
      // @ts-ignore Discord channel type
          await channel.send(chunk);
        }

        return {
          content: [{ type: 'text', text: `Message sent to ${channelId}` }],
          details: { sent: true, chunks: chunks.length },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to send: ${err}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  pi.registerTool({
    name: 'discord_reply',
    description: 'Reply to a specific Discord message',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Discord channel ID' },
        messageId: { type: 'string', description: 'Message ID to reply to' },
        content: { type: 'string', description: 'Reply content' },
      },
      required: ['channelId', 'messageId', 'content'],
    },
    async execute(args) {
      const { channelId, messageId, content } = args;

      if (!client || !connected) {
        return {
          content: [{ type: 'text', text: 'Discord client not connected' }],
          details: { error: 'not_connected' },
        };
      }

      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !('messages' in channel)) {
          return {
            content: [{ type: 'text', text: `Channel not found: ${channelId}` }],
            details: { error: 'channel_not_found' },
          };
        }

        const message = await channel.messages.fetch(messageId);
        const chunks = chunkMessage(content, 2000);

        for (let i = 0; i < chunks.length; i++) {
          if (i === 0) {
            await message.reply({
              content: chunks[i],
              allowedMentions: { repliedUser: false },
            });
          } else {
      // @ts-ignore Discord channel type
            await channel.send(chunks[i]);
          }
        }

        return {
          content: [{ type: 'text', text: 'Reply sent' }],
          details: { sent: true, chunks: chunks.length },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to reply: ${err}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  // Register Discord commands
  pi.registerCommand('discord:connect', {
    description: 'Connect to Discord with bot token',
    async execute(args) {
      const token = args?.token || process.env.DISCORD_TOKEN;

      if (!token) {
  // @ts-ignore ExtensionAPI emit
        pi.emit('discord.error', { message: 'No Discord token provided' });
        return;
      }

      if (client?.isReady()) {
  // @ts-ignore ExtensionAPI emit
        pi.emit('discord.info', { message: 'Already connected' });
        return;
      }

      client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.GuildMembers,
        ],
        partials: [Partials.Channel, Partials.Message],
      });

      // Event handlers
      client.on(Events.ClientReady, () => {
        connected = true;
        console.log(`[Discord] Logged in as ${client?.user?.tag}`);
  // @ts-ignore ExtensionAPI emit
        pi.emit('discord.connected', {
          botId: client?.user?.id,
          botName: client?.user?.tag,
          guilds: client?.guilds.cache.size ?? 0,
        });
      });

      client.on(Events.MessageCreate, (message) => handleMessage(message, pi));

      client.on(Events.Error, (error) => {
        console.error('[Discord] Client error:', error);
  // @ts-ignore ExtensionAPI emit
        pi.emit('discord.error', { error });
      });

      // @ts-ignore Discord event enum
      client.on(Events.Disconnect, () => {
        connected = false;
        console.log('[Discord] Disconnected');
  // @ts-ignore ExtensionAPI emit
        pi.emit('discord.disconnected', {});
      });

      try {
        await client.login(token);
      } catch (err) {
        console.error('[Discord] Failed to login:', err);
  // @ts-ignore ExtensionAPI emit
        pi.emit('discord.error', { error: err });
      }
    },
  });

  pi.registerCommand('discord:disconnect', {
    description: 'Disconnect from Discord',
    async execute() {
      if (client) {
        await client.destroy();
        client = null;
        connected = false;
        console.log('[Discord] Client stopped');
  // @ts-ignore ExtensionAPI emit
        pi.emit('discord.disconnected', {});
      }
    },
  });

  pi.registerCommand('discord:status', {
    description: 'Get Discord connection status',
    async execute() {
  // @ts-ignore ExtensionAPI emit
      pi.emit('discord.status', {
        connected: connected && client?.isReady(),
        botName: client?.user?.tag,
        guilds: client?.guilds.cache.size ?? 0,
      });
    },
  });

  // Status bar item
  // @ts-ignore ExtensionAPI property
  pi.registerStatusBarItem('discord', {
    render() {
      if (connected && client?.isReady()) {
        return `Discord: 🟢 ${client.user?.tag}`;
      }
      return 'Discord: 🔴';
    },
  });

  // Cleanup on shutdown
  pi.on('shutdown', async () => {
    clearInterval(cleanupInterval);
    if (client) {
      await client.destroy();
    }
  });
}

/**
 * Handle incoming Discord message
 */
async function handleMessage(message: Message, pi: ExtensionAPI): Promise<void> {
  if (!client) return;

  // Ignore own messages
  if (message.author.id === client.user?.id) return;

  // Ignore bots
  if (message.author.bot) return;

  // Skip already processed
  if (recentMessages.has(message.id) || processingMessages.has(message.id)) return;

  // Mark as processing
  processingMessages.add(message.id);
  recentMessages.set(message.id, Date.now());

  try {
    const messageInfo = extractMessageInfo(message);

    // Emit message event
  // @ts-ignore ExtensionAPI emit
    pi.emit('discord.message', messageInfo);

    // Auto-reply logic can be configured via settings
    const shouldAutoReply = !message.author.bot;

    if (shouldAutoReply) {
  // @ts-ignore ExtensionAPI emit
      pi.emit('agent.message', {
        source: 'discord',
        message: messageInfo,
        reply: async (content: string, options?: { codeBlock?: string }) => {
          await sendReply(message, content, options);
        },
      });
    }
  } catch (err) {
    console.error('[Discord] Error handling message:', err);
  } finally {
    processingMessages.delete(message.id);
  }
}

/**
 * Send reply to message
 */
async function sendReply(
  originalMessage: Message,
  content: string,
  options?: { codeBlock?: string }
): Promise<void> {
  try {
    let formattedContent = content;
    if (options?.codeBlock) {
      formattedContent = `\`\`\`${options.codeBlock}\n${content}\n\`\`\``;
    }

    const chunks = chunkMessage(formattedContent, 2000);

    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) {
        await originalMessage.reply({
          content: chunks[i],
          allowedMentions: { repliedUser: false },
        });
      } else {
      // @ts-ignore Discord channel type
        await originalMessage.channel.send(chunks[i]);
      }
    }
  } catch (err) {
    console.error('[Discord] Failed to send reply:', err);
  }
}

/**
 * Extract message info
 */
function extractMessageInfo(message: Message) {
  return {
    id: message.id,
    content: message.content,
    author: {
      id: message.author.id,
      username: message.author.username,
      displayName: message.author.displayName,
      bot: message.author.bot,
    },
    channel: {
      id: message.channelId,
      type: message.channel.type,
      name: getChannelName(message.channel),
    },
    guild: message.guild
      ? {
          id: message.guild.id,
          name: message.guild.name,
        }
      : null,
    mentions: {
      users: message.mentions.users.map((u) => u.id),
      roles: [...message.mentions.roles.keys()],
      everyone: message.mentions.everyone,
    },
    attachments: message.attachments.map((a) => ({
      id: a.id,
      url: a.url,
      name: a.name,
      contentType: a.contentType,
      size: a.size,
    })),
    timestamp: message.createdTimestamp,
    isDM: message.channel.type === 1,
  };
}

/**
 * Get channel name
 */
function getChannelName(channel: Channel): string {
  if (channel.type === 1) return 'DM';
  if ('name' in channel) return channel.name ?? 'unknown';
  return 'unknown';
}

/**
 * Chunk message to fit Discord limits
 */
function chunkMessage(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let breakPoint = maxLength;
    while (breakPoint > 0 && remaining[breakPoint] !== '\n') {
      breakPoint--;
    }
    if (breakPoint === 0) breakPoint = maxLength;

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trim();
  }

  return chunks;
}
