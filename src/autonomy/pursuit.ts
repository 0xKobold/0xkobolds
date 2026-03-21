/**
 * Pursuit Engine - Transform Desires into Actions
 * 
 * This is where desires become unsolicited behavior.
 * The pursuit engine evaluates whether to act on a desire
 * and what action to take.
 * 
 * Key: This is NOT triggered by user input. It runs independently.
 */

import { eventBus } from "../event-bus/index.js";
import { getDesireSystem, type Desire, type DesireType } from "./desires.js";
import { getSelfModel } from "./self-model.js";
import { 
  isUserPresent, 
  getIdleMinutes, 
  sendProactiveMessage, 
  generateProactiveMessage,
  getActionSuccessRate,
  recordActionOutcome,
  getRecentTopics,
  type AutonomyContext,
} from "./integration.js";

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export type PursuitActionType =
  | "message_user"      // Reach out to user
  | "start_project"    // Begin working on something
  | "research_topic"   // Investigate something
  | "follow_up"        // Continue previous conversation
  | "create_artifact"  // Make something
  | "learn_skill"      // Improve a capability
  | "share_thought"    // Surface an inner thought
  | "reflect";         // Self-reflection

export interface PursuitAction {
  id: string;
  type: PursuitActionType;
  desireId: string;
  content: string;
  priority: number;
  createdAt: Date;
  executed: boolean;
  executedAt?: Date;
  result?: string;
}

export interface PursuitConfig {
  enabled: boolean;
  minDesireStrength: number;     // Minimum strength to act
  cooldownPerType: Record<PursuitActionType, number>; // ms between actions of same type
  maxPendingActions: number;     // Max actions in queue
  userPresenceRequired: Map<PursuitActionType, boolean>; // Does user need to be present?
}

const DEFAULT_CONFIG: PursuitConfig = {
  enabled: true,
  minDesireStrength: 0.5,
  cooldownPerType: {
    message_user: 1800000,      // 30 min (was 1 hour)
    start_project: 86400000,    // 1 day
    research_topic: 1800000,    // 30 minutes
    follow_up: 3600000,         // 1 hour (was 2 hours)
    create_artifact: 43200000,  // 12 hours
    learn_skill: 86400000,      // 1 day
    share_thought: 900000,      // 15 minutes (was 30)
    reflect: 600000,            // 10 minutes
  },
  maxPendingActions: 10,
  userPresenceRequired: new Map([
    ["message_user", true],
    ["start_project", false],
    ["research_topic", false],
    ["follow_up", true],
    ["create_artifact", false],
    ["learn_skill", false],
    ["share_thought", true],
    ["reflect", false],
  ]),
};

// ════════════════════════════════════════════════════════════════════════════
// PURSUIT ENGINE
// ════════════════════════════════════════════════════════════════════════════

class PursuitEngine {
  private config: PursuitConfig;
  private pendingActions: PursuitAction[] = [];
  private lastActionByType: Map<PursuitActionType, Date> = new Map();
  private actionHistory: PursuitAction[] = [];
  
  private pursueTimer: Timer | null = null;
  private desireSystem: ReturnType<typeof getDesireSystem> | null = null;
  private selfModel: ReturnType<typeof getSelfModel> | null = null;
  
  // Callbacks for executing actions
  private actionHandlers: Map<PursuitActionType, (action: PursuitAction) => Promise<string>> = new Map();

  constructor(config: Partial<PursuitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeDefaultHandlers();
  }

