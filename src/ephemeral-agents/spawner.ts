/**
 * Ephemeral Agent Spawner - v2.0
 * 
 * Uses 0xKobold's LLM Router for consistent provider/model selection.
 * This ensures ephemeral agents use the same provider as the main agent (Ollama, Anthropic, Google, etc.)
 */

import { randomUUID } from 'node:crypto';
import { runEmbeddedAgent } from '../agent/index.js';
import { ephemeralRegistry } from './registry.js';
import { createWorkspace } from './workspace.js';
import type { EphemeralResult, TokenMetrics } from './types.js';

export interface SpawnParams {
  task: string;
  agentType?: string;
  model?: string;
  timeoutMs?: number;
  parentId?: string;
  provider?: string;
}

/**
 * Spawn an ephemeral agent using 0xKobold's LLM Router
 * This ensures same provider/model as the main agent
 */
export async function spawnEphemeral(
  params: SpawnParams
): Promise<EphemeralResult> {
  const startTime = Date.now();
  const agentId = randomUUID();
  
  // Create isolated workspace
  const workspace = await createWorkspace(agentId);
  
  // Register agent in ephemeral registry
  let agent;
  try {
    agent = ephemeralRegistry.create({
      type: params.agentType || 'worker',
      task: params.task,
      workspace: workspace.path,
      parentId: params.parentId,
      ttlMs: params.timeoutMs,
    });
    agent.id = agentId;
  } catch (error) {
    await workspace.cleanup();
    throw error;
  }

  ephemeralRegistry.start(agentId);

  console.log(`[Ephemeral] Spawning ${agent.type} agent ${agentId.slice(0, 8)}`);
  console.log(`[Ephemeral] Workspace: ${workspace.path}`);
  console.log(`[Ephemeral] Using 0xKobold LLM Router (same provider as main agent)`);
  console.log(`[Ephemeral] Task: ${params.task.slice(0, 50)}...`);

  try {
    // Use runEmbeddedAgent which uses 0xKobold's LLM Router
    // This ensures same provider/model config as main agent
    const result = await runEmbeddedAgent({
      prompt: params.task,
      cwd: workspace.path,
      extensions: [],
      model: params.model,
    });

    const durationMs = Date.now() - startTime;
    
    // Convert stats to TokenMetrics format
    const tokens: TokenMetrics = {
      input: result.stats?.tokens?.input || 0,
      output: result.stats?.tokens?.output || 0,
      total: result.stats?.tokens?.total || result.metadata?.tokens || 0,
    };
    
    const ephemeralResult: EphemeralResult = {
      success: true,
      text: result.output || result.text || 'Completed',
      tokens,
      durationMs,
      status: 'completed',
    };

    ephemeralRegistry.complete(agentId, ephemeralResult);
    console.log(`[Ephemeral] Completed in ${durationMs}ms (${tokens.total} tokens)`);

    // Cleanup workspace after delay
    setTimeout(() => {
      workspace.cleanup().catch(() => {});
    }, 5000);

    return ephemeralResult;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    console.error(`[Ephemeral] Failed:`, errorMessage);

    const result: EphemeralResult = {
      success: false,
      text: errorMessage,
      durationMs,
      status: 'failed',
    };

    ephemeralRegistry.fail(agentId, errorMessage);
    workspace.cleanup().catch(() => {});

    return result;
  }
}

/**
 * Spawn multiple ephemeral agents in parallel (fan-out pattern)
 */
export async function spawnEphemeralFanOut(
  tasks: string[],
  agentType: string = 'worker',
  maxConcurrent: number = 4
): Promise<EphemeralResult[]> {
  console.log(`[Ephemeral] Fan-out: ${tasks.length} tasks, max ${maxConcurrent} concurrent`);

  const results: EphemeralResult[] = [];
  
  for (let i = 0; i < tasks.length; i += maxConcurrent) {
    const batch = tasks.slice(i, i + maxConcurrent);
    
    const batchResults = await Promise.all(
      batch.map(task => spawnEphemeral({ task, agentType }))
    );

    results.push(...batchResults);

    if (i + maxConcurrent < tasks.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const successful = results.filter(r => r.success).length;
  console.log(`[Ephemeral] Fan-out complete: ${successful}/${tasks.length} succeeded`);

  return results;
}

/**
 * Spawn with timeout wrapper
 */
export async function spawnEphemeralWithTimeout(
  params: SpawnParams,
  timeoutMs: number
): Promise<EphemeralResult> {
  return Promise.race([
    spawnEphemeral({ ...params, timeoutMs }),
    new Promise<EphemeralResult>((_, reject) =>
      setTimeout(() => reject(new Error('Spawn timeout')), timeoutMs)
    ),
  ]);
}
