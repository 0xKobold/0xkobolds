/**
 * Autonomous Skill Creation
 *
 * Detects patterns in observations and tool usage, then generates
 * skills to automate recurring tasks.
 *
 * Phase 3 of Dialectic Memory Implementation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import type { DialecticStore } from "./store";

// ═════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════

export interface Pattern {
  id: string;
  type: "tool_sequence" | "command_repeat" | "workflow" | "query_pattern";
  description: string;
  occurrences: number;
  lastSeen: Date;
  examples: string[];
  confidence: number;
  suggestedSkill?: string;
}

export interface SkillSuggestion {
  name: string;
  description: string;
  risk: "safe" | "medium" | "high";
  toolDefinition: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
      };
    };
  };
  executeCode: string;
  pattern: Pattern;
  reasoning: string;
}

// ═════════════════════════════════════════════════════════════════
// PATTERN DETECTION
// ═════════════════════════════════════════════════════════════════

/**
 * Detect patterns from observations and tool usage.
 */
export async function detectPatterns(
  store: DialecticStore,
  peerId: string,
  ollamaUrl: string = process.env.OLLAMA_URL || "http://localhost:11434"
): Promise<Pattern[]> {
  const observations = store.getObservations(peerId, 500);
  
  if (observations.length < 10) {
    return []; // Not enough data
  }

  // Group observations by type
  const toolCalls = observations.filter(o => o.sourceType === "tool_call");
  const commands = observations.filter(o => o.category === "behavior");
  const workflows = observations.filter(o => o.category === "success" || o.category === "error");

  const patterns: Pattern[] = [];

  // Pattern 1: Repeated tool sequences
  const toolPatterns = detectToolSequences(toolCalls);
  patterns.push(...toolPatterns);

  // Pattern 2: Repeated commands
  const commandPatterns = detectRepeatedCommands(commands);
  patterns.push(...commandPatterns);

  // Pattern 3: Workflow patterns (success/error sequences)
  const workflowPatterns = detectWorkflowPatterns(workflows);
  patterns.push(...workflowPatterns);

  // Use LLM to suggest skill names/descriptions for high-confidence patterns
  for (const pattern of patterns) {
    if (pattern.confidence >= 0.7 && pattern.occurrences >= 3) {
      const suggestion = await suggestSkillForPattern(pattern, ollamaUrl);
      pattern.suggestedSkill = suggestion;
    }
  }

  return patterns;
}

/**
 * Detect repeated tool call sequences.
 */
function detectToolSequences(observations: import("./types").Observation[]): Pattern[] {
  const patterns: Pattern[] = [];
  const sequences = new Map<string, { count: number; examples: string[] }>();

  // Look for 2-4 tool call sequences
  for (let i = 0; i < observations.length - 1; i++) {
    for (let len = 2; len <= 4 && i + len <= observations.length; len++) {
      const sequence = observations.slice(i, i + len)
        .map(o => o.content)
        .join(" → ");

      // Normalize common variations
      const normalized = sequence
        .replace(/\b\w+Id\b/g, "{id}") // Replace IDs
        .replace(/\b\d+\b/g, "{num}") // Replace numbers
        .replace(/\/[\w\/-]+/g, "{path}"); // Replace paths

      if (!sequences.has(normalized)) {
        sequences.set(normalized, { count: 0, examples: [] });
      }
      const entry = sequences.get(normalized)!;
      entry.count++;
      if (entry.examples.length < 3) {
        entry.examples.push(sequence);
      }
    }
  }

  // Convert to patterns
  for (const [sequence, data] of sequences) {
    if (data.count >= 3) {
      patterns.push({
        id: `pattern_tool_${patterns.length}`,
        type: "tool_sequence",
        description: `Repeated tool sequence: ${sequence.substring(0, 100)}...`,
        occurrences: data.count,
        lastSeen: new Date(),
        examples: data.examples,
        confidence: Math.min(0.9, data.count / 10),
      });
    }
  }

  return patterns;
}

/**
 * Detect repeated command patterns.
 */
