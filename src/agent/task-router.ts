/**
 * Task Router - v0.2.0
 * 
 * Routes tasks to appropriate agent types based on task content.
 * Part of the Unified Agent Orchestration system.
 */

import { getAgentTypesForTask, AgentType, AGENT_TYPES } from "./types/index.js";

export interface TaskRequest {
  task: string;
  context?: string;
  priority?: "low" | "normal" | "high";
  constraints?: string[];
  expectedOutput?: string;
  maxTime?: number; // minutes
}

export interface TaskRouterResult {
  recommendedAgent: AgentType;
  confidence: number;
  reasoning: string;
  alternativeAgents: AgentType[];
  estimatedComplexity: "simple" | "medium" | "complex";
  suggestions?: string[];
}

/**
 * Analyze task and route to appropriate agent
 */
export function routeTask(request: TaskRequest): TaskRouterResult {
  const task = request.task.toLowerCase();
  const context = (request.context || "").toLowerCase();
  
  // Keywords for each agent type
  const keywords = {
    coordinator: ["plan", "coordinate", "organize", "delegate", "manage", "break down", "multiple"],
    researcher: ["research", "find", "search", "investigate", "lookup", "document", "learn about"],
    reviewer: ["review", "check", "validate", "audit", "inspect", "quality", "verify"],
    specialist: ["optimize", "refactor", "architecture", "design", "expert", "complex", "advanced"],
    worker: ["implement", "code", "write", "create", "build", "fix", "test", "update"]
  };

  // Score each agent type
  const scores: Record<string, number> = {
    coordinator: 0,
    researcher: 0,
    reviewer: 0,
    specialist: 0,
    worker: 0
  };

  // Check keywords
  for (const [agentType, words] of Object.entries(keywords)) {
    for (const word of words) {
      if (task.includes(word) || context.includes(word)) {
        scores[agentType] += 1;
      }
    }
  }

  // Special patterns
  if (/\b(design|architect|optimize|performance|security)\b/.test(task + context)) {
    scores.specialist += 2;
  }
  if (/\b(bug|fix|implement|create|write)\b/.test(task + context)) {
    scores.worker += 2;
  }
  if (/\b(review|check|validate|audit)\b/.test(task + context)) {
    scores.reviewer += 2;
  }
  if (/\b(research|find|document|search)\b/.test(task + context)) {
    scores.researcher += 2;
  }
  if (/\b(plan|coordinate|multiple|team|organize)\b/.test(task + context)) {
    scores.coordinator += 2;
  }

  // Find best match
  let bestAgent = "worker"; // default
  let bestScore = -1;
  
  for (const [agent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  // Calculate confidence
  const confidence = Math.min(0.95, 0.5 + bestScore * 0.15);

  // Get alternatives
  const alternatives = Object.entries(scores)
    .filter(([agent, score]) => agent !== bestAgent && score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([agent]) => AGENT_TYPES[agent]);

  // Estimate complexity
  let complexity: "simple" | "medium" | "complex" = "medium";
  if (/\b(plan|architecture|design|multiple|coordinate)\b/i.test(task)) {
    complexity = "complex";
  } else if (/\b(simple|quick|minor|small)\b/i.test(task)) {
    complexity = "simple";
  }

  // Build reasoning
  const reasoning = buildReasoning(bestAgent, request, scores);

  return {
    recommendedAgent: AGENT_TYPES[bestAgent],
    confidence,
    reasoning,
    alternativeAgents: alternatives,
    estimatedComplexity: complexity,
    suggestions: generateSuggestions(request, bestAgent)
  };
}

/**
 * Build human-readable reasoning
 */
function buildReasoning(agentType: string, request: TaskRequest, scores: Record<string, number>): string {
  const task = request.task;
  
  switch (agentType) {
    case "coordinator":
      return `Task "${task}" appears to require planning and coordination. It mentions aspects that suggest multiple subtasks or need for delegation.`;
    case "researcher":
      return `Task "${task}" is primarily about information gathering. A Researcher is best suited to find and synthesize this information.`;
    case "reviewer":
      return `Task "${task}" involves validation and quality assurance. A Reviewer will ensure standards are met.`;
    case "specialist":
      return `Task "${task}" requires deep domain expertise. A Specialist ${AGENT_TYPES.specialist.emoji} has the knowledge needed.`;
    case "worker":
    default:
      return `Task "${task}" is an implementation task best handled by a Worker agent. All scores: ${JSON.stringify(scores)}`;
  }
}

/**
 * Generate helpful suggestions
 */
function generateSuggestions(request: TaskRequest, agentType: string): string[] {
  const suggestions: string[] = [];
  
  if (agentType === "coordinator") {
    suggestions.push("Consider breaking this into clearly defined subtasks");
    suggestions.push("Identify dependencies between subtasks");
  }
  
  if (agentType === "worker") {
    const complexity = /\b(complex|multiple|architecture)\b/i.test(request.task) ? "high" : "low";
    if (complexity === "high") {
      suggestions.push("This appears complex - consider using a Specialist for the design phase");
      suggestions.push("A Reviewer could validate the implementation");
    }
  }
  
  if (agentType === "specialist") {
    suggestions.push("Consider having a Worker implement the solution after design");
  }
  
  if (!request.expectedOutput) {
    suggestions.push("Consider specifying expected output format in the task");
  }
  
  return suggestions;
}

/**
 * Get quick agent recommendation
 */
export function quickRoute(task: string): AgentType {
  const result = routeTask({ task });
  return result.recommendedAgent;
}

/**
 * Check if task should use subagents
 */
export function shouldUseSubagents(task: string): {
  useSubagents: boolean;
  reason: string;
  complexity: "simple" | "medium" | "complex";
} {
  const complexity = analyzeComplexity(task);
  
  if (complexity === "simple") {
    return {
      useSubagents: false,
      reason: "Task is simple enough to handle directly",
      complexity
    };
  }
  
  if (complexity === "complex") {
    return {
      useSubagents: true,
      reason: "Complex task would benefit from coordinated subagents",
      complexity
    };
  }
  
  return {
    useSubagents: false,
    reason: "Medium complexity - use subagents if parallel work is possible",
    complexity
  };
}

/**
 * Analyze task complexity
 */
function analyzeComplexity(task: string): "simple" | "medium" | "complex" {
  const taskLower = task.toLowerCase();
  
  // Complex indicators
  const complexIndicators = [
    /\b(multiple|several|various)\b/,
    /\b(coordinate|orchestrate|plan)\b/,
    /\b(architecture|design|refactor)\b/,
    /\band\b.*\band\b.*\band\b/, // Multiple "and" clauses
    /\b(system|framework|platform)\b/,
    /\b(migrate|upgrade|rewrite)\b/,
  ];
  
  // Simple indicators
  const simpleIndicators = [
    /\b(simple|quick|minor|small|fix)\b/,
    /^\s*\w+\s+(the|a|an)\s+\w+\s*$/, // Simple action pattern
    /^\s*(add|fix|update|remove)\s+/i,
    /\b(just|only|single)\b/,
  ];
  
  const complexScore = complexIndicators.filter(r => r.test(taskLower)).length;
  const simpleScore = simpleIndicators.filter(r => r.test(taskLower)).length;
  
  if (complexScore >= 2) return "complex";
  if (simpleScore >= 2 || task.length < 50) return "simple";
  return "medium";
}
