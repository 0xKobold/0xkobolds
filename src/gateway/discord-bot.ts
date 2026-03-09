/**
 * Discord Bot Integration - v0.2.0
 * 
 * Real Discord bot that connects to the Gateway.
 */

import { 
  Client, 
  GatewayIntentBits, 
  Events, 
  Message, 
  TextChannel,
  ThreadChannel
} from "discord.js";
import { getRealGateway } from "./server.js";

export interface DiscordBotConfig {
  token: string;
  prefix?: string;
  allowedChannels?: string[];
  requireMention?: boolean;
  createThreads?: boolean;
}

class DiscordBotIntegration {
  private client: Client | null = null;
  private config: DiscordBotConfig;
  private gatewayConnectionId?: string;
  private connected = false;

  constructor(config: DiscordBotConfig) {
    this.config = {
      prefix: "!",
      requireMention: true,
      createThreads: true,
      ...config,
    };
  }

  /**
   * Start Discord bot
   */
  async start(): Promise<void> {
    if (this.connected) return;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    // Register event handlers
    this.client.on(Events.MessageCreate, (message) => this.handleMessage(message));
    this.client.on(Events.Error, (error) => console.error("[Discord] Client error:", error));
    this.client.on(Events.ShardError, (error) => console.error("[Discord] Shard error:", error));

    // Login
    try {
      await this.client.login(this.config.token);
      this.connected = true;
      console.log(`[Discord] Bot logged in as ${this.client.user?.tag}`);
      
      // Register with gateway
      this.registerWithGateway();
    } catch (error) {
      console.error("[Discord] Failed to start:", error);
      throw error;
    }
  }

  /**
   * Stop Discord bot
   */
  async stop(): Promise<void> {
    if (!this.connected) return;
    
    // Unregister from gateway
    if (this.gatewayConnectionId) {
      const gateway = getRealGateway();
      gateway.removeConnection(this.gatewayConnectionId);
    }

    await this.client?.destroy();
    this.connected = false;
    console.log("[Discord] Bot stopped");
  }

  /**
   * Register with gateway server
   */
  private registerWithGateway(): void {
    const gateway = getRealGateway();
    
    this.gatewayConnectionId = gateway.registerConnection({
      type: "discord",
      channel: "bot",
      user: this.client?.user?.tag,
    });

    // Listen for gateway messages to send to Discord
    gateway.on("message", (event: { id: string; message: unknown; type: string }) => {
      if (event.type === "discord") {
        this.sendToChannel(event.message as string);
      }
    });
  }

  /**
   * Handle incoming Discord messages
   */
  private async handleMessage(message: Message): Promise<void> {
    // Don't respond to bots
    if (message.author.bot) return;

    // Check if allowed channel
    if (this.config.allowedChannels?.length) {
      const channelId = message.channelId;
      if (!this.config.allowedChannels.includes(channelId)) return;
    }

    // Check if mention required
    if (this.config.requireMention) {
      const botMentioned = message.mentions.users.has(this.client?.user?.id || "");
      if (!botMentioned) return;
    }

    // Extract command/content
    const content = message.content
      .replace(`<@${this.client?.user?.id}>`, "") // Remove mention
      .replace(`<@!${this.client?.user?.id}>`, "")
      .trim();

    console.log(`[Discord] Message from ${message.author.tag}: ${content.slice(0, 60)}`);

    // Create thread if enabled and not in DM
    let thread: ThreadChannel | null = null;
    if (this.config.createThreads && message.channel instanceof TextChannel) {
      try {
        thread = await message.startThread({
          name: `Session with ${message.author.username}`,
          autoArchiveDuration: 60, // 1 hour
        });
      } catch (error) {
        console.error("[Discord] Failed to create thread:", error);
      }
    }

    // Forward to gateway
    const gateway = getRealGateway();
    gateway.emit("message", {
      connection: {
        id: this.gatewayConnectionId,
        type: "discord",
        channel: message.channelId,
        user: message.author.tag,
      },
      data: {
        type: "chat",
        id: `discord-${message.id}`,
        payload: {
          content,
          author: message.author.tag,
          channel: message.channelId,
          thread: thread?.id,
        },
        timestamp: Date.now(),
      },
    });

    // Send typing indicator (only if supported)
    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping();
    }
  }

  /**
   * Send message to Discord channel
   */
  async sendToChannel(content: string, channelId?: string): Promise<void> {
    if (!this.client) return;

    const channel = channelId 
      ? await this.client.channels.fetch(channelId).catch(() => null)
      : this.client.channels.cache.first();

    if (channel?.isTextBased()) {
      await channel.send(content.slice(0, 2000)); // Discord limit
    }
  }

  /**
   * Get bot status
   */
  getStatus(): { connected: boolean; user?: string; guilds: number } {
    return {
      connected: this.connected,
      user: this.client?.user?.tag,
      guilds: this.client?.guilds.cache.size || 0,
    };
  }
}

// Singleton
let bot: DiscordBotIntegration | null = null;

export function getDiscordBot(config?: DiscordBotConfig): DiscordBotIntegration {
  if (!bot && config) {
    bot = new DiscordBotIntegration(config);
  }
  return bot!;
}

export function resetDiscordBot(): void {
  bot?.stop();
  bot = null;
}

export default DiscordBotIntegration;