function detectRepeatedCommands(observations: import("./types").Observation[]): Pattern[] {
  const patterns: Pattern[] = [];
  const commands = new Map<string, { count: number; examples: string[] }>();

  for (const obs of observations) {
    // Extract command-like patterns
    const content = obs.content.toLowerCase();
    
    // Look for command patterns (e.g., "run tests", "check status")
    const commandMatch = content.match(/(?:run|check|execute|start|stop|build|deploy|test)\s+\w+/g);
    if (commandMatch) {
      for (const cmd of commandMatch) {
        const normalized = cmd.replace(/\b\w+Id\b/g, "{id}");
        if (!commands.has(normalized)) {
          commands.set(normalized, { count: 0, examples: [] });
        }
        const entry = commands.get(normalized)!;
        entry.count++;
        if (entry.examples.length < 3) {
          entry.examples.push(obs.content);
        }
      }
    }
  }

  // Convert to patterns
  for (const [cmd, data] of commands) {
    if (data.count >= 3) {
      patterns.push({
        id: `pattern_cmd_${patterns.length}`,
        type: "command_repeat",
        description: `Repeated command: "${cmd}"`,
        occurrences: data.count,
        lastSeen: new Date(),
        examples: data.examples,
        confidence: Math.min(0.8, data.count / 8),
      });
    }
  }

  return patterns;
}

/**
 * Detect workflow patterns (task → success/error).
 */
function detectWorkflowPatterns(observations: import("./types").Observation[]): Pattern[] {
  const patterns: Pattern[] = [];
  const workflows = new Map<string, { success: number; error: number; examples: string[] }>();

  // Group by session
  const bySession = new Map<string, import("./types").Observation[]>();
  for (const obs of observations) {
    if (obs.sessionId) {
      if (!bySession.has(obs.sessionId)) {
        bySession.set(obs.sessionId, []);
      }
      bySession.get(obs.sessionId)!.push(obs);
    }
  }

  // Analyze session workflows
  for (const [sessionId, sessionObs] of bySession) {
    for (let i = 0; i < sessionObs.length - 1; i++) {
      const current = sessionObs[i];
      const next = sessionObs[i + 1];

      if (current.category === "behavior" && 
          (next.category === "success" || next.category === "error")) {
        const workflow = `${current.content.substring(0, 50)} → ${next.category}`;
        const normalized = workflow.replace(/\b\w+Id\b/g, "{id}");
        
        if (!workflows.has(normalized)) {
          workflows.set(normalized, { success: 0, error: 0, examples: [] });
        }
        const entry = workflows.get(normalized)!;
        if (next.category === "success") entry.success++;
        else entry.error++;
        if (entry.examples.length < 3) {
          entry.examples.push(workflow);
        }
      }
    }
  }

  // Convert to patterns
  for (const [workflow, data] of workflows) {
    const total = data.success + data.error;
    if (total >= 2) {
      patterns.push({
        id: `pattern_workflow_${patterns.length}`,
        type: "workflow",
        description: `Workflow pattern: ${workflow.substring(0, 100)}...`,
        occurrences: total,
        lastSeen: new Date(),
        examples: data.examples,
        confidence: data.success / total, // Higher confidence for successful workflows
      });
    }
  }

  return patterns;
}

// ═════════════════════════════════════════════════════════════════
// SKILL SUGGESTION (LLM)
// ═════════════════════════════════════════════════════════════════

/**
 * Use LLM to suggest a skill name for a pattern.
 */
async function suggestSkillForPattern(
  pattern: Pattern,
  ollamaUrl: string
): Promise<string | undefined> {
  const prompt = `Given this recurring pattern, suggest a concise skill name (lowercase, hyphen-separated, max 40 chars):

Pattern type: ${pattern.type}
Description: ${pattern.description}
Occurrences: ${pattern.occurrences}
Examples:
${pattern.examples.map(e => `  - ${e}`).join("\n")}

Respond with only the skill name, no explanation.`;

  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    const data = await response.json() as { response: string };
    const suggestion = data.response.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").substring(0, 40);
    return suggestion || undefined;
  } catch {
    return undefined;
  }
}

// ═════════════════════════════════════════════════════════════════
// SKILL GENERATION
// ═════════════════════════════════════════════════════════════════

