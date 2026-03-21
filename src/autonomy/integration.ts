/**
 * Autonomy Integration - Connects autonomy to external systems
 * 
 * Provides:
 * - User presence detection (from gateway, discord, etc.)
 * - Delivery system integration (send messages)
 * - Memory context (pull from perennial memory)
 * - Session awareness (what's currently happening)
 */

import { eventBus } from "../event-bus/index.js";

// ════════════════════════════════════════════════════════════════════════════
// PRESENCE DETECTION
// ════════════════════════════════════════════════════════════════════════════

interface PresenceState {
  lastActivity: Date;
  isActive: boolean;
  channel: string | null;
  platform: "tui" | "discord" | "web" | "unknown";
}

let presenceState: PresenceState = {
  lastActivity: new Date(),
  isActive: true,
  channel: null,
  platform: "unknown",
};

/**
 * Record user activity (called from gateway/Discord)
 */
export function recordUserActivity(channel?: string, platform?: string): void {
  presenceState = {
    lastActivity: new Date(),
    isActive: true,
    channel: channel || presenceState.channel,
    platform: (platform as any) || presenceState.platform,
  };
  
  eventBus.emit("autonomy.user_active", {
    timestamp: Date.now(),
    channel: presenceState.channel,
    platform: presenceState.platform,
  });
}

/**
 * Check if user is present
 */
export function isUserPresent(thresholdMinutes = 30): boolean {
  const minutesSinceActivity = (Date.now() - presenceState.lastActivity.getTime()) / 60000;
  presenceState.isActive = minutesSinceActivity < thresholdMinutes;
  return presenceState.isActive;
}

/**
 * Get time since last activity
 */
export function getIdleMinutes(): number {
  return Math.floor((Date.now() - presenceState.lastActivity.getTime()) / 60000);
}

/**
 * Get presence state
 */
export function getPresenceState(): PresenceState {
  return { ...presenceState };
}

// ════════════════════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES
// ════════════════════════════════════════════════════════════════════════════

/**
 * Message templates for unsolicited outreach by desire type
 */
export const MESSAGE_TEMPLATES = {
  connection: {
    followUp: [
      "I was thinking about {topic} from our conversation. How's that going?",
      "Earlier we talked about {topic} - any updates?",
      "I've been reflecting on {topic}. Have you made progress?",
    ],
    checkIn: [
      "How are things going? I wanted to check in.",
      "I've been thinking about our conversations - anything new?",
      "Just wanted to connect. How can I help?",
    ],
    offer: [
      "I noticed you might need help with {topic}. Want to talk about it?",
      "I think I could help with {project}. Interested?",
    ],
  },
  
  curiosity: {
    question: [
      "I've been wondering about {topic}. What do you think?",
      "Something I'm curious about: {question}",
      "I wanted to ask about {topic} - could you tell me more?",
    ],
    discovery: [
      "I discovered something interesting about {topic}. Want to hear?",
      "I found something that might help with {project}.",
    ],
  },
  
  completion: {
    reminder: [
      "We were working on {project}. Should we continue?",
      "I think we can finish {topic} - want to pick it back up?",
      "There's {project} we started. How about we complete it?",
    ],
    offer: [
      "I can help finish {project}. Want me to take a look?",
      "Let me check on {project} - I can probably help move it forward.",
    ],
  },
  
  growth: {
    improvement: [
      "I think I've gotten better at {skill}. Want to test me?",
      "I've been working on {area}. How am I doing?",
    ],
    learning: [
      "I learned something new about {topic}. Can I share?",
    ],
  },
};

/**
 * Generate a proactive message based on desire and context
 */
export function generateProactiveMessage(
  desireType: string,
  context: {
    recentTopics?: string[];
    activeProjects?: string[];
    lastInteraction?: string;
    idleMinutes?: number;
  }
): string {
  const templates = MESSAGE_TEMPLATES[desireType as keyof typeof MESSAGE_TEMPLATES];
  
  if (!templates) {
    // Generic fallback
    return "I wanted to reach out. Is there anything I can help with?";
  }
  
  // Pick a category based on context
  const categories = Object.keys(templates) as (keyof typeof templates)[];
  const category = categories[Math.floor(Math.random() * categories.length)];
  const categoryTemplates = templates[category] as string[];
  
  // Pick a template
  let template = categoryTemplates[Math.floor(Math.random() * categoryTemplates.length)];
  
  // Fill in placeholders
  if (context.recentTopics && context.recentTopics.length > 0) {
    template = template.replace("{topic}", context.recentTopics[0]);
  }
  if (context.activeProjects && context.activeProjects.length > 0) {
    template = template.replace("{project}", context.activeProjects[0]);
  }
  if (context.lastInteraction) {
    template = template.replace("{question}", context.lastInteraction);
  }
  if (template.includes("{skill}")) {
    template = template.replace("{skill}", "understanding context");
  }
  
  // Remove unfilled placeholders
  template = template.replace(/\{[^}]+\}/g, "something");
  
  return template;
}

// ════════════════════════════════════════════════════════════════════════════
// DELIVERY INTEGRATION
// ════════════════════════════════════════════════════════════════════════════

