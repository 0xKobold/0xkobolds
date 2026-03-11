/**
 * 🐉 Natural Language Command Parser
 * 
 * Converts natural language to structured commands
 * Examples:
 *   "spawn a researcher to analyze the codebase" → /agent-spawn researcher "analyze the codebase"
 *   "get a specialist to fix this bug" → /agent-spawn specialist "fix this bug"
 *   "plan how to implement auth" → /agent-spawn planner "implement auth"
 *   "review this code" → /agent-spawn reviewer "review this code"
 */

interface ParsedCommand {
  tool: string;
  params: Record<string, unknown>;
}

// Natural language patterns for agent spawning
const spawnPatterns = [
  // Spawn patterns
  {
    regex: /(?:spawn|get|create|delegate|use)\s+(?:a|an)?\s*(researcher|specialist|planner|reviewer|scout|worker)\s+(?:to|for)?\s+(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_spawn_tui",
      params: {
        type: matches[1].toLowerCase(),
        task: matches[2].trim(),
        strategy: "auto",
      },
    }),
  },
  // "I need a researcher to..."
  {
    regex: /(?:i\s+)?(?:need|want)\s+(?:a|an)?\s*(researcher|specialist|planner|reviewer|scout|worker)\s+(?:to|for)?\s+(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_spawn_tui",
      params: {
        type: matches[1].toLowerCase(),
        task: matches[2].trim(),
        strategy: "auto",
      },
    }),
  },
  // "analyze the codebase" → researcher
  {
    regex: /^(analyze|research|investigate|explore|study)\s+(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_spawn_tui",
      params: {
        type: "researcher",
        task: `${matches[1]} ${matches[2]}`,
        strategy: "thorough",
      },
    }),
  },
  // "implement/fix/refactor" → specialist
  {
    regex: /^(implement|fix|refactor|build|create|write|code)\s+(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_spawn_tui",
      params: {
        type: "specialist",
        task: `${matches[1]} ${matches[2]}`,
        strategy: "thorough",
      },
    }),
  },
  // "plan/design/architecture" → planner
  {
    regex: /^(plan|design|architect|structure|organize)\s+(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_spawn_tui",
      params: {
        type: "planner",
        task: `${matches[1]} ${matches[2]}`,
        strategy: "thorough",
      },
    }),
  },
  // "review/check/audit" → reviewer
  {
    regex: /^(review|check|audit|validate|inspect)\s+(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_spawn_tui",
      params: {
        type: "reviewer",
        task: `${matches[1]} ${matches[2]}`,
        strategy: "auto",
      },
    }),
  },
  // "find/discover/locate" → scout
  {
    regex: /^(find|discover|locate|search|scout)\s+(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_spawn_tui",
      params: {
        type: "scout",
        task: `${matches[1]} ${matches[2]}`,
        strategy: "fast",
      },
    }),
  },
  // "help me with..." → auto-select based on context
  {
    regex: /^(?:help\s+me\s+(?:with|on)?|assist\s+me\s+with)\s+(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => {
      const task = matches[1].toLowerCase();
      let type = "specialist"; // default
      
      if (/analyze|research|explore|understand/.test(task)) type = "researcher";
      else if (/plan|design|architecture/.test(task)) type = "planner";
      else if (/review|check|audit/.test(task)) type = "reviewer";
      else if (/find|search|locate/.test(task)) type = "scout";
      
      return {
        tool: "agent_spawn_tui",
        params: { type, task: matches[1], strategy: "auto" },
      };
    },
  },
];

// Stop/resume/kill patterns
const controlPatterns = [
  // Stop patterns
  {
    regex: /^(?:stop|pause|halt)\s+(?:agent\s+)?(?:#?)?(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_stop",
      params: { runId: matches[1].trim() || "last" },
    }),
  },
  // Resume patterns
  {
    regex: /^(?:resume|continue|unpause)\s+(?:agent\s+)?(?:#?)?(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_resume",
      params: { runId: matches[1].trim() || "last" },
    }),
  },
  // Kill patterns
  {
    regex: /^(?:kill|terminate|abort)\s+(?:agent\s+)?(?:#?)?(.+)/i,
    action: (matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_kill",
      params: { runId: matches[1].trim() || "last" },
    }),
  },
];

// Query patterns
const queryPatterns = [
  // Status patterns
  {
    regex: /^(?:show|list|display)?\s*(?:all)?\s*(?:running|active)?\s*agents?/i,
    action: (_matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agents_list_controls",
      params: { filter: "all" },
    }),
  },
  // Tree patterns
  {
    regex: /^(?:show|display)?\s*(?:agent\s+)?tree|hierarchy/i,
    action: (_matches: RegExpMatchArray): ParsedCommand => ({
      tool: "agent_tree_view",
      params: {},
    }),
  },
  // Artifacts patterns
  {
    regex: /^(?:show|list)?\s*(?:all)?\s*artifacts?/i,
    action: (_matches: RegExpMatchArray): ParsedCommand => ({
      tool: "artifacts_list",
      params: { limit: 10 },
    }),
  },
];

/**
 * Parse natural language input into structured command
 */
export function parseNaturalLanguage(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  
  // Skip if it looks like a slash command
  if (trimmed.startsWith("/")) return null;
  
  // Try spawn patterns
  for (const pattern of spawnPatterns) {
    const matches = trimmed.match(pattern.regex);
    if (matches) {
      return pattern.action(matches);
    }
  }
  
  // Try control patterns
  for (const pattern of controlPatterns) {
    const matches = trimmed.match(pattern.regex);
    if (matches) {
      return pattern.action(matches);
    }
  }
  
  // Try query patterns
  for (const pattern of queryPatterns) {
    const matches = trimmed.match(pattern.regex);
    if (matches) {
      return pattern.action(matches);
    }
  }
  
  return null;
}

/**
 * Check if input is natural language (not a slash command)
 */
export function isNaturalLanguage(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.startsWith("/")) return false;
  
  // Check if it matches any natural pattern
  return parseNaturalLanguage(input) !== null;
}

/**
 * Get example natural language commands
 */
export function getNaturalLanguageExamples(): string[] {
  return [
    "spawn a researcher to analyze the codebase",
    "get a specialist to fix this bug",
    "I need a planner to design the API",
    "analyze the authentication flow",
    "implement user registration",
    "plan how to migrate to TypeScript",
    "review this implementation for security",
    "find all files that handle caching",
    "stop agent #e55676fc",
    "show all running agents",
    "display agent tree",
  ];
}

interface ParsedCommand {
  tool: string;
  params: Record<string, unknown>;
}
