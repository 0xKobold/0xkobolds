/**
 * System Prompt Builder - v0.4.0
 * 
 * HERMES-STYLE PROMPT ASSEMBLY:
 * 
 * 1. Instance identity (KOBOLD_HOME/SOUL.md, IDENTITY.md)
 *    - Follows you everywhere, stable baseline personality
 *    - Injected directly, no wrapper explanation
 * 
 * 2. Project context (AGENTS.md discovered hierarchically)
 *    - Project-specific, lives in working directory
 *    - Multiple AGENTS.md files merged shallowest first
 * 
 * 3. Personality overlay (/personality command)
 *    - Session-level temporary mode switch
 *    - Supplements identity, doesn't replace
 * 
 * 4. Mode instructions (plan/build/minimal)
 *    - Added at end, can override behavior
 */

import { 
  BootstrapFile, 
  loadInstanceFiles,
  discoverProjectFiles,
  loadPersonalityOverlay,
  getKoboldHome
} from "./bootstrap-loader.js";

export interface SystemPromptConfig {
  basePrompt?: string;
  instanceFiles?: BootstrapFile[];
  projectFiles?: BootstrapFile[];
  personality?: string;
  personalityContent?: string;
  tools?: { name: string; description: string }[];
  workspace?: string;
  mode?: "plan" | "build" | "minimal";
  agentType?: string;
  extraSystemPrompt?: string; // For subagent context
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
 * Build system prompt (Hermes-style)
 * 
 * Order:
 * 1. Base prompt / agent type definition
 * 2. Instance identity (SOUL.md, IDENTITY.md from KOBOLD_HOME)
 * 3. Project context (AGENTS.md from working directory)
 * 4. Personality overlay (session-level)
 * 5. Mode instructions
 */
export async function buildSystemPromptAsync(
  config: SystemPromptConfig = {}
): Promise<string> {
  const parts: string[] = [];
  const home = getKoboldHome();
  
  // 1. Base prompt
  parts.push(config.basePrompt || BASE_SYSTEM_PROMPT);
  
  // 2. Agent type indicator (if subagent)
  if (config.agentType) {
    parts.push("");
    parts.push(`<!-- Agent Type: ${config.agentType} -->`);
  }
  
  // 3. Instance identity - load if not provided
  let instanceFiles = config.instanceFiles;
  if (!instanceFiles) {
    instanceFiles = await loadInstanceFiles({ homeDir: home });
  }
  
  // Inject instance identity directly (Hermes style: no wrapper)
  const validInstance = instanceFiles.filter(f => f.exists && !f.blocked);
  for (const file of validInstance) {
    parts.push("");
    parts.push(file.content);
  }
  
  // 4. Project context (AGENTS.md)
  let projectFiles = config.projectFiles;
  if (!projectFiles && config.workspace) {
    projectFiles = await discoverProjectFiles(config.workspace);
  }
  
  const validProject = (projectFiles || []).filter(f => f.exists && !f.blocked);
  if (validProject.length > 0) {
    parts.push("");
    parts.push("<!-- Project Context -->");
    for (const file of validProject) {
      parts.push(`<!-- ${file.name} (${file.size} chars) -->`);
      parts.push(file.content);
    }
  }
  
  // 5. Workspace context
  if (config.workspace) {
    parts.push("");
    parts.push(`<!-- Workspace -->\nWorking directory: ${config.workspace}`);
  }
  
  // 6. Tools reference
  if (config.tools && config.tools.length > 0) {
    parts.push("");
    parts.push("Available tools: " + config.tools.map(t => t.name).join(", "));
  }
  
  // 7. Personality overlay (session-level, Hermes /personality style)
  if (config.personalityContent) {
    parts.push("");
    parts.push(`<!-- Personality: ${config.personality || "custom"} -->`);
    parts.push(config.personalityContent);
  } else if (config.personality) {
    // Try loading from environment (set by /personality command)
    const envPersonality = process.env.KOBOLD_PERSONALITY_CONTENT;
    if (envPersonality) {
      parts.push("");
      parts.push(`<!-- Personality: ${process.env.KOBOLD_PERSONALITY || config.personality} -->`);
      parts.push(envPersonality);
    } else {
      // Try loading from file
    const overlay = await loadPersonalityOverlay(config.personality, { homeDir: home });
      if (overlay) {
        parts.push("");
        parts.push(`<!-- Personality: ${overlay.name} -->`);
        parts.push(overlay.content);
      }
    }
  }
  
  // 8. Extra system prompt (for subagent context)
  if (config.extraSystemPrompt) {
    parts.push("");
    parts.push("<!-- Subagent Context -->");
    parts.push(config.extraSystemPrompt);
  }
  
  // 9. Mode-specific instructions
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
 * Build system prompt sync (for cases where async isn't possible)
 * Uses only provided config, doesn't load files
 */
export function buildSystemPrompt(config: SystemPromptConfig = {}): string {
  const parts: string[] = [];
  
  // 1. Base prompt
  parts.push(config.basePrompt || BASE_SYSTEM_PROMPT);
  
  // 2. Agent type indicator
  if (config.agentType) {
    parts.push("");
    parts.push(`<!-- Agent Type: ${config.agentType} -->`);
  }
  
  // 3. Instance identity (must be pre-loaded)
  if (config.instanceFiles && config.instanceFiles.length > 0) {
    const validInstance = config.instanceFiles.filter(f => f.exists && !f.blocked);
    for (const file of validInstance) {
      parts.push("");
      parts.push(file.content);
    }
  }
  
  // 4. Project context (must be pre-loaded)
  if (config.projectFiles && config.projectFiles.length > 0) {
    const validProject = config.projectFiles.filter(f => f.exists && !f.blocked);
    if (validProject.length > 0) {
      parts.push("");
      parts.push("<!-- Project Context -->");
      for (const file of validProject) {
        parts.push(`<!-- ${file.name} (${file.size} chars) -->`);
        parts.push(file.content);
      }
    }
  }
  
  // 5. Workspace
  if (config.workspace) {
    parts.push("");
    parts.push(`<!-- Workspace -->\nWorking directory: ${config.workspace}`);
  }
  
  // 6. Tools
  if (config.tools && config.tools.length > 0) {
    parts.push("");
    parts.push("Available tools: " + config.tools.map(t => t.name).join(", "));
  }
  
  // 7. Personality overlay
  if (config.personalityContent) {
    parts.push("");
    parts.push(`<!-- Personality: ${config.personality || "custom"} -->`);
    parts.push(config.personalityContent);
  }
  
  // 8. Mode
  if (config.mode === "plan") {
    parts.push("");
    parts.push(`<!-- Mode: Plan -->\nYou are in PLAN MODE. Focus on investigation and planning.`);
  } else if (config.mode === "build") {
    parts.push("");
    parts.push(`<!-- Mode: Build -->\nYou are in BUILD MODE. Focus on implementation and execution.`);
  }
  
  return parts.join("\n\n");
}

/**
 * Create system prompt override for pi-coding-agent
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
 * Get prompt statistics for diagnostics
 */
export function getPromptStats(prompt: string): {
  totalChars: number;
  totalLines: number;
  sections: string[];
  estimatedTokens: number;
} {
  const lines = prompt.split("\n");
  const sections = prompt.match(/<!--.*?-->/g) || [];
  const estimatedTokens = Math.ceil(prompt.length / 4);
  
  return {
    totalChars: prompt.length,
    totalLines: lines.length,
    sections: sections.map(s => s.replace(/<!--\s*|\s*-->/g, "")),
    estimatedTokens,
  };
}

export default {
  buildSystemPrompt,
  buildSystemPromptAsync,
  createSystemPromptOverride,
  getPromptStats,
};