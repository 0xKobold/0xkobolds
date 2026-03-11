/**
 * 🧠 Draconic Capability Router
 *
 * Superior to OpenClaw (which can't route):
 * - Analyzes tasks and routes to best agent
 * - Historical performance tracking
 * - Dynamic model selection
 * - Confidence scoring
 *
 * "Every task finds its perfect agent"
 */

import { EventEmitter } from "node:events";

// Agent type definitions
export type AgentType =
  | "coordinator"    // Task delegation, planning
  | "specialist"     // Focused implementation
  | "researcher"     // Exploration, analysis
  | "planner"        // Architecture, design
  | "reviewer"       // Code review, QA
  | "worker";        // General tasks

// Task characteristics
export interface TaskCharacteristics {
  complexity: "simple" | "medium" | "complex";
  domain: string[]; // coding, web, docs, data, security, etc.
  requiresResearch: boolean;
  requiresPlanning: boolean;
  requiresReview: boolean;
  estimatedDuration: number; // ms
  estimatedTokens: number;
}

// Capability match result
export interface CapabilityMatch {
  agentType: AgentType;
  confidence: number; // 0-1
  reason: string;
  subtasks: TaskBreakdown[];
  suggestedModel: string;
  estimatedDuration: number; // ms
  suggestedCapabilities: string[];
}

// Task breakdown
export interface TaskBreakdown {
  index: number;
  description: string;
  agentType: AgentType;
  estimatedTokens: number;
  dependencies: number[];
}

// Session history for context
export interface SessionHistory {
  tasks: Array<{
    task: string;
    agentType: AgentType;
    duration: number;
    success: boolean;
    tokenCount: number;
  }>;
  activeFiles: string[];
  techStack: string[];
  recentErrors: string[];
}

// Performance metrics per agent type
interface AgentPerformance {
  totalTasks: number;
  successfulTasks: number;
  averageDuration: number;
  averageTokens: number;
  averageQuality: number; // 0-10
  successRate: number;
  byDomain: Record<string, { tasks: number; successRate: number }>;
}

// Domain patterns for task analysis
interface DomainPattern {
  patterns: RegExp[];
  domain: string;
  weight: number;
}

/**
 * 🐉 Draconic Capability Router
 *
 * Superior to OpenClaw: Intelligent task routing
 */
export class DraconicCapabilityRouter extends EventEmitter {
  // Domain detection patterns
  private domainPatterns: DomainPattern[] = [
    {
      patterns: [/code|implement|refactor|fix|debug|write|function|class|method/i],
      domain: "coding",
      weight: 1.0,
    },
    {
      patterns: [/research|search|find|explore|analyze|investigate|look.*up/i],
      domain: "research",
      weight: 1.0,
    },
    {
      patterns: [/plan|design|architect|structure|organize/i],
      domain: "planning",
      weight: 1.0,
    },
    {
      patterns: [/review|check|validate|verify|audit/i],
      domain: "review",
      weight: 1.0,
    },
    {
      patterns: [/document|readme|comment|explain/i],
      domain: "documentation",
      weight: 0.8,
    },
    {
      patterns: [/test|spec|coverage|unit.*test/i],
      domain: "testing",
      weight: 0.9,
    },
    {
      patterns: [/web|http|fetch|api|endpoint|request/i],
      domain: "web",
      weight: 1.0,
    },
    {
      patterns: [/database|sql|query|migration|schema/i],
      domain: "database",
      weight: 1.0,
    },
    {
      patterns: [/security|auth|encrypt|vulnerability|safe/i],
      domain: "security",
      weight: 1.0,
    },
    {
      patterns: [/config|setting|environment|variable/i],
      domain: "configuration",
      weight: 0.7,
    },
  ];

  // Performance tracking
  private performanceMetrics = new Map<AgentType, AgentPerformance>();

