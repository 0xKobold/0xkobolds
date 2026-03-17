/**
 * WhatsApp Integration - v0.3.0
 * 
 * Real WhatsApp channel using Baileys library.
 * Part of "The Gap Closer" - matching OpenClaw's multi-channel support.
 */

import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
  proto,
  AnyMessageContent,
} from "@whiskeysockets/baileys";
import { EventEmitter } from "events";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";
import { getGateway } from "../../gateway/index.js";

export interface WhatsAppConfig {
  sessionPath: string;
  qrTimeout: number;
  reconnectInterval: number;
  markOnlineOnConnect: boolean;
  defaultMessageDelay: number;
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  fromMe: boolean;
  body: string;
  type: "text" | "image" | "video" | "audio" | "document";
  timestamp: number;
  isGroup: boolean;
  groupName?: string;
  senderName?: string;
  mediaUrl?: string;
}

const DEFAULT_CONFIG: WhatsAppConfig = {
  sessionPath: path.join(process.env.HOME || "~", ".0xkobold", "whatsapp-session"),
  qrTimeout: 60000,
  reconnectInterval: 5000,
  markOnlineOnConnect: true,
  defaultMessageDelay: 1000,
};

class WhatsAppIntegration extends EventEmitter {
  private config: WhatsAppConfig;
  private socket: WASocket | null = null;
  private connected = false;
  private qrCode: string | null = null;
  private gatewayConnectionId?: string;
  private reconnectTimer?: Timer;
  private sendQueue: Array<{ to: string; message: AnyMessageContent; resolve: (v: unknown) => void }> = [];