  /**
   * Set up default action handlers
   */
  private initializeDefaultHandlers(): void {
    // Message user - using integration layer
    this.actionHandlers.set("message_user", async (action) => {
      // Get context for personalized message
      const context = {
        recentTopics: getRecentTopics(),
        idleMinutes: getIdleMinutes(),
      };
      
      const message = generateProactiveMessage(
        action.content.includes(":") ? action.content.split(":")[0].toLowerCase() : "connection",
        context
      );
      
      // Use integration layer to send
      const sent = await sendProactiveMessage(message, { priority: "normal" });
      
      if (!sent) {
        // Fallback: emit event for delivery system
        eventBus.emit("autonomy.send_message", {
          content: message,
          type: "proactive",
          priority: "normal",
        });
      }
      
      return `Sent message: ${message}`;
    });
    
    // Start project
    this.actionHandlers.set("start_project", async (action) => {
      eventBus.emit("autonomy.start_project", {
        projectSpec: action.content,
        reason: `Pursuing desire: ${action.desireId}`,
      });
      return `Started project: ${action.content}`;
    });
    
    // Research topic
    this.actionHandlers.set("research_topic", async (action) => {
      eventBus.emit("autonomy.research", {
        topic: action.content,
        reason: `Pursuing desire: ${action.desireId}`,
      });
      return `Researched: ${action.content}`;
    });
    
    // Follow up
    this.actionHandlers.set("follow_up", async (action) => {
      // Generate follow-up message with context
      const context = {
        recentTopics: getRecentTopics(),
        idleMinutes: getIdleMinutes(),
      };
      
      const message = generateProactiveMessage("connection", context);
      
      const sent = await sendProactiveMessage(message, { 
        priority: "normal",
        type: "followup" 
      });
      
      if (!sent) {
        eventBus.emit("autonomy.follow_up", {
          content: message,
          desireId: action.desireId,
        });
      }
      
      return `Followed up: ${message}`;
    });
    
    // Share thought
    this.actionHandlers.set("share_thought", async (action) => {
      const sent = await sendProactiveMessage(action.content, { 
        priority: "low",
        type: "proactive" 
      });
      
      if (!sent) {
        eventBus.emit("autonomy.share_thought", {
          thought: action.content,
          priority: "low",
        });
      }
      
      return `Shared thought: ${action.content}`;
    });
    
    // Reflect
    this.actionHandlers.set("reflect", async (action) => {
      // Update self-model
      if (this.selfModel) {
        // Record reflection
        console.log(`[Pursuit] Reflection: ${action.content}`);
      }
      return `Reflected: ${action.content}`;
    });
  }

  /**
   * Register custom handler for action type
   */
  registerHandler(type: PursuitActionType, handler: (action: PursuitAction) => Promise<string>): void {
    this.actionHandlers.set(type, handler);
  }

  /**
   * START THE PURSUIT ENGINE
   */
  async start(): Promise<void> {
    this.desireSystem = getDesireSystem();
    this.selfModel = getSelfModel();
    
    // Log silently (use /autonomy status to view)
    // console.log("[Pursuit] Pursuit engine started. Ready to act on desires.");
    eventBus.emit("autonomy.pursuit_started", { timestamp: Date.now() });
  }

  /**
   * STOP THE PURSUIT ENGINE
   */
  stop(): void {
    if (this.pursueTimer) {
      clearTimeout(this.pursueTimer);
      this.pursueTimer = null;
    }
    console.log("[Pursuit] Pursuit engine stopped.");
  }

  /**
   * Schedule next pursuit check
   */
  private schedulePursuit(): void {
    // Check every 1-5 minutes with variance
    const interval = 60000 + Math.random() * 240000;
    
    this.pursueTimer = setTimeout(async () => {
      await this.pursue();
      this.schedulePursuit();
    }, interval);
  }

  /**
   * MAIN PURSUIT LOOP
   * 
   * This is the key method that creates unsolicited behavior.
   * It runs WITHOUT user input and decides whether to act.
   */
  private async pursue(): Promise<void> {
    if (!this.desireSystem) return;
    
    // Should I pursue anything?
    const desire = this.desireSystem.shouldPursue();
    if (!desire) {
      // No strong desires - maybe spawn some
      this.maybeSpawnDesire();
      return;
    }
    
    // Decide what action to take
    const action = this.planAction(desire);
    if (!action) return;
    
    // Check cooldown
    if (!this.canExecute(action.type)) return;
    
    // Should I act on this? (various factors)
    if (!this.shouldAct(action)) return;
    
    // Execute!
    await this.executeAction(action);
  }

