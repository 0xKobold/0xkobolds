/**
 * Spawn Agent Tool - v1.0
 * 
 * Now uses ephemeral agent system for actual spawning.
 * Based on OpenClaw/Hermes patterns.
 * 
 * Changes from v0.3.0:
 * - Uses runEmbeddedAgent for actual execution
 * - Isolated workspaces per sub-agent
 * - TTL-based cleanup
 * - Structured results with tokens/duration
 */

import { getAgentType, AgentType } from "../types/index.js";

import { trackAgentSpawn, trackAgentComplete } from "../../telemetry/integration";
import { spawnEphemeral, ephemeralRegistry } from "../../ephemeral-agents/index.js";

export interface SpawnAgentParams {
  task: string;
  agentType?: string;
  autoRoute?: boolean;
  context?: string;
  priority?: "low" | "normal" | "high";
  maxIterations?: number;
  model?: string;
  parentRunId?: string;
  extraSystemPrompt?: string;
  sessionKey?: string;
  // Ephemeral options
  ephemeral?: boolean;
  timeoutMs?: number;
}

export interface SpawnAgentResult {
  success: boolean;
  agentId: string;
  agentType: AgentType;
  task: string;
  systemPrompt?: string;
  maxIterations: number;

  error?: string;
  runId?: string;
  // Ephemeral results
  result?: string;
  durationMs?: number;
  tokens?: { input: number; output: number; total: number };
}

/**
 * Auto-route task to best agent type
 */
function autoRouteTask(task: string): AgentType {
  // Simple heuristic routing
  const t = task.toLowerCase();
  
  if (t.includes('research') || t.includes('find') || t.includes('search')) {
    return getAgentType('researcher');
  }
  if (t.includes('review') || t.includes('check') || t.includes('validate')) {
    return getAgentType('reviewer');
  }
  if (t.includes('plan') || t.includes('coordinate') || t.includes('organize')) {
    return getAgentType('coordinator');
  }
  if (t.includes('expert') || t.includes('optimize') || t.includes('architecture')) {
    return getAgentType('specialist');
  }
  
  return getAgentType('worker');
}

/**
 * Spawn a sub-agent (now actually works!)
 */
export async function spawnAgent(params: SpawnAgentParams): Promise<SpawnAgentResult> {
  const startTime = Date.now();
  
  // Determine agent type
  const agentType = params.autoRoute !== false
    ? autoRouteTask(params.task)
    : (params.agentType ? getAgentType(params.agentType) : getAgentType('worker'));

  console.log(`[SpawnAgent] Spawning ${agentType.name} (ephemeral: ${params.ephemeral !== false})`);
  console.log(`[SpawnAgent] Task: ${params.task.slice(0, 100)}...`);

  // Track spawn
  const runId = crypto.randomUUID();
  trackAgentSpawn(runId, agentType.id);

  // Check if ephemeral spawning is requested
  if (params.ephemeral !== false) {
    try {
      const result = await spawnEphemeral({
        task: params.task,
        agentType: agentType.id,
        model: params.model,
        timeoutMs: params.timeoutMs || 5 * 60 * 1000,
        parentId: params.parentRunId,
        extraSystemPrompt: params.extraSystemPrompt,
      });

      const durationMs = Date.now() - startTime;

      if (result.success) {
        trackAgentComplete(runId, durationMs, true);
      } else {
        trackAgentComplete(runId, durationMs, false);
      }

      return {
        success: result.success,
        agentId: runId,
        agentType,
        task: params.task,
        result: result.text,
        durationMs,
        tokens: result.tokens,
        maxIterations: params.maxIterations || 100,
        runId,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      trackAgentComplete(runId, durationMs, false);
      
      return {
        success: false,
        agentId: runId,
        agentType,
        task: params.task,
        error: errorMessage,
        durationMs,
        maxIterations: params.maxIterations || 100,
        runId,
      };
    }
  }

  // Legacy mode (non-ephemeral) - just return config
  return {
    success: true,
    agentId: runId,
    agentType,
    task: params.task,
    maxIterations: params.maxIterations || 100,
    runId,
  };
}

/**
 * Spawn multiple agents in parallel
 */
export async function spawnAgents(
  tasks: Array<{ task: string; agentType?: string }>
): Promise<SpawnAgentResult[]> {
  const results = await Promise.all(
    tasks.map(t => spawnAgent({
      task: t.task,
      agentType: t.agentType,
      autoRoute: !t.agentType,
    }))
  );
  
  return results;
}

/**
 * Fan-out pattern: spawn multiple, collect results
 */
export async function spawnFanOut(
  tasks: string[],
  agentType: string = 'worker',
  maxConcurrent: number = 4
): Promise<{ success: number; failed: number; results: SpawnAgentResult[] }> {
  const { spawnEphemeralFanOut } = await import('../../ephemeral-agents/index.js');
  
  const ephemeralResults = await spawnEphemeralFanOut(tasks, agentType, maxConcurrent);
  
  const spawnResults: SpawnAgentResult[] = ephemeralResults.map((r, i) => ({
    success: r.success,
    agentId: crypto.randomUUID(),
    agentType: getAgentType(agentType),
    task: tasks[i],
    result: r.text,
    durationMs: r.durationMs,
    tokens: r.tokens,
    maxIterations: 100,
  }));

  return {
    success: ephemeralResults.filter(r => r.success).length,
    failed: ephemeralResults.filter(r => !r.success).length,
    results: spawnResults,
  };
}

/**
 * Get spawn agent tool definition
 */
export function getSpawnAgentToolConfig() {
  return {
    name: "spawn_agent",
    description: `Spawn a sub-agent to handle a task.

Uses ephemeral agents with isolated workspaces:
- Each agent gets its own /tmp/0xkobold/ephemeral/<uuid>/ workspace
- No context pollution - fresh start for each agent
- Auto-cleanup after completion (30min TTL)
- Returns actual results, not just configs

Agent types:
- worker: Implement and execute tasks
- researcher: Research and gather information
- reviewer: Review and validate work
- specialist: Deep domain expertise
- coordinator: Plan and coordinate complex tasks`,
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The task for the sub-agent. Be specific and clear.",
        },
        agentType: {
          type: "string",
          enum: ["worker", "researcher", "reviewer", "specialist", "coordinator"],
          description: "Type of agent (auto-selected if not specified)",
        },
        autoRoute: {
          type: "boolean",
          description: "Auto-select best agent type based on task",
          default: true,
        },
        model: {
          type: "string",
          description: "Model override (optional)",
        },
        timeoutMs: {
          type: "number",
          description: "Timeout in milliseconds (default: 300000 = 5 min)",
          default: 300000,
        },
        ephemeral: {
          type: "boolean",
          description: "Use ephemeral agent (default: true)",
          default: true,
        },
      },
      required: ["task"],
    },
  };
}

/**
 * Execute spawn agent tool (for agent tool calling)
 */
export async function executeSpawnAgent(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await spawnAgent({
    task: args.task as string,
    agentType: args.agentType as string | undefined,
    autoRoute: args.autoRoute !== false,
    model: args.model as string | undefined,
    timeoutMs: args.timeoutMs as number | undefined,
    ephemeral: args.ephemeral !== false,
  });

  if (!result.success) {
    return {
      success: false,
      content: [{ type: 'text' as const, text: `Failed: ${result.error}` }],
    };
  }

  return {
    success: true,
    content: [{ type: 'text' as const, text: result.result || 'Agent completed' }],
    metadata: {
      agentType: result.agentType.id,
      durationMs: result.durationMs,
      tokens: result.tokens,
    },
  };
}
