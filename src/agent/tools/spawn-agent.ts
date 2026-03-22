/**
 * Spawn Agent Tool - Delegates to Ephemeral Agent System
 * 
 * Provides spawning of ephemeral sub-agents with full tool execution
 * via the pi CLI RPC protocol.
 */

import { spawnEphemeral, spawnEphemeralFanOut } from '../../ephemeral-agents/spawner.js';

export const SpawnAgentParams = {
  task: String,
  agentType: String,
  model: String,
  timeoutMs: Number,
  // Gateway-specific fields
  extraSystemPrompt: String,
  parentRunId: String,
  sessionKey: String,
  // Real-workers specific
  autoRoute: Boolean,
};

export type SpawnAgentParams = {
  task: string;
  agentType?: string;
  model?: string;
  timeoutMs?: number;
  extraSystemPrompt?: string;
  parentRunId?: string;
  sessionKey?: string;
  autoRoute?: boolean;
};

export interface SpawnAgentResult {
  agentId: string;
  agentType?: string;
  success: boolean;
  text: string;
  error?: string;
  runId?: string;
  tokens: { input: number; output: number; total: number };
  durationMs: number;
  status: 'running' | 'completed' | 'failed';
}

export interface SpawnAgentsParams {
  tasks: string[];
  agentType?: string;
  maxConcurrent?: number;
}

/**
 * Spawn a single ephemeral agent
 */
export async function spawnAgent(params: SpawnAgentParams): Promise<SpawnAgentResult> {
  const startTime = Date.now();
  const agentId = 'eph-' + Math.random().toString(36).slice(2, 10);

  // Build task with system prompt if provided
  let task = params.task;
  if (params.extraSystemPrompt) {
    task = `${params.extraSystemPrompt}\n\nTask: ${params.task}`;
  }

  const result = await spawnEphemeral({
    task,
    agentType: params.agentType,
    model: params.model,
    timeoutMs: params.timeoutMs,
    parentId: params.parentRunId,
  });

  return {
    agentId,
    agentType: params.agentType,
    success: result.success,
    text: result.text,
    runId: agentId,
    tokens: result.tokens,
    durationMs: result.durationMs,
    status: result.status === 'completed' ? 'completed' : result.status === 'failed' ? 'failed' : 'running',
  };
}

/**
 * Spawn multiple ephemeral agents in parallel
 */
export async function spawnAgents(params: SpawnAgentsParams): Promise<{
  results: SpawnAgentResult[];
  totalDurationMs: number;
}> {
  const startTime = Date.now();

  const results = await spawnEphemeralFanOut(
    params.tasks,
    params.agentType || 'worker',
    params.maxConcurrent || 4
  );

  return {
    results: results.map((r, i) => ({
      agentId: `eph-${i}`,
      success: r.success,
      text: r.text,
      tokens: r.tokens,
      durationMs: r.durationMs,
      status: r.status === 'completed' ? 'completed' : r.status === 'failed' ? 'failed' : 'running',
    })),
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Get spawn agent tool configuration for AI SDK
 */
export function getSpawnAgentToolConfig() {
  return {
    description: 'Spawn an ephemeral sub-agent to execute a task with full tool execution.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task to execute' },
        agentType: { type: 'string', description: 'Type of agent' },
        model: { type: 'string', description: 'Model to use' },
        timeoutMs: { type: 'number', description: 'Timeout in ms' },
      },
      required: ['task'],
    },
  };
}

/**
 * Execute spawn agent tool
 */
export async function executeSpawnAgent(params: SpawnAgentParams): Promise<string> {
  const result = await spawnAgent(params);
  
  if (result.success) {
    return `✅ Agent completed in ${result.durationMs}ms\n\n${result.text}`;
  } else {
    return `❌ Agent failed: ${result.text}`;
  }
}

// CLI interface
export async function main(args: string[]) {
  const task = args[0] || 'What is 2+2?';
  
  console.log(`Spawning ephemeral agent for: ${task.slice(0, 50)}...`);
  
  const result = await spawnAgent({ task });
  
  console.log('\n=== Result ===');
  console.log(`Status: ${result.success ? '✅' : '❌'} ${result.status}`);
  console.log(`Duration: ${result.durationMs}ms`);
  console.log(`\n${result.text}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(console.error);
}
