/**
 * Ephemeral Agent Spawner
 * 
 * Spawns sub-agents using runEmbeddedAgent.
 * Pattern: OpenClaw/Hermes - spawn → work → report → die
 */

import { randomUUID } from 'node:crypto';
import { ephemeralRegistry } from './registry.js';
import { createWorkspace, cleanupWorkspace } from './workspace.js';
import { runEmbeddedAgent } from '../agent/embedded-runner.js';
import type { SpawnEphemeralParams, EphemeralResult, EphemeralAgent } from './types.js';

/**
 * Spawn an ephemeral sub-agent
 * 
 * 1. Create isolated workspace
 * 2. Run embedded agent in workspace
 * 3. Track in registry
 * 4. Return structured result
 * 5. Schedule workspace cleanup
 */
export async function spawnEphemeral(
  params: SpawnEphemeralParams
): Promise<EphemeralResult> {
  const startTime = Date.now();
  const agentId = randomUUID();
  
  // Create workspace
  const workspace = await createWorkspace(agentId);
  
  // Create agent in registry
  let agent: EphemeralAgent;
  try {
    agent = ephemeralRegistry.create({
      type: params.agentType || 'worker',
      task: params.task,
      workspace: workspace.path,
      parentId: params.parentId,
      ttlMs: params.timeoutMs,
    });
    agent.id = agentId; // Use our ID
  } catch (error) {
    await workspace.cleanup();
    throw error;
  }

  // Mark as running
  ephemeralRegistry.start(agentId);

  console.log(`[Ephemeral] Spawning ${agent.type} agent ${agentId.slice(0, 8)}`);
  console.log(`[Ephemeral] Task: ${params.task.slice(0, 100)}...`);
  console.log(`[Ephemeral] Workspace: ${workspace.path}`);

  try {
    // Run embedded agent
    const runResult = await runEmbeddedAgent({
      prompt: params.task,
      cwd: workspace.path,
      workspaceDir: workspace.path,
      model: params.model,
      extraSystemPrompt: params.extraSystemPrompt,
      mode: 'build',
    });

    const durationMs = Date.now() - startTime;

    // Extract tokens from result
    const tokens = runResult.stats?.tokens || {
      input: 0,
      output: 0,
      total: runResult.metadata.tokens || 0,
    };

    const result: EphemeralResult = {
      success: true,
      text: runResult.text || runResult.output || 'No output',
      tokens: {
        input: tokens.input || 0,
        output: tokens.output || 0,
        total: tokens.total || 0,
      },
      durationMs,
      status: 'completed',
    };

    // Complete in registry
    ephemeralRegistry.complete(agentId, result);

    console.log(`[Ephemeral] Agent ${agentId.slice(0, 8)} completed in ${durationMs}ms`);
    console.log(`[Ephemeral] Output: ${result.text.slice(0, 100)}...`);

    // Schedule workspace cleanup (don't wait)
    setTimeout(async () => {
      await workspace.cleanup();
    }, 5000);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    console.error(`[Ephemeral] Agent ${agentId.slice(0, 8)} failed:`, errorMessage);

    const result: EphemeralResult = {
      success: false,
      text: errorMessage,
      durationMs,
      status: 'failed',
    };

    ephemeralRegistry.fail(agentId, errorMessage);

    // Cleanup workspace
    await workspace.cleanup();

    return result;
  }
}

/**
 * Spawn multiple ephemeral agents in parallel (fan-out pattern)
 * 
 * Like OpenClaw's parallel spawning.
 */
export async function spawnEphemeralFanOut(
  tasks: string[],
  agentType: string = 'worker',
  maxConcurrent: number = 4
): Promise<EphemeralResult[]> {
  console.log(`[Ephemeral] Fan-out: ${tasks.length} tasks, max ${maxConcurrent} concurrent`);

  const results: EphemeralResult[] = [];
  
  // Process in batches
  for (let i = 0; i < tasks.length; i += maxConcurrent) {
    const batch = tasks.slice(i, i + maxConcurrent);
    console.log(`[Ephemeral] Batch ${Math.floor(i / maxConcurrent) + 1}: tasks ${i + 1}-${i + batch.length}`);

    const batchResults = await Promise.all(
      batch.map(task => spawnEphemeral({ task, agentType }))
    );

    results.push(...batchResults);

    // Small delay between batches to avoid rate limits
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
  params: SpawnEphemeralParams,
  timeoutMs: number
): Promise<EphemeralResult> {
  return Promise.race([
    spawnEphemeral(params),
    new Promise<EphemeralResult>((_, reject) =>
      setTimeout(() => reject(new Error('Spawn timeout')), timeoutMs)
    ),
  ]);
}
