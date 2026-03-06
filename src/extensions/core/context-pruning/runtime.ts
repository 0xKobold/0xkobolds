/**
 * Context Pruning Runtime State
 * 
 * Manages per-session pruning settings and cache timestamps
 * 
 * NOTE: This module uses @ts-ignore for SessionManager methods that are
 * not yet in the TypeScript definitions but exist at runtime:
 * - getCurrentSession(): Returns the current active session
 * - getExtensionRuntime(key): Gets extension-specific runtime state
 * - setExtensionRuntime(key, value): Sets extension-specific runtime state
 * 
 * These methods are available in the actual pi-coding-agent runtime but
 * the type definitions are incomplete. This is a known issue tracked
 * in the extension development docs.
 */

import type { SessionManager } from "@mariozechner/pi-coding-agent";
import type { EffectiveContextPruningSettings } from "./settings.js";

const RUNTIME_KEY = "contextPruning:v1";

export type ContextPruningRuntime = {
  settings: EffectiveContextPruningSettings;
  lastCacheTouchAt?: number;
  contextWindowTokens?: number;
};

// @ts-ignore - getCurrentSession doesn't exist on SessionManager type
export function getContextPruningRuntime(sessionManager: SessionManager): ContextPruningRuntime | null {
  try {
    // @ts-ignore - getCurrentSession doesn't exist
    const session = sessionManager.getCurrentSession?.();
    if (!session) {
      return null;
    }
    // @ts-ignore - getExtensionRuntime doesn't exist
    const runtime = session.getExtensionRuntime?.(RUNTIME_KEY) as ContextPruningRuntime | undefined;
    return runtime ?? null;
  } catch {
    return null;
  }
}

// @ts-ignore - sessionManager type
export function setContextPruningRuntime(
  sessionManager: SessionManager,
  runtime: ContextPruningRuntime,
): void {
  try {
    // @ts-ignore - getCurrentSession doesn't exist
    const session = sessionManager.getCurrentSession?.();
    if (!session) {
      return;
    }
    // @ts-ignore - setExtensionRuntime doesn't exist  
    session.setExtensionRuntime?.(RUNTIME_KEY, runtime);
  } catch {
    // ignore
  }
}
