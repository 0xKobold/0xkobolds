/**
 * Delivery System - Hermes-style proactive message routing
 * 
 * Features:
 * - Home channel concept (default delivery target)
 * - Mirror remote messages back to local session
 * - Cross-platform delivery routing
 * - Delivery queue with priority
 */

import { EventEmitter } from "events";

export interface DeliveryTarget {
  id: string;
  type: "discord" | "cli" | "websocket" | "telegram" | "slack";
  channelId?: string;
  userId?: string;
  platformId: string;  // Platform-specific identifier
  isHome?: boolean;     // Is this the home/default channel?
  priority: number;     // Delivery priority (higher = more important)
  metadata?: Record<string, unknown>;
}

export interface DeliveryMessage {
  id: string;
  content: string;
  target: DeliveryTarget;
  sourceSessionId: string;
  sourceSessionKey: string;
  priority: "low" | "normal" | "high" | "urgent";
  metadata?: {
    agentId?: string;
    taskId?: string;
    parentMessageId?: string;
    attachments?: Array<{
      type: "image" | "file" | "link";
      url: string;
      name?: string;
    }>;
    mirroredFrom?: string;
  };
  createdAt: number;
  deliveredAt?: number;
  status: "pending" | "delivering" | "delivered" | "failed";
  error?: string;
}

export interface MirrorConfig {
  enabled: boolean;
  platforms: string[];  // Which platforms to mirror to
  excludeChannels?: string[];  // Channels to exclude from mirroring
  includePrivate?: boolean;  // Mirror private messages
}

type DeliveryHandler = (message: DeliveryMessage) => Promise<{ success: boolean; error?: string }>;

/**
 * Delivery System - manages message routing across platforms
 */
export class DeliverySystem extends EventEmitter {
  private homeChannel: DeliveryTarget | null = null;
  private targets: Map<string, DeliveryTarget> = new Map();
  private handlers: Map<string, DeliveryHandler> = new Map();
  private deliveryQueue: DeliveryMessage[] = [];
  private mirrorConfig: MirrorConfig = { enabled: true, platforms: [] };
  private sessionMessages: Map<string, DeliveryMessage[]> = new Map();

  constructor() {
    super();
    this.startDeliveryLoop();
  }

  /**
   * Set the home channel (default delivery target)
   */
  setHomeChannel(target: DeliveryTarget): void {
    // Clear previous home flag
    if (this.homeChannel) {
      const prev = this.targets.get(this.homeChannel.id);
      if (prev) {
        prev.isHome = false;
      }
    }
    
    this.homeChannel = target;
    target.isHome = true;
    this.targets.set(target.id, target);
    
    this.emit("home-channel-set", target);
    console.log(`[Delivery] Home channel set: ${target.type}/${target.platformId}`);
  }

  /**
   * Get the current home channel
   */
  getHomeChannel(): DeliveryTarget | null {
    return this.homeChannel;
  }

  /**
   * Register a delivery target
   */
  registerTarget(target: DeliveryTarget): void {
    this.targets.set(target.id, target);
    
    // Set as home if first target and no home set
    if (!this.homeChannel && target.type === "discord") {
      this.setHomeChannel(target);
    }
    
    this.emit("target-registered", target);
  }

  /**
   * Unregister a delivery target
   */
  unregisterTarget(targetId: string): void {
    const target = this.targets.get(targetId);
    if (target?.isHome) {
      this.homeChannel = null;
      // Find new home channel
      for (const [id, t] of this.targets) {
        if (id !== targetId && t.type === "discord") {
          this.setHomeChannel(t);
          break;
        }
      }
    }
    this.targets.delete(targetId);
    this.emit("target-unregistered", targetId);
  }

  /**
   * Register a delivery handler for a platform type
   */
  registerHandler(platformType: string, handler: DeliveryHandler): void {
    this.handlers.set(platformType, handler);
  }

  /**
   * Configure mirroring behavior
   */
  setMirrorConfig(config: Partial<MirrorConfig>): void {
    this.mirrorConfig = { ...this.mirrorConfig, ...config };
  }

  /**
   * Queue a message for delivery
   */
  queueDelivery(
    content: string,
    target?: DeliveryTarget,
    options: Partial<DeliveryMessage> = {}
  ): DeliveryMessage {
    const effectiveTarget = target ?? this.homeChannel;
    
    if (!effectiveTarget) {
      // Don't crash - just warn and return a failed message
      console.warn("[Delivery] No delivery target and no home channel set");
      const failedMessage: DeliveryMessage = {
        id: `delivery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        content,
        target: { id: "none", type: "cli", platformId: "none", priority: 0 },
        sourceSessionId: options.sourceSessionId ?? "",
        sourceSessionKey: options.sourceSessionKey ?? "",
        priority: options.priority ?? "normal",
        metadata: options.metadata,
        createdAt: Date.now(),
        status: "failed",
        error: "No delivery target",
      };
      this.emit("message-failed", failedMessage, "No home channel set");
      return failedMessage;
    }
    
    const message: DeliveryMessage = {
      id: `delivery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      target: effectiveTarget,
      sourceSessionId: options.sourceSessionId ?? "",
      sourceSessionKey: options.sourceSessionKey ?? "",
      priority: options.priority ?? "normal",
      metadata: options.metadata,
      createdAt: Date.now(),
      status: "pending",
    };
    
    // Track by session
    const sessionKey = message.sourceSessionKey;
    if (!this.sessionMessages.has(sessionKey)) {
      this.sessionMessages.set(sessionKey, []);
    }
    this.sessionMessages.get(sessionKey)!.push(message);
    
    // Add to delivery queue with priority
    this.insertByPriority(message);
    
    this.emit("message-queued", message);
    return message;
  }

  /**
   * Queue delivery to all registered targets (broadcast)
   */
  broadcast(content: string, options: Partial<DeliveryMessage> = {}): DeliveryMessage[] {
    const messages: DeliveryMessage[] = [];
    
    for (const target of this.targets.values()) {
      if (this.mirrorConfig.platforms.length === 0 || 
          this.mirrorConfig.platforms.includes(target.type)) {
        messages.push(this.queueDelivery(content, target, options));
      }
    }
    
    return messages;
  }

  /**
   * Queue delivery to home channel specifically
   */
  deliverToHome(content: string, options: Partial<DeliveryMessage> = {}): DeliveryMessage | null {
    if (!this.homeChannel) {
      console.warn("[Delivery] No home channel set, cannot deliver");
      return null;
    }
    
    return this.queueDelivery(content, this.homeChannel, options);
  }

  /**
   * Mirror a message from remote platform to local session history
   */
  mirrorToLocal(
    content: string,
    sourceSessionKey: string,
    sourcePlatform: string,
    metadata?: DeliveryMessage["metadata"]
  ): void {
    if (!this.mirrorConfig.enabled) return;
    if (this.mirrorConfig.platforms.length > 0 && 
        !this.mirrorConfig.platforms.includes(sourcePlatform)) return;
    
    // Create mirrored message record
    const message: DeliveryMessage = {
      id: `mirror-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      target: this.homeChannel ?? { id: "local", type: "cli", platformId: "local", priority: 0 },
      sourceSessionId: "",
      sourceSessionKey,
      priority: "normal",
      metadata: { ...metadata, mirroredFrom: sourcePlatform },
      createdAt: Date.now(),
      status: "delivered",
    };
    
    // Track in session messages
    if (!this.sessionMessages.has(sourceSessionKey)) {
      this.sessionMessages.set(sourceSessionKey, []);
    }
    this.sessionMessages.get(sourceSessionKey)!.push(message);
    
    this.emit("message-mirrored", message, sourcePlatform);
  }

  /**
   * Get delivery history for a session
   */
  getSessionHistory(sessionKey: string, limit = 50): DeliveryMessage[] {
    const messages = this.sessionMessages.get(sessionKey) ?? [];
    return messages.slice(-limit);
  }

  /**
   * Get all pending deliveries
   */
  getPendingDeliveries(): DeliveryMessage[] {
    return this.deliveryQueue.filter(m => m.status === "pending");
  }

  /**
   * Insert message into queue by priority
   */
  private insertByPriority(message: DeliveryMessage): void {
    const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
    const msgPriority = priorityOrder[message.priority];
    
    let insertIndex = this.deliveryQueue.length;
    for (let i = 0; i < this.deliveryQueue.length; i++) {
      const queuePriority = priorityOrder[this.deliveryQueue[i].priority];
      if (msgPriority > queuePriority) {
        insertIndex = i;
        break;
      }
    }
    
    this.deliveryQueue.splice(insertIndex, 0, message);
  }

  /**
   * Start background delivery loop
   */
  private startDeliveryLoop(): void {
    const processQueue = async () => {
      const pending = this.deliveryQueue.filter(m => m.status === "pending");
      
      for (const message of pending) {
        const handler = this.handlers.get(message.target.type);
        if (!handler) {
          console.warn(`[Delivery] No handler for platform type: ${message.target.type}`);
          message.status = "failed";
          message.error = `No handler for ${message.target.type}`;
          continue;
        }
        
        try {
          message.status = "delivering";
          const result = await handler(message);
          
          if (result.success) {
            message.status = "delivered";
            message.deliveredAt = Date.now();
            this.emit("message-delivered", message);
          } else {
            message.status = "failed";
            message.error = result.error;
            this.emit("message-failed", message, result.error ?? "Unknown error");
          }
        } catch (error) {
          message.status = "failed";
          message.error = error instanceof Error ? error.message : String(error);
          this.emit("message-failed", message, message.error);
        }
      }
      
      // Clean up old delivered messages
      const oneHourAgo = Date.now() - 3600000;
      this.deliveryQueue = this.deliveryQueue.filter(
        m => m.status === "pending" || m.createdAt > oneHourAgo
      );
    };
    
    // Process queue every 100ms
    setInterval(processQueue, 100);
  }
}

// Singleton instance
let deliverySystem: DeliverySystem | null = null;

export function getDeliverySystem(): DeliverySystem {
  if (!deliverySystem) {
    deliverySystem = new DeliverySystem();
  }
  return deliverySystem;
}

/**
 * Initialize delivery system with Discord gateway
 */
export function initDeliveryWithDiscord(
  sendToChannel: (channelId: string, content: string) => Promise<void>
): DeliverySystem {
  const ds = getDeliverySystem();
  
  ds.registerHandler("discord", async (message) => {
    try {
      await sendToChannel(
        message.target.channelId ?? message.target.platformId,
        message.content
      );
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });
  
  return ds;
}

/**
 * Initialize delivery system with CLI (local terminal)
 */
export function initDeliveryWithCli(
  writeToTerminal: (content: string) => void
): DeliverySystem {
  const ds = getDeliverySystem();
  
  ds.registerHandler("cli", async (message) => {
    try {
      writeToTerminal(message.content);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  
  return ds;
}

/**
 * Initialize delivery system with WebSocket (Mission Control)
 */
export function initDeliveryWithWebSocket(
  broadcastToClients: (content: string, sessionId?: string) => void
): DeliverySystem {
  const ds = getDeliverySystem();
  
  ds.registerHandler("websocket", async (message) => {
    try {
      broadcastToClients(message.content, message.sourceSessionId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  
  return ds;
}