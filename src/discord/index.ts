/**
 * Discord Module
 *
 * Discord integration for 0xKobold.
 * Simplified port from OpenClaw's Discord implementation.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Message,
  TextChannel,
  DMChannel,
  ThreadChannel,
  NewsChannel,
  Channel,
  User,
  GuildMember,
} from 'discord.js';
import type { DiscordConfig } from '../config';
import { eventBus, createEventEmitter } from '../event-bus';

const emit = createEventEmitter('discord');

// Discord client instance
let client: Client | null = null;
let config: DiscordConfig | null = null;

// Message processing state
const processingMessages = new Set<string>();
const recentMessages = new Map<string, number>();

// Cleanup interval for recent messages (1 minute)
setInterval(() => {
  const now = Date.now();
  for (const [id, timestamp] of recentMessages) {
    if (now - timestamp > 60000) {
      recentMessages.delete(id);
    }
  }
}, 60000);

/**
 * Initialize Discord client
 */
export async function initDiscord(discordConfig: DiscordConfig): Promise<Client | null> {
  if (!discordConfig.enabled) {
    console.log('[Discord] Discord integration disabled');
    return null;
  }

  if (!discordConfig.token) {
    console.error('[Discord] No bot token configured');
    return null;
  }

  config = discordConfig;

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
    console.log(`[Discord] Logged in as ${client?.user?.tag}`);
    updatePresence();
    // @ts-ignore EventEmitter type
    emit('discord.client.connected', {
      botId: client?.user?.id,
      botName: client?.user?.tag,
      guilds: client?.guilds.cache.size ?? 0,
    });
  });

  client.on(Events.MessageCreate, handleMessage);
  client.on(Events.Error, (error) => {
    console.error('[Discord] Client error:', error);
    // @ts-ignore EventEmitter type
    emit('system.error', { source: 'discord', error });
  });

  // @ts-ignore Discord event name
  client.on(Events.Disconnect, () => {
    console.log('[Discord] Disconnected');
    // @ts-ignore EventEmitter type
    emit('discord.client.disconnected', {});
  });

  // Login
  try {
    await client.login(discordConfig.token);
  } catch (err) {
    console.error('[Discord] Failed to login:', err);
    return null;
  }

  return client;
}

/**
 * Handle incoming message
 */
async function handleMessage(message: Message): Promise<void> {
  if (!client || !config) return;

  // Ignore own messages
  if (message.author.id === client.user?.id) return;

  // Ignore bots (unless configured otherwise)
  if (message.author.bot) return;

  // Check if we should process this message
  if (!shouldProcessMessage(message)) return;

  // Mark as processing
  processingMessages.add(message.id);
  recentMessages.set(message.id, Date.now());

  try {
    // Extract message info
    const messageInfo = extractMessageInfo(message);

    // Emit event for other modules
    // @ts-ignore EventEmitter type
    emit('discord.message.received', messageInfo);

    // Auto-reply if enabled
    if (shouldAutoReply(message)) {
      await processMessage(message, messageInfo);
    }
  } catch (err) {
    console.error('[Discord] Error handling message:', err);
  } finally {
    processingMessages.delete(message.id);
  }
}

/**
 * Check if message should be processed
 */
function shouldProcessMessage(message: Message): boolean {
  if (!config) return false;

  // Skip already processed
  if (recentMessages.has(message.id)) return false;
  if (processingMessages.has(message.id)) return false;

  // DM handling
  if (message.channel.type === 1) { // DM
    switch (config.dmPolicy) {
      case 'block':
        return false;
      case 'whitelist':
        return config.dmWhitelist.includes(message.author.id);
      case 'allow':
      default:
        return true;
    }
  }

  // Guild channel handling
  const channelId = message.channelId;
  const channelConfig = config.channels?.[channelId];

  // If channel has config, use it
  if (channelConfig) {
    return channelConfig.enabled !== false;
  }

  // Default to true for guild channels
  return true;
}

/**
 * Check if should auto-reply
 */
function shouldAutoReply(message: Message): boolean {
  if (!config) return false;

  const channelConfig = config.channels?.[message.channelId];

  // Channel-specific setting takes precedence
  if (channelConfig?.autoReply !== undefined) {
    return channelConfig.autoReply;
  }

  // Mentioned in message
  const isMentioned = message.mentions.has(client?.user?.id ?? '', { ignoreEveryone: true });
  if (isMentioned) return true;

  // Default setting
  return config.autoReply ?? true;
}

