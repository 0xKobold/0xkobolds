/**
 * Discord CLI Extension
 * 
 * Registers Discord subcommands under 0xkobold CLI
 */

import { Command } from "commander";

export function registerDiscordCli(program: Command): void {
  const discord = program
    .command("discord")
    .description("Discord channel management");

  discord
    .command("status")
    .description("Check Discord connection status")
    .action(async () => {
      const token = process.env.DISCORD_BOT_TOKEN;
      if (!token) {
        console.log("❌ DISCORD_BOT_TOKEN not set");
        console.log("   Set with: export DISCORD_BOT_TOKEN=your_token");
        return;
      }

      try {
        const response = await fetch("https://discord.com/api/v10/users/@me", {
          headers: { Authorization: `Bot ${token}` },
        });

        if (response.ok) {
          const bot = await response.json() as { username: string; discriminator?: string; id: string };
          console.log(`🟢 Discord: Connected`);
          console.log(`   Bot: ${bot.username}#${bot.discriminator || "0000"}`);
          console.log(`   ID: ${bot.id}`);
        } else {
          console.log("🔴 Discord: Connection failed");
          console.log(`   Error: ${response.status} ${await response.text()}`);
        }
      } catch (err) {
        console.log("🔴 Discord: Connection error");
        console.log(`   ${err}`);
      }
    });

  discord
    .command("test <channel>")
    .description("Send test message to channel")
    .option("-m, --message <text>", "Message content", "🧪 Test from 0xKobold")
    .action(async (channelId, opts) => {
      const token = process.env.DISCORD_BOT_TOKEN;
      if (!token) {
        console.error("❌ DISCORD_BOT_TOKEN not set");
        process.exit(1);
      }

      try {
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: opts.message }),
        });

        if (response.ok) {
          const result = await response.json() as { id: string };
          console.log(`✅ Message sent! ID: ${result.id}`);
        } else {
          console.error(`❌ Failed: ${response.status} ${await response.text()}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`❌ Error: ${err}`);
        process.exit(1);
      }
    });

  discord
    .command("notify <message>")
    .description("Send notification to configured channel")
    .option("--channel <id>", "Override channel ID")
    .option("--urgent", "Mark as urgent")
    .action(async (message, opts) => {
      const token = process.env.DISCORD_BOT_TOKEN;
      const channelId = opts.channel || process.env.DISCORD_NOTIFY_CHANNEL_ID;
      
      if (!token) {
        console.error("❌ DISCORD_BOT_TOKEN not set");
        process.exit(1);
      }
      if (!channelId) {
        console.error("❌ No channel ID. Set DISCORD_NOTIFY_CHANNEL_ID or use --channel");
        process.exit(1);
      }

      const prefix = opts.urgent ? "🚨 " : "";
      
      try {
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: prefix + message }),
        });

        if (response.ok) {
          console.log("✅ Notification sent");
        } else {
          console.error(`❌ Failed: ${response.status}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`❌ Error: ${err}`);
        process.exit(1);
      }
    });
}
