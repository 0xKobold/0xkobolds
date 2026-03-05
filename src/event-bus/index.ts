/**
 * Event Bus System
 *
 * Simple event system for inter-module communication.
 */

import { EventEmitter } from 'events';

// Domain Event Types
export type DomainEventType =
  // Agent events
  | 'agent.spawned'
  | 'agent.completed'
  | 'agent.error'
  | 'agent.status_changed'
  | 'agent.message'
  | 'agent.run'
  | 'agent.stopped'
  | 'agent.tool.started'
  | 'agent.tool.completed'
  // Discord events
  | 'discord.message.received'
  | 'discord.message.sent'
  | 'discord.channel.joined'
  | 'discord.channel.left'
  // Gateway events
  | 'gateway.client.connected'
  | 'gateway.client.disconnected'
  // Config events
  | 'config.loaded'
  | 'config.changed'
  // Hook events
  | 'hook.triggered'
  // Media events
  | 'media.processed'
  | 'media.understood'
  // System events
  | 'system.error'
  | 'system.shutdown'
  // Skill events
  | 'skill.registered'
  | 'skill.unregistered';

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
  on<T>(event: DomainEventType, listener: EventHandler<T>): this {
    return super.on(event, listener);
  }

  // Unsubscribe from an event
  off<T>(event: DomainEventType, listener: EventHandler<T>): this {
    return super.off(event, listener);
  }

  // Publish an event
  async emit<T>(type: DomainEventType, payload: T, options: EmitOptions = {}): Promise<void> {
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

  async emit(type: DomainEventType): Promise<void> {
    return eventBus.emit(type, this.payload as T, this.options);
  }
}
