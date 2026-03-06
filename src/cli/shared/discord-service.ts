/**
 * Discord Service - Shared logic for CLI and TUI
 */

export interface DiscordStatus {
  connected: boolean;
  botInfo?: {
    username: string;
    discriminator?: string;
    id: string;
  };
  error?: string;
}

export async function getDiscordStatus(token?: string): Promise<DiscordStatus> {
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

    if (response.ok) {
      const botInfo = await response.json() as { username: string; discriminator?: string; id: string };
      return {
        connected: true,
        botInfo: {
          username: botInfo.username,
          discriminator: botInfo.discriminator,
          id: botInfo.id,
        },
      };
    } else {
      const errorText = await response.text();
      return { 
        connected: false, 
        error: `Discord API error: ${response.status} ${errorText}` 
      };
    }
  } catch (err) {
    return { 
      connected: false, 
      error: err instanceof Error ? err.message : String(err) 
    };
  }
}

export interface SendDiscordMessageOptions {
  channelId?: string;
  userId?: string;
  content: string;
  token?: string;
}

export async function sendDiscordMessage(
  options: SendDiscordMessageOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const token = options.token || process.env.DISCORD_BOT_TOKEN;
  
  if (!token) {
    return { success: false, error: "DISCORD_BOT_TOKEN not set" };
  }

  try {
    let targetChannelId = options.channelId;
    
    // If userId provided, create DM channel first
    if (options.userId) {
      const dmResponse = await fetch("https://discord.com/api/v10/users/@me/channels", {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipient_id: options.userId }),
      });

      if (!dmResponse.ok) {
        return { 
          success: false, 
          error: `Failed to create DM: ${dmResponse.status}` 
        };
      }

      const dmChannel = await dmResponse.json() as { id: string };
      targetChannelId = dmChannel.id;
    }

    if (!targetChannelId) {
      return { success: false, error: "No channel or user ID provided" };
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${targetChannelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: options.content }),
      }
    );

    if (response.ok) {
      const result = await response.json() as { id: string };
      return { success: true, messageId: result.id };
    } else {
      const errorText = await response.text();
      return { success: false, error: `Discord API error: ${response.status} ${errorText}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function formatDiscordStatus(status: DiscordStatus): string {
  if (status.connected && status.botInfo) {
    const { username, discriminator, id } = status.botInfo;
    const discrim = discriminator ? `#${discriminator}` : "";
    return `🟢 Discord: ${username}${discrim}\n   ID: ${id}`;
  } else {
    return `🔴 Discord: ${status.error || "Not connected"}`;
  }
}
