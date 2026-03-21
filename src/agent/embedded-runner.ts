/**
 * Embedded Agent Runner - v0.4.0
 * 
 * Wraps pi-coding-agent with full TUI settings sharing.
 * Shares: extensions, model config, persona from IDENTITY.md/SOUL.md
 * 
 * HERMES-STYLE: Loads instance identity from KOBOLD_HOME only
 */

import { loadBootstrap, ensureDefaultFiles, loadInstanceFiles } from "./bootstrap-loader.js";
import { buildSystemPromptAsync, createSystemPromptOverride } from "./system-prompt.js";
import { config as piConfig } from "../pi-config.js";
import { loadConfig, getConfigValue } from "../config/loader.js";
import { chat } from "../llm/multi-provider.js";
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
  extraSystemPrompt?: string; // Additional system prompt for subagents
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

  // 1. Ensure default files exist (creates SOUL.md if missing)
  const homeDir = process.env.KOBOLD_HOME || path.join(homedir(), ".0xkobold");
  await ensureDefaultFiles({ homeDir });

  // 2. Load instance identity (Hermes-style: from KOBOLD_HOME only)
  const { instanceFiles, projectFiles } = await loadBootstrap({
    homeDir,
    workingDir: workspaceDir,
  });
  console.log(`[Embedded] Loaded ${instanceFiles.filter(f => f.exists).length} instance files`);
  console.log(`[Embedded] Loaded ${projectFiles.filter(f => f.exists).length} project files`);

  // 3. Build custom system prompt with persona context
  const systemPrompt = await buildSystemPromptAsync({
    instanceFiles,
    projectFiles,
    workspace: workspaceDir,
    mode: config.mode,
    tools: [],
    extraSystemPrompt: config.extraSystemPrompt,
  });

  console.log(`[Embedded] System prompt: ${systemPrompt.length} chars`);

  // 4. Use model router for chat completion
  try {
    console.log('[Embedded] Using model router');
    
    // Determine model to use - default to Ollama with a locally available model
    const modelToUse = model || 'ollama/minimax-m2.7:cloud';
    console.log(`[Embedded] Model: ${modelToUse}`);
    
    // Call the router
    const response = await chat({
      model: modelToUse,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: config.prompt }
      ],
      temperature: 0.7,
    });
    
    const duration = Date.now() - startTime;
    const result = response.content || 'No response';
    
    console.log(`[Embedded] Response received in ${duration}ms`);
    
    return {
      text: result,
      toolCalls: [],
      metadata: {
        duration,
        tokens: response.usage?.totalTokens || systemPrompt.length / 4,
        model: modelToUse,
        extensions: extensions.length > 0 ? extensions : undefined,
      },
      // Gateway compatibility
      output: result,
      stats: {
        tokens: { 
          total: response.usage?.totalTokens || Math.floor(systemPrompt.length / 4),
          input: response.usage?.inputTokens,
          output: response.usage?.outputTokens,
        },
        duration,
      },
    };
  } catch (routerError: any) { console.error("[Embedded] Router error details:", routerError);
    console.log('[Embedded] Router failed, falling back to simulation:', (routerError as Error).message);
  }

  // Fallback: Simulate the structure
  console.log('[Embedded] Running in simulation mode (SDK not available)');
  const simulatedResult: EmbeddedRunResult = {
    text: `[Embedded mode simulation]\n\n` +
          `Instance identity loaded:\n` +
          instanceFiles
            .filter(f => f.exists)
            .map(f => `- ${f.name} (${f.size} chars)`)
            .join("\n") +
          (projectFiles.length > 0 
            ? `\n\nProject context:\n` + projectFiles.filter(f => f.exists).map(f => `- ${f.name}`).join("\n")
            : '') +
          (model ? `\n\nModel: ${model}` : '') +
          (extensions.length > 0 ? `\nExtensions: ${extensions.length}` : ''),
    toolCalls: [],
    metadata: {
      duration: Date.now() - startTime,
      tokens: systemPrompt.length / 4,
      model,
      extensions: extensions.length > 0 ? extensions : undefined,
    },
    // Gateway compatibility
    output: `[Embedded mode simulation]`,
    stats: {
      tokens: { total: Math.floor(systemPrompt.length / 4) },
      duration: Date.now() - startTime,
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
  const homeDir = process.env.KOBOLD_HOME || path.join(homedir(), ".0xkobold");
  await ensureDefaultFiles({ homeDir });
  console.log("[Embedded] Initialized with default identity files");
}
