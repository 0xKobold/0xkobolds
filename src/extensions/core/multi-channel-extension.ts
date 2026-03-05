/**
 * Multi-Channel Extension
 * 
 * Supports Discord, Web, and future channels with unified session management.
 * Each channel type has its own message format, but shares session and memory.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

type ChannelType = "tui" | "discord" | "web" | "slack" | "telegram";

interface ChannelConfig {
  id: string;
  type: ChannelType;
  channelId?: string; // Discord channel, etc.
  userId: string;
  guildId?: string; // Discord server
  webhookUrl?: string;
  sessionId: string;
  workspace: string;
  createdAt: number;
}

interface Message {
  id: string;
  channelId: string;
  sessionId: string;
  source: ChannelType;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const CHANNELS_DB = join(KOBOLD_DIR, "channels.db");

let db: Database | null = null;
let currentChannel: ChannelConfig | null = null;

/**
 * Initialize channels database
 */
function initDatabase(): Database {
  if (db) return db;

  if (!existsSync(KOBOLD_DIR)) {
    mkdirSync(KOBOLD_DIR, { recursive: true });
  }

  db = new Database(CHANNELS_DB);
  db.run("PRAGMA journal_mode = WAL;");

  // Channel configs
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_configs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      channel_id TEXT,
      user_id TEXT NOT NULL,
      guild_id TEXT,
      webhook_url TEXT,
      session_id TEXT NOT NULL,
      workspace TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Unified message log
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      source TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT
    )
  `);

  // Channel state (for syncing across instances)
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_state (
      channel_id TEXT PRIMARY KEY,
      last_message_id TEXT,
      last_activity INTEGER,
      typing_since INTEGER
    )
  `);

  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_channel ON channel_messages(channel_id, timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session ON channel_messages(session_id)`);

  console.log("[MultiChannel] Database initialized");
  return db;
}

/**
 * Generate channel ID
 */
function generateChannelId(type: ChannelType): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Multi-Channel Extension
 */
export default function multiChannelExtension(pi: ExtensionAPI) {
  const database = initDatabase();

  /**
   * Get or create channel
   */
  function getOrCreateChannel(
    type: ChannelType,
    userId: string,
    sessionId: string,
    channelId?: string,
    guildId?: string
  ): ChannelConfig {
    // Check for existing channel
    let existing;
    
    if (type === "discord" && channelId) {
      existing = database.query(
        "SELECT * FROM channel_configs WHERE type = ? AND channel_id = ?"
      // @ts-ignore SQLite binding
      ).get([type, channelId]) as any;
    }
    
    if (!existing) {
      const id = generateChannelId(type);
      const now = Date.now();
      const workspace = join(KOBOLD_DIR, "workspaces", type, id);
      
      const config: ChannelConfig = {
        id,
        type,
        channelId,
        userId,
        guildId,
        sessionId,
        workspace,
        createdAt: now,
      };
      
// @ts-ignore SQLite binding
      database.run(
        `INSERT INTO channel_configs (id, type, channel_id, user_id, guild_id, session_id, workspace, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [config.id,
        config.type,
        config.channelId || null,
        config.userId,
        config.guildId || null,
        config.sessionId,
        config.workspace,
        config.createdAt]
      );
      
      console.log(`[MultiChannel] Created ${type} channel: ${id.slice(0, 8)}...`);
      return config;
    }
    
    return {
      id: existing.id,
      type: existing.type,
      channelId: existing.channel_id,
      userId: existing.user_id,
      guildId: existing.guild_id,
      webhookUrl: existing.webhook_url,
      sessionId: existing.session_id,
      workspace: existing.workspace,
      createdAt: existing.created_at,
    };
  }

  /**
   * Store message
   */
  function storeMessage(
    channelId: string,
    sessionId: string,
    source: ChannelType,
    role: "user" | "assistant",
    content: string,
    metadata?: Record<string, unknown>
  ): Message {
    const msg: Message = {
      id: `msg-${Date.now()}`,
      channelId,
      sessionId,
      source,
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };
    
// @ts-ignore SQLite binding
    database.run(
      `INSERT INTO channel_messages (id, channel_id, session_id, source, role, content, timestamp, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [msg.id,
      msg.channelId,
      msg.sessionId,
      msg.source,
      msg.role,
      msg.content,
      msg.timestamp,
      JSON.stringify(metadata || {})]
    );
    
    // Update channel state
// @ts-ignore SQLite binding
    database.run(
      `INSERT INTO channel_state (channel_id, last_message_id, last_activity) 
       VALUES (?, ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET 
       last_message_id = excluded.last_message_id,
       last_activity = excluded.last_activity`,
      [channelId,
      msg.id,
      msg.timestamp]
    );
    
    return msg;
  }

  /**
   * Get channel history
   */
  function getChannelHistory(channelId: string, limit: number = 50): Message[] {
    const rows = database.query(
      `SELECT * FROM channel_messages 
       WHERE channel_id = ? 
       ORDER BY timestamp DESC 
       LIMIT ?`
    ).all(channelId, limit) as any[];
    
    return rows.map(r => ({
      id: r.id,
      channelId: r.channel_id,
      sessionId: r.session_id,
      source: r.source as ChannelType,
      role: r.role,
      content: r.content,
      timestamp: r.timestamp,
      metadata: JSON.parse(String(r.metadata || "{}")),
    })).reverse();
  }

  /**
   * Broadcast message to all instances of channel
   */
  function broadcastToChannel(channelId: string, message: Message): void {
    // In real implementation, would use WebSocket/pub-sub
    // For now, we just store and rely on polling
    console.log(`[MultiChannel] Broadcast to ${channelId}: ${message.content.slice(0, 50)}...`);
  }

  // ═══════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════

  pi.on("session_start", async (_event, ctx) => {
    const sessionId = process.env.KOBOLD_SESSION_ID;
    const channelType = (process.env.KOBOLD_CHANNEL_TYPE || "tui") as ChannelType;
    const userId = process.env.KOBOLD_USER_ID || "anonymous";
    
    if (!sessionId) return;
    
    currentChannel = getOrCreateChannel(
      channelType,
      userId,
      sessionId,
      process.env.KOBOLD_CHANNEL_ID,
      process.env.KOBOLD_GUILD_ID
    );
    
    // Load history
    const history = getChannelHistory(currentChannel.id, 50);
    
    if (history.length > 0) {
      console.log(`[MultiChannel] Loaded ${history.length} messages from ${channelType} channel`);
    }
    
    // Set environment for tools
    process.env.KOBOLD_CHANNEL_CONFIG_ID = currentChannel.id;
  });

  // @ts-ignore Event type
  pi.on("message", async (event, ctx) => {
    if (!currentChannel) return;
    
    // Store incoming message
    storeMessage(
      currentChannel.id,
      currentChannel.sessionId,
      currentChannel.type,
      "user",
      event.content || "",
      { timestamp: Date.now() }
    );
  });

  // @ts-ignore Event type
  pi.on("reply", async (event, ctx) => {
    if (!currentChannel) return;
    
    // Store outgoing message
    storeMessage(
      currentChannel.id,
      currentChannel.sessionId,
      currentChannel.type,
      "assistant",
      event.content || "",
      { timestamp: Date.now() }
    );
  });

  // ═══════════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════════

  pi.registerCommand("channel", {
    description: "Show current channel info",
    handler: async (_args, ctx) => {
      if (!currentChannel) {
        ctx.ui?.notify?.("No active channel", "warning");
        return;
      }
      
      const history = getChannelHistory(currentChannel.id, 1);
      const lines = [
        `📡 Channel Info`,
        ``,
        `Type: ${currentChannel.type}`,
        `ID: ${currentChannel.id}`,
        `Session: ${currentChannel.sessionId.slice(0, 16)}...`,
        `Workspace: ${currentChannel.workspace}`,
        `User: ${currentChannel.userId}`,
      ];
      
      if (currentChannel.channelId) {
        lines.push(`Channel: ${currentChannel.channelId}`);
      }
      if (currentChannel.guildId) {
        lines.push(`Guild: ${currentChannel.guildId}`);
      }
      
      lines.push(`Messages: ${history.length}+`);
      
      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("channels", {
    description: "List active channels",
  // @ts-ignore Command args property
    args: [{ name: "type", description: "Filter by type (tui/discord/web)", required: false }],
    handler: async (args: any, ctx) => {
      let query = "SELECT * FROM channel_configs";
      const params: any[] = [];
      
      if (args.type) {
        query += " WHERE type = ?";
        params.push(args.type);
      }
      
      query += " ORDER BY created_at DESC";
      
      const rows = database.query(query).all(...params) as any[];
      
      if (rows.length === 0) {
        ctx.ui?.notify?.("No channels yet", "info");
        return;
      }
      
      const grouped = rows.reduce((acc, r) => {
        if (!acc[r.type]) acc[r.type] = [];
        acc[r.type].push(r);
        return acc;
      }, {} as Record<string, any[]>);
      
      const lines: string[] = ["📡 Channels\n"];
      
      for (const [type, channels] of Object.entries(grouped)) {
        lines.push(`${type.toUpperCase()}:`);
        for (const c of channels) {
          const current = c.id === currentChannel?.id ? " 👈" : "";
          lines.push(`  ${c.id.slice(0, 20)}... (${c.session_id.slice(0, 8)}...)${current}`);
        }
        lines.push("");
      }
      
      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("channel-history", {
    description: "Show recent channel messages",
  // @ts-ignore Command args property
    args: [{ name: "limit", description: "Number of messages (default: 10)", required: false }],
    handler: async (args, ctx) => {
      if (!currentChannel) {
        ctx.ui?.notify?.("No active channel", "warning");
        return;
      }
      
      const limit = parseInt(String(args.limit)) || 10;
      const history = getChannelHistory(currentChannel.id, limit);
      
      if (history.length === 0) {
        ctx.ui?.notify?.("No messages in channel", "info");
        return;
      }
      
      const lines: string[] = ["💬 Recent Messages\n"];
      
      for (const msg of history) {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const prefix = msg.role === "user" ? "👤" : "🤖";
        lines.push(`${prefix} [${time}] ${msg.content.slice(0, 60)}...`);
      }
      
      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // TOOLS
  // ═══════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "channel_broadcast",
    description: "Broadcast a message to all channel participants",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Message content" },
        channel_id: { type: "string", description: "Target channel (default: current)" },
      },
      required: ["content"],
    },
    async execute(args: any) {
      if (!currentChannel) {
        return {
          content: [{ type: "text", text: "No active channel" }],
          details: { error: "no_channel" },
        };
      }
      
      const content = String(args.content);
      const targetChannel = String(args.channel_id || currentChannel.id);
      
      const msg = storeMessage(
        targetChannel,
        currentChannel.sessionId,
        currentChannel.type,
        "assistant",
        content,
        { broadcast: true }
      );
      
      broadcastToChannel(targetChannel, msg);
      
      return {
        content: [{ type: "text", text: `Broadcast to ${targetChannel}` }],
        details: { channelId: targetChannel, messageId: msg.id },
      };
    },
  });

  pi.registerTool({
    name: "channel_switch",
    description: "Switch to a different channel (for multi-channel agents)",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "Channel ID to switch to" },
      },
      required: ["channel_id"],
    },
    async execute(args: any) {
      const channelId = String(args.channel_id);
// @ts-ignore SQLite binding
      const config = database.query("SELECT * FROM channel_configs WHERE id = ?").get([channelId]) as any;
      
      if (!config) {
        return {
          content: [{ type: "text", text: `Channel ${channelId} not found` }],
          details: { error: "not_found" },
        };
      }
      
      currentChannel = {
        id: config.id,
        type: config.type,
        channelId: config.channel_id,
        userId: config.user_id,
        guildId: config.guild_id,
        webhookUrl: config.webhook_url,
        sessionId: config.session_id,
        workspace: config.workspace,
        createdAt: config.created_at,
      };
      
      return {
        content: [{ type: "text", text: `Switched to ${config.type} channel ${channelId}` }],
        details: { channel: currentChannel },
      };
    },
  });

  pi.registerTool({
    name: "channel_stats",
    description: "Get statistics across all channels",
  // @ts-ignore TSchema type mismatch
    // @ts-ignore TSchema mismatch
    parameters: { type: "object", properties: {} },
    async execute() {
      const channels = database.query("SELECT type, COUNT(*) as count FROM channel_configs GROUP BY type").all() as any[];
// @ts-ignore SQLite binding
      const messages = database.query("SELECT COUNT(*) as total FROM channel_messages").get() as any;
      
      const today = Date.now() - (24 * 60 * 60 * 1000);
      const recent = database.query(
        "SELECT COUNT(*) as count FROM channel_messages WHERE timestamp > ?"
      // @ts-ignore SQLite binding
      ).get([today]) as any;
      
      return {
        content: [
          { type: "text", text: `Channel Stats:\n` +
            `Total Channels: ${channels.reduce((a, c) => a + c.count, 0)}\n` +
            channels.map(c => `  ${c.type}: ${c.count}`).join("\n") +
            `\nTotal Messages: ${messages?.total || 0}\n` +
            `Last 24h: ${recent?.count || 0}`
          },
        ],
        details: { channels, messages: messages?.total, recent: recent?.count },
      };
    },
  });

  // Status bar
  // @ts-ignore ExtensionAPI property
  pi.registerStatusBarItem("channel", {
    render() {
      if (!currentChannel) return "";
      const icons: Record<ChannelType, string> = {
        tui: "💻",
        discord: "💬",
        web: "🌐",
        slack: "💼",
        telegram: "✈️",
      };
      return `${icons[currentChannel.type]} ${currentChannel.type}`;
    },
  });

  console.log("[MultiChannel] Multi-channel support loaded");
  console.log("[MultiChannel] Commands: /channel, /channels, /channel-history");
  console.log("[MultiChannel] Supports: TUI, Discord, Web, Slack, Telegram");
}
