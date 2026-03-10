/**
 * Session Bridge Extension
 * 
 * RE-EXPORT: UnifiedSessionBridge
 * 
 * This maintains backwards compatibility with imports that expect
 * session-bridge-extension.ts to exist, but delegates to the
 * unified session system.
 * 
 * For new code, import directly from:
 *   import UnifiedSessionBridge from "../sessions/UnifiedSessionBridge.js"
 */

export { default } from "../../sessions/UnifiedSessionBridge.js";