const SKILL_GENERATION_PROMPT = `You are a skill generator for an AI assistant. Generate a TypeScript skill for the following pattern.

Pattern Details:
- Type: {{type}}
- Description: {{description}}
- Occurrences: {{occurrences}}
- Examples:
{{examples}}

Generate a skill that:
1. Automates this recurring pattern
2. Has a clear, descriptive name (lowercase, hyphen-separated)
3. Has appropriate risk level (safe/medium/high)
4. Has clear parameters with descriptions
5. Returns useful results

Output ONLY valid JSON with this structure:
{
  "name": "skill-name",
  "description": "Clear description of what this skill does",
  "risk": "safe|medium|high",
  "parameters": {
    "param1": { "type": "string", "description": "What this param does" },
    "param2": { "type": "number", "description": "What this param does" }
  },
  "requiredParams": ["param1"],
  "executeCode": "// TypeScript code that implements the skill\\n// Use: async (args) => { ... }\\n// Available imports: fs, path, child_process, fetch, console"
}

Do not include any explanation, only the JSON.`;

/**
 * Generate a skill from a pattern using LLM.
 */
export async function generateSkill(
  pattern: Pattern,
  ollamaUrl: string = process.env.OLLAMA_URL || "http://localhost:11434"
): Promise<SkillSuggestion | null> {
  const prompt = SKILL_GENERATION_PROMPT
    .replace("{{type}}", pattern.type)
    .replace("{{description}}", pattern.description)
    .replace("{{occurrences}}", String(pattern.occurrences))
    .replace("{{examples}}", pattern.examples.map(e => `  - ${e}`).join("\n"));

  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      console.error(`[SkillCreation] LLM error: ${response.status}`);
      return null;
    }

    const data = await response.json() as { response: string };
    const parsed = JSON.parse(data.response);

    // Validate required fields
    if (!parsed.name || !parsed.description || !parsed.executeCode) {
      console.error("[SkillCreation] Invalid skill response: missing fields");
      return null;
    }

    const suggestion: SkillSuggestion = {
      name: String(parsed.name).toLowerCase().replace(/[^a-z0-9-]/g, "-").substring(0, 40),
      description: String(parsed.description),
      risk: ["safe", "medium", "high"].includes(parsed.risk) ? parsed.risk : "medium",
      toolDefinition: {
        type: "function",
        function: {
          name: parsed.name,
          description: parsed.description,
          parameters: {
            type: "object",
            properties: parsed.parameters || {},
            required: parsed.requiredParams || [],
          },
        },
      },
      executeCode: String(parsed.executeCode),
      pattern,
      reasoning: `Generated from pattern seen ${pattern.occurrences} times with ${Math.round(pattern.confidence * 100)}% confidence.`,
    };

    return suggestion;
  } catch (err) {
    console.error("[SkillCreation] Failed to generate skill:", err);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════
// SKILL WRITING
// ═════════════════════════════════════════════════════════════════

const SKILL_TEMPLATE = `/**
 * {{name}}
 *
 * {{description}}
 *
 * Auto-generated from pattern: {{patternType}}
 * Occurrences: {{occurrences}}
 * Confidence: {{confidence}}%
 */

import type { Skill } from '../src/skills/types';

export const {{camelName}}Skill: Skill = {
  name: '{{name}}',
  description: '{{description}}',
  risk: '{{risk}}',

  toolDefinition: {{toolDefinition}},

  async execute(args: Record<string, unknown>) {
    {{executeCode}}
  },
};

export default {{camelName}}Skill;
`;

/**
 * Write a generated skill to the skills directory.
 */
export async function writeSkill(
  suggestion: SkillSuggestion,
  skillsDir?: string
): Promise<string | null> {
  // Determine skills directory
  const dir = skillsDir || path.join(homedir(), ".0xkobold", "skills");
  
  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true });

  // Generate skill file
  const camelName = suggestion.name
    .split("-")
    .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  const skillPath = path.join(dir, `${suggestion.name}.ts`);

  // Check if skill already exists
  try {
    await fs.access(skillPath);
    console.log(`[SkillCreation] Skill ${suggestion.name} already exists, skipping`);
    return null;
  } catch {
    // File doesn't exist, proceed
  }

  // Format tool definition
  const toolDefStr = JSON.stringify(suggestion.toolDefinition, null, 2);

  // Format execute code (indent)
  const executeLines = suggestion.executeCode.split("\n");
  const indentedExecute = executeLines.map(line => line ? `    ${line}` : line).join("\n");

  // Generate file content
  const content = SKILL_TEMPLATE
    .replace(/\{\{name\}\}/g, suggestion.name)
    .replace(/\{\{camelName\}\}/g, camelName)
    .replace(/\{\{description\}\}/g, suggestion.description)
    .replace(/\{\{risk\}\}/g, suggestion.risk)
    .replace(/\{\{patternType\}\}/g, suggestion.pattern.type)
    .replace(/\{\{occurrences\}\}/g, String(suggestion.pattern.occurrences))
    .replace(/\{\{confidence\}\}/g, String(Math.round(suggestion.pattern.confidence * 100)))
    .replace(/\{\{toolDefinition\}\}/g, toolDefStr)
    .replace(/\{\{executeCode\}\}/g, indentedExecute);

  try {
    await fs.writeFile(skillPath, content, "utf-8");
    console.log(`[SkillCreation] Created skill: ${skillPath}`);
    return skillPath;
  } catch (err) {
    console.error(`[SkillCreation] Failed to write skill:`, err);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════
// SKILL VALIDATION
// ═════════════════════════════════════════════════════════════════

/**
 * Validate a generated skill by attempting to parse it.
 */
export async function validateSkill(skillPath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // Try to import the skill
    const skillModule = await import(skillPath);
    
    if (!skillModule.default && !skillModule.skill) {
      return { valid: false, error: "No skill export found" };
    }

    const skill = skillModule.default || skillModule.skill;

    // Validate required fields
    if (!skill.name || typeof skill.name !== "string") {
      return { valid: false, error: "Invalid or missing skill name" };
    }

    if (!skill.description || typeof skill.description !== "string") {
      return { valid: false, error: "Invalid or missing skill description" };
    }

    if (!["safe", "medium", "high"].includes(skill.risk)) {
      return { valid: false, error: "Invalid risk level" };
    }

    if (typeof skill.execute !== "function") {
      return { valid: false, error: "Missing execute function" };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

// ═════════════════════════════════════════════════════════════════
// CONVENIENCE API
// ═════════════════════════════════════════════════════════════════

/**
 * Auto-create skills from detected patterns.
 * This is the main entry point for autonomous skill creation.
 */
export async function autoCreateSkills(
  store: DialecticStore,
  peerId: string,
  options?: {
    minOccurrences?: number;
    minConfidence?: number;
    skillsDir?: string;
    ollamaUrl?: string;
    dryRun?: boolean;
  }
): Promise<{
  patterns: Pattern[];
  suggestions: SkillSuggestion[];
  created: string[];
  errors: string[];
}> {
  const {
    minOccurrences = 3,
    minConfidence = 0.7,
    skillsDir,
    ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434",
    dryRun = false,
  } = options || {};

  const result: {
    patterns: Pattern[];
    suggestions: SkillSuggestion[];
    created: string[];
    errors: string[];
  } = {
    patterns: [],
    suggestions: [],
    created: [],
    errors: [],
  };

  // Step 1: Detect patterns
  console.log("[SkillCreation] Detecting patterns...");
  const patterns = await detectPatterns(store, peerId, ollamaUrl);
  result.patterns = patterns;

  // Step 2: Filter patterns
  const eligiblePatterns = patterns.filter(
    p => p.occurrences >= minOccurrences && p.confidence >= minConfidence
  );

  console.log(`[SkillCreation] Found ${patterns.length} patterns, ${eligiblePatterns.length} eligible`);

  // Step 3: Generate skills for eligible patterns
  for (const pattern of eligiblePatterns) {
    const suggestion = await generateSkill(pattern, ollamaUrl);
    if (suggestion) {
      result.suggestions.push(suggestion);

      // Step 4: Write skill (unless dry run)
      if (!dryRun) {
        const skillPath = await writeSkill(suggestion, skillsDir);
        if (skillPath) {
          // Step 5: Validate
          const validation = await validateSkill(skillPath);
          if (validation.valid) {
            result.created.push(skillPath);
          } else {
            result.errors.push(`${suggestion.name}: ${validation.error}`);
            // Remove invalid skill
            await fs.unlink(skillPath).catch(() => {});
          }
        }
      }
    }
  }

  console.log(`[SkillCreation] Created ${result.created.length} skills, ${result.errors.length} errors`);
  return result;
}

// Singleton for default store
let skillCreationStore: DialecticStore | null = null;

export function setSkillCreationStore(store: DialecticStore): void {
  skillCreationStore = store;
}

export function getSkillCreationStore(): DialecticStore | null {
  return skillCreationStore;
}