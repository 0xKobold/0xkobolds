/**
 * Unified Session Bridge Extension
 *
 * Replaces the old session-bridge-extension.ts with proper unified session support.
 * Bridges pi-coding-agent sessions to unified 0xKobold session management.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSessionManager } from "./SessionManager.js";
import { generateStableSessionId, getDeviceId } from "./SessionStore.js";

/**
 * Unified Session Bridge Extension
 * 
 * This extension:
 * 1. Creates stable unified session IDs (survive restarts)
 * 2. Coordinates all subsystems under unified session
 * 3. Enables session resume/restore
 * 4. Tracks session hierarchy (parents, forks, subagents)
 */
export default function unifiedSessionBridgeExtension(pi: ExtensionAPI) {
  const sessionManager = getSessionManager({
    autoResume: true,
    resumeMaxAgeHours: 168,
  });

  // Initialize the session manager
  sessionManager.initialize(pi);

  /**
   * Get current unified session info
   */
  pi.registerTool({
    name: "get_unified_session",
    label: "Unified Session Info",
    description: "Get information about the current unified session",
    parameters: {
      type: "object",
      properties: {},
    } as any,
    // @ts-ignore Tool signature mismatch - needs full rewrite for proper API
    async execute() {
      const session = await sessionManager.getCurrentSession();
      
      if (!session) {
        return {
          content: [{ type: "text", text: "No active unified session" }],
          details: { error: "no_session" },
        };
      }

      const hierarchy = session.id 
        ? await getSessionManager().listSessions({ activeSince: Date.now() - 7 * 24 * 60 * 60 * 1000 })
        : [];

      return {
        content: [
          {
            type: "text",
            text:
              `📋 Unified Session: ${session.id.slice(0, 16)}...\n` +
              `State: ${session.state}\n` +
              `Mode: ${session.mode}\n` +
              `Source: ${session.source}\n` +
              `CWD: ${session.cwd}\n` +
              `Turns: ${session.totalTurns}\n` +
              `Created: ${new Date(session.createdAt).toLocaleString()}\n` +
              `Last Activity: ${new Date(session.lastActivityAt).toLocaleString()}`,
          },
        ],
        details: {
          session,
          recentCount: hierarchy.length,
        },
      };
    },
  });

  /**
   * List all unified sessions
   */
  pi.registerTool({
    name: "list_unified_sessions",
    label: "List Sessions",
    description: "List all unified sessions with optional filtering",
    parameters: {
      type: "object",
      properties: {
        state: {
          type: "string",
          enum: ["idle", "active", "error", "completed", "suspended"],
          description: "Filter by session state",
        },
        source: {
          type: "string",
          enum: ["tui", "discord", "web", "gateway", "cron", "api"],
          description: "Filter by source",
        },
        limit: {
          type: "number",
          default: 20,
          description: "Maximum results",
        },
      },
    } as any,
    // @ts-ignore Tool signature mismatch
    async execute(args: any) {
      const filter: any = {};
      if (args.state) filter.state = args.state;
      if (args.source) filter.source = args.source;

      const sessions = await sessionManager.listSessions(filter, args.limit || 20);

      if (sessions.length === 0) {
        return {
          content: [{ type: "text", text: "No sessions found" }],
          details: { count: 0 },
        };
      }

      const lines = sessions.map((s) => {
        const icon = s.hasChildren ? "👨‍👩‍👧‍👦" : "";
        const depth = "  ".repeat(s.depth);
        return `${depth}${icon} ${s.id.slice(0, 16)}... [${s.state}] ${s.source} (${s.totalTurns} turns)`;
      });

      return {
        content: [
          {
            type: "text",
            text: `📊 Sessions (${sessions.length}):\n${lines.join("\n")}`,
          },
        ],
        details: { sessions, count: sessions.length },
      };
    },
  });

  /**
   * Resume a unified session
   */
  pi.registerTool({
    name: "resume_unified_session",
    label: "Resume Session",
    description: "Resume a previously suspended unified session",
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID to resume (or prefix)",
        },
      },
      required: ["sessionId"],
    } as any,
    // @ts-ignore Tool signature mismatch - execute signature incompatible with ExtensionAPI
    async execute(args: any) {
      const { sessionId } = args;

      try {
        // Find by prefix if full ID not provided
        const sessions = await sessionManager.listSessions();
        const match = sessions.find((s) => s.id.startsWith(sessionId));
        
        if (!match) {
          return {
            content: [{ type: "text", text: `Session ${sessionId} not found` }],
            details: { error: "not_found", sessionId },
          };
        }

        const session = await sessionManager.resumeSession(match.id);

        return {
          content: [
            {
              type: "text",
              text: `✅ Resumed session: ${session.id.slice(0, 16)}...\nState: ${session.state}\nSource: ${session.source}`,
            },
          ],
          details: { session },
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `❌ Failed to resume: ${(err as Error).message}` },
          ],
          details: { error: (err as Error).message },
        };
      }
    },
  });

  /**
   * Create session snapshot
   */
  pi.registerTool({
    name: "create_session_snapshot",
    label: "Snapshot Session",
    description: "Create a restore point for current session",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["manual", "checkpoint"],
          default: "manual",
        },
      },
    } as any,
    // @ts-ignore Tool signature mismatch
    async execute(args: any) {
      const currentId = sessionManager.getCurrentSessionId();
      
      if (!currentId) {
        return {
          content: [{ type: "text", text: "No active session to snapshot" }],
          details: { error: "no_session" },
        };
      }

      const snapshotId = await sessionManager.createSnapshot(
        currentId,
        args.type || "manual"
      );

      return {
        content: [
          {
            type: "text",
            text: `📸 Created snapshot: ${snapshotId}\nSession will be restorable from this point`,
          },
        ],
        details: { snapshotId },
      };
    },
  });

  /**
   * Get session statistics
   */
  pi.registerTool({
    name: "get_session_stats",
    label: "Session Statistics",
    description: "Get aggregate session statistics",
    parameters: {
      type: "object",
      properties: {},
    } as any,
    // @ts-ignore Tool signature mismatch
    async execute() {
      const stats = await sessionManager.getStats();

      return {
        content: [
          {
            type: "text",
            text:
              `📊 Session Statistics:\n\n` +
              `Total Sessions: ${stats.total}\n` +
              `Active: ${stats.active}\n` +
              `Idle: ${stats.idle}\n` +
              `Total Turns: ${stats.totalTurns.toLocaleString()}\n` +
              `Total Tokens: ${stats.totalTokens.toLocaleString()}`,
          },
        ],
        details: stats,
      };
    },
  });

  /**
   * Fork current session
   */
  pi.registerTool({
    name: "fork_session",
    label: "Fork Session",
    description: "Fork current session for isolated sub-task",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Reason for fork",
        },
        childPiSessionId: {
          type: "string",
          description: "Child pi-coding-agent session ID",
        },
      },
      required: ["reason", "childPiSessionId"],
    } as any,
    // @ts-ignore Tool signature mismatch - execute signature incompatible with ExtensionAPI
    async execute(args: any) {
      const parentId = sessionManager.getCurrentSessionId();
      
      if (!parentId) {
        return {
          content: [{ type: "text", text: "No active session to fork" }],
          details: { error: "no_session" },
        };
      }

      try {
        const child = await sessionManager.forkSession(
          parentId,
          args.childPiSessionId,
          args.reason
        );

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Forked session:\n` +
                `Parent: ${parentId.slice(0, 16)}...\n` +
                `Child: ${child.id.slice(0, 16)}...`,
            },
          ],
          details: { parentId, childId: child.id },
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `❌ Fork failed: ${(err as Error).message}` },
          ],
          details: { error: (err as Error).message },
        };
      }
    },
  });

  // ============================================================================
  // Commands
  // ============================================================================

  pi.registerCommand("session", {
    description: "Show current unified session info",
    handler: async (_args, ctx) => {
      const session = await sessionManager.getCurrentSession();
      
      if (!session) {
        ctx.ui?.notify?.("No active unified session", "warning");
        return;
      }

      const stats = await sessionManager.getStats();

      ctx.ui?.notify?.(
        `📋 Unified Session\n` +
        `ID: ${session.id}\n` +
        `State: ${session.state} | Mode: ${session.mode}\n` +
        `Source: ${session.source}\n` +
        `CWD: ${session.cwd}\n` +
        `Turns: ${session.totalTurns} | Tokens: ${session.totalTokens.input + session.totalTokens.output}\n` +
        `\nGlobal: ${stats.active} active, ${stats.idle} idle`,
        "info"
      );
    },
  });

  pi.registerCommand("sessions", {
    description: "List all unified sessions",
    handler: async (_args, ctx) => {
      const sessions = await sessionManager.listSessions({}, 20);

      if (sessions.length === 0) {
        ctx.ui?.notify?.("No sessions found", "info");
        return;
      }

      const lines = ["📊 Recent Sessions:"];
      sessions.slice(0, 10).forEach((s, i) => {
        const current = sessionManager.getCurrentSessionId() === s.id ? " 👈 current" : "";
        lines.push(`${i + 1}. ${s.id.slice(0, 20)}... [${s.state}]${current}`);
      });

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("session-resume", {
    description: "Resume a unified session by ID prefix (usage: /session-resume <sessionId>)",
    handler: async (args: string, ctx) => {
      const sessionId = args.trim();
      
      // Find by prefix
      const sessions = await sessionManager.listSessions();
      const match = sessions.find((s) => s.id.startsWith(sessionId));

      if (!match) {
        ctx.ui?.notify?.(`Session ${sessionId} not found`, "error");
        return;
      }

      try {
        await sessionManager.resumeSession(match.id);
        // @ts-ignore Notify type
        ctx.ui?.notify?.(`✅ Resumed session: ${match.id.slice(0, 16)}...`, "success");
      } catch (err) {
        ctx.ui?.notify?.(`❌ ${(err as Error).message}`, "error");
      }
    },
  });

  pi.registerCommand("session-tree", {
    description: "Show session hierarchy tree",
    handler: async (_args, ctx) => {
      const currentId = sessionManager.getCurrentSessionId();
      if (!currentId) {
        ctx.ui?.notify?.("No active session", "warning");
        return;
      }

      const tree = await sessionManager.getSessionTree(currentId);
      
      if (tree.length === 0) {
        ctx.ui?.notify?.("Single session (no children)", "info");
        return;
      }

      const lines = ["🌳 Session Tree:"];
      tree.forEach((s, i) => {
        const depth = "  ".repeat(i);
        const marker = i === 0 ? "📍" : "└─";
        lines.push(`${depth}${marker} ${s.id.slice(0, 16)}... [${s.state}]`);
      });

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("session-snapshot", {
    description: "Create a snapshot of current session",
    handler: async (_args, ctx) => {
      const currentId = sessionManager.getCurrentSessionId();
      if (!currentId) {
        ctx.ui?.notify?.("No active session", "warning");
        return;
      }

      const snapshotId = await sessionManager.createSnapshot(currentId, "manual");
      // @ts-ignore Notify type
      ctx.ui?.notify?.(`📸 Snapshotted: ${snapshotId.slice(0, 20)}...`, "success");
    },
  });

  console.log("[UnifiedSessionBridge] Extension loaded with stable session IDs");
  console.log("[UnifiedSessionBridge] Sessions survive restarts, enable /sessions and /session-resume");
}
