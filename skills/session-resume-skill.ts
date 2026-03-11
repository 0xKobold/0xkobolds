/**
 * Session Resume Skill
 * 
 * Allows users to:
 * - /sessions → List recent sessions with suggestions
 * - /sessions search "query" → Search past sessions
 * - /sessions resume <key> → Resume a specific session
 * - Auto-suggests relevant sessions on startup
 */

import { getSessionResumeSystem } from "../src/memory/session-resume";

export const sessionResumeSkill = {
  name: "session_resume",
  description: "Search and resume previous sessions",
  risk: "safe",
  
  toolDefinition: {
    type: "function" as const,
    function: {
      name: "session_resume",
      description: "Search through previous sessions or resume a specific one",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["suggest", "search", "resume"],
            description: "What to do: suggest (get recommendations), search (find by query), resume (continue session)"
          },
          query: {
            type: "string",
            description: "Search query for finding sessions (used with search action)"
          },
          sessionKey: {
            type: "string",
            description: "Session key or memory thread ID to resume"
          },
          context: {
            type: "string",
            description: "Current context for relevance matching"
          }
        },
        required: ["action"]
      }
    }
  },

  async execute(args: { 
    action: "suggest" | "search" | "resume"; 
    query?: string; 
    sessionKey?: string;
    context?: string;
  }) {
    const system = getSessionResumeSystem();
    
    switch (args.action) {
      case "suggest": {
        const suggestions = await system.getResumeSuggestions(args.context);
        
        if (suggestions.length === 0) {
          return {
            success: true,
            message: "No previous sessions found. Starting fresh!",
            sessions: []
          };
        }

        const formatted = suggestions.map((s, i) => 
          `${i + 1}. **${s.sessionKey.slice(0, 8)}** (${s.timeAgo})\n` +
          `   Reason: ${s.reason}\n` +
          `   Last: "${s.lastMessage.slice(0, 50)}..."\n` +
           `   To resume: \`/sessions resume ${s.sessionKey}\``
        ).join("\n\n");

        return {
          success: true,
          message: `💡 ${suggestions.length} session(s) you might want to resume:\n\n${formatted}`,
          sessions: suggestions
        };
      }

      case "search": {
        if (!args.query) {
          return { success: false, error: "Search requires a 'query' parameter" };
        }

        const results = await system.searchSessions(args.query);
        
        if (results.length === 0) {
          return {
            success: true,
            message: `No sessions found matching "${args.query}"`,
            results: []
          };
        }

        const formatted = results.map((r, i) =>
          `${i + 1}. **${r.sessionKey.slice(0, 8)}** (${r.messageCount} msgs, ${Math.round(r.relevanceScore * 100)}% match)\n` +
          `   Summary: ${r.summary?.slice(0, 60) || "No summary"}...\n` +
          `   Thread: \`${r.memoryThreadId}\``
        ).join("\n\n");

        return {
          success: true,
          message: `🔍 Found ${results.length} session(s) for "${args.query}":\n\n${formatted}`,
          results
        };
      }

      case "resume": {
        if (!args.sessionKey) {
          return { success: false, error: "Resume requires a 'sessionKey' parameter" };
        }

        const result = await system.resumeSession(args.sessionKey);
        
        if (!result.success) {
          return { success: false, error: result.error };
        }

        return {
          success: true,
          message: `🔄 **Resumed session ${result.sessionKey?.slice(0, 8)}**\n\n${result.context || ""}`,
          sessionKey: result.sessionKey,
          context: result.context
        };
      }

      default:
        return { success: false, error: "Unknown action" };
    }
  }
};

// Auto-suggest on startup
export async function suggestOnStartup(context?: string) {
  const system = getSessionResumeSystem();
  const suggestions = await system.getResumeSuggestions(context);
  
  if (suggestions.length > 0) {
    console.log("\n🧠 [Session Resume] Recent sessions:");
    for (const s of suggestions.slice(0, 3)) {
      console.log(`   • ${s.sessionKey.slice(0, 8)} - ${s.reason}`);
    }
    console.log(`   Type "/sessions" to see more options\n`);
  }
}

export default sessionResumeSkill;