/**
 * Process message and generate reply
 */
async function processMessage(message: Message, info: MessageInfo): Promise<void> {
  // Show typing indicator if enabled
  if (config?.typingIndicator) {
    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping();
    }
  }

  // Get agent for this channel
  const channelConfig = config?.channels?.[message.channelId];
  const agentId = channelConfig?.agentId ?? 'default';

  // Emit event for agent system to handle
  // @ts-ignore EventEmitter type
  emit('agent.message', {
    source: 'discord',
    agentId,
    message: info,
    reply: async (content: string, options?: ReplyOptions) => {
      await sendReply(message, content, options);
    },
  });
}

/**
 * Send reply to message
 */
export async function sendReply(
  originalMessage: Message,
  content: string,
  options: ReplyOptions = {}
): Promise<void> {
  try {
    const { reply = true, codeBlock, ephemeral } = options;

    let formattedContent = content;

    // Format as code block if specified
    if (codeBlock) {
      formattedContent = `\`\`\`${codeBlock}\n${content}\n\`\`\``;
    }

    // Chunk long messages
    const chunks = chunkMessage(formattedContent, 2000);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isFirst = i === 0;

      if (isFirst && reply) {
        await originalMessage.reply({
          content: chunk,
          allowedMentions: { repliedUser: false },
        });
      } else {
        // @ts-ignore Discord channel send
        await originalMessage.channel.send(chunk);
      }
    }

    // @ts-ignore EventEmitter type
    emit('discord.message.sent', {
      channelId: originalMessage.channelId,
      replyTo: originalMessage.id,
      chunks: chunks.length,
    });
  } catch (err) {
    console.error('[Discord] Failed to send reply:', err);
  }
}

/**
 * Send message to channel
 */
export async function sendToChannel(
  channelId: string,
  content: string,
  options: { codeBlock?: string } = {}
): Promise<void> {
  if (!client) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !('send' in channel)) return;

    let formattedContent = content;
    if (options.codeBlock) {
      formattedContent = `\`\`\`${options.codeBlock}\n${content}\n\`\`\``;
    }

    const chunks = chunkMessage(formattedContent, 2000);
    for (const chunk of chunks) {
      // @ts-ignore Discord channel send
      await channel.send(chunk);
    }

    // @ts-ignore EventEmitter type
    emit('discord.message.sent', {
      channelId,
      chunks: chunks.length,
    });
  } catch (err) {
    console.error('[Discord] Failed to send to channel:', err);
  }
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

    // Find good break point
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

/**
 * Update bot presence
 */
function updatePresence(): void {
  if (!client?.user || !config) return;

  const presence = config.presence;
  if (!presence) return;

  client.user.setPresence({
    status: presence.status ?? 'online',
    activities: presence.activity
      ? [{ name: presence.activity, type: 0 }]
      : undefined,
  });
}

/**
 * Extract message info
 */
function extractMessageInfo(message: Message): MessageInfo {
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
 * Stop Discord client
 */
export async function stopDiscord(): Promise<void> {
  if (client) {
    await client.destroy();
    client = null;
    config = null;
    console.log('[Discord] Client stopped');
  }
}

/**
 * Get client instance
 */
export function getClient(): Client | null {
  return client;
}

/**
 * Check if connected
 */
export function isConnected(): boolean {
  return client?.isReady() ?? false;
}

// Types
export interface MessageInfo {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    bot: boolean;
  };
  channel: {
    id: string;
    type: number;
    name: string;
  };
  guild: {
    id: string;
    name: string;
  } | null;
  mentions: {
    users: string[];
    roles: string[];
    everyone: boolean;
  };
  attachments: Array<{
    id: string;
    url: string;
    name: string | null;
    contentType: string | null;
    size: number;
  }>;
  timestamp: number;
  isDM: boolean;
}

export interface ReplyOptions {
  reply?: boolean;
  codeBlock?: string;
  ephemeral?: boolean;
}

// Re-export
export { Client, Events } from 'discord.js';