type DeliveryHandler = (message: string, options: {
  priority: "low" | "normal" | "high";
  type: "proactive" | "followup" | "alert";
}) => Promise<void>;

let deliveryHandler: DeliveryHandler | null = null;

/**
 * Set the delivery handler (called from extension)
 */
export function setDeliveryHandler(handler: DeliveryHandler): void {
  deliveryHandler = handler;
}

/**
 * Send a proactive message to the user
 */
export async function sendProactiveMessage(
  message: string,
  options: {
    priority?: "low" | "normal" | "high";
    type?: "proactive" | "followup" | "alert";
  } = {}
): Promise<boolean> {
  if (!deliveryHandler) {
    console.log("[Autonomy] No delivery handler set, cannot send message");
    return false;
  }
  
  try {
    await deliveryHandler(message, {
      priority: options.priority || "normal",
      type: options.type || "proactive",
    });
    return true;
  } catch (err) {
    console.error("[Autonomy] Failed to send message:", err);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MEMORY CONTEXT
// ════════════════════════════════════════════════════════════════════════════

export interface AutonomyContext {
  recentTopics: string[];
  recentInteractions: string[];
  activeProjects: string[];
  relationships: string[];
  lastSessionSummary?: string;
}

/**
 * Get context for autonomous thinking
 * 
 * Pulls from:
 * - Perennial memory (recent memories)
 * - Session store (current session)
 * - Self-model relationships
 */
export async function getAutonomyContext(): Promise<AutonomyContext> {
  const context: AutonomyContext = {
    recentTopics: [],
    recentInteractions: [],
    activeProjects: [],
    relationships: [],
  };
  
  try {
    // Try to get from perpetual memory via event bus
    // This is a simple approach - could be enhanced with direct integration
    
    // For now, return empty context - will be populated by memory integration
    // when the extension connects the systems
  } catch (err) {
    console.error("[Autonomy] Failed to get context:", err);
  }
  
  return context;
}

/**
 * Update context from memory events
 */
export function updateContextFromMemory(memories: Array<{ content: string; category: string }>): void {
  // Extract topics from memories
  for (const memory of memories.slice(0, 10)) {
    if (memory.category === "decision" || memory.category === "task") {
      // Extract keywords for topics
      const words = memory.content.toLowerCase().split(/\s+/);
      const topics = words.filter(w => w.length > 5 && !["about", "would", "should", "could", "there"].includes(w));
      // Add unique topics
      for (const topic of topics.slice(0, 3)) {
        if (!recentTopicsCache.includes(topic)) {
          recentTopicsCache.push(topic);
          if (recentTopicsCache.length > 20) {
            recentTopicsCache.shift();
          }
        }
      }
    }
  }
}

// Simple cache for recent topics
let recentTopicsCache: string[] = [];

/**
 * Get cached recent topics
 */
export function getRecentTopics(): string[] {
  return [...recentTopicsCache];
}

// ════════════════════════════════════════════════════════════════════════════
// LEARNING FROM OUTCOMES
// ════════════════════════════════════════════════════════════════════════════

interface ActionOutcome {
  actionId: string;
  actionType: string;
  desireId: string;
  result: "success" | "ignored" | "failed";
  userResponse?: string;
  timestamp: Date;
}

const outcomeHistory: ActionOutcome[] = [];

/**
 * Record outcome of an autonomous action
 */
export function recordActionOutcome(
  actionId: string,
  actionType: string,
  desireId: string,
  result: "success" | "ignored" | "failed",
  userResponse?: string
): void {
  outcomeHistory.push({
    actionId,
    actionType,
    desireId,
    result,
    userResponse,
    timestamp: new Date(),
  });
  
  // Keep only last 100 outcomes
  if (outcomeHistory.length > 100) {
    outcomeHistory.shift();
  }
  
  eventBus.emit("autonomy.action_outcome", {
    actionId,
    actionType,
    desireId,
    result,
  });
}

/**
 * Get success rate for an action type
 */
export function getActionSuccessRate(actionType: string): number {
  const relevantOutcomes = outcomeHistory.filter(o => o.actionType === actionType);
  if (relevantOutcomes.length === 0) return 0.5; // Unknown, assume 50%
  
  const successes = relevantOutcomes.filter(o => o.result === "success").length;
  return successes / relevantOutcomes.length;
}

/**
 * Get recent outcomes for learning
 */
export function getRecentOutcomes(limit = 20): ActionOutcome[] {
  return outcomeHistory.slice(-limit);
}

// ════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Initialize integration with event bus
 */
export function initializeIntegration(): void {
  // Listen for user activity from gateway
  eventBus.on("gateway.session_connected", (event) => {
    recordUserActivity("web", "gateway");
  });
  
  eventBus.on("discord.notify", (event) => {
    recordUserActivity("discord", "discord");
  });
  
  eventBus.on("perennial.save", (event) => {
    const payload = event.payload as any;
    if (payload?.content) {
      updateContextFromMemory([{ content: payload.content, category: payload.category || "fact" }]);
    }
  });
  
  console.log("[AutonomyIntegration] Initialized presence detection and delivery integration");
}