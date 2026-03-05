/**
 * Session Manager Extension
 *
 * Provides isolated sessions for each TUI/Discord instance.
 * Sessions are identified by unique IDs and persisted to SQLite.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const SESSION_DB = join(KOBOLD_DIR, "sessions.db");

interface Session {
  id: string;
  type: "tui" | "discord" | "gateway";
  workspace: string;
  createdAt: number;
  lastActivity: number;
  metadata: Record<string, unknown>;
  isActive: boolean;
}

interface SessionMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

let db: Database | null = null;

/**
 * Initialize SQLite database for sessions
 */
function initDatabase(): Database {
  if (db) return db;

  if (!existsSync(KOBOLD_DIR)) {
    mkdirSync(KOBOLD_DIR, { recursive: true });
  }

  db = new Database(SESSION_DB);
  db.run("PRAGMA journal_mode = WAL;");

  // Sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      workspace TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_activity INTEGER NOT NULL,
      metadata TEXT,
      is_active INTEGER DEFAULT 1
    )
  `);

  // Messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_session 
    ON session_messages(session_id, timestamp)
  `);

  console.log("[SessionManager] Database initialized");
  return db;
}

/**
 * Generate unique session ID
 */
function generateSessionId(type: string): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Session Manager Extension
 */
export default function sessionManagerExtension(pi: ExtensionAPI) {
  const database = initDatabase();
  let currentSession: Session | null = null;

  /**
   * Create or resume a session
   */
  function createSession(
    type: "tui" | "discord",
    workspace: string,
    resumeId?: string
  ): Session {
    // Try to resume existing session
    if (resumeId) {
      const existing = database
        .query("SELECT * FROM sessions WHERE id = ? AND type = ?")
        .get(resumeId, type) as Session | undefined;

      if (existing) {
        // Reactivate session
        database.run(
          "UPDATE sessions SET is_active = 1, last_activity = ? WHERE id = ?",
          Date.now(),
          resumeId
        );

        const session: Session = {
          id: existing.id,
          type: existing.type as "tui" | "discord",
          workspace,
          createdAt: existing.createdAt,
          lastActivity: Date.now(),
          metadata: JSON.parse(String(existing.metadata || "{}")),
          isActive: true,
        };

        currentSession = session;
        console.log(`[SessionManager] Resumed session: ${session.id}`);
        return session;
      }
    }

    // Create new session
    const sessionId = generateSessionId(type);
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      type,
      workspace,
      createdAt: now,
      lastActivity: now,
      metadata: {
        pid: process.pid,
        platform: process.platform,
      },
      isActive: true,
    };

    database.run(
      `INSERT INTO sessions (id, type, workspace, created_at, last_activity, metadata, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      session.id,
      session.type,
      session.workspace,
      session.createdAt,
      session.lastActivity,
      JSON.stringify(session.metadata),
      1
    );

    currentSession = session;
    console.log(`[SessionManager] Created session: ${session.id}`);
    return session;
  }

  /**
   * Store a message in the session
   */
  function storeMessage(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
    metadata?: Record<string, unknown>
  ): void {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    database.run(
      `INSERT INTO session_messages (id, session_id, role, content, timestamp, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      messageId,
      sessionId,
      role,
      content,
      Date.now(),
      JSON.stringify(metadata || {})
    );

    // Update session activity
    database.run(
      "UPDATE sessions SET last_activity = ? WHERE id = ?",
      Date.now(),
      sessionId
    );
  }

  /**
   * Get conversation history for a session
   */
  function getSessionHistory(
    sessionId: string,
    limit: number = 100
  ): SessionMessage[] {
    const rows = database
      .query(
        `SELECT * FROM session_messages 
         WHERE session_id = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`
      )
      .all(sessionId, limit) as any[];

    return rows
      .map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
        metadata: JSON.parse(String(row.metadata || "{}")),
      }))
      .reverse(); // Oldest first
  }

  /**
   * List active sessions for a workspace
   */
  function listSessions(workspace?: string): Session[] {
    let query = "SELECT * FROM sessions WHERE is_active = 1";
    const params: (string | number)[] = [];

    if (workspace) {
      query += " AND workspace = ?";
      params.push(workspace);
    }

    query += " ORDER BY last_activity DESC";

    const rows = database.query(query).all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      workspace: row.workspace,
      createdAt: row.created_at,
      lastActivity: row.last_activity,
      metadata: JSON.parse(String(row.metadata || "{}")),
      isActive: row.is_active === 1,
    }));
  }

  /**
   * Deactivate a session (not delete, just mark inactive)
   */
  function deactivateSession(sessionId: string): void {
    database.run(
      "UPDATE sessions SET is_active = 0 WHERE id = ?",
      sessionId
    );
    console.log(`[SessionManager] Deactivated session: ${sessionId}`);
  }

  // Hook into session start
  pi.on("session_start", async (_event, ctx) => {
    const workspace = process.env.KOBOLD_WORKING_DIR || process.cwd();
    const sessionType = process.env.KOBOLD_SESSION_TYPE || "tui";
    const resumeId = process.env.KOBOLD_RESUME_SESSION;

    const session = createSession(
      sessionType as "tui" | "discord",
      workspace,
      resumeId
    );

    // Store session ID for later use
    process.env.KOBOLD_SESSION_ID = session.id;

    // Load conversation history
    const history = getSessionHistory(session.id, 50);
    if (history.length > 0) {
      ctx.ui?.notify?.(
        `📝 Resumed session with ${history.length} previous messages`,
        "info"
      );
    }

    // Set up message interception to store conversations
    const originalSendMessage = pi.sendMessage.bind(pi);
    pi.sendMessage = (msg: any) => {
      // Store assistant messages
      if (msg.content?.[0]?.text) {
        storeMessage(
          session.id,
          "assistant",
          msg.content[0].text,
          msg.customType ? { type: msg.customType } : undefined
        );
      }
      return originalSendMessage(msg);
    };
  });

  // Hook into shutdown
  pi.on("shutdown", async () => {
    if (currentSession) {
      deactivateSession(currentSession.id);
    }
  });

  // Register commands
  pi.registerCommand("session", {
    description: "Show current session info",
    handler: async (_args, ctx) => {
      if (!currentSession) {
        ctx.ui?.notify?.("No active session", "warning");
        return;
      }

      const history = getSessionHistory(currentSession.id);

      ctx.ui?.notify?.(
        `📋 Session Info:\n` +
          `  ID: ${currentSession.id}\n` +
          `  Type: ${currentSession.type}\n` +
          `  Workspace: ${currentSession.workspace}\n` +
          `  Messages: ${history.length}\n` +
          `  Started: ${new Date(currentSession.createdAt).toLocaleString()}`,
        "info"
      );
    },
  });

  pi.registerCommand("sessions", {
    description: "List active sessions",
    handler: async (_args, ctx) => {
      const sessions = listSessions();

      if (sessions.length === 0) {
        ctx.ui?.notify?.("No active sessions", "info");
        return;
      }

      const lines = sessions.map((s) => {
        const time = new Date(s.lastActivity).toLocaleTimeString();
        const current = s.id === currentSession?.id ? " 👈" : "";
        return `  ${s.type} ${s.id.slice(0, 20)}... (${time})${current}`;
      });

      ctx.ui?.notify?.(`Active Sessions:\n${lines.join("\n")}`, "info");
    },
  });

  pi.registerCommand("resume", {
    description: "Resume a previous session (requires session ID)",
    args: [
      { name: "sessionId", description: "Session ID to resume", required: true },
    ],
    handler: async (args, ctx) => {
      const sessionId = args.sessionId;
      if (!sessionId) {
        ctx.ui?.notify?.("Usage: /resume <session-id>", "warning");
        return;
      }

      const history = getSessionHistory(sessionId);
      if (history.length === 0) {
        ctx.ui?.notify?.("Session not found or empty", "warning");
        return;
      }

      ctx.ui?.notify?(
        `Resuming session ${sessionId.slice(0, 20)}...\n` +
          `Loaded ${history.length} messages`,
        "success"
      );
    },
  });

  // Register session-aware gateway broadcast
  pi.registerTool({
    name: "session_broadcast",
    description: "Broadcast a message to all clients in current session",
    parameters: {
      type: "object",
      properties: {
        event: { type: "string" },
        payload: { type: "object" },
      },
      required: ["event", "payload"],
    },
    async execute(args) {
      if (!currentSession) {
        return {
          content: [{ type: "text", text: "No active session" }],
          details: { error: "no_session" },
        };
      }

      const { event, payload } = args;

      // Broadcast with session ID
      pi.sendMessage({
        customType: "session.broadcast",
        content: [{ type: "text", text: `Session event: ${event}` }],
        display: { type: "text", text: `📡 ${event}` },
        details: { sessionId: currentSession.id, event, payload },
      });

      return {
        content: [{ type: "text", text: `Broadcasted to session ${currentSession.id}` }],
        details: { sessionId: currentSession.id },
      };
    },
  });

  console.log("[SessionManager] Extension loaded");
}
