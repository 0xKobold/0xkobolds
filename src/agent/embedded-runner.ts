/**
 * Embedded Agent Runner - v0.3.0
 * 
 * Wraps pi-coding-agent with full TUI settings sharing.
 * Shares: extensions, model config, persona from IDENTITY.md/SOUL.md
 */

import { loadBootstrapFiles, ensureDefaultBootstrap } from "./bootstrap-loader.js";
import { buildSystemPrompt, createSystemPromptOverride } from "./system-prompt.js";
import { config as piConfig } from "../pi-config.js";
import { loadConfig, getConfigValue } from "../config/loader.js";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

export interface EmbeddedRunConfig {
  prompt: string;
  cwd: string;
  workspaceDir?: string;
  workingDir?: string; // Alias for workspaceDir
  mode?: "plan" | "build";
  extensions?: string[]; // Extension paths (defaults to pi-config)
  useTuiSettings?: boolean; // Load model/persona from TUI config
  model?: string; // Override model
  onUpdate?: (update: any) => void;
  onBlockReply?: (reply: string) => void;
  task?: string; // Alias for prompt (compatibility)
}

export interface EmbeddedRunResult {
  text: string;
  toolCalls: any[];
  metadata: {
    duration: number;
    tokens: number;
    model?: string;
    extensions?: string[];
  };
  // Compatibility properties for gateway
  output?: string;
  stats?: {
    tokens: { total?: number; input?: number; output?: number };
    duration?: number;
  };
}

/**
 * Run agent with embedded mode (shares TUI settings)
 * 
 * Loads:
 * - Extensions from pi-config.ts
 * - Model from config (with override support)
 * - Persona from IDENTITY.md/SOUL.md
 * - Keybindings and settings
 */
export async function runEmbeddedAgent(
  config: EmbeddedRunConfig
): Promise<EmbeddedRunResult> {
  const startTime = Date.now();
  const workspaceDir = config.workspaceDir || config.cwd;

  console.log("[Embedded] Starting embedded agent run");
  console.log(`[Embedded] Workspace: ${workspaceDir}`);
  console.log(`[Embedded] Mode: ${config.mode || "default"}`);

  // Load shared settings if requested
  let extensions: string[] = config.extensions || [];
  let model: string = config.model || "";
  
  if (config.useTuiSettings !== false) {
    console.log("[Embedded] Loading TUI shared settings...");
    
    // Load extensions from pi-config
    if (piConfig.extensions && extensions.length === 0) {
      extensions = piConfig.extensions.filter((e: string) => 
        // Filter out TUI-specific extensions
        !e.includes('tui-integration') && 
        !e.includes('tui')
      );
      console.log(`[Embedded] Loaded ${extensions.length} extensions from pi-config`);
    }
    
    // Load model preference from config
    if (!model) {
      try {
        const koboldConfig = getConfigValue<string>('agents.defaults.model') ||
                process.env.KOBOLD_MODEL ||
                "ollama/kimi-k2.5:cloud";
        model = koboldConfig;
        console.log(`[Embedded] Using model from config: ${model}`);
      } catch {
        model = process.env.KOBOLD_MODEL || "ollama/kimi-k2.5:cloud";
        console.log(`[Embedded] Using default model: ${model}`);
      }
    }
    
    // Load keybindings from pi-config
    if (piConfig.keybindings) {
      console.log(`[Embedded] Loaded ${Object.keys(piConfig.keybindings).length} keybindings`);
    }
  } else {
    console.log("[Embedded] Using standalone mode (no TUI settings)");
    model = config.model || process.env.KOBOLD_MODEL || "ollama/kimi-k2.5:cloud";
  }

  // 1. Ensure bootstrap files exist (checks global ~/.0xkobold/ first)
  await ensureDefaultBootstrap(workspaceDir);

  // 2. Load bootstrap files (SOUL.md, IDENTITY.md, etc.)
  const bootstrapFiles = await loadBootstrapFiles(workspaceDir);
  console.log(`[Embedded] Loaded ${bootstrapFiles.filter(f => f.exists).length} bootstrap files`);

  // 3. Build custom system prompt with persona context
  const systemPrompt = buildSystemPrompt({
    basePrompt: undefined,
    bootstrapFiles,
    workspace: workspaceDir,
    mode: config.mode,
    tools: [],
  });

  console.log(`[Embedded] System prompt: ${systemPrompt.length} chars`);

  // 4. Try to integrate with pi-coding-agent SDK
  try {
    const { createAgentSession } = await import('@mariozechner/pi-coding-agent').catch(() => ({ createAgentSession: null }));
    
    if (createAgentSession) {
      console.log('[Embedded] Using pi-coding-agent SDK');
      
      // Create agent session with shared settings
      const { session } = await createAgentSession({
        cwd: config.cwd,
        systemPrompt: systemPrompt,
        extensions: extensions.length > 0 ? extensions : undefined,
        model: model, // Pass model preference
        settings: {
          ...piConfig.settings,
          '0xkobold.embedded': true,
          '0xkobold.mode': config.mode || 'default',
        },
      });
      
      // Run the prompt
      const maxIterations = config.mode === 'build' ? 30 : 15;
      const result = await session.prompt(config.prompt, maxIterations);
      
      const duration = Date.now() - startTime;
      
      return {
        text: result || 'No response',
        toolCalls: [],
        metadata: {
          duration,
          tokens: systemPrompt.length / 4,
          model,
          extensions: extensions.length > 0 ? extensions : undefined,
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
            .join("\n") +
          (model ? `\n\nModel: ${model}` : '') +
          (extensions.length > 0 ? `\nExtensions: ${extensions.length}` : ''),
    toolCalls: [],
    metadata: {
      duration: Date.now() - startTime,
      tokens: systemPrompt.length / 4,
      model,
      extensions: extensions.length > 0 ? extensions : undefined,
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