  // Model selection preferences - Cloud Ollama Strategy
  // minimax-m2.5:cloud for worker, reviewer, specialist
  // kimi-k2.5:cloud for coordinator, researcher, planner
  private modelPreferences: Record<AgentType, string[]> = {
    coordinator: ["kimi-k2.5:cloud", "claude-3-opus", "gpt-4"],
    specialist: ["minimax-m2.5:cloud", "claude-3-sonnet", "gpt-4-turbo"],
    researcher: ["kimi-k2.5:cloud", "claude-3-sonnet", "gpt-4-turbo"],
    planner: ["kimi-k2.5:cloud", "claude-3-opus", "gpt-4"],
    reviewer: ["minimax-m2.5:cloud", "claude-3-sonnet", "gpt-4-turbo"],
    worker: ["minimax-m2.5:cloud", "claude-3-haiku", "gpt-3.5-turbo"],
  };

  // Task history
  private taskHistory: Array<{
    task: string;
    agentType: AgentType;
    domains: string[];
    duration: number;
    tokens: number;
    success: boolean;
    timestamp: number;
  }> = [];

  private static instance: DraconicCapabilityRouter | null = null;

  static getInstance(): DraconicCapabilityRouter {
    if (!DraconicCapabilityRouter.instance) {
      DraconicCapabilityRouter.instance = new DraconicCapabilityRouter();
    }
    return DraconicCapabilityRouter.instance;
  }

  constructor() {
    super();
    this.initializeMetrics();
  }

  /**
   * Analyze task and route to best agent
   * Superior to OpenClaw: Deep analysis + confidence
   */
  analyze(task: string, history?: SessionHistory): CapabilityMatch {
    // 1. Extract characteristics
    const characteristics = this.analyzeTask(task);

    // 2. Determine complexity
    const complexity = this.assessComplexity(task, characteristics);

    // 3. Route based on characteristics
    const routing = this.routeByCharacteristics(characteristics, complexity);

    // 4. Adjust based on history
    const adjustedRouting = this.adjustByHistory(routing, history);

    // 5. Generate breakdown
    const subtasks = this.generateSubtasks(task, adjustedRouting.agentType, complexity);

    // 6. Select model
    const suggestedModel = this.selectModel(adjustedRouting.agentType, characteristics);

    // Calculate confidence
    const confidence = this.calculateConfidence(
      adjustedRouting.agentType,
      characteristics,
      adjustedRouting.reason
    );

    // Estimate duration
    const estimatedDuration = this.estimateDuration(
      adjustedRouting.agentType,
      characteristics,
      complexity
    );

    // Get suggested capabilities
    const suggestedCapabilities = this.getCapabilitiesFor(adjustedRouting.agentType, characteristics);

    return {
      agentType: adjustedRouting.agentType,
      confidence,
      reason: adjustedRouting.reason,
      subtasks,
      suggestedModel,
      estimatedDuration,
      suggestedCapabilities,
    };
  }

