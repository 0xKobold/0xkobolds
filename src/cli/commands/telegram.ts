/**
 * Telegram CLI Command - v0.3.0
 *
 * Manage Telegram bot integration.
 */

import { Command } from "commander";
import {
  getTelegramIntegration,
  resetTelegramIntegration,
} from "../../channels/index.js";

export function createTelegramCommand(): Command {
  const cmd = new Command("telegram")
    .description("Manage Telegram integration");

  // Start Telegram
  cmd
    .command("start")
    .description("Start Telegram bot")
    .option("--token <token>", "Bot token (or set TELEGRAM_BOT_TOKEN)")
    .option("--mode <mode>", "Connection mode (polling|webhook)", "polling")
    .action(async (options) => {
      const token = options.token || process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        console.error("❌ Telegram bot token required");
        console.error("Set TELEGRAM_BOT_TOKEN or use --token");
        process.exit(1);
      }

      console.log("📱 Starting Telegram bot...");

      try {
        const telegram = getTelegramIntegration({
          token,
          mode: options.mode,
        });

        telegram.on("connected", () => {
          console.log("✅ Telegram bot connected!");
          console.log("Mode:", options.mode);
        });

        telegram.on("message", (msg) => {
          console.log(`📩 ${msg.isGroup ? "Group" : "DM"}: ${msg.text?.slice(0, 50)}...`);
        });

        telegram.on("error", (err) => {
          console.error("❌ Telegram error:", err.message);
        });

        await telegram.start();

        console.log("\n🔄 Telegram bot running...");
        console.log("Press Ctrl+C to stop\n");

        process.on("SIGINT", async () => {
          console.log("\n🛑 Stopping Telegram...");
          await resetTelegramIntegration();
          console.log("✅ Telegram stopped");
          process.exit(0);
        });
      } catch (error) {
        console.error("❌ Failed to start Telegram:", error);
        process.exit(1);
      }
    });

  // Stop
  cmd
    .command("stop")
    .description("Stop Telegram bot")
    .action(async () => {
      console.log("🛑 Stopping Telegram...");
      await resetTelegramIntegration();
      console.log("✅ Telegram stopped");
    });

  // Status
  cmd
    .command("status")
    .description("Check Telegram status")
    .action(() => {
      try {
        const telegram = getTelegramIntegration();
        const status = telegram.getStatus();

        if (status.connected) {
          console.log("🟢 Telegram: Connected");
          console.log(`   Mode: ${status.mode}`);
        } else {
          console.log("🔴 Telegram: Not running");
          console.log("   Run: 0xkobold telegram start");
        }
      } catch {
        console.log("🔴 Telegram: Not initialized");
        console.log("   Run: 0xkobold telegram start --token <token>");
      }
    });

  // Send message
  cmd
    .command("send")
    .description("Send test message")
    .argument("<chatId>", "Chat ID (e.g., 123456789)")
    .argument("<message>", "Message text")
    .option("--token <token>", "Bot token")
    .action(async (chatId: string, message: string, options) => {
      try {
        const token = options.token || process.env.TELEGRAM_BOT_TOKEN;
        const telegram = getTelegramIntegration(token ? { token, mode: "polling" } : undefined);

        if (!telegram.getStatus().connected) {
          console.error("❌ Telegram not connected");
          return;
        }

        await telegram.sendMessage(chatId, message);
        console.log("✅ Message sent");
      } catch (error) {
        console.error("❌ Failed to send:", error);
        process.exit(1);
      }
    });

  return cmd;
}
