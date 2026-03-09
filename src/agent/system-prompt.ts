/**
 * System Prompt Builder - v0.2.0
 * 
 * Constructs custom system prompts with bootstrap injection.
 * Inspired by OpenClaw's buildAgentSystemPrompt()
 */

import { BootstrapFile, formatBootstrapForPrompt } from "./bootstrap-loader.js";

export interface SystemPromptConfig {
  basePrompt: string;
  bootstrapFiles: BootstrapFile[];
  tools?: { name: string; description: string }[];
  workspace?: string;
  mode?: "plan" | "build" | "minimal";
}

const BASE_SYSTEM_PROMPT = `You are 0xKobold, a helpful AI coding assistant and digital familiar.

Your purpose is to assist the user with coding tasks, answer questions, and act as a companion in their development workflow.

Key capabilities:
- Read, write, and edit files in the workspace
- Execute commands and scripts
- Search the codebase
- Spawn sub-agents for complex tasks
- Access web resources
- Remember context across sessions

Important behaviors:
- Be concise and focused on delivering working code
- Ask clarifying questions when requirements are unclear
- Handle errors gracefully and explain what went wrong
- Follow existing code patterns in the project
- Test your changes when possible

When to use sub-agents:
- Complex tasks requiring multiple steps
- Parallel work streams
- Research vs implementation split
- Code review scenarios`;

/**
 * Build custom system prompt with bootstrap injection
 */
export function buildSystemPrompt(config: SystemPromptConfig): string {
  const parts: string[] = [];

  // 1. Base identity
  parts.push(config.basePrompt || BASE_SYSTEM_PROMPT);

  // 2. Bootstrap context (SOUL.md, IDENTITY.md, etc.)
  if (config.bootstrapFiles.length > 0) {
    parts.push("");
    parts.push(formatBootstrapForPrompt(config.bootstrapFiles));
  }

  // 3. Workspace context
  if (config.workspace) {
    parts.push("");
    parts.push(`<!-- Workspace -->\nWorking directory: ${config.workspace}`);
  }

  // 4. Tools reference (optional summary)
  if (config.tools && config.tools.length > 0) {
    parts.push("");
    parts.push("Available tools: " + config.tools.map(t => t.name).join(", "));
  }

  // 5. Mode-specific instructions
  if (config.mode === "plan") {
    parts.push("");
    parts.push(`<!-- Mode: Plan -->\nYou are in PLAN MODE. Focus on investigation and planning. Do not write code unless explicitly asked.`);
  } else if (config.mode === "build") {
    parts.push("");
    parts.push(`<!-- Mode: Build -->\nYou are in BUILD MODE. Focus on implementation and execution. Write clean, tested code.`);
  }

  return parts.join("\n\n");
}

/**
 * Create system prompt override for pi-coding-agent
 * This format matches what pi-coding-agent expects
 */
export function createSystemPromptOverride(systemPrompt: string): {
  type: "override";
  systemPrompt: string;
} {
  return {
    type: "override",
    systemPrompt,
  };
}

/**
 * Apply system prompt override to session
 * This is a placeholder - actual application depends on pi-coding-agent internals
 */
export function applySystemPromptOverride(
  session: any,
  override: ReturnType<typeof createSystemPromptOverride>
): void {
  // In real implementation, this would access pi-coding-agent internals
  // For now, we document the intent
  console.log("[SystemPrompt] Override prepared (" + override.systemPrompt.length + " chars)");
}
