/**
 * WhatsApp Bot Example - v0.3.0
 * 
 * Simple bot that responds to messages.
 */

import { getWhatsAppIntegration } from "../src/channels/index.js";

async function main() {
  console.log("🤖 Starting WhatsApp Example Bot...");

  const whatsapp = getWhatsAppIntegration({
    sessionPath: "./whatsapp-session",
  });

  // Handle QR code
  whatsapp.on("qr", (qr: string) => {
    console.log("\n📱 Scan this QR code with WhatsApp:\n");
    console.log(qr);
    console.log("\n👉 WhatsApp > Settings > Linked Devices\n");
  });

  // Handle connection
  whatsapp.on("connected", () => {
    console.log("✅ Bot connected! Ready to receive messages.");
    console.log("\nTry sending: 'hello' or 'help'\n");
  });

  // Handle messages
  whatsapp.on("message", async (msg) => {
    console.log(`📩 ${msg.from}: ${msg.body}`);

    // Simple responses
    const body = msg.body.toLowerCase().trim();

    if (body === "hello" || body === "hi") {
      await whatsapp.sendText(msg.from, "👋 Hello! I'm your 0xKobold!");
    } else if (body === "help") {
      await whatsapp.sendText(
        msg.from,
        "🤖 Available commands:\n\n" +
        "hello - Greeting\n" +
        "help - This message\n" +
        "ping - Test response\n" +
        "about - Bot info"
      );
    } else if (body === "ping") {
      await whatsapp.sendText(msg.from, "🏓 Pong!");
    } else if (body === "about") {
      await whatsapp.sendText(
        msg.from,
        "🐉 0xKobold v0.3.0\n" +
        "Your personal AI assistant\n" +
        "Multi-channel · Secure · Fast"
      );
    } else if (!msg.fromMe) {
      // Echo for unknown commands
      await whatsapp.sendTyping(msg.from);
      setTimeout(() => {
        whatsapp.sendText(msg.from, `You said: "${msg.body}"`);
      }, 1000);
    }
  });

  // Start
  await whatsapp.start();

  // Handle shutdown
  process.on("SIGINT", async () => {
    console.log("\n🛑 Stopping bot...");
    process.exit(0);
  });
}

main().catch(console.error);
