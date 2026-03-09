/**
 * Multi-Channel Bot Example - v0.3.0
 * 
 * Bot that works across Discord, WhatsApp, and Telegram.
 */

import { getWhatsAppIntegration } from "../src/channels/whatsapp/integration.js";
import { getTelegramIntegration } from "../src/channels/telegram/bot.js";

interface ChannelMessage {
  channel: string;
  from: string;
  text?: string;
  isGroup?: boolean;
}

// Bot logic
class MultiChannelBot {
  private name = "0xBot";
  private commands = new Map([
    ["help", this.help.bind(this)],
    ["status", this.status.bind(this)],
    ["time", this.time.bind(this)],
    ["echo", this.echo.bind(this)],
  ]);

  async handleMessage(msg: ChannelMessage, reply: (text: string) => Promise<void>): Promise<void> {
    const text = msg.text?.toLowerCase().trim() || "";
    
    if (text.startsWith("/") || text.startsWith("!")) {
      const [command, ...args] = text.slice(1).split(" ");
      const handler = this.commands.get(command);
      
      if (handler) {
        await handler(msg, args.join(" "), reply);
      } else {
        await reply(`❓ Unknown command: ${command}. Try: help`);
      }
    }
  }

  private async help(msg: ChannelMessage, _: string, reply: ReplyFn): Promise<void> {
    await reply(
      `🤖 ${this.name} v0.3.0\n\n` +
      `Commands:\n` +
      `  help  - Show this message\n` +
      `  status - Bot status\n` +
      `  time   - Current time\n` +
      `  echo   - Echo back text`
    );
  }

  private async status(msg: ChannelMessage, _: string, reply: ReplyFn): Promise<void> {
    await reply(
      `🟢 ${this.name} Online\n` +
      `Channel: ${msg.channel}\n` +
      `From: ${msg.from.slice(0, 20)}...`
    );
  }

  private async time(msg: ChannelMessage, _: string, reply: ReplyFn): Promise<void> {
    await reply(`🕐 ${new Date().toISOString()}`);
  }

  private async echo(msg: ChannelMessage, text: string, reply: ReplyFn): Promise<void> {
    await reply(`📢 ${text || "No text provided"}`);
  }
}

type ReplyFn = (text: string) => Promise<void>;

// Start WhatsApp bot
async function startWhatsApp(): Promise<void> {
  const bot = new MultiChannelBot();
  const whatsapp = getWhatsAppIntegration();

  whatsapp.on("message", async (msg) => {
    await bot.handleMessage(
      { channel: "whatsapp", from: msg.from, text: msg.body, isGroup: msg.isGroup },
      (text) => whatsapp.sendText(msg.from, text)
    );
  });

  whatsapp.on("qr", () => console.log("📱 WhatsApp: Scan QR code"));
  whatsapp.on("connected", () => console.log("✅ WhatsApp: Connected"));

  await whatsapp.start();
}

// Start Telegram bot
async function startTelegram(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("⚠️  Telegram: No token (set TELEGRAM_BOT_TOKEN)");
    return;
  }

  const bot = new MultiChannelBot();
  const telegram = getTelegramIntegration({ token, mode: "polling" });

  telegram.on("message", async (msg) => {
    await bot.handleMessage(
      { channel: "telegram", from: String(msg.from.id), text: msg.text, isGroup: msg.isGroup },
      (text) => telegram.sendMessage(msg.chat.id, text)
    );
  });

  telegram.on("connected", () => console.log("✅ Telegram: Connected"));

  await telegram.start();
}

// Main: Start all channels
async function main() {
  console.log("🤖 Multi-Channel Bot Demo (v0.3.0)\n");

  try {
    await Promise.all([
      startWhatsApp(),
      startTelegram(),
    ]);

    console.log("\n✅ All channels started!");
    console.log("Send 'help' in any channel to see commands");
  } catch (err) {
    console.error("❌ Error:", err);
  }

  // Keep alive
  process.on("SIGINT", () => {
    console.log("\n🛑 Stopping...");
    process.exit(0);
  });
}

main();
