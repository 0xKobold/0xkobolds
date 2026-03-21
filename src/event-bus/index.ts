/**
 * Event Bus System
 *
 * Simple event system for inter-module communication.
 */

import { EventEmitter } from 'events';

// Domain Event Types
export type DomainEventType =
  // Agent events (used)
  | 'agent.spawned'
  | 'agent.completed'
  | 'agent.error'
  | 'agent.stopped'
  | 'agent.run'
  | 'agent.message'
  | 'agent.tool.started'
  | 'agent.tool.completed'
  // Discord events (used)
  | 'discord.notify'
  // Gateway events (used)
  | 'gateway.session_connected'
  | 'gateway.session_disconnected'
  // Extension events (used)
  | 'extension.loaded'
  | 'extension.error'
  | 'extension.unloaded'
  // File events (used)
  | 'file.written'
  | 'file.read'
  // Security events (used)
  | 'security.issues_found'
  | 'security.scan_completed'
  // Session events (used)
  | 'session.run.completed'
  | 'session.run.linked'
  // Learning events (used)
  | 'learning.observation'
  | 'learning.recap'
  | 'learning.trigger_reflection'
  | 'learning.observe_session'
  | 'learning.query_thread'
  // Perennial events (used)
  | 'perennial.save'
  | 'perennial.save_session'
  | 'perennial.query_for_session'
  // Memory integration events (used)
  | 'memory.resource_ingested'
  | 'memory.consolidate_resource'
  | 'memory.summarize_category'
  | 'memory.reindex'
  | 'memory.needs_resolution'
  // Auth profile events (used)
  | 'auth-profile:added'
  | 'auth-profile:removed'
  | 'auth-profile:used'
  | 'auth-profile:failed'
  | 'auth-profile:recovered'
  // Fallback events (used)
  | 'fallback.attempt'
  | 'fallback.success'
  | 'fallback.failed'
  // System events (used)
  | 'system.error'
  | 'system.notification'
  | 'system.shutdown'
  // Cron events (used)
  | 'cron.job.injected'
  // Notification channels (used)
  | 'whatsapp.notify'
  // Autonomy events (inner monologue, desires, pursuit)
  | 'autonomy.monologue_started'
  | 'autonomy.monologue_stopped'
  | 'autonomy.thought'
  | 'autonomy.thought_surfaceable'
  | 'autonomy.reflection'
  | 'autonomy.desire_spawned'
  | 'autonomy.desire_pursued'
  | 'autonomy.desire_blocked'
  | 'autonomy.desire_unblocked'
  | 'autonomy.action_executed'
  | 'autonomy.action_failed'
  | 'autonomy.pursuit_started'
  | 'autonomy.pursuit_stopped'
  | 'autonomy.started'
  | 'autonomy.stopped'
  | 'autonomy.send_message'
  | 'autonomy.start_project'
  | 'autonomy.research'
  | 'autonomy.follow_up'
  | 'autonomy.share_thought'
  | 'autonomy.user_active'
  | 'autonomy.proactive_message'
  | 'autonomy.action_outcome';

// Domain Event Interface
export interface DomainEvent {
  type: DomainEventType;
  payload: unknown;
  metadata: EventMetadata;
  timestamp: number;
  source: string;
}

export interface EventMetadata {
  eventId: string;
  correlationId?: string;
  causationId?: string;
  timestamp: number;
  source: string;
  tags?: string[];
}

export type EventHandler<T = unknown> = (event: DomainEvent & { payload: T }) => Promise<void> | void;

// Subscription interface for cleanup
export interface Subscription {
  unsubscribe(): void;
}

// Event Bus Implementation
class KoboldEventBus extends EventEmitter {
  private middleware: MiddlewareFn[] = [];

  // Subscribe to an event
  // Returns unsubsribe function instead of `this` for better ergonomics
  // @ts-ignore EventEmitter override
  on<T>(event: DomainEventType, listener: EventHandler<T>): () => void {
    super.on(event, listener);
    return () => this.off(event, listener);
  }

  // Unsubscribe from an event
  // @ts-ignore EventEmitter override
  off<T>(event: DomainEventType, listener: EventHandler<T>): this {
    return super.off(event, listener);
  }

  // Publish an event - override EventEmitter.emit but return Promise<void>
  // @ts-ignore Return type override
  override async emit<T>(type: DomainEventType, payload: T, options: EmitOptions = {}): Promise<void> {
    const event: DomainEvent = {
      type,
      payload,
      metadata: {
        eventId: crypto.randomUUID(),
        correlationId: options.correlationId,
        causationId: options.causationId,
        timestamp: Date.now(),
        source: options.source ?? 'system',
        tags: options.tags
      },
      timestamp: Date.now(),
      source: options.source ?? 'system'
    };

    // Run middleware
    for (const mw of this.middleware) {
      try {
        await mw(event);
      } catch (err) {
        console.error(`Event middleware failed for ${type}:`, err);
        return;
      }
    }

    // Emit using Node's EventEmitter
    super.emit(type, event);
  }

  // Add middleware
  use(middleware: MiddlewareFn): void {
    this.middleware.push(middleware);
  }
}

export interface EmitOptions {
  correlationId?: string;
  causationId?: string;
  source?: string;
  tags?: string[];
}

export type MiddlewareFn = (event: DomainEvent) => Promise<void> | void;

// Global event bus instance
export const eventBus = new KoboldEventBus();

// Helper to create typed event emitters
export function createEventEmitter(source: string) {
  return {
    emit<T>(type: DomainEventType, payload: T, options: Omit<EmitOptions, 'source'> = {}): Promise<void> {
      return eventBus.emit(type, payload, { ...options, source });
    }
  };
}

// Event type guards
export const isAgentEvent = (type: DomainEventType): boolean =>
  type.startsWith('agent.');

export const isDiscordEvent = (type: DomainEventType): boolean =>
  type.startsWith('discord.');

export const isGatewayEvent = (type: DomainEventType): boolean =>
  type.startsWith('gateway.');

// Event builder for complex payloads
export class EventBuilder<T = Record<string, unknown>> {
  private payload: Record<string, unknown> = {};
  private options: EmitOptions = {};

  with<K extends keyof T>(key: K, value: T[K]): this {
    this.payload[key as string] = value;
    return this;
  }

  withPayload(payload: Partial<T>): this {
    Object.assign(this.payload, payload);
    return this;
  }

  withCorrelationId(id: string): this {
    this.options.correlationId = id;
    return this;
  }

  withSource(source: string): this {
    this.options.source = source;
    return this;
  }

  withTags(...tags: string[]): this {
    this.options.tags = tags;
    return this;
  }

  emit(type: DomainEventType): Promise<void> {
    return eventBus.emit(type, this.payload as T, this.options);
  }
}
