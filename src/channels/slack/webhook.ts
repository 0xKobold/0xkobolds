/**
 * Slack Integration - v0.3.0
 * 
 * Webhook and slash command support for Slack.
 */

import { EventEmitter } from "events";
import { getGateway } from "../../gateway/index.js";

export interface SlackConfig {
  webhookUrl: string;
  botToken?: string;
  signingSecret?: string;
  port?: number;
}

export interface SlackMessage {
  type: "message" | "command" | "action";
  channel?: string;
  user?: string;
  username?: string;
  text: string;
  timestamp: number;
  team?: string;
  responseUrl?: string;
  triggerId?: string;
  command?: string;
  args?: string[];
}

class SlackIntegration extends EventEmitter {
  private config: SlackConfig;
  private connected = false;
  private gatewayConnectionId?: string;

  constructor(config: SlackConfig) {
    super();
    this.config = {
      port: 3001,
      ...config,
    };
  }

  /**
   * Send message via webhook
   */
  async sendMessage(text: string, options?: {
    channel?: string;
    username?: string;
    iconEmoji?: string;
    blocks?: unknown[];
  }): Promise<{ ok: boolean; error?: string }> {
    const payload: any = { text };
    
    if (options?.channel) payload.channel = options.channel;
    if (options?.username) payload.username = options.username;
    if (options?.iconEmoji) payload.icon_emoji = options.iconEmoji;
    if (options?.blocks) payload.blocks = options.blocks;

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        return { ok: false, error };
      }

      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  /**
   * Send rich message with blocks
   */
  async sendRichMessage(blocks: unknown[]): Promise<{ ok: boolean }> {
    return this.sendMessage("", { blocks });
  }

  /**
   * Send typing indicator (simulated via webhook)
   */
  async sendTyping(channel: string): Promise<void> {
    // Slack webhooks don't support typing, but we can simulate with a status update
    console.log(`[Slack] Typing in ${channel}`);
  }

  /**
   * Handle incoming webhook
   */
  handleWebhook(payload: SlackMessage): void {
    console.log(`[Slack] ${payload.type}: ${payload.text.slice(0, 50)}...`);
    
    // Forward to gateway
    this.forwardToGateway(payload);
    
    this.emit("message", payload);
  }

  /**
   * Verify Slack signature
   */
  verifySignature(body: string, timestamp: string, signature: string): boolean {
    if (!this.config.signingSecret) {
      // Skip verification if no secret configured
      return true;
    }

    // Simple verification - in production use proper HMAC
    const crypto = require("node:crypto");
    const hmac = crypto.createHmac("sha256", this.config.signingSecret);
    hmac.update(`v0:${timestamp}:${body}`);
    const expected = `v0=${hmac.digest("hex")}`;
    
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  }

  /**
   * Forward to gateway
   */
  private forwardToGateway(message: SlackMessage): void {
    const gateway = getGateway();
    
    gateway.emit("message", {
      connection: {
        id: this.gatewayConnectionId,
        type: "slack",
        channel: message.channel || "webhook",
        user: message.user,
      },
      data: {
        type: "chat",
        id: Date.now().toString(),
        payload: message,
        timestamp: message.timestamp,
      },
    });
  }

  getStatus(): { connected: boolean; webhook: string } {
    return {
      connected: true,
      webhook: this.config.webhookUrl,
    };
  }
}

// Singleton
let instance: SlackIntegration | null = null;

export function getSlackIntegration(config?: SlackConfig): SlackIntegration {
  if (!instance && config) {
    instance = new SlackIntegration(config);
  }
  if (!instance) {
    throw new Error("Slack not initialized");
  }
  return instance;
}

export function resetSlackIntegration(): void {
  instance = null;
}

export { SlackIntegration };
export default SlackIntegration;
