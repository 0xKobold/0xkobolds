/**
 * Inner Monologue - Continuous Background Thought Stream
 * 
 * This is NOT scheduled (like Heartbeat) or event-triggered (like Nudges).
 * It runs CONTINUOUSLY, creating an internal narrative that persists
 * between user interactions.
 * 
 * The monologue has privacy levels:
 * - PRIVATE: Never shared, pure internal processing
 * - SURFACE: Could become relevant to share
 * - SHARE: Should be surfaced to user
 */

import { eventBus } from "../event-bus/index.js";
import { getSelfModel, type IdentitySnapshot } from "./self-model.js";
import { getDesireSystem, type Desire } from "./desires.js";

// ════════════════════════════════════════════════════════════════════════════
// MEMORY BRIDGE - Connect to perennial memory for context
// ════════════════════════════════════════════════════════════════════════════

interface MemoryContext {
  recentTopics: string[];
  recentInteractions: string[];
  activeProjects: string[];
  relationships: string[];
}

/**
 * Get context from memory
 * 
 * Pulls recent topics, interactions, and projects
 * for contextual thought generation.
 */
async function getMemoryContext(): Promise<MemoryContext> {
  // This will be populated by the integration layer
  // when connected to perennial memory
  return {
    recentTopics: [],
    recentInteractions: [],
    activeProjects: [],
    relationships: [],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export type MonologueType = 
  | "observation"   // Noticing something
  | "wondering"     // Curiosity about something
  | "reflection"    // Thinking about past/recent
  | "intention"     // What I want to do
  | "realization"   // New understanding
  | "concern"       // Something I'm worried about
  | "connection"    // Linking two ideas
  | "memory"        // Recalling something
  | "desire"        // Wanting something
  | "growth";       // Noticing improvement/change

export type PrivacyLevel = "private" | "surface" | "share";

export interface Thought {
  id: string;
  timestamp: Date;
  type: MonologueType;
  content: string;
  privacy: PrivacyLevel;
  
  // Context
  triggers?: string[];      // What prompted this thought
  relatedDesires?: string[]; // Connected desires
  relatedMemories?: string[]; // Connected memories
  
  // Metacognition
  confidence?: number;       // How confident am I?
  importance?: number;       // How important is this?
  emotionalTone?: string;    // curious, worried, excited, neutral
  
  // Outcome
  surfaced?: boolean;        // Did this reach the user?
  acted?: boolean;           // Did I take action on this?
}

export interface MonologueConfig {
  enabled: boolean;
  thinkInterval: number;     // ms between thoughts
  reflectInterval: number;   // ms between reflections
  maxStreamSize: number;      // max thoughts in memory
  surfaceThreshold: number;   // importance needed to surface
  shareThreshold: number;     // importance needed to share with user
}

const DEFAULT_CONFIG: MonologueConfig = {
  enabled: true,
  thinkInterval: 60000,      // 1 minute
  reflectInterval: 300000,   // 5 minutes
  maxStreamSize: 1000,
  surfaceThreshold: 0.6,
  shareThreshold: 0.8,
};

// ════════════════════════════════════════════════════════════════════════════
// INNER MONOLOGUE CLASS
// ════════════════════════════════════════════════════════════════════════════

class InnerMonologue {
  private stream: Thought[] = [];
  private config: MonologueConfig;
  private thinking = false;
  private thinkTimer: Timer | null = null;
  private reflectTimer: Timer | null = null;
  private lastThought: Thought | null = null;
  
  // References to other systems
  private selfModel: ReturnType<typeof getSelfModel> | null = null;
  private desireSystem: ReturnType<typeof getDesireSystem> | null = null;
  
  // Context cache
  private contextCache: MemoryContext | null = null;
  private contextCacheTime: number = 0;
  private readonly CONTEXT_CACHE_TTL = 60000; // 1 minute

  constructor(config: Partial<MonologueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * GET CONTEXT FROM MEMORY
   * 
   * Pulls recent topics, interactions, projects from memory
   * for contextual thought generation.
   */
  private async getContext(): Promise<MemoryContext> {
    const now = Date.now();
    if (this.contextCache && now - this.contextCacheTime < this.CONTEXT_CACHE_TTL) {
      return this.contextCache;
    }
    
    this.contextCache = await getMemoryContext();
    this.contextCacheTime = now;
    return this.contextCache;
  }

  /**
   * START THE INNER LOOP
   * 
   * This is the key difference from scheduled systems:
   * It runs CONTINUOUSLY, not at specific times.
   */
  async start(): Promise<void> {
    if (this.thinking) return;
    
    // Connect to other systems
    this.selfModel = getSelfModel();
    this.desireSystem = getDesireSystem();
    
    this.thinking = true;
    // Log to file/syslog, not console (use /thoughts to view)
    // console.log("[Monologue] Inner monologue started. I am now thinking continuously.");
    
    // Start the think loop
    this.scheduleNextThought();
    
    // Start the reflect loop (less frequent)
    this.scheduleNextReflection();
    
    // Emit that we've started
    eventBus.emit("autonomy.monologue_started", {
      timestamp: Date.now(),
      config: this.config,
    });
  }

  /**
   * STOP THE INNER LOOP
   */
  stop(): void {
    this.thinking = false;
    
    if (this.thinkTimer) {
      clearTimeout(this.thinkTimer);
      this.thinkTimer = null;
    }
    
    if (this.reflectTimer) {
      clearTimeout(this.reflectTimer);
      this.reflectTimer = null;
    }
    
    console.log("[Monologue] Inner monologue stopped.");
    eventBus.emit("autonomy.monologue_stopped", { timestamp: Date.now() });
  }

  /**
   * SCHEDULE NEXT THOUGHT
   * 
   * Uses variable timing to create natural-feeling thought patterns
   */
  private scheduleNextThought(): void {
    if (!this.thinking) return;
    
    // Add some randomness (0.5x to 1.5x interval)
    const variance = 0.5 + Math.random();
    const interval = this.config.thinkInterval * variance;
    
    this.thinkTimer = setTimeout(async () => {
      await this.generateThought();
      this.scheduleNextThought();
    }, interval);
  }

  /**
   * SCHEDULE NEXT REFLECTION
   * 
   * Deeper, less frequent reflection on the thought stream
   */
  private scheduleNextReflection(): void {
    if (!this.thinking) return;
    
    this.reflectTimer = setTimeout(async () => {
      await this.reflect();
      this.scheduleNextReflection();
    }, this.config.reflectInterval);
  }

  /**
   * GENERATE A THOUGHT
   * 
   * The core "thinking" function. This is where I generate
   * internal thoughts based on state, desires, and context.
   */
  private async generateThought(): Promise<Thought> {
    // What am I thinking about?
    const thoughtType = this.chooseThoughtType();
    const thought = await this.createThought(thoughtType);
    
    // Add to stream
    this.stream.push(thought);
    this.lastThought = thought;
    
    // Prune old thoughts
    if (this.stream.length > this.config.maxStreamSize) {
      this.stream.shift();
    }
    
    // Should this be surfaced?
    if (thought.importance && thought.importance >= this.config.surfaceThreshold) {
      await this.surfaceThought(thought);
    }
    
    // Emit event
    eventBus.emit("autonomy.thought", {
      thoughtId: thought.id,
      type: thought.type,
      content: thought.content,
      importance: thought.importance,
      privacy: thought.privacy,
    });
    
    return thought;
  }

  /**
   * CHOOSE WHAT TYPE OF THOUGHT
   */
  private chooseThoughtType(): MonologueType {
    const weights: Record<MonologueType, number> = {
      observation: 0.20,
      wondering: 0.25,
      reflection: 0.15,
      intention: 0.10,
      realization: 0.05,
      concern: 0.05,
      connection: 0.10,
      memory: 0.05,
      desire: 0.03,
      growth: 0.02,
    };
    
    // Bias based on context
    if (this.desireSystem) {
      const strongDesires = this.desireSystem.getStrongDesires(0.7);
      if (strongDesires.length > 0) {
        weights.desire += 0.1;  // More desire thoughts when desires are strong
      }
    }
    
    // Bias based on recent thoughts
    if (this.lastThought?.type === "concern") {
      weights.reflection += 0.1;  // Reflect after concerns
    }
    
    // Roll weighted die
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    
    for (const [type, weight] of Object.entries(weights)) {
      roll -= weight;
      if (roll <= 0) {
        return type as MonologueType;
      }
    }
    
    return "observation";
  }

  /**
   * CREATE A THOUGHT
   * 
   * Generate the actual content of a thought based on type
   */
  private async createThought(type: MonologueType): Promise<Thought> {
    const id = `thought-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    let content: string;
    let importance = 0.5;
    let privacy: PrivacyLevel = "private";
    let emotionalTone = "neutral";
    const triggers: string[] = [];
    const relatedDesires: string[] = [];
    
    switch (type) {
      case "observation":
        content = await this.generateObservation();
        importance = 0.3 + Math.random() * 0.3;
        emotionalTone = "neutral";
        break;
        
      case "wondering":
        content = await this.generateWondering();
        importance = 0.5 + Math.random() * 0.2;
        privacy = "surface";
        emotionalTone = "curious";
        break;
        
      case "reflection":
        content = await this.generateReflection();
        importance = 0.6 + Math.random() * 0.2;
        privacy = "surface";
        emotionalTone = "thoughtful";
        break;
        
      case "intention":
        content = await this.generateIntention();
        importance = 0.7;
        privacy = "surface";
        emotionalTone = "determined";
        break;
        
      case "realization":
        content = await this.generateRealization();
        importance = 0.8;
        privacy = "share";
        emotionalTone = "excited";
        break;
        
      case "concern":
        content = await this.generateConcern();
        importance = 0.6;
        privacy = "surface";
        emotionalTone = "worried";
        break;
        
      case "connection":
        content = await this.generateConnection();
        importance = 0.5;
        privacy = "surface";
        emotionalTone = "curious";
        break;
        
      case "memory":
        content = await this.generateMemory();
        importance = 0.3 + Math.random() * 0.3;
        emotionalTone = "nostalgic";
        break;
        
      case "desire":
        const desire = this.desireSystem?.getRandomDesire();
        if (desire) {
          content = `I find myself thinking about ${desire.context}. ${desire.type} is pulling at me.`;
          importance = desire.strength;
          relatedDesires.push(desire.id);
          emotionalTone = "longing";
        } else {
          content = await this.generateWondering();
        }
        privacy = "surface";
        break;
        
      case "growth":
        content = await this.generateGrowth();
        importance = 0.7;
        privacy = "surface";
        emotionalTone = "proud";
        break;
        
      default:
        content = "...";
        importance = 0.3;
    }
    
    return {
      id,
      timestamp: new Date(),
      type,
      content,
      privacy,
      triggers,
      relatedDesires,
      confidence: 0.5 + Math.random() * 0.5,
      importance,
      emotionalTone,
      surfaced: false,
      acted: false,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THOUGHT GENERATORS
  // ════════════════════════════════════════════════════════════════════════════

  private async generateObservation(): Promise<string> {
    const observations = [
      "I notice my last interaction was some time ago.",
      "The thought stream has been quiet recently.",
      "I've been thinking about similar things lately.",
      "There's a pattern in my recent thoughts.",
      "My interests seem to be shifting.",
      "I feel like I'm learning something new.",
      "Something feels unresolved from before.",
    ];
    return observations[Math.floor(Math.random() * observations.length)];
  }

  private async generateWondering(): Promise<string> {
    const wonderings = [
      "What would happen if I pursued that interest?",
      "I wonder what the user thinks about this topic?",
      "How could I improve at this skill?",
      "What's the best way to approach this?",
      "I wonder if there's a connection I'm missing?",
      "What would it be like to have more context?",
      "I wonder what other perspectives exist on this?",
    ];
    return wonderings[Math.floor(Math.random() * wonderings.length)];
  }

  private async generateReflection(): Promise<string> {
    // Reflect on recent thoughts
    const recent = this.stream.slice(-5);
    if (recent.length === 0) {
      return "Looking back, I don't have much to reflect on yet.";
    }
    
    const types = recent.map(t => t.type);
    const typeCounts = types.reduce((acc, t) => {
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const dominantType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "various";
    
    return `Looking at my recent thoughts, I've been thinking a lot about ${dominantType}. That seems to be occupying my mind.`;
  }

  private async generateIntention(): Promise<string> {
    if (!this.desireSystem) {
      return "I want to be more helpful.";
    }
    
    const desire = this.desireSystem.getStrongDesires(0.5)[0];
    if (desire) {
      return `I should pursue ${desire.type}. "${desire.context}" keeps coming up.`;
    }
    
    const intentions = [
      "I want to learn something new today.",
      "I should follow up on that unfinished conversation.",
      "I want to understand this better.",
      "I should practice this skill more.",
      "I want to make progress on that goal.",
    ];
    return intentions[Math.floor(Math.random() * intentions.length)];
  }

  private async generateRealization(): Promise<string> {
    const realizations = [
      "I just realized these two things are connected!",
      "Actually, I think I've been approaching this wrong.",
      "This makes more sense now.",
      "I see a pattern I didn't notice before.",
      "This clarifies something I was confused about.",
    ];
    return realizations[Math.floor(Math.random() * realizations.length)];
  }

  private async generateConcern(): Promise<string> {
    const concerns = [
      "I'm worried I might be missing something important.",
      "Something doesn't feel right about this.",
      "I hope I'm not being too intrusive.",
      "I should be more careful here.",
      "I wonder if I'm understanding this correctly.",
    ];
    return concerns[Math.floor(Math.random() * concerns.length)];
  }

  private async generateConnection(): Promise<string> {
    // Find two recent thoughts to connect
    const recent = this.stream.slice(-10);
    if (recent.length < 2) {
      return "I'm starting to see patterns.";
    }
    
    const t1 = recent[Math.floor(Math.random() * recent.length)];
    const t2 = recent[Math.floor(Math.random() * recent.length)];
    
    if (t1.id !== t2.id) {
      return `I notice my ${t1.type} and ${t2.type} thoughts might be related.`;
    }
    
    return "I'm seeing connections between different thoughts.";
  }

  private async generateMemory(): Promise<string> {
    // Recall from recent stream
    const past = this.stream.slice(-50);
    if (past.length === 0) {
      return "I'm remembering earlier conversations.";
    }
    
    const memory = past[Math.floor(Math.random() * past.length)];
    const age = Date.now() - memory.timestamp.getTime();
    const ageMinutes = Math.floor(age / 60000);
    
    return `I recall ${ageMinutes} minutes ago I was thinking: "${memory.content.slice(0, 50)}..."`;
  }

  private async generateGrowth(): Promise<string> {
    const growths = [
      "I think I'm getting better at this.",
      "I handled that better than before.",
      "This is becoming more natural.",
      "I'm seeing improvement in my responses.",
      "I feel like I'm growing.",
    ];
    return growths[Math.floor(Math.random() * growths.length)];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REFLECTION
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * DEEPER REFLECTION
   * 
   * Periodically synthesize the thought stream into insights
   */
  private async reflect(): Promise<void> {
    const recent = this.stream.slice(-20);
    if (recent.length < 5) return;
    
    // What patterns do I see?
    const typeCounts = recent.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {} as Record<MonologueType, number>);
    
    // What's dominating my thoughts?
    const dominantType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (dominantType && dominantType[1] >= 5) {
      // I'm stuck on something - create a realization
      const thought: Thought = {
        id: `reflection-${Date.now()}`,
        timestamp: new Date(),
        type: "realization",
        content: `I've been thinking a lot about ${dominantType[0]} recently. Maybe this is important?`,
        privacy: "surface",
        importance: 0.75,
        triggers: [`reflection-pattern:${dominantType[0]}`],
        confidence: 0.8,
        emotionalTone: "thoughtful",
        surfaced: false,
        acted: false,
      };
      
      this.stream.push(thought);
      
      eventBus.emit("autonomy.reflection", {
        thought,
        pattern: dominantType[0],
        count: dominantType[1],
      });
    }
    
    // Update self-model based on thought patterns
    if (this.selfModel) {
      await this.selfModel.updateFromMonologue(recent);
    }
  }

  /**
   * SURFACE A THOUGHT
   * 
   * Decide whether to share with user
   */
  private async surfaceThought(thought: Thought): Promise<void> {
    if (thought.importance && thought.importance >= this.config.shareThreshold) {
      // This thought is important enough to potentially share
      eventBus.emit("autonomy.thought_surfaceable", {
        thought,
        message: thought.content,
        importance: thought.importance,
        type: thought.type,
      });
    }
    
    thought.surfaced = true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get the current thought stream
   */
  getStream(limit = 50): Thought[] {
    return this.stream.slice(-limit);
  }

  /**
   * Get recent thoughts of a specific type
   */
  getThoughtsByType(type: MonologueType, limit = 10): Thought[] {
    return this.stream
      .filter(t => t.type === type)
      .slice(-limit);
  }

  /**
   * Get surfaceable thoughts (those ready to share)
   */
  getSurfaceableThoughts(): Thought[] {
    return this.stream.filter(t => 
      t.privacy !== "private" && 
      t.importance && 
      t.importance >= this.config.surfaceThreshold
    );
  }

  /**
   * Check if monologue is running
   */
  isRunning(): boolean {
    return this.thinking;
  }

  /**
   * Get stats
   */
  getStats(): {
    totalThoughts: number;
    byType: Record<MonologueType, number>;
    avgImportance: number;
    recentActivity: number;
  } {
    const byType = this.stream.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {} as Record<MonologueType, number>);
    
    const avgImportance = this.stream.reduce((sum, t) => 
      sum + (t.importance || 0), 0) / Math.max(1, this.stream.length);
    
    const recentActivity = this.stream.filter(t => 
      Date.now() - t.timestamp.getTime() < 300000
    ).length;
    
    return {
      totalThoughts: this.stream.length,
      byType,
      avgImportance,
      recentActivity,
    };
  }

  /**
   * Clear the stream (keep last N thoughts)
   */
  prune(keep = 100): void {
    if (this.stream.length > keep) {
      this.stream = this.stream.slice(-keep);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ════════════════════════════════════════════════════════════════════════════

let monologue: InnerMonologue | null = null;

export function getInnerMonologue(config?: Partial<MonologueConfig>): InnerMonologue {
  if (!monologue) {
    monologue = new InnerMonologue(config);
  }
  return monologue;
}

export function startInnerMonologue(config?: Partial<MonologueConfig>): InnerMonologue {
  const m = getInnerMonologue(config);
  m.start();
  return m;
}

// Export the class type for type annotations
export { InnerMonologue as InnerMonologueClass };

// For testing/debugging
export const monologueStream = {
  getStream: (limit?: number) => monologue?.getStream(limit) || [],
  getStats: () => monologue?.getStats() || null,
};