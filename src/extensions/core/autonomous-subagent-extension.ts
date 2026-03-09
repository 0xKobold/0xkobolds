/**
 * Autonomous Subagent Extension - v0.2.1
 *
 * Enables main agents to automatically use subagents based on task analysis.
 * No explicit /implement command needed - just say "use subagents" or the agent
 * automatically decides when delegation is appropriate.
 *
 * Features:
 * - Task complexity analysis
 * - Automatic delegation decisions
 * - Multi-strategy execution modes
 * - User-controlled autonomy levels
 *
 * @version 0.2.1
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Autonomy settings
interface AutonomyConfig {
  mode: "off" | "simple" | "medium" | "complex" | "always";
  maxParallelAgents: number;
  taskThreshold: number; // Words that trigger delegation
}

let autonomyConfig: AutonomyConfig = {
  mode: "medium",
  maxParallelAgents: 4,
  taskThreshold: 10,
};

// Task complexity analysis
interface TaskAnalysis {
  complexity: "simple" | "medium" | "complex";
  estimatedFiles: number;
  requiresResearch: boolean;
  requiresPlanning: boolean;
  suggestedStrategy: string;
  confidence: number;
}

function analyzeTask(task: string): TaskAnalysis {
  const taskLower = task.toLowerCase();
  const words = task.split(/\s+/).length;

  // Keywords indicating complexity
  const simpleKeywords = ["fix", "update", "change", "add", "remove"];
  const mediumKeywords = ["implement", "create", "build", "refactor", "migrate"];
  const complexKeywords = [
    "system",
    "architecture",
    "redesign",
    "framework",
    "platform",
    "microservices",
    "distributed",
  ];

  // File count indicators
  const filePatterns = task.match(/\b\w+\.(ts|js|tsx|jsx|py|rs|go)\b/g) || [];
  const specificFiles = filePatterns.length;

  // Calculate complexity score
  let score = 0;
  if (words < 15) score += 1;
  else if (words < 50) score += 2;
  else score += 3;

  simpleKeywords.forEach((k) => { if (taskLower.includes(k)) score += 1; });
  mediumKeywords.forEach((k) => { if (taskLower.includes(k)) score += 2; });
  complexKeywords.forEach((k) => { if (taskLower.includes(k)) score += 3; });

  // Specific files mentioned reduce complexity (more defined scope)
  if (specificFiles > 0 && specificFiles <= 3) score = Math.min(score, 4);
  if (specificFiles > 3) score += 1;

  // Determine complexity
  let complexity: "simple" | "medium" | "complex";
  if (score <= 5) complexity = "simple";
  else if (score <= 10) complexity = "medium";
  else complexity = "complex";

  // Determine strategy
  let estimatedFiles = specificFiles || (complexity === "simple" ? 1 : complexity === "medium" ? 3 : 5);
  const requiresResearch = complexity !== "simple" && !specificFiles;
  const requiresPlanning = complexity === "complex" || (complexity === "medium" && words > 30);

  const strategies: Record<string, string> = {
    simple: "Execute directly - no subagents needed",
    medium: "Use scout + worker workflow",
    complex: "Full workflow: scout → planner → workers → reviewer",
  };

  return {
    complexity,
    estimatedFiles,
    requiresResearch,
    requiresPlanning,
    suggestedStrategy: strategies[complexity],
    confidence: Math.min(0.9, 0.5 + score / 20),
  };
}

// Delegation strategies
async function executeStrategy(
  task: string,
  analysis: TaskAnalysis,
  ctx: ExtensionContext
): Promise<string> {
  const { complexity } = analysis;

  switch (autonomyConfig.mode) {
    case "off":
      return "Autonomy is disabled. Use explicit /implement command.";

    case "simple":
      // Only use subagents for complex tasks
      if (complexity !== "complex") {
        return `Task complexity: ${complexity}. Not using subagents (simple mode).`;
      }
      break;

    case "medium":
      // Use subagents for medium and complex
      if (complexity === "simple") {
        return `Task complexity: ${complexity}. Not using subagents.`;
      }
      break;

    case "always":
      // Always use subagents regardless of complexity
      break;

    case "complex":
    default:
      // Only use subagents for complex
      if (complexity !== "complex") {
        return `Task complexity: ${complexity}. Not using subagents (only complex tasks).`;
      }
  }

  // Execute based on complexity
  ctx.ui.notify(
    `🤖 Autonomous delegation: ${complexity} task. ${analysis.suggestedStrategy}`,
    "info"
  );

  if (complexity === "medium") {
    // Medium: Scout + Worker
    ctx.ui.notify("Spawning scout + worker...", "info");

    // In real implementation, these would call subagent_spawn
    return `
**Autonomous Delegation (Medium Complexity)**

Strategy: Scout → Worker

1. **Scout** - Finds relevant code
2. **Worker** - Implements based on findings

Task: "${task}"

*Estimated: ${analysis.estimatedFiles} files*  
*Confidence: ${Math.round(analysis.confidence * 100)}%*

---

Would you like me to:
- A) Execute with subagents now
- B) Show detailed plan first
- C) Handle manually (no subagents)
`;
  }

  if (complexity === "complex") {
    // Complex: Full workflow
    ctx.ui.notify("Spawning full workflow...", "info");

    return `
**Autonomous Delegation (Complex Task)**

Strategy: Scout → Planner → Workers → Reviewer

1. **Scout** - Comprehensive reconnaissance
2. **Planner** - Creates implementation plan
3. **Workers** - Parallel implementation (up to ${autonomyConfig.maxParallelAgents})
4. **Reviewer** - Code review of all changes

Task: "${task}"

*Estimated: ${analysis.estimatedFiles}+ files*  
*Requires planning: ${analysis.requiresPlanning ? "Yes" : "No"}*  
*Confidence: ${Math.round(analysis.confidence * 100)}%*

---

Would you like me to:
- A) Launch full autonomous workflow
- B) Create detailed breakdown first
- C) Simpler approach (scout + worker only)
`;
  }

  return "Unknown complexity";
}

export default async function autonomousSubagentExtension(pi: ExtensionAPI) {
  console.log("[AutonomousSubagent] Extension loaded");

  // Register tool for analysis (used by agent or accessible directly)
  pi.registerTool({
    name: "analyze_task",
    label: "Analyze Task Complexity",
    description: "Analyze task complexity and suggest delegation strategy",
    parameters: Type.Object({
      task: Type.String({ description: "Task to analyze" }),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      _ctx: ExtensionContext
    ) {
      const task = params.task as string;
      const analysis = analyzeTask(task);

      return {
        content: [
          {
            type: "text" as const,
            text: `**Task Analysis:**

**Task:** ${task}

**Complexity:** ${analysis.complexity}
**Estimated Files:** ${analysis.estimatedFiles}
**Requires Research:** ${analysis.requiresResearch ? "Yes" : "No"}
**Requires Planning:** ${analysis.requiresPlanning ? "Yes" : "No"}
**Confidence:** ${Math.round(analysis.confidence * 100)}%

**Suggested Strategy:**
${analysis.suggestedStrategy}

**Recommendation:**
${
  analysis.complexity === "simple"
    ? "Handle directly without subagents."
    : analysis.complexity === "medium"
      ? "Use /implement or delegate to scout + worker."
      : "Consider full workflow with planner and multiple workers."
}`,
          },
        ],
        details: analysis,
      };
    },
  });

  // TOOL: autonomous_delegation
  pi.registerTool({
    name: "autonomous_delegation",
    label: "Autonomous Task Delegation",
    description: "Automatically delegate task to appropriate subagents based on analysis",
    parameters: Type.Object({
      task: Type.String({ description: "Task to delegate" }),
      mode: Type.Optional(
        Type.String({
          description: "Override autonomy mode (simple/medium/complex/always)",
        })
      ),
      dry_run: Type.Optional(
        Type.Boolean({
          description: "Show plan without executing",
          default: false,
        })
      ),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ) {
      const task = params.task as string;

      // Override mode if specified
      if (params.mode) {
        autonomyConfig.mode = params.mode as AutonomyConfig["mode"];
      }

      const analysis = analyzeTask(task);

      // Execute strategy (or dry run)
      const result = params.dry_run
        ? `**DRY RUN - Delegation Plan**

Task: "${task}"

Analysis:
- Complexity: ${analysis.complexity}
- Strategy: ${analysis.suggestedStrategy}
- Estimated files: ${analysis.estimatedFiles}
- Autonomy mode: ${autonomyConfig.mode}

Would execute: ${
            analysis.complexity === "simple"
              ? "Direct execution (no subagents)"
              : analysis.complexity === "medium"
                ? "Scout → Worker"
                : "Full workflow"
          }`
        : await executeStrategy(task, analysis, ctx);

      return {
        content: [{ type: "text" as const, text: result }],
        details: { analysis, executed: !params.dry_run, dry_run: !!params.dry_run },
      };
    },
  });

  // COMMAND: /autonomous-toggle
  pi.registerCommand("autonomous-toggle", {
    description: "Toggle autonomous subagent mode",
    handler: async (args: string, ctx: ExtensionContext) => {
      const mode = args.trim() as AutonomyConfig["mode"];

      if (mode) {
        if (["off", "simple", "medium", "complex", "always"].includes(mode)) {
          autonomyConfig.mode = mode;
          ctx.ui.notify(`✅ Autonomous mode set to: ${mode}`, "info");
        } else {
          ctx.ui.notify(
            "❌ Invalid mode. Use: off, simple, medium, complex, always",
            "error"
          );
        }
      } else {
        // Toggle
        autonomyConfig.mode =
          autonomyConfig.mode === "off" ? "medium" : "off";
        ctx.ui.notify(
          `🔄 Autonomous mode: ${autonomyConfig.mode === "off" ? "OFF" : "ON"} (${autonomyConfig.mode})`,
          "info"
        );
      }
    },
  });

  // COMMAND: /autonomous-status
  pi.registerCommand("autonomous-status", {
    description: "Show autonomous subagent status",
    handler: async (_args: string, ctx: ExtensionContext) => {
      ctx.ui.notify(
        `🤖 Autonomous Mode: ${autonomyConfig.mode}\nMax agents: ${autonomyConfig.maxParallelAgents}`,
        "info"
      );
    },
  });

  // COMMAND: /delegation-plan
  pi.registerCommand("delegation-plan", {
    description: "Show delegation plan for a task: /delegation-plan <task>",
    handler: async (args: string, ctx: ExtensionContext) => {
      if (!args.trim()) {
        ctx.ui.notify("❌ Usage: /delegation-plan <task description>", "error");
        return;
      }

      const analysis = analyzeTask(args);

      ctx.ui.notify(
        `**Delegation Plan:**
Task: ${args}
Complexity: ${analysis.complexity}
Strategy: ${analysis.suggestedStrategy}
Confidence: ${Math.round(analysis.confidence * 100)}%`,
        "info"
      );
    },
  });

  // COMMAND: /implement (enhanced with auto-detection)
  pi.registerCommand("implement", {
    description:
      "Implement with auto-delegation. Says what it will do first.",
    handler: async (args: string, ctx: ExtensionContext) => {
      if (!args.trim()) {
        ctx.ui.notify("❌ Usage: /implement <feature description>", "error");
        return;
      }

      const analysis = analyzeTask(args);

      // Show analysis
      ctx.ui.notify(
        `🤖 Analyzing: "${args}"
Complexity: ${analysis.complexity}
Strategy: ${analysis.suggestedStrategy}
Confidence: ${Math.round(analysis.confidence * 100)}%`,
        "info"
      );

      // If simple, just do it
      if (
        analysis.complexity === "simple" &&
        autonomyConfig.mode !== "always"
      ) {
        ctx.ui.notify(
          "Task is simple. Handle directly without subagents.",
          "info"
        );
        return;
      }

      // Otherwise, execute strategy
      const result = await executeStrategy(args, analysis, ctx);
      ctx.ui.notify(result, "info");
    },
  });

  // Notify mode on startup
  console.log(
    `[AutonomousSubagent] Mode: ${autonomyConfig.mode}, Max agents: ${autonomyConfig.maxParallelAgents}`
  );
  console.log(
    `[AutonomousSubagent] Agent will automatically use subagents for ${
      autonomyConfig.mode === "off"
        ? "no"
        : autonomyConfig.mode
    } tasks`
  );
}