  /**
   * Analyze task characteristics
   */
  private analyzeTask(task: string): TaskCharacteristics {
    const domains = new Map<string, number>();

    for (const pattern of this.domainPatterns) {
      let matches = 0;
      for (const regex of pattern.patterns) {
        const matchCount = (task.match(regex) || []).length;
        matches += matchCount;
      }
      if (matches > 0) {
        domains.set(pattern.domain, (domains.get(pattern.domain) || 0) + matches * pattern.weight);
      }
    }

    // Sort by score
    const sortedDomains = Array.from(domains.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([d]) => d);

    const requiresResearch = sortedDomains.includes("research");
    const requiresPlanning = sortedDomains.includes("planning");
    const requiresReview = sortedDomains.includes("review");

    // Estimate complexity
    const wordCount = task.split(/\s+/).length;
    const codeCount = (task.match(/```/g) || []).length;

    let complexity: TaskCharacteristics["complexity"];
    if (wordCount > 100 || requiresPlanning) complexity = "complex";
    else if (wordCount > 30 || requiresResearch) complexity = "medium";
    else complexity = "simple";

    // Estimate tokens (rough)
    const estimatedTokens = wordCount * 2 + codeCount * 50;

    return {
      complexity,
      domain: sortedDomains.slice(0, 3), // Top 3 domains
      requiresResearch,
      requiresPlanning,
      requiresReview,
      estimatedDuration: 0, // Will be calculated
      estimatedTokens,
    };
  }

  /**
   * Assess task complexity
   */
  private assessComplexity(task: string, characteristics: TaskCharacteristics): TaskCharacteristics["complexity"] {
    // Additional complexity heuristics
    let score = 0;

    // Multiple domains = more complex
    score += characteristics.domain.length * 10;

    // Research requirement
    if (characteristics.requiresResearch) score += 20;
    if (characteristics.requiresPlanning) score += 30;

    // Keywords indicating complexity
    const complexKeywords = [
      /refactor|restructure|redesign/i,
      /architecture|system|framework/i,
      /optimize|performance|scal/i,
      /security|auth|encrypt/i,
      /database|schema|migration/i,
    ];

    for (const kw of complexKeywords) {
      if (kw.test(task)) score += 15;
    }

    // Simple keywords reduce complexity
    const simpleKeywords = [/simple|easy|quick|small/i];
    for (const kw of simpleKeywords) {
      if (kw.test(task)) score -= 10;
    }

    if (score >= 50) return "complex";
    if (score >= 20) return "medium";
    return "simple";
  }

  /**
   * Route based on characteristics
   */
  private routeByCharacteristics(
    characteristics: TaskCharacteristics,
    complexity: TaskCharacteristics["complexity"]
  ): { agentType: AgentType; reason: string } {
    // Domain-based routing logic
    const domains = characteristics.domain;

    // Coordination needed
    if (complexity === "complex" && domains.length > 2) {
      return {
        agentType: "coordinator",
        reason: `Complex multi-domain task (${domains.join(", ")}) requires coordination`,
      };
    }

    // Planning focus
    if (characteristics.requiresPlanning || domains.includes("planning")) {
      return {
        agentType: "planner",
        reason: "Task requires architecture/design planning",
      };
    }

    // Review focus
    if (characteristics.requiresReview || domains.includes("review")) {
      return {
        agentType: "reviewer",
        reason: "Task is primarily review/validation",
      };
    }

    // Research focus
    if (characteristics.requiresResearch || domains.includes("research")) {
      return {
        agentType: "researcher",
        reason: "Task requires exploration and analysis",
      };
    }

    // Coding focus
    if (domains.includes("coding")) {
      // Complex coding = specialist
      if (complexity === "complex") {
        return {
          agentType: "specialist",
          reason: "Complex coding task requires focused implementation",
        };
      }
      // Simple coding = worker
      return {
        agentType: "worker",
        reason: "Straightforward coding task",
      };
    }

    // Default
    if (complexity === "simple") {
      return {
        agentType: "worker",
        reason: "Simple task, general worker suitable",
      };
    }

    return {
      agentType: "specialist",
      reason: "Medium complexity task requiring focused attention",
    };
  }

  /**
   * Adjust routing based on history
   */
  private adjustByHistory(
    routing: { agentType: AgentType; reason: string },
    history?: SessionHistory
  ): { agentType: AgentType; reason: string } {
    if (!history || history.tasks.length === 0) {
      return routing;
    }

    // Check recent performance of this agent type
    const recentTasks = history.tasks.slice(-10);
    const agentTasks = recentTasks.filter((t) => t.agentType === routing.agentType);

    if (agentTasks.length >= 3) {
      const successRate = agentTasks.filter((t) => t.success).length / agentTasks.length;

      if (successRate < 0.5) {
        // Low success rate, try alternative
        const alternatives: AgentType[] = ["coordinator", "specialist", "worker"];
        const alternative = alternatives.find((a) => a !== routing.agentType);
        if (alternative) {
          return {
            agentType: alternative,
            reason: `${routing.agentType} had low success rate (${(successRate * 100).toFixed(0)}%), trying ${alternative}`,
          };
        }
      }
    }

    return routing;
  }

  /**
   * Generate subtask breakdown
   */
  private generateSubtasks(
    task: string,
    agentType: AgentType,
    complexity: TaskCharacteristics["complexity"]
  ): TaskBreakdown[] {
    const subtasks: TaskBreakdown[] = [];
    let index = 0;

    switch (agentType) {
      case "coordinator":
        subtasks.push({
          index: index++,
          description: "Analyze task requirements",
          agentType: "researcher",
          estimatedTokens: 2000,
          dependencies: [],
        });
        subtasks.push({
          index: index++,
          description: "Plan implementation approach",
          agentType: "planner",
          estimatedTokens: 3000,
          dependencies: [0],
        });
        subtasks.push({
          index: index++,
          description: "Implement solution",
          agentType: "specialist",
          estimatedTokens: 5000,
          dependencies: [1],
        });
        subtasks.push({
          index: index++,
          description: "Review implementation",
          agentType: "reviewer",
          estimatedTokens: 2000,
          dependencies: [2],
        });
        break;

      case "planner":
        subtasks.push({
          index: index++,
          description: "Research existing code patterns",
          agentType: "researcher",
          estimatedTokens: 2000,
          dependencies: [],
        });
        subtasks.push({
          index: index++,
          description: "Design architecture",
          agentType: "planner",
          estimatedTokens: 4000,
          dependencies: [0],
        });
        break;

      default:
        // Single task for specialized agents
        subtasks.push({
          index: 0,
          description: task.slice(0, 100),
          agentType,
          estimatedTokens: complexity === "complex" ? 5000 : complexity === "medium" ? 3000 : 1500,
          dependencies: [],
        });
    }

    return subtasks;
  }

  /**
   * Select best available model
   */
  private selectModel(agentType: AgentType, characteristics: TaskCharacteristics): string {
    const preferences = this.modelPreferences[agentType];

    // For simple tasks, downgrade
    if (characteristics.complexity === "simple" && preferences.length > 1) {
      return preferences[preferences.length - 1]; // Cheapest/fastest
    }

    // For complex tasks, upgrade
    if (characteristics.complexity === "complex") {
      return preferences[0]; // Best model
    }

    return preferences[Math.floor(preferences.length / 2)]; // Middle option
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    agentType: AgentType,
    characteristics: TaskCharacteristics,
    reason: string
  ): number {
    let confidence = 0.8; // Base

    // Domain clarity increases confidence
    if (characteristics.domain.length === 1) confidence += 0.1;
    if (characteristics.domain.length > 3) confidence -= 0.1;

    // Known type increases confidence
    const knownTypes: AgentType[] = ["coordinator", "specialist", "researcher", "planner", "reviewer", "worker"];
    if (knownTypes.includes(agentType)) confidence += 0.05;

    // Complexity alignment
    if (characteristics.complexity === "simple" && agentType === "worker") confidence += 0.05;
    if (characteristics.complexity === "complex" && agentType === "coordinator") confidence += 0.05;

    return Math.min(0.95, confidence);
  }

  /**
   * Estimate duration based on characteristics
   */
  private estimateDuration(
    agentType: AgentType,
    characteristics: TaskCharacteristics,
    complexity: TaskCharacteristics["complexity"]
  ): number {
    const baseDuration = {
      simple: 15000,
      medium: 45000,
      complex: 120000,
    }[complexity];

    const agentMultiplier = {
      coordinator: 1.5, // Coordination overhead
      planner: 1.3,
      researcher: 1.2,
      specialist: 1.0,
      reviewer: 0.8,
      worker: 0.9,
    }[agentType];

    return baseDuration * agentMultiplier;
  }

  /**
   * Get suggested capabilities
   */
  private getCapabilitiesFor(
    agentType: AgentType,
    characteristics: TaskCharacteristics
  ): string[] {
    const baseCapabilities: Record<AgentType, string[]> = {
      coordinator: ["task-delegation", "planning", "coordination"],
      specialist: ["coding", "refactoring", "debugging", "implementation"],
      researcher: ["research", "analysis", "documentation", "search"],
      planner: ["planning", "architecture-design", "task-breakdown"],
      reviewer: ["code-review", "quality-assurance", "security-review"],
      worker: ["file-ops", "shell", "general"],
    };

    const capabilities = [...baseCapabilities[agentType]];

    // Add domain-specific capabilities
    for (const domain of characteristics.domain) {
      capabilities.push(domain);
    }

    return [...new Set(capabilities)];
  }

  /**
   * Record outcome for learning
   */
  recordOutcome(
    task: string,
    agentType: AgentType,
    domains: string[],
    duration: number,
    tokens: number,
    success: boolean
  ): void {
    this.taskHistory.push({
      task,
      agentType,
      domains,
      duration,
      tokens,
      success,
      timestamp: Date.now(),
    });

    // Keep only last 1000
    if (this.taskHistory.length > 1000) {
      this.taskHistory = this.taskHistory.slice(-1000);
    }

    // Update metrics
    this.updateMetrics(agentType, success, duration, tokens, domains);

    this.emit("outcome.recorded", { agentType, success, duration });
  }

  /**
   * Update agent performance metrics
   */
  private updateMetrics(
    agentType: AgentType,
    success: boolean,
    duration: number,
    tokens: number,
    domains: string[]
  ): void {
    const metrics = this.performanceMetrics.get(agentType) ?? this.createEmptyMetrics();

    metrics.totalTasks++;
    if (success) metrics.successfulTasks++;

    // Update averages
    metrics.averageDuration = this.ewma(metrics.averageDuration, duration);
    metrics.averageTokens = this.ewma(metrics.averageTokens, tokens);
    metrics.successRate = metrics.successfulTasks / metrics.totalTasks;

    // Update domain stats
    for (const domain of domains) {
      if (!metrics.byDomain[domain]) {
        metrics.byDomain[domain] = { tasks: 0, successRate: 0 };
      }
      const domainStats = metrics.byDomain[domain];
      domainStats.tasks++;
      const prevSuccesses = domainStats.successRate * (domainStats.tasks - 1);
      domainStats.successRate = (prevSuccesses + (success ? 1 : 0)) / domainStats.tasks;
    }

    this.performanceMetrics.set(agentType, metrics);
  }

  /**
   * Exponential weighted moving average
   */
  private ewma(current: number, value: number, alpha = 0.3): number {
    if (current === 0) return value;
    return alpha * value + (1 - alpha) * current;
  }

  /**
   * Get agent performance
   */
  getPerformance(agentType: AgentType): AgentPerformance | undefined {
    return this.performanceMetrics.get(agentType);
  }

  /**
   * Get all performance metrics
   */
  getAllPerformance(): Map<AgentType, AgentPerformance> {
    return new Map(this.performanceMetrics);
  }

  /**
   * Get recommendations based on history
   */
  getRecommendations(): Array<{
    observation: string;
    recommendation: string;
    confidence: number;
  }> {
    const recommendations = [];

    for (const [agentType, metrics] of this.performanceMetrics) {
      if (metrics.totalTasks >= 5) {
        if (metrics.successRate < 0.5) {
          recommendations.push({
            observation: `${agentType} has low success rate`,
            recommendation: `Consider using alternative agent types for ${agentType} tasks`,
            confidence: metrics.totalTasks / 20,
          });
        }

        if (metrics.averageDuration > 60000) {
          recommendations.push({
            observation: `${agentType} tasks are slow`,
            recommendation: `Consider breaking ${agentType} tasks into smaller subtasks`,
            confidence: 0.7,
          });
        }
      }
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Initialize empty metrics
   */
  private initializeMetrics(): void {
    const types: AgentType[] = ["coordinator", "specialist", "researcher", "planner", "reviewer", "worker"];
    for (const type of types) {
      this.performanceMetrics.set(type, this.createEmptyMetrics());
    }
  }

  private createEmptyMetrics(): AgentPerformance {
    return {
      totalTasks: 0,
      successfulTasks: 0,
      averageDuration: 0,
      averageTokens: 0,
      averageQuality: 0,
      successRate: 0,
      byDomain: {},
    };
  }
}

// Export singleton
export const getDraconicCapabilityRouter = DraconicCapabilityRouter.getInstance;

// Convenience function
export function analyzeTask(task: string, history?: SessionHistory): CapabilityMatch {
  return getDraconicCapabilityRouter().analyze(task, history);
}

// Types already exported at top of file