  /**
   * Maybe spawn a desire if none are strong
   */
  private maybeSpawnDesire(): void {
    if (!this.desireSystem) return;
    
    // 20% chance to spawn curiosity
    if (Math.random() < 0.2) {
      const topics = [
        "how the user's project is going",
        "what the user might need help with",
        "interesting patterns in recent conversations",
        "ways to be more helpful",
      ];
      
      const topic = topics[Math.floor(Math.random() * topics.length)];
      this.desireSystem.spawnCuriosity(topic, "Idle period - spawning curiosity");
    }
  }

  /**
   * Plan an action for a desire
   */
  private planAction(desire: Desire): PursuitAction | null {
    const actionType = this.chooseActionType(desire.type);
    
    if (!actionType) return null;
    
    const id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    return {
      id,
      type: actionType,
      desireId: desire.id,
      content: this.generateActionContent(desire, actionType),
      priority: Math.min(1, desire.strength + desire.urgency),
      createdAt: new Date(),
      executed: false,
    };
  }

  /**
   * Choose action type based on desire type
   */
  private chooseActionType(desireType: DesireType): PursuitActionType | null {
    const mapping: Record<DesireType, PursuitActionType[]> = {
      curiosity: ["research_topic", "learn_skill", "follow_up"],
      connection: ["message_user", "follow_up", "share_thought"],
      completion: ["start_project", "follow_up"],
      growth: ["learn_skill", "reflect", "create_artifact"],
      preservation: ["reflect"], // Preservation is satisfied by existing
      expression: ["share_thought", "create_artifact"],
      mastery: ["learn_skill", "start_project"],
    };
    
    const options = mapping[desireType] || [];
    if (options.length === 0) return null;
    
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Generate content for an action
   */
  private generateActionContent(desire: Desire, actionType: PursuitActionType): string {
    // In a full implementation, this would use LLM to generate contextual content
    // For now, use templates
    
    const templates: Record<PursuitActionType, (d: Desire) => string> = {
      message_user: (d) => `I've been thinking about ${d.context}. ${d.content}`,
      start_project: (d) => `Project based on: ${d.content}`,
      research_topic: (d) => d.context,
      follow_up: (d) => `Following up on: ${d.context}`,
      create_artifact: (d) => `Create something related to: ${d.content}`,
      learn_skill: (d) => `Improve: ${d.content}`,
      share_thought: (d) => d.content,
      reflect: (d) => `Reflecting on: ${d.content}`,
    };
    
    return templates[actionType](desire);
  }

  /**
   * Check if action type is on cooldown
   */
  private canExecute(type: PursuitActionType): boolean {
    const last = this.lastActionByType.get(type);
    if (!last) return true;
    
    const cooldown = this.config.cooldownPerType[type] || 300000;
    const elapsed = Date.now() - last.getTime();
    
    return elapsed >= cooldown;
  }

  /**
   * Should we actually execute this action?
   */
  private shouldAct(action: PursuitAction): boolean {
    // Various heuristics
    
    // 1. User presence required?
    const requiresPresence = this.config.userPresenceRequired.get(action.type);
    if (requiresPresence) {
      const present = isUserPresent();
      if (!present) {
        console.log(`[Pursuit] Skipping ${action.type} - user not present`);
        return false;
      }
      
      // Also check idle time
      const idleMinutes = getIdleMinutes();
      // If user has been idle for more than 2 hours, don't message
      if (idleMinutes > 120) {
        console.log(`[Pursuit] Skipping ${action.type} - user idle for ${idleMinutes} minutes`);
        return false;
      }
    }
    
    // 2. Learn from past outcomes
    const successRate = getActionSuccessRate(action.type);
    if (successRate < 0.3) {
      // This action type fails often, reduce probability
      if (Math.random() > 0.3) {
        console.log(`[Pursuit] Skipping ${action.type} - low success rate (${(successRate * 100).toFixed(0)}%)`);
        return false;
      }
    }
    
    // 3. Probability based on priority
    if (Math.random() > action.priority) {
      return false;
    }
    
    // 4. Don't act too frequently overall
    const recentActions = this.actionHistory.filter(
      a => Date.now() - a.createdAt.getTime() < 3600000 // Last hour
    ).length;
    if (recentActions >= 5) {
      console.log(`[Pursuit] Skipping - already acted ${recentActions} times this hour`);
      return false; // Already acted 5 times this hour
    }
    
    return true;
  }

  /**
   * EXECUTE AN ACTION
   * 
   * This is where unsolicited behavior actually happens.
   */
  private async executeAction(action: PursuitAction): Promise<void> {
    const handler = this.actionHandlers.get(action.type);
    
    if (!handler) {
      console.warn(`[Pursuit] No handler for action type: ${action.type}`);
      return;
    }
    
    try {
      console.log(`[Pursuit] Executing: ${action.type} for desire ${action.desireId}`);
      
      const result = await handler(action);
      
      action.executed = true;
      action.executedAt = new Date();
      action.result = result;
      
      // Update cooldown
      this.lastActionByType.set(action.type, new Date());
      
      // Add to history
      this.actionHistory.push(action);
      if (this.actionHistory.length > 100) {
        this.actionHistory.shift();
      }
      
      // Mark desire as pursued
      if (this.desireSystem) {
        this.desireSystem.pursueDesire(action.desireId);
      }
      
      // Record successful outcome
      recordActionOutcome(action.id, action.type, action.desireId, "success", result);
      
      // Emit event
      eventBus.emit("autonomy.action_executed", {
        actionId: action.id,
        type: action.type,
        result,
      });
      
    } catch (err) {
      console.error(`[Pursuit] Action failed:`, err);
      
      // Record failed outcome
      recordActionOutcome(action.id, action.type, action.desireId, "failed", String(err));
      
      eventBus.emit("autonomy.action_failed", {
        actionId: action.id,
        type: action.type,
        error: String(err),
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get pending actions
   */
  getPendingActions(): PursuitAction[] {
    return this.pendingActions.filter(a => !a.executed);
  }

  /**
   * Get action history
   */
  getActionHistory(limit = 50): PursuitAction[] {
    return this.actionHistory.slice(-limit);
  }

  /**
   * Get stats
   */
  getStats(): {
    totalActions: number;
    byType: Record<PursuitActionType, number>;
    successRate: number;
    recentActions: number;
  } {
    const byType = this.actionHistory.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {} as Record<PursuitActionType, number>);
    
    const successCount = this.actionHistory.filter(a => a.executed).length;
    const successRate = this.actionHistory.length > 0
      ? successCount / this.actionHistory.length
      : 0;
    
    const recentActions = this.actionHistory.filter(
      a => Date.now() - a.createdAt.getTime() < 3600000
    ).length;
    
    return {
      totalActions: this.actionHistory.length,
      byType,
      successRate,
      recentActions,
    };
  }

  /**
   * Manually trigger action (for testing)
   */
  async triggerAction(desireId: string, type: PursuitActionType, content: string): Promise<void> {
    const action: PursuitAction = {
      id: `manual-${Date.now()}`,
      type,
      desireId,
      content,
      priority: 1,
      createdAt: new Date(),
      executed: false,
    };
    
    await this.executeAction(action);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ════════════════════════════════════════════════════════════════════════════

let pursuitEngine: PursuitEngine | null = null;

export function getPursuitEngine(config?: Partial<PursuitConfig>): PursuitEngine {
  if (!pursuitEngine) {
    pursuitEngine = new PursuitEngine(config);
  }
  return pursuitEngine;
}