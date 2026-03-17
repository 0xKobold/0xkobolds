/**
 * Queue Modes - v0.1.0
 * 
 * Hermes-style message queue handling:
 * - steer: Interrupt mid-run, skip remaining tools
 * - followup: Queue for next turn
 * - collect: Batch with debounce
 * 
 * Based on Hermes Agent queue_modes.py
 */

import { EventEmitter } from "events";

/**
 * Queue mode determines how incoming messages are handled
 * while the agent is processing.
 */
export type QueueMode = "steer" | "followup" | "collect";

/**
 * Queued message from any platform
 */
export interface QueuedMessage {
  id: string;
  content: string;
  platform: string;      // 'cli', 'telegram', 'discord', etc.
  userId?: string;       // Platform user ID
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Default queue mode */
  defaultMode: QueueMode;
  
  /** Debounce time for collect mode (ms) */
  debounceMs: number;
  
  /** Maximum queued messages before forcing process */
  maxQueueSize: number;
  
  /** Whether to merge consecutive messages in collect mode */
  mergeMessages: boolean;
  
  /** Platform-specific mode overrides */
  platformModes?: Record<string, QueueMode>;
}

/**
 * Interrupt result
 */
export interface InterruptResult {
  interrupted: boolean;
  skippedTools: string[];
  reason: string;
}

const DEFAULT_CONFIG: QueueConfig = {
  defaultMode: "followup",
  debounceMs: 500,
  maxQueueSize: 10,
  mergeMessages: true,
  platformModes: {
    // CLI gets steer mode for immediate interruption
    cli: "steer",
    // Messaging platforms use followup for safety
    telegram: "followup",
    discord: "followup",
    whatsapp: "followup",
    slack: "followup",
  },
};

/**
 * Message Queue Manager
 * 
 * Handles incoming messages based on queue mode while
 * the agent is processing.
 */
export class MessageQueue extends EventEmitter {
  private config: QueueConfig;
  private mode: QueueMode;
  private queue: QueuedMessage[] = [];
  private processing = false;
  private debounceTimer?: Timer;
  private interruptRequested = false;
  private interruptMessage: QueuedMessage | null = null;
  private platform: string;

  constructor(config: Partial<QueueConfig> = {}, platform: string = "cli") {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.platform = platform;
    this.mode = this.config.platformModes?.[platform] || this.config.defaultMode;
  }

  /**
   * Set queue mode
   */
  setMode(mode: QueueMode): void {
    this.mode = mode;
    this.emit("mode-change", mode);
  }

  /**
   * Get current queue mode
   */
  getMode(): QueueMode {
    return this.mode;
  }

  /**
   * Start processing (agent begins)
   */
  startProcessing(): void {
    this.processing = true;
    this.interruptRequested = false;
    this.interruptMessage = null;
    this.emit("processing-start");
  }

  /**
   * Stop processing (agent ends)
   */
  stopProcessing(): void {
    this.processing = false;
    this.emit("processing-stop");
    
    // Process any queued messages
    if (this.queue.length > 0) {
      this.processQueue();
    }
  }

  /**
   * Check if currently processing
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Handle incoming message based on current mode
   */
  async handleMessage(message: QueuedMessage): Promise<void> {
    switch (this.mode) {
      case "steer":
        await this.handleSteer(message);
        break;
      case "followup":
        await this.handleFollowup(message);
        break;
      case "collect":
        await this.handleCollect(message);
        break;
    }
  }

  /**
   * Steer mode: Interrupt current run
   * 
   * When agent is processing:
   * - Set interrupt flag
   * - Store message for immediate attention
   * - Agent checks flag and aborts
   */
  private async handleSteer(message: QueuedMessage): Promise<void> {
    if (this.processing) {
      // Signal interrupt
      this.interruptRequested = true;
      this.interruptMessage = message;
      
      // Clear any queued messages (steer replaces)
      this.queue = [];
      
      this.emit("interrupt", {
        message,
        reason: "steer-mode-interrupt",
      });
    } else {
      // Not processing, emit immediately
      this.emit("message", message);
    }
  }

  /**
   * Followup mode: Queue for next turn
   * 
   * When agent is processing:
   * - Add to queue
   * - Process when agent finishes
   */
  private async handleFollowup(message: QueuedMessage): Promise<void> {
    if (this.processing) {
      // Queue for later
      if (this.queue.length >= this.config.maxQueueSize) {
        // Remove oldest
        const removed = this.queue.shift();
        this.emit("queue-overflow", { removed, reason: "max-size" });
      }
      
      this.queue.push(message);
      this.emit("queued", { message, queueSize: this.queue.length });
    } else {
      // Not processing, emit immediately
      this.emit("message", message);
    }
  }

  /**
   * Collect mode: Batch with debounce
   * 
   * When agent is processing:
   * - Collect messages
   * - Wait for pause (debounce)
   * - Merge into single input
   * - Process when agent finishes
   */
  private async handleCollect(message: QueuedMessage): Promise<void> {
    // Add to queue
    this.queue.push(message);
    
    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    // Wait for pause
    this.debounceTimer = setTimeout(() => {
      this.processCollected();
    }, this.config.debounceMs);
    
    this.emit("collecting", { queueSize: this.queue.length });
  }

  /**
   * Process collected messages
   */
  private processCollected(): void {
    if (this.queue.length === 0) return;
    
    if (this.config.mergeMessages && this.queue.length > 1) {
      // Merge messages
      const merged: QueuedMessage = {
        id: `merged-${Date.now()}`,
        content: this.queue.map(m => m.content).join("\n\n"),
        platform: this.platform,
        timestamp: Date.now(),
        metadata: {
          mergedCount: this.queue.length,
          originalIds: this.queue.map(m => m.id),
        },
      };
      
      this.queue = [];
      this.emit("message", merged);
    } else {
      // Process first, queue rest
      const first = this.queue.shift();
      if (first) {
        this.emit("message", first);
      }
      
      // Keep rest for next turn
      if (this.queue.length > 0) {
        this.emit("queued", { queueSize: this.queue.length });
      }
    }
  }

  /**
   * Process queued messages
   */
  private processQueue(): void {
    if (this.queue.length === 0) return;
    
    // Take all queued messages
    const messages = [...this.queue];
    this.queue = [];
    
    // Merge if configured
    if (this.config.mergeMessages && messages.length > 1) {
      const merged: QueuedMessage = {
        id: `merged-${Date.now()}`,
        content: messages.map(m => m.content).join("\n\n"),
        platform: this.platform,
        timestamp: Date.now(),
        metadata: {
          mergedCount: messages.length,
          originalIds: messages.map(m => m.id),
        },
      };
      
      this.emit("message", merged);
    } else {
      // Process each
      for (const message of messages) {
        this.emit("message", message);
      }
    }
    
    this.emit("queue-processed", { count: messages.length });
  }

  /**
   * Check if interrupt was requested
   */
  isInterruptRequested(): boolean {
    return this.interruptRequested;
  }

  /**
   * Get interrupt message
   */
  getInterruptMessage(): QueuedMessage | null {
    return this.interruptMessage;
  }

  /**
   * Clear interrupt state (after handling)
   */
  clearInterrupt(): void {
    this.interruptRequested = false;
    this.interruptMessage = null;
  }

  /**
   * Get queued message count
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get all queued messages
   */
  getQueue(): QueuedMessage[] {
    return [...this.queue];
  }

  /**
   * Clear queue without processing
   */
  clearQueue(): void {
    const count = this.queue.length;
    this.queue = [];
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.emit("queue-cleared", { count });
  }
}

/**
 * Create a message queue instance
 */
export function createMessageQueue(
  config?: Partial<QueueConfig>,
  platform?: string
): MessageQueue {
  return new MessageQueue(config, platform);
}

/**
 * Interrupt handler for integrating with agent loop
 */
export class InterruptHandler {
  private interrupted = false;
  private skippedTools: string[] = [];

  /**
   * Check interrupt flag (call from agent loop)
   */
  checkInterrupt(): boolean {
    return this.interrupted;
  }

  /**
   * Set interrupt (steer mode signal)
   */
  setInterrupt(): void {
    this.interrupted = true;
  }

  /**
   * Clear interrupt after handling
   */
  clearInterrupt(): void {
    this.interrupted = false;
    this.skippedTools = [];
  }

  /**
   * Record skipped tool due to interrupt
   */
  recordSkippedTool(toolName: string): void {
    if (this.interrupted) {
      this.skippedTools.push(toolName);
    }
  }

  /**
   * Get interrupt result
   */
  getResult(): InterruptResult {
    return {
      interrupted: this.interrupted,
      skippedTools: this.skippedTools,
      reason: this.interrupted ? "steer-mode-interrupt" : "no-interrupt",
    };
  }
}

/**
 * Platform-specific queue mode recommendations
 */
export const PLATFORM_RECOMMENDATIONS: Record<string, QueueMode> = {
  // CLI: Immediate interruption for responsive REPL
  cli: "steer",
  
  // Messaging platforms: Followup for safety
  // Don't interrupt mid-task on async platforms
  telegram: "followup",
  discord: "followup",
  slack: "followup",
  whatsapp: "followup",
  signal: "followup",
  email: "followup",
  
  // Cron: Collect for batched reporting
  cron: "collect",
  
  // Gateway: Followup for multi-platform safety
  gateway: "followup",
};

/**
 * Get recommended queue mode for platform
 */
export function getRecommendedMode(platform: string): QueueMode {
  return PLATFORM_RECOMMENDATIONS[platform] || "followup";
}

export default createMessageQueue;