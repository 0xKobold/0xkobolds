/**
 * Discord Channel Extension for 0xKobold
 * 
 * Enables bidirectional Discord communication
 * Based on OpenClaw channel architecture
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface DiscordConfig {
  botToken: string;
  webhookUrl?: string;
  defaultChannelId?: string;
  dmUserId?: string;
}

class DiscordClient {
  private token: string;
  private baseUrl = "https://discord.com/api/v10";

  constructor(token: string) {
    this.token = token;
  }

  async sendMessage(channelId: string, content: string): Promise<{ id: string }> {
    const response = await fetch(`${this.baseUrl}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }
    return response.json() as Promise<{ id: string }>;
  }

  async sendDM(userId: string, content: string): Promise<{ id: string }> {
    const dmResponse = await fetch(`${this.baseUrl}/users/@me/channels`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: userId }),
    });

    if (!dmResponse.ok) {
      throw new Error(`Failed to create DM: ${dmResponse.status}`);
    }

    const dmChannel = await dmResponse.json() as { id: string };
    return this.sendMessage(dmChannel.id, content);
  }
}

// TUI Discord functions
async function getBotInfo(token?: string): Promise<{
  connected: boolean;
  botInfo?: { username: string; id: string };
  error?: string;
}> {
  const botToken = token || process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return { connected: false, error: "DISCORD_BOT_TOKEN not set" };
  }

  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return { connected: false, error: `Discord API error: ${response.status}` };
    }

    const bot = await response.json() as { username: string; id: string };
    return {
      connected: true,
      botInfo: { username: bot.username, id: bot.id },
    };
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendDiscordMessage(
  token: string,
  channelId: string,
  content: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      }
    );

    if (response.ok) {
      const result = await response.json() as { id: string };
      return { success: true, messageId: result.id };
    } else {
      return { success: false, error: `Discord API error: ${response.status}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default function discordChannelExtension(pi: ExtensionAPI) {
  console.log("[DiscordChannel] Extension loading...");

  // ═══════════════════════════════════════════════════════════════
  // TOOLS
  // ═══════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "discord_send_message",
    label: "discord_send_message",
    description: "Send a message to a Discord channel",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "Discord channel ID" },
        content: { type: "string", description: "Message content" },
      },
      required: ["channel_id", "content"],
    },
    async execute(_toolCallId: string, args: any) {
      const token = process.env.DISCORD_BOT_TOKEN;
      if (!token) {
        return { content: [{ type: "text" as const, text: "DISCORD_BOT_TOKEN not configured" }], details: { success: false } };
      }

      const result = await sendDiscordMessage(token, args.channel_id, args.content);
      return { 
        content: [{ type: "text" as const, text: result.success ? `Message sent! ID: ${result.messageId}` : `Error: ${result.error}` }], 
        details: result 
      };
    },
  });

  pi.registerTool({
    name: "discord_send_dm",
    label: "discord_send_dm",
    description: "Send a DM to a Discord user",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "Discord user ID" },
        content: { type: "string", description: "Message content" },
      },
      required: ["user_id", "content"],
    },
    async execute(_toolCallId: string, args: any) {
      const token = process.env.DISCORD_BOT_TOKEN;
      if (!token) {
        return { content: [{ type: "text" as const, text: "DISCORD_BOT_TOKEN not configured" }], details: { success: false } };
      }

      try {
        const client = new DiscordClient(token);
        const result = await client.sendDM(args.user_id, args.content);
        return { content: [{ type: "text" as const, text: `DM sent! ID: ${result.id}` }], details: { success: true, messageId: result.id } };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${String(error)}` }], details: { success: false, error: String(error) } };
      }
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // TUI COMMANDS
  // ═══════════════════════════════════════════════════════════════

  pi.registerCommand("discord-status", {
    description: "Check Discord connection status",
    handler: async (_args, ctx) => {
      const result = await getBotInfo();

      if (result.connected && result.botInfo) {
        ctx.ui.notify(
          `🟢 Discord Connected\nBot: ${result.botInfo.username}\nID: ${result.botInfo.id}`,
          "info"
        );
      } else {
        ctx.ui.notify(`🔴 Discord Error\n${result.error}`, "error");
      }
    },
  });

  pi.registerCommand("discord-test", {
    description: "Send test message to Discord",
    handler: async (args, ctx) => {
      const parts = args.trim().split(" ");
      const channelId = parts[0];
      const message = parts.slice(1).join(" ") || "🧪 Test from 0xKobold";

      if (!channelId) {
        ctx.ui.notify("Usage: /discord-test <channel-id> [message]", "error");
        return;
      }

      const token = process.env.DISCORD_BOT_TOKEN;
      if (!token) {
        ctx.ui.notify("❌ DISCORD_BOT_TOKEN not set", "error");
        return;
      }

      const result = await sendDiscordMessage(token, channelId, message);
      if (result.success) {
        ctx.ui.notify(`✅ Message sent! ID: ${result.messageId}`, "info");
      } else {
        ctx.ui.notify(`❌ Failed: ${result.error}`, "error");
      }
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTO-NOTIFICATION
  // ═══════════════════════════════════════════════════════════════
  pi.on("agent_end", async () => {
    const channelId = process.env.DISCORD_NOTIFY_CHANNEL_ID;
    const token = process.env.DISCORD_BOT_TOKEN;
    
    if (!channelId || !token) return;

    try {
      await sendDiscordMessage(token, channelId, "✅ Agent completed");
    } catch (error) {
      console.error("[Discord] Notification failed:", error);
    }
  });

  console.log("[DiscordChannel] Extension loaded");
}
