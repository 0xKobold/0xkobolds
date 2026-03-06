/**
 * Session naming extension.
 *
 * Usage:
 *   User: /session-name [new-name]
 *   Agent: set_session_name tool
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function sessionNameExtension(pi: ExtensionAPI) {
    // ═══════════════════════════════════════════════════════════════
    // USER COMMANDS
    // ═══════════════════════════════════════════════════════════════
    
    pi.registerCommand("session-name", {
        description: "Set or show session name (usage: /session-name [new name])",
        handler: async (args, ctx) => {
            const name = args.trim();

            if (name) {
                pi.setSessionName(name);
                ctx.ui.notify(`Session named: ${name}`, "info");
            } else {
                const current = pi.getSessionName();
                ctx.ui.notify(current ? `Session: ${current}` : "No session name set", "info");
            }
        },
    });

    // ═══════════════════════════════════════════════════════════════
    // AGENT TOOLS
    // ═══════════════════════════════════════════════════════════════

    // Tool: set_session_name
    pi.registerTool({
        name: "set_session_name",
        label: "set_session_name",
        description: "Set a friendly name for the current session. Use when you want to label what you are working on.",
        // @ts-ignore TSchema mismatch
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The friendly name to give this session (e.g., 'Refactor Auth System', 'Bug Fix #123')",
                },
            },
            required: ["name"],
        },
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const { name } = params as { name: string };
            
            if (!name.trim()) {
                return {
                    content: [{ type: "text", text: "Error: Session name cannot be empty" }],
                    details: { success: false },
                };
            }

            pi.setSessionName(name.trim());
            
            if (ctx.ui?.notify) {
                ctx.ui.notify(`Session named: ${name}`, "info");
            }
            
            return {
                content: [{ type: "text", text: `Session named: ${name}` }],
                details: { success: true, name: name.trim() },
            };
        },
    });

    // Tool: get_session_name  
    pi.registerTool({
        name: "get_session_name",
        label: "get_session_name",
        description: "Get the current session name, if one is set.",
        // @ts-ignore TSchema mismatch
        parameters: {
            type: "object",
            properties: {},
        },
        async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
            const current = pi.getSessionName();
            
            return {
                content: [{ 
                    type: "text", 
                    text: current 
                        ? `Current session name: ${current}` 
                        : "No session name set" 
                }],
                details: { success: true, name: current },
            };
        },
    });

    console.log("[SessionName] Extension loaded with commands + tools");
}
