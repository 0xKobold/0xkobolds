/**
 * Natural Language Command Patterns
 *
 * Maps natural language input to structured commands for the agent system.
 * Used by the TUI and CLI for parsing user intents.
 */

export interface ParsedCommand {
  tool: string;
  params: Record<string, unknown>;
}

export interface PatternDefinition {
  regex: RegExp;
  description: string;
  action: (match: RegExpMatchArray) => ParsedCommand;
}

// Query patterns for agent-related commands
export const agentPatterns: PatternDefinition[] = [
  // Status patterns
  {
    regex: /^(?:show|list|display)?\s*(?:all)?\s*(?:running|active)?\s*agents?/i,
    description: "Show all running/active agents",
    action: () => ({
      tool: "agent_orchestrate",
      params: { operation: "status" },
    }),
  },
  // Tree patterns
  {
    regex: /^(?:show|display)?\s*(?:agent\s+)?tree|hierarchy/i,
    description: "Display agent hierarchy tree",
    action: () => ({
      tool: "agent_orchestrate",
      params: { operation: "list" },
    }),
  },
  // Spawn patterns
  {
    regex: /^(?:spawn|create|start)\s+(?:a\s+)?(\w+)\s+(?:agent\s+)?(?:to\s+)?(.+)/i,
    description: "Spawn a specific agent type with task",
    action: (match) => ({
      tool: "agent_orchestrate",
      params: {
        operation: "spawn_subagent",
        subagent: match[1],
        task: match[2],
      },
    }),
  },
  // Analyze patterns
  {
    regex: /^(?:analyze|assess|evaluate)\s+(?:this\s+)?(?:task\s+)?["']?(.+?)["']?$/i,
    description: "Analyze task complexity for delegation",
    action: (match) => ({
      tool: "agent_orchestrate",
      params: { operation: "analyze", task: match[1] },
    }),
  },
  // Delegate patterns
  {
    regex: /^(?:delegate|assign|hand\s+off)\s+(?:this\s+)?(?:task\s+)?["']?(.+?)["']?$/i,
    description: "Auto-delegate task to appropriate agent",
    action: (match) => ({
      tool: "agent_orchestrate",
      params: { operation: "delegate", task: match[1] },
    }),
  },
  // Memory patterns
  {
    regex: /^(?:show|display)?\s*(?:agent\s+)?memories/i,
    description: "Show agent memory stream",
    action: () => ({
      tool: "/agent-memories",
      params: {},
    }),
  },
  {
    regex: /^(?:show|display)?\s*(?:agent\s+)?reflections/i,
    description: "Show agent reflections/insights",
    action: () => ({
      tool: "/agent-reflections",
      params: {},
    }),
  },
  {
    regex: /^(?:show|display)?\s*(?:agent\s+)?plans/i,
    description: "Show agent plans",
    action: () => ({
      tool: "/agent-plans",
      params: {},
    }),
  },
];

// Memory-related patterns
export const memoryPatterns: PatternDefinition[] = [
  {
    regex: /^(?:remember|save|store)\s+["']?(.+?)["']?$/i,
    description: "Save a memory",
    action: (match) => ({
      tool: "perennial_save",
      params: { content: match[1], category: "context" },
    }),
  },
  {
    regex: /^(?:recall|remember|what\s+about)\s+["']?(.+?)["']?$/i,
    description: "Recall a memory by description",
    action: (match) => ({
      tool: "perennial_search",
      params: { query: match[1] },
    }),
  },
];

/**
 * Parse natural language input into structured command
 * @param input - User input string
 * @returns ParsedCommand or null if no pattern matches
 */
export function parseNaturalLanguage(input: string): ParsedCommand | null {
  // Check agent patterns first
  for (const pattern of agentPatterns) {
    const match = input.match(pattern.regex);
    if (match) {
      return pattern.action(match);
    }
  }

  // Check memory patterns
  for (const pattern of memoryPatterns) {
    const match = input.match(pattern.regex);
    if (match) {
      return pattern.action(match);
    }
  }

  return null;
}

/**
 * Get all available patterns for documentation
 * @returns Array of pattern descriptions
 */
export function getPatternDescriptions(): Array<{ pattern: string; description: string }> {
  return [
    ...agentPatterns.map((p) => ({
      pattern: p.regex.source,
      description: p.description,
    })),
    ...memoryPatterns.map((p) => ({
      pattern: p.regex.source,
      description: p.description,
    })),
  ];
}

// Example usage:
// parseNaturalLanguage("show all running agents") → { tool: "agent_orchestrate", params: { operation: "status" } }
// parseNaturalLanguage("spawn a worker to test the API") → { tool: "agent_orchestrate", params: { ... } }
// parseNaturalLanguage("remember the database schema") → { tool: "perennial_save", params: { ... } }