  constructor(config: Partial<WhatsAppConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start WhatsApp connection
   */
  async start(): Promise<void> {
    if (this.connected) return;

    console.log("[WhatsApp] Starting connection...");

    // Ensure session directory exists
    await fs.mkdir(this.config.sessionPath, { recursive: true });

    // Get latest Baileys version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp] Using Baileys v${version.join(".")} (latest: ${isLatest})`);

    // Load auth state
    const { state, saveCreds } = await useMultiFileAuthState(this.config.sessionPath);

    // Create socket
    this.socket = makeWASocket({
      version,
      logger: { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} } as any,
      printQRInTerminal: true,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, { info: () => {} } as any),
      },
      markOnlineOnConnect: this.config.markOnlineOnConnect,
      defaultQueryTimeoutMs: 60000,
    });

    // Handle connection updates
    this.socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR code for pairing
      if (qr) {
        this.qrCode = qr;
        console.log("[WhatsApp] QR Code generated - scan with WhatsApp app");
        this.emit("qr", qr);
      }

      // Connection established
      if (connection === "open") {
        this.connected = true;
        this.qrCode = null;
        console.log("[WhatsApp] ✅ Connected successfully");
        
        // Register with gateway
        this.registerWithGateway();
        
        // Process queued messages
        this.processSendQueue();
        
        this.emit("connected", { user: this.socket?.user });
      }

      // Connection closed
      if (connection === "close") {
        this.connected = false;
        this.unregisterFromGateway();

        const shouldReconnect = 
          (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp] Disconnected. Reconnect: ${shouldReconnect}`);
        this.emit("disconnected", { shouldReconnect });

        if (shouldReconnect) {
          this.scheduleReconnect();
        }
      }
    });

    // Handle credentials update
    this.socket.ev.on("creds.update", saveCreds);

    // Handle messages
    this.socket.ev.on("messages.upsert", async (event) => {
      for (const msg of event.messages) {
        if (msg.key.fromMe) continue; // Skip own messages
        await this.handleIncomingMessage(msg);
      }
    });

    // Handle group events
    this.socket.ev.on("groups.upsert", (groups) => {
      console.log("[WhatsApp] Groups updated:", groups.length);
    });
  }

  /**
   * Stop WhatsApp connection
   */
  async stop(): Promise<void> {
    console.log("[WhatsApp] Stopping...");
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.unregisterFromGateway();

    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
    }

    this.connected = false;
    console.log("[WhatsApp] Stopped");
  }

  /**
   * Send text message
   */
  async sendText(to: string, text: string): Promise<unknown> {
    const jid = this.formatJid(to);
    
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.socket) {
        // Queue for later
        this.sendQueue.push({
          to: jid,
          message: { text },
          resolve,
        });
        return;
      }

      this.socket.sendMessage(jid, { text })
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * Send typing indicator
   */
  async sendTyping(to: string): Promise<void> {
    if (!this.connected || !this.socket) return;
    
    const jid = this.formatJid(to);
    await this.socket.sendPresenceUpdate("composing", jid);
  }

  /**
   * Send image
   */
  async sendImage(to: string, imagePath: string, caption?: string): Promise<unknown> {
    if (!this.connected || !this.socket) {
      throw new Error("Not connected");
    }

    const jid = this.formatJid(to);
    const imageBuffer = await fs.readFile(imagePath);

    return this.socket.sendMessage(jid, {
      image: imageBuffer,
      caption,
    });
  }

  /**
   * Get groups
   */
  async getGroups(): Promise<string[]> {
    if (!this.connected || !this.socket) {
      throw new Error("Not connected");
    }

    const groups = await this.socket.groupFetchAllParticipating();
    return Object.keys(groups);
  }

  /**
   * Handle incoming message
   */
  private async handleIncomingMessage(msg: proto.IWebMessageInfo): Promise<void> {
    const from = msg.key.remoteJid || "";
    const isGroup = from.endsWith("@g.us");
    
    // Extract message body
    let body = "";
    let type: WhatsAppMessage["type"] = "text";

    if (msg.message?.conversation) {
      body = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
      body = msg.message.extendedTextMessage.text;
    } else if (msg.message?.imageMessage) {
      body = msg.message.imageMessage.caption || "";
      type = "image";
    } else if (msg.message?.videoMessage) {
      body = msg.message.videoMessage.caption || "";
      type = "video";
    }

    const message: WhatsAppMessage = {
      id: msg.key.id || "",
      from,
      fromMe: msg.key.fromMe || false,
      body,
      type,
      timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
      isGroup,
      groupName: isGroup ? await this.getGroupName(from) : undefined,
      senderName: msg.pushName,
    };

    console.log(`[WhatsApp] Message from ${isGroup ? "group" : "user"}: ${body.slice(0, 50)}...`);

    // Forward to gateway
    this.forwardToGateway(message);

    this.emit("message", message);
  }

  /**
   * Forward to gateway
   */
  private forwardToGateway(message: WhatsAppMessage): void {
    const gateway = getGateway();
    
    gateway.emit("message", {
      connection: {
        id: this.gatewayConnectionId,
        type: "whatsapp",
        channel: message.isGroup ? "group" : "dm",
        user: message.from,
      },
      data: {
        type: "chat",
        id: message.id,
        payload: message,
        timestamp: message.timestamp,
      },
    });
  }

  /**
   * Register with gateway
   */
  private registerWithGateway(): void {
    const gateway = getGateway();
    
    this.gatewayConnectionId = gateway.registerConnection({
      type: "whatsapp",
      channel: "whatsapp",
      user: this.socket?.user?.id,
    });

    // Listen for gateway messages to send to WhatsApp
    gateway.on("message", (event: { id: string; message: unknown; type: string }) => {
      if (event.type === "whatsapp") {
        const data = event.message as { to: string; text: string };
        this.sendText(data.to, data.text).catch(console.error);
      }
    });
  }

  /**
   * Unregister from gateway
   */
  private unregisterFromGateway(): void {
    if (this.gatewayConnectionId) {
      const gateway = getGateway();
      gateway.removeConnection(this.gatewayConnectionId);
      this.gatewayConnectionId = undefined;
    }
  }

  /**
   * Get group name
   */
  private async getGroupName(jid: string): Promise<string | undefined> {
    if (!this.socket) return undefined;
    
    try {
      const metadata = await this.socket.groupMetadata(jid);
      return metadata.subject;
    } catch {
      return undefined;
    }
  }

  /**
   * Format JID
   */
  private formatJid(input: string): string {
    if (input.includes("@")) return input;
    return `${input.replace(/\D/g, "")}@s.whatsapp.net`;
  }

  /**
   * Process queued messages
   */
  private processSendQueue(): void {
    while (this.sendQueue.length > 0 && this.connected) {
      const item = this.sendQueue.shift();
      if (item) {
        this.socket?.sendMessage(item.to, item.message)
          .then(item.resolve)
          .catch(console.error);
      }
    }
  }

  /**
   * Schedule reconnect
   */
  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(async () => {
      console.log("[WhatsApp] Reconnecting...");
      await this.start();
    }, this.config.reconnectInterval);
  }

  getStatus(): { connected: boolean; qr: string | null; user?: string } {
    return {
      connected: this.connected,
      qr: this.qrCode,
      user: this.socket?.user?.id,
    };
  }
}

// Singleton
let instance: WhatsAppIntegration | null = null;

export function getWhatsAppIntegration(config?: Partial<WhatsAppConfig>): WhatsAppIntegration {
  if (!instance) {
    instance = new WhatsAppIntegration(config);
  }
  return instance;
}

export function resetWhatsAppIntegration(): void {
  instance?.stop();
  instance = null;
}

export default WhatsAppIntegration;
