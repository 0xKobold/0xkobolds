/**
 * Delivery Integration - Wire delivery system to gateways
 * 
 * Connects delivery.ts to Discord and WebSocket for proactive messaging.
 */

import {
  getDeliverySystem,
  initDeliveryWithDiscord,
  initDeliveryWithWebSocket,
  type DeliveryTarget,
  type DeliverySystem,
} from "./delivery.js";
import type { RealGatewayServer } from "./gateway-server.js";
import type { Client, TextChannel } from "discord.js";

let deliverySystem: DeliverySystem | null = null;

/**
 * Initialize delivery system with Discord client
 */
export function initDeliveryFromDiscord(
  discordClient: Client,
  homeChannelId?: string
): DeliverySystem {
  const ds = getDeliverySystem();

  // Register Discord handler
  ds.registerHandler("discord", async (message) => {
    try {
      const channelId = message.target.channelId ?? message.target.platformId;
      const channel = await discordClient.channels.fetch(channelId);
      
      if (!channel || !("send" in channel)) {
        return { success: false, error: `Channel ${channelId} not found or not text-based` };
      }

      const textChannel = channel as TextChannel;
      
      // Split long messages
      const chunks = chunkMessage(message.content, 2000);
      
      for (const chunk of chunks) {
        await textChannel.send(chunk);
      }
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // Set home channel if provided
  if (homeChannelId) {
    ds.setHomeChannel({
      id: `discord-${homeChannelId}`,
      type: "discord",
      platformId: homeChannelId,
      channelId: homeChannelId,
      priority: 1,
    });
  }

  deliverySystem = ds;
  return ds;
}

/**
 * Initialize delivery system with WebSocket gateway
 */
export function initDeliveryFromGateway(
  gateway: RealGatewayServer,
  homeSessionKey?: string
): DeliverySystem {
  const ds = getDeliverySystem();

  // Register WebSocket handler
  ds.registerHandler("websocket", async (message) => {
    try {
      // Broadcast to all WebSocket clients
      const payload = {
        type: "delivery",
        data: {
          id: message.id,
          content: message.content,
          sourceSessionKey: message.sourceSessionKey,
          priority: message.priority,
          timestamp: message.createdAt,
        },
      };

      gateway.broadcast(payload);
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // Set home channel if provided
  if (homeSessionKey) {
    ds.setHomeChannel({
      id: `ws-${homeSessionKey}`,
      type: "websocket",
      platformId: homeSessionKey,
      priority: 1,
    });
  }

  deliverySystem = ds;
  return ds;
}

/**
 * Initialize delivery system with CLI (local terminal)
 */
export function initDeliveryFromCli(): DeliverySystem {
  const ds = getDeliverySystem();

  ds.registerHandler("cli", async (message) => {
    try {
      // For CLI, just log to console with formatting
      const prefix = message.priority === "urgent" ? "🚨 " : 
                     message.priority === "high" ? "⚡ " : "";
      console.log(`${prefix}${message.content}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // CLI is the home channel by default
  ds.setHomeChannel({
    id: "cli-home",
    type: "cli",
    platformId: "local",
    priority: 1,
  });

  deliverySystem = ds;
  return ds;
}

/**
 * Get the global delivery system
 */
export function getDelivery(): DeliverySystem | null {
  return deliverySystem;
}

/**
 * Deliver message to home channel
 */
export async function deliverToHome(
  content: string,
  options?: {
    sourceSessionId?: string;
    sourceSessionKey?: string;
    priority?: "low" | "normal" | "high" | "urgent";
  }
): Promise<boolean> {
  if (!deliverySystem) {
    console.warn("[Delivery] System not initialized");
    return false;
  }

  const message = deliverySystem.deliverToHome(content, options);
  return message !== null;
}

/**
 * Deliver message to specific Discord channel
 */
export async function deliverToDiscord(
  channelId: string,
  content: string,
  options?: {
    priority?: "low" | "normal" | "high" | "urgent";
    sourceSessionId?: string;
    sourceSessionKey?: string;
  }
): Promise<boolean> {
  if (!deliverySystem) {
    console.warn("[Delivery] System not initialized");
    return false;
  }

  const target: DeliveryTarget = {
    id: `discord-${channelId}`,
    type: "discord",
    platformId: channelId,
    channelId,
    priority: options?.priority === "urgent" ? 4 : 
               options?.priority === "high" ? 3 : 
               options?.priority === "normal" ? 2 : 1,
  };

  deliverySystem.registerTarget(target);
  const message = deliverySystem.queueDelivery(content, target, options ?? {});
  
  return message.status !== "failed";
}

/**
 * Set home channel from config
 */
export function setHomeChannelFromConfig(config: {
  platform: "discord" | "cli" | "websocket";
  channelId?: string;
  sessionKey?: string;
}): void {
  if (!deliverySystem) {
    console.warn("[Delivery] System not initialized");
    return;
  }

  const target: DeliveryTarget = {
    id: `home-${config.platform}`,
    type: config.platform,
    platformId: config.channelId ?? config.sessionKey ?? "default",
    channelId: config.channelId,
    priority: 1,
    isHome: true,
  };

  deliverySystem.setHomeChannel(target);
  console.log(`[Delivery] Home channel set: ${config.platform}/${target.platformId}`);
}

/**
 * Mirror message from remote platform to local session
 * Use this to keep CLI/gateway in sync with Discord messages
 */
export function mirrorFromPlatform(
  content: string,
  sourceSessionKey: string,
  sourcePlatform: string,
  metadata?: Record<string, unknown>
): void {
  if (!deliverySystem) {
    return;
  }

  deliverySystem.mirrorToLocal(content, sourceSessionKey, sourcePlatform, metadata);
}

/**
 * Helper: Chunk message for platforms with character limits
 */
function chunkMessage(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    // Try to find a good break point
    let breakPoint = maxLength;
    
    // Prefer breaking at newline
    const lastNewline = remaining.lastIndexOf("\n", maxLength);
    if (lastNewline > maxLength * 0.5) {
      breakPoint = lastNewline + 1;
    } else {
      // Try breaking at space
      const lastSpace = remaining.lastIndexOf(" ", maxLength);
      if (lastSpace > maxLength * 0.5) {
        breakPoint = lastSpace + 1;
      }
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint);
  }

  return chunks;
}

/**
 * Initialize from existing gateway config
 */
export function initDeliveryFromConfig(config: {
  discordClient?: Client;
  gateway?: RealGatewayServer;
  homeChannelId?: string;
  homeSessionKey?: string;
}): DeliverySystem | null {
  if (config.discordClient) {
    return initDeliveryFromDiscord(config.discordClient, config.homeChannelId);
  }

  if (config.gateway) {
    return initDeliveryFromGateway(config.gateway, config.homeSessionKey);
  }

  // Default to CLI
  return initDeliveryFromCli();
}

export default {
  initDeliveryFromDiscord,
  initDeliveryFromGateway,
  initDeliveryFromCli,
  initDeliveryFromConfig,
  getDelivery,
  deliverToHome,
  deliverToDiscord,
  setHomeChannelFromConfig,
  mirrorFromPlatform,
};