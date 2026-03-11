/**
 * Embedded Agent Runner - v0.2.0
 * 
 * Wraps pi-coding-agent with custom system prompt injection.
 * Provides OpenClaw-style embedded mode while keeping Pi TUI.
 */

import { loadBootstrapFiles, ensureDefaultBootstrap } from "./bootstrap-loader.js";
import { buildSystemPrompt, createSystemPromptOverride } from "./system-prompt.js";

export interface EmbeddedRunConfig {
  prompt: string;
  cwd: string;
  workspaceDir?: string;
  mode?: "plan" | "build";
  extensions?: any[];
  onUpdate?: (update: any) => void;
  onBlockReply?: (reply: string) => void;
}

export interface EmbeddedRunResult {
  text: string;
  toolCalls: any[];
  metadata: {
    duration: number;
    tokens: number;
  };
}

/**
 * Run agent with embedded mode (custom system prompt)
 * 
 * This is a stub implementation showing the architecture.
 * Full implementation requires pi-coding-agent SDK integration.
 */
export async function runEmbeddedAgent(
  config: EmbeddedRunConfig
): Promise<EmbeddedRunResult> {
  const startTime = Date.now();
  const workspaceDir = config.workspaceDir || config.cwd;

  console.log("[Embedded] Starting embedded agent run");
  console.log(`[Embedded] Workspace: ${workspaceDir}`);
  console.log(`[Embedded] Mode: ${config.mode || "default"}`);

  // 1. Ensure bootstrap files exist
  await ensureDefaultBootstrap(workspaceDir);

  // 2. Load bootstrap files (SOUL.md, IDENTITY.md, etc.)
  const bootstrapFiles = await loadBootstrapFiles(workspaceDir);
  console.log(`[Embedded] Loaded ${bootstrapFiles.filter(f => f.exists).length} bootstrap files`);

  // 3. Build custom system prompt
  const systemPrompt = buildSystemPrompt({
    basePrompt: undefined, // Uses default
    bootstrapFiles,
    workspace: workspaceDir,
    mode: config.mode,
    tools: config.extensions?.flatMap(e => e.tools || []),
  });

  console.log(`[Embedded] System prompt: ${systemPrompt.length} chars`);

  // 4. TODO(v0.5.2+): Integrate with pi-coding-agent SDK
  // This requires SDK linkage and is a larger architectural change
  // const { session } = await createAgentSession({
  //   cwd: config.cwd,
  //   // ... other config
  // });
  // 
  // // Apply custom system prompt
  // const override = createSystemPromptOverride(systemPrompt);
  // applySystemPromptOverride(session, override);
  //
  // // Run
  // const result = await session.prompt(config.prompt);

  // For now, simulate the structure
  const simulatedResult: EmbeddedRunResult = {
    text: `[Embedded mode simulation]\n\n` +
          `Bootstrap files loaded:\n` +
          bootstrapFiles
            .filter(f => f.exists)
            .map(f => `- ${f.name} (${f.size} chars)`)
            .join("\n"),
    toolCalls: [],
    metadata: {
      duration: Date.now() - startTime,
      tokens: systemPrompt.length / 4, // Rough estimate
    },
  };

  console.log(`[Embedded] Completed in ${simulatedResult.metadata.duration}ms`);

  return simulatedResult;
}

/**
 * Check if embedded mode is available
 */
export function isEmbeddedModeAvailable(): boolean {
  // TODO(v0.6.0): Check if pi-coding-agent SDK is properly linked
  return true;
}

/**
 * Initialize embedded mode
 * Sets up directories and default files
 */
export async function initEmbeddedMode(workspaceDir: string): Promise<void> {
  await ensureDefaultBootstrap(workspaceDir);
  console.log("[Embedded] Initialized workspace with bootstrap files");
}
