/**
 * Context Pruning Extension
 * 
 * Adapted from OpenClaw - intelligent context window management
 * Features:
 * - Soft trimming: keeps head+tail of large tool results
 * - Hard clearing: removes old tool results entirely
 * - Image protection: never prunes results with images
 * - Cache TTL: avoids unnecessary pruning
 * 
 * NOTE: This extension uses @ts-ignore for SessionManager methods that exist
 * at runtime but are missing from type definitions:
 * - ExtensionContext.sessionManager.getCurrentSession(): Returns current session
 * - Session.getConfig(key): Gets session-specific config
 * - Session.setConfig(key, value): Sets session-specific config
 * - Session.getExtensionRuntime(key): Gets extension runtime state
 * - Session.setExtensionRuntime(key, value): Sets extension runtime state
 * 
 * These are available in pi-coding-agent runtime but types are incomplete.
 * Tracked: Extension API needs ReadonlySessionManager → Session type cast.
 */

import type { ContextEvent, ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { pruneContextMessages } from "./pruner.js";
import { getContextPruningRuntime, setContextPruningRuntime, ContextPruningRuntime } from "./runtime.js";
import { computeEffectiveSettings, EffectiveContextPruningSettings } from "./settings.js";

export { pruneContextMessages } from "./pruner.js";
export type {
  ContextPruningConfig,
  ContextPruningToolMatch,
  EffectiveContextPruningSettings,
} from "./settings.js";
export {
  computeEffectiveSettings,
  DEFAULT_CONTEXT_PRUNING_SETTINGS,
} from "./settings.js";

export default function contextPruningExtension(api: ExtensionAPI): void {
  console.log("[ContextPruning] Extension loaded");

  api.on("context", (event: ContextEvent, ctx: ExtensionContext) => {
    // Get or initialize runtime
    // @ts-ignore - sessionManager type mismatch
    let runtime = getContextPruningRuntime(ctx.sessionManager);
    
    // First time - try to load from session config
    if (!runtime) {
      // @ts-ignore - getCurrentSession doesn't exist on ReadonlySessionManager
      const session = ctx.sessionManager.getCurrentSession?.();
      // @ts-ignore - getConfig doesn't exist
      const rawConfig = session?.getConfig?.("contextPruning") ?? session?.contextPruning;
      const settings = computeEffectiveSettings(rawConfig);
      
      if (!settings) {
        return undefined; // Pruning disabled
      }
      
      runtime = { settings };
      // @ts-ignore - sessionManager type mismatch
      setContextPruningRuntime(ctx.sessionManager, runtime);
    }

    // Check TTL cache mode
    if (runtime.settings.mode === "cache-ttl") {
      const ttlMs = runtime.settings.ttlMs;
      const lastTouch = runtime.lastCacheTouchAt ?? null;
      
      if (!lastTouch || ttlMs <= 0) {
        return undefined;
      }
      
      if (ttlMs > 0 && Date.now() - lastTouch < ttlMs) {
        return undefined; // Cache still valid, skip pruning
      }
    }

    // Perform pruning
    const next = pruneContextMessages({
      messages: event.messages,
      settings: runtime.settings,
      ctx,
      contextWindowTokensOverride: runtime.contextWindowTokens ?? undefined,
    });

    // No changes needed
    if (next === event.messages) {
      return undefined;
    }

    // Update cache timestamp
    if (runtime.settings.mode === "cache-ttl") {
      runtime.lastCacheTouchAt = Date.now();
      // @ts-ignore - sessionManager type mismatch
      setContextPruningRuntime(ctx.sessionManager, runtime);
    }

    return { messages: next };
  });

  // Command to configure pruning
  api.registerCommand?.("pruning-config", {
    description: "Configure context pruning settings",
    // @ts-ignore - handler return type
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = args.trim().split(" ");
      const subcommand = parts[0];
      
      if (subcommand === "status") {
        // @ts-ignore - sessionManager type mismatch
        const runtime = getContextPruningRuntime(ctx.sessionManager);
        if (!runtime) {
          ctx.ui.notify("Context pruning: disabled", "info");
          return;
        }
        const s = runtime.settings;
        const lines = [
          "Context Pruning Status:",
          `  Mode: ${s.mode}`,
          `  TTL: ${s.ttlMs / 1000}s`,
          `  Keep last assistants: ${s.keepLastAssistants}`,
          `  Soft trim ratio: ${(s.softTrimRatio * 100).toFixed(0)}%`,
          `  Hard clear ratio: ${(s.hardClearRatio * 100).toFixed(0)}%`,
        ];
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }
      
      if (subcommand === "disable") {
        // @ts-ignore - getCurrentSession doesn't exist
        const session = ctx.sessionManager.getCurrentSession?.();
        if (session?.setConfig) {
          session.setConfig("contextPruning", { mode: "off" });
        }
        // @ts-ignore - sessionManager type mismatch
        const runtime = getContextPruningRuntime(ctx.sessionManager);
        if (runtime) {
          // @ts-ignore - sessionManager type mismatch  
          setContextPruningRuntime(ctx.sessionManager, { 
            settings: { ...runtime.settings, mode: "cache-ttl" } 
          });
        }
        ctx.ui.notify("Context pruning disabled", "info");
        return;
      }
      
      ctx.ui.notify("Usage: /pruning-config [status|disable]", "error");
    },
  });
}
