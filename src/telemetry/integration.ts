/**
 * Telemetry Integration Helpers
 * 
 * Easy-to-use wrapper functions for common telemetry patterns.
 * These can be imported and used throughout the codebase.
 */

import { telemetry } from "./index";

// ============================================================================
// Gateway Helpers
// ============================================================================

export function trackGatewayRequest(
  latency_ms: number,
  success: boolean,
  method?: string,
  error?: string
): void {
  telemetry().gateway.request({ latency_ms, success, method, error });
}

export function trackGatewayConnect(client_type: string, node_id?: string): void {
  telemetry().gateway.connect({ client_type, node_id });
}

export function trackGatewayDisconnect(client_type: string, reason?: string): void {
  telemetry().gateway.disconnect({ client_type, reason });
}

// ============================================================================
// LLM Helpers
// ============================================================================

export function trackLLMRequest(
  model: string,
  latency_ms: number,
  tokens_used: number,
  success: boolean,
  provider?: string,
  error?: string
): void {
  telemetry().llm.request({ model, latency_ms, tokens_used, success, provider, error });
}

export function trackLLMFallback(
  from_model: string,
  to_model: string,
  reason: string
): void {
  telemetry().llm.fallback({ from_model, to_model, reason });
}

export function trackLLMRetry(
  model: string,
  attempt: number,
  error?: string
): void {
  telemetry().llm.retry({ model, attempt, error });
}

// ============================================================================
// Session Helpers
// ============================================================================

export function trackSessionCreate(session_id: string, type: string): void {
  telemetry().session.create({ session_id, type });
}

export function trackSessionResume(session_id: string, age_hours?: number): void {
  telemetry().session.resume({ session_id, age_hours });
}

export function trackSessionFork(parent_id: string, child_id: string): void {
  telemetry().session.fork({ parent_id, child_id });
}

export function trackSessionAbandon(session_id: string, reason?: string): void {
  telemetry().session.abandon({ session_id, reason });
}

// ============================================================================
// Skill Helpers
// ============================================================================

export function trackSkillExecution(
  name: string,
  latency_ms: number,
  success: boolean,
  error?: string
): void {
  telemetry().skill.execute({ name, latency_ms, success, error });
}

export function trackSkillInvoke(name: string): void {
  telemetry().skill.invoke({ name });
}

// ============================================================================
// Agent Helpers
// ============================================================================

export function trackAgentSpawn(agent_id: string, type: string): void {
  telemetry().agent.spawn({ agent_id, type });
}

export function trackAgentComplete(
  agent_id: string,
  duration_ms: number,
  success: boolean
): void {
  telemetry().agent.complete({ agent_id, duration_ms, success });
}

export function trackAgentTimeout(agent_id: string, max_duration_ms: number): void {
  telemetry().agent.timeout({ agent_id, max_duration_ms });
}

// ============================================================================
// Storage Helpers
// ============================================================================

export function trackStorageRead(
  operation: string,
  latency_ms: number,
  records?: number
): void {
  telemetry().storage.read({ operation, latency_ms, records });
}

export function trackStorageWrite(
  operation: string,
  latency_ms: number,
  records?: number
): void {
  telemetry().storage.write({ operation, latency_ms, records });
}

// ============================================================================
// WebSocket Helpers
// ============================================================================

export function trackWebSocketConnect(url: string, protocol?: string): void {
  telemetry().websocket.connect({ url, protocol });
}

export function trackWebSocketDisconnect(url: string, reason?: string): void {
  telemetry().websocket.disconnect({ url, reason });
}

export function trackWebSocketReconnect(url: string, attempt: number): void {
  telemetry().websocket.reconnect({ url, attempt });
}

// ============================================================================
// Channel Helpers
// ============================================================================

export function trackChannelMessage(
  platform: string,
  direction: 'in' | 'out',
  message_count: number = 1
): void {
  telemetry().channel.message({ platform, direction, message_count });
}

export function trackChannelCommand(platform: string, command: string): void {
  telemetry().channel.command({ platform, command });
}

// ============================================================================
// Cron Helpers
// ============================================================================

export function trackCronJob(
  name: string,
  latency_ms: number,
  success: boolean,
  error?: string
): void {
  telemetry().cron.job({ name, latency_ms, success, error });
}

// ============================================================================
// System Helpers
// ============================================================================

export function trackSystemStartup(): void {
  telemetry().system.startup();
}

export function trackSystemShutdown(): void {
  telemetry().system.shutdown();
}

export function trackSystemMemory(heap_used_mb: number, heap_total_mb: number): void {
  telemetry().system.memory({ heap_used_mb, heap_total_mb });
}

export function trackSystemError(error_type: string, message: string): void {
  telemetry().system.error({ error_type, message });
}

// ============================================================================
// Decorators (for class methods)
// ============================================================================

/**
 * Decorator to track async function execution as a skill
 */
export function trackSkill(skillName?: string) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const name = skillName || propertyKey;

    descriptor.value = async function (...args: any[]) {
      const start = Date.now();
      try {
        const result = await originalMethod.apply(this, args);
        trackSkillExecution(name, Date.now() - start, true);
        return result;
      } catch (e) {
        trackSkillExecution(name, Date.now() - start, false, String(e));
        throw e;
      }
    };

    return descriptor;
  };
}

/**
 * Decorator to track async function execution as an agent task
 */
export function trackAgent(agentId?: string) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const id = agentId || this.agentId || propertyKey;
      const start = Date.now();
      try {
        const result = await originalMethod.apply(this, args);
        trackAgentComplete(id, Date.now() - start, true);
        return result;
      } catch (e) {
        trackAgentComplete(id, Date.now() - start, false);
        throw e;
      }
    };

    return descriptor;
  };
}

// ============================================================================
// Timer Helper (for inline timing)
// ============================================================================

/**
 * Start a timer and return end() function
 */
export function startTimer(
  name: string,
  tags?: Record<string, string>
): { end: (options?: { success?: boolean; tags?: Record<string, string> }) => void } {
  return telemetry().startTimer(name, tags);
}

/**
 * Track an async operation with automatic timing
 */
export async function track<T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  return telemetry().trackAsync(name, fn, tags);
}

/**
 * Track a sync operation with automatic timing
 */
export function trackSync<T>(
  name: string,
  fn: () => T,
  tags?: Record<string, string>
): T {
  return telemetry().trackSync(name, fn, tags);
}
