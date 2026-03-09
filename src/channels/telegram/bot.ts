/**
 * Telegram Bot Completion - v0.3.0
 * 
 * Full Telegram bot integration with webhook/polling, inline queries, and group support.
 */

import TelegramBot from "node-telegram-bot-api";
import { EventEmitter } from "events";
import { getRealGateway } from "../../gateway/index.js";

export interface TelegramConfig {
  token: string;
  mode: "polling" | "webhook";
  webhookUrl?: string;
  port?: number;
  allowedUpdates?: string[];
}

export interface TelegramMessage {
  id: number;
  from: {
    id: number;
    username?: string;
    firstName?: string;
  };
  chat: {
    id: number;
    type: "private" | "group" | "supergroup" | "channel";
    title?: string;
  };
  text?: string;
  caption?: string;
  date: number;
  isGroup: boolean;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
  }>;
}

class TelegramIntegration extends EventEmitter {
  private config: TelegramConfig;
  private bot?: TelegramBot;
  private connected = false;
  private gatewayConnectionId?: string;

  constructor(config: TelegramConfig) {
    super();
    this.config = {
      mode: "polling",
      port: 3000,
      allowedUpdates: ["message", "edited_message", "callback_query"],
      ...config,
    };
  }

  /**
   * Start Telegram bot
   */
  async start(): Promise<void> {
    if (!this.config.token) {
      throw new Error("Telegram bot token required");
    }

    console.log("[Telegram] Starting bot...");

    this.bot = new TelegramBot(this.config.token, {
      polling: this.config.mode === "polling",
      webHook: this.config.mode === "webhook" ? {
        port: this.config.port!,
      } : false,
    });

    // Setup webhook if needed
    if (this.config.mode === "webhook" && this.config.webhookUrl) {
      await this.bot.setWebHook(this.config.webhookUrl);
      console.log(`[Telegram] Webhook set: ${this.config.webhookUrl}`);
    }

    // Handle messages
    this.bot.on("message", (msg) => this.handleMessage(msg));
    this.bot.on("edited_message", (msg) => this.handleMessage(msg, true));
    this.bot.on("callback_query", (query) => this.handleCallback(query));

    // Handle polling errors
    this.bot.on("polling_error", (err) => {
      console.error("[Telegram] Polling error:", err.message);
      this.emit("error", err);
    });

    this.connected = true;
    console.log("[Telegram] Bot started successfully");

    // Register with gateway
    this.registerWithGateway();

    this.emit("connected", { bot: this.bot });
  }

  /**
   * Stop Telegram bot
   */
  async stop(): Promise<void> {
    console.log("[Telegram] Stopping...");
    this.unregisterFromGateway();

    if (this.bot) {
      if (this.config.mode === "webhook") {
        await this.bot.deleteWebHook();
      } else {
        await this.bot.stopPolling();
      }
      this.bot = undefined;
    }

    this.connected = false;
    console.log("[Telegram] Stopped");
  }

  /**
   * Send message
   */
  async sendMessage(chatId: number | string, text: string, options?: {
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    replyTo?: number;
    buttons?: Array<Array<{ text: string; callbackData: string }>>;
  }): Promise<void> {
    if (!this.bot) {
      throw new Error("Bot not initialized");
    }

    const sendOptions: any = {};
    if (options?.parseMode) sendOptions.parse_mode = options.parseMode;
    if (options?.replyTo) sendOptions.reply_to_message_id = options.replyTo;
    if (options?.buttons) {
      sendOptions.reply_markup = {
        inline_keyboard: options.buttons.map(row =>
          row.map(btn => ({ text: btn.text, callback_data: btn.callbackData }))
        ),
      };
    }

    await this.bot.sendMessage(chatId, text, sendOptions);
  }

  /**
   * Send typing indicator
   */
  async sendTyping(chatId: number | string): Promise<void> {
    if (!this.bot) return;
    await this.bot.sendChatAction(chatId, "typing");
  }

  /**
   * Send photo
   */
  async sendPhoto(chatId: number | string, photo: Buffer | string, caption?: string): Promise<void> {
    if (!this.bot) return;
    await this.bot.sendPhoto(chatId, photo, { caption });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(msg: TelegramBot.Message, edited = false): void {
    const message: TelegramMessage = {
      id: msg.message_id,
      from: {
        id: msg.from?.id || 0,
        username: msg.from?.username,
        firstName: msg.from?.first_name,
      },
      chat: {
        id: msg.chat.id,
        type: msg.chat.type as any,
        title: (msg.chat as any).title,
      },
      text: msg.text,
      caption: msg.caption,
      date: msg.date * 1000,
      isGroup: msg.chat.type !== "private",
      entities: msg.entities?.map(e => ({ type: e.type, offset: e.offset, length: e.length })),
    };

    console.log(`[Telegram] ${edited ? "Edited" : "New"} message from ${message.from.username || message.from.id}`);

    // Forward to gateway
    this.forwardToGateway(message);

    this.emit("message", message);
  }

  /**
   * Handle callback query
   */
  private handleCallback(query: TelegramBot.CallbackQuery): void {
    console.log("[Telegram] Callback query:", query.data);
    
    // Answer callback to remove loading state
    this.bot?.answerCallbackQuery(query.id);

    this.emit("callback", {
      id: query.id,
      from: query.from,
      data: query.data,
      message: query.message,
    });
  }

  /**
   * Forward to gateway
   */
  private forwardToGateway(message: TelegramMessage): void {
    const gateway = getRealGateway();

    gateway.emit("message", {
      connection: {
        id: this.gatewayConnectionId,
        type: "telegram",
        channel: message.isGroup ? "group" : "dm",
        user: String(message.from.id),
      },
      data: {
        type: "chat",
        id: String(message.id),
        payload: message,
        timestamp: message.date,
      },
    });
  }

  /**
   * Register with gateway
   */
  private registerWithGateway(): void {
    const gateway = getRealGateway();

    this.gatewayConnectionId = gateway.registerConnection({
      type: "telegram",
      channel: "telegram",
      user: "bot",
    });

    gateway.on("message", (event: any) => {
      if (event.type === "telegram" && event.message) {
        const { chatId, text, options } = event.message;
        this.sendMessage(chatId, text, options).catch(console.error);
      }
    });
  }

  /**
   * Unregister from gateway
   */
  private unregisterFromGateway(): void {
    if (this.gatewayConnectionId) {
      const gateway = getRealGateway();
      gateway.removeConnection(this.gatewayConnectionId);
      this.gatewayConnectionId = undefined;
    }
  }

  getStatus(): { connected: boolean; mode: string; bot?: string } {
    return {
      connected: this.connected,
      mode: this.config.mode,
      bot: this.bot ? "initialized" : undefined,
    };
  }
}

// Singleton
let instance: TelegramIntegration | null = null;

export function getTelegramIntegration(config?: TelegramConfig): TelegramIntegration {
  if (!instance && config) {
    instance = new TelegramIntegration(config);
  }
  if (!instance) {
    throw new Error("Telegram not initialized");
  }
  return instance;
}

export function resetTelegramIntegration(): void {
  instance?.stop();
  instance = null;
}

export { TelegramIntegration };
export default TelegramIntegration;
