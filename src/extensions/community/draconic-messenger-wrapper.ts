/**
 * 🐉 Draconic Messenger - Community Extension Wrapper
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { eventBus } from "../../event-bus/index.js";

export default async function register(pi: ExtensionAPI) {
  console.log("[🐉 DraconicMessenger] Loading wrapper...");
  
  // Result collector for parent agents
  const resultCollector = new Map<string, any[]>();
  
  // Collect results from completed subagents
  eventBus.on("agent.completed", (payload: any) => {
    if (payload?.parentId) {
      if (!resultCollector.has(payload.parentId)) {
        resultCollector.set(payload.parentId, []);
      }
      resultCollector.get(payload.parentId)?.push({
        childId: payload.runId,
        output: payload.output?.slice(0, 500),
        completedAt: Date.now(),
      });
    }
  });
  
  // Expose API globally
  (global as any).getSubagentResults = (parentId: string) => {
    return resultCollector.get(parentId) || [];
  };
  
  // Register command
  pi.registerCommand("draconic-results", {
    description: "Get results from subagents",
    async handler(_args: string, ctx: ExtensionContext) {
      ctx.ui.notify("Subagent results available via getSubagentResults()", "info");
    },
  });
  
  console.log("[🐉 DraconicMessenger] Wrapper loaded");
}
