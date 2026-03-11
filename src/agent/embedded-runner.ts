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

  // 4. Try to integrate with pi-coding-agent SDK
  try {
    // Dynamic import to avoid hard dependency
    const { createAgentSession } = await import('@mariozechner/pi-coding-agent').catch(() => ({ createAgentSession: null }));
    
    if (createAgentSession) {
      console.log('[Embedded] Using pi-coding-agent SDK');
      
      // Create agent session with custom system prompt
      const { session } = await createAgentSession({
        cwd: config.cwd,
        systemPrompt: systemPrompt,
      });
      
      // Run the prompt with appropriate options
      const maxIterations = config.mode === 'build' ? 30 : 15;
      const result = await session.prompt(config.prompt, maxIterations);
      
      const duration = Date.now() - startTime;
      
      return {
        text: result || 'No response',
        toolCalls: [], // Tool calls would need to be extracted from result
        metadata: {
          duration,
          tokens: systemPrompt.length / 4, // Rough estimate until SDK provides usage
        },
      };
    }
  } catch (sdkError) {
    console.log('[Embedded] SDK integration failed, falling back to simulation:', (sdkError as Error).message);
  }

  // Fallback: Simulate the structure
  console.log('[Embedded] Running in simulation mode (SDK not available)');
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
 * 
 * Verifies pi-coding-agent SDK is properly linked and functional.
 * Attempts dynamic import to check for SDK presence.
 */
export async function isEmbeddedModeAvailable(): Promise<boolean> {
  try {
    // Try to import pi-coding-agent SDK
    const { createAgentSession } = await import('@mariozechner/pi-coding-agent');
    
    // Check for required API
    const hasSessionAPI = typeof createAgentSession === 'function';
    
    if (!hasSessionAPI) {
      console.log('[Embedded] pi-coding-agent SDK found but createAgentSession API unavailable');
      return false;
    }
    
    console.log('[Embedded] pi-coding-agent SDK fully available');
    return true;
  } catch (error) {
    console.log('[Embedded] pi-coding-agent SDK not found:', (error as Error).message);
    return false;
  }
}

/**
 * Initialize embedded mode
 * Sets up directories and default files
 */
export async function initEmbeddedMode(workspaceDir: string): Promise<void> {
  await ensureDefaultBootstrap(workspaceDir);
  console.log("[Embedded] Initialized workspace with bootstrap files");
}
