/**
 * WhatsApp CLI Command - v0.3.0
 *
 * Manage WhatsApp bot integration.
 */

import { Command } from "commander";
import {
  getWhatsAppIntegration,
  resetWhatsAppIntegration,
} from "../../channels/index.js";

export function createWhatsAppCommand(): Command {
  const cmd = new Command("whatsapp")
    .description("Manage WhatsApp integration")
    .option("--session <path>", "Session storage path", "~/.0xkobold/whatsapp-session");

  // Start WhatsApp
  cmd
    .command("start")
    .description("Start WhatsApp connection")
    .action(async (options) => {
      console.log("📱 Starting WhatsApp connection...");
      console.log("⚠️  Make sure to scan the QR code with your WhatsApp app\n");

      try {
        const whatsapp = getWhatsAppIntegration({
          sessionPath: options.session,
        });

        // Listen for events
        whatsapp.on("qr", (qr: string) => {
          console.log("\n📱 QR CODE:");
          console.log(qr);
          console.log("\n👉 Scan this with WhatsApp > Settings > Linked Devices\n");
        });

        whatsapp.on("connected", (info: unknown) => {
          console.log("✅ WhatsApp connected!");
          console.log("User:", info);
          console.log("\nYou can now receive messages.");
        });

        whatsapp.on("message", (msg: unknown) => {
          const message = msg as {
            from: string;
            body: string;
            isGroup: boolean;
          };
          console.log(
            `📩 ${message.isGroup ? "Group" : "DM"} from ${message.from}: ${message.body.slice(0, 50)}...`
          );
        });

        whatsapp.on("disconnected", (info: { shouldReconnect: boolean }) => {
          if (info.shouldReconnect) {
            console.log("⚠️ Disconnected. Will reconnect...");
          } else {
            console.log("❌ Logged out. Run '0xkobold whatsapp start' again.");
            process.exit(0);
          }
        });

        await whatsapp.start();

        console.log("\n🔄 WhatsApp bot running...");
        console.log("Press Ctrl+C to stop\n");

        // Keep alive
        process.on("SIGINT", async () => {
          console.log("\n🛑 Stopping WhatsApp...");
          await resetWhatsAppIntegration();
          console.log("✅ WhatsApp stopped");
          process.exit(0);
        });
      } catch (error) {
        console.error("❌ Failed to start WhatsApp:", error);
        process.exit(1);
      }
    });

  // Stop WhatsApp
  cmd
    .command("stop")
    .description("Stop WhatsApp connection")
    .action(async () => {
      console.log("🛑 Stopping WhatsApp...");
      await resetWhatsAppIntegration();
      console.log("✅ WhatsApp stopped");
    });

  // Status
  cmd
    .command("status")
    .description("Check WhatsApp status")
    .action(() => {
      const whatsapp = getWhatsAppIntegration();
      const status = whatsapp.getStatus();

      if (status.connected) {
        console.log("🟢 WhatsApp: Connected");
        console.log(`   User: ${status.user || "Unknown"}`);
      } else if (status.qr) {
        console.log("🟡 WhatsApp: Waiting for QR scan");
        console.log("   Run: 0xkobold whatsapp start");
      } else {
        console.log("🔴 WhatsApp: Not running");
        console.log("   Run: 0xkobold whatsapp start");
      }
    });

  // Send message (test)
  cmd
    .command("send")
    .description("Send a test message")
    .argument("<number>", "Phone number (e.g., 1234567890)")
    .argument("<message>", "Message to send")
    .action(async (number: string, message: string) => {
      try {
        const whatsapp = getWhatsAppIntegration();

        if (!whatsapp.getStatus().connected) {
          console.error("❌ WhatsApp not connected. Run: 0xkobold whatsapp start");
          return;
        }

        console.log(`📤 Sending to ${number}...`);
        await whatsapp.sendText(number, message);
        console.log("✅ Message sent");
      } catch (error) {
        console.error("❌ Failed to send:", error);
        process.exit(1);
      }
    });

  return cmd;
}
