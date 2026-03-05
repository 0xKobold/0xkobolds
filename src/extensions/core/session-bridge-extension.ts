/**
 * Session Bridge Extension
 * 
 * Bridges pi-coding-agent's native session management with 0xKobold's
 * extensions by setting KOBOLD_SESSION_ID environment variable.
 * 
 * This allows extensions to get a consistent session ID without managing
 * their own databases or duplicating session storage.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

let currentSessionId: string = "default";

/**
 * Generate a human-readable session ID from pi-coding-agent's session data
 * Format: kobold-{timestamp}-{short-hash}
 */
function generateKoboldSessionId(piSessionId: string): string {
  // pi-coding-agent session IDs are file paths or UUIDs
  // Create a shorter, more readable ID for display
  const hash = piSessionId.slice(-8).replace(/[^a-zA-Z0-9]/g, '');
  const timestamp = Date.now().toString(36).slice(-6);
  return `kobold-${timestamp}-${hash}`;
}

/**
 * Session Bridge Extension
 */
export default function sessionBridgeExtension(pi: ExtensionAPI) {
  // Listen for session start
  pi.on("session_start", async (_event, ctx) => {
    const piSessionId = ctx.sessionManager.getSessionId();
    currentSessionId = generateKoboldSessionId(piSessionId);
    
    // Set environment variable for legacy extensions
    process.env.KOBOLD_SESSION_ID = currentSessionId;
    process.env.KOBOLD_WORKING_DIR = ctx.sessionManager.getCwd();
    
    console.log(`[SessionBridge] Session started: ${currentSessionId}`);
  });

  // Update on session switch (e.g., /resume, /fork, /switch)
  pi.on("session_switch", async (event, ctx) => {
    const piSessionId = ctx.sessionManager.getSessionId();
    currentSessionId = generateKoboldSessionId(piSessionId);
    
    process.env.KOBOLD_SESSION_ID = currentSessionId;
    process.env.KOBOLD_WORKING_DIR = ctx.sessionManager.getCwd();
    
    console.log(`[SessionBridge] Session switched: ${currentSessionId} (${event.reason})`);
  });

  // Update on fork
  pi.on("session_fork", async (event, ctx) => {
    const piSessionId = ctx.sessionManager.getSessionId();
    currentSessionId = generateKoboldSessionId(piSessionId);
    
    process.env.KOBOLD_SESSION_ID = currentSessionId;
    process.env.KOBOLD_WORKING_DIR = ctx.sessionManager.getCwd();
    
    console.log(`[SessionBridge] Session forked: ${currentSessionId}`);
  });

  // Tool to get current session info
  pi.registerTool({
    name: "get_session_info",
    // @ts-ignore ToolDefinition type
    label: "Session Info",
    description: "Get information about the current session",
    // @ts-ignore TSchema mismatch
    parameters: { type: "object", properties: {} } as any,
    async execute() {
      return {
        content: [
          { 
            type: "text", 
            text: `Session ID: ${currentSessionId}\n` +
                  `Working Dir: ${process.env.KOBOLD_WORKING_DIR}\n` +
                  `Session File: ${process.env.PI_SESSION_FILE || 'N/A'}`
          },
        ],
        details: {
          sessionId: currentSessionId,
          workingDir: process.env.KOBOLD_WORKING_DIR,
        },
      };
    },
  });

  console.log("[SessionBridge] Extension loaded - bridging pi-coding-agent sessions to 0xKobold");
}
