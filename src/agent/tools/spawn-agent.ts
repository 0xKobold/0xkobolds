/**
 * Spawn Agent Tool - v0.3.0
 *
 * Spawns a subagent of a specific type with appropriate configuration.
 * Part of the Unified Agent Orchestration system.
 * 
 * HERMES-STYLE: Subagents share instance-level identity from KOBOLD_HOME.
 * No per-agent SOUL/IDENTITY - personality overlays via /personality command.
 */

import { getAgentType, AgentType } from "../types/index.js";
import { routeTask, TaskRequest, TaskRouterResult } from "../task-router.js";
import { 
  loadInstanceFiles,
  formatBootstrapForPrompt,
  BootstrapFile 
} from "../bootstrap-loader.js";
import { trackAgentSpawn } from "../../telemetry/integration";

export interface SpawnAgentParams {
  task: string;
  agentType?: string; // "coordinator" | "specialist" | "researcher" | "worker" | "reviewer"
  autoRoute?: boolean; // If true, automatically determine agent type
  context?: string;
  priority?: "low" | "normal" | "high";
  maxIterations?: number; // Override default
  model?: string; // Override model preference
  // Gateway compatibility
  parentRunId?: string;
  extraSystemPrompt?: string;
  sessionKey?: string;
}

export interface SpawnAgentResult {
  success: boolean;
  agentId: string;
  agentType: AgentType;
  task: string;
  systemPrompt: string;
  maxIterations: number;
  routingInfo?: TaskRouterResult;
  error?: string;
  // Gateway compatibility
  runId?: string;
}

/**
 * Generate unique agent ID
 */
function generateAgentId(type: string): string {
  const timestamp = Date.now().toString(36).slice(-4);
  const random = Math.random().toString(36).slice(2, 6);
  return `${type}-${timestamp}-${random}`;
}

/**
 * Spawn a specialized agent
 */
export async function spawnAgent(params: SpawnAgentParams): Promise<SpawnAgentResult> {
  let agentType: AgentType;
  let routingInfo: TaskRouterResult | undefined;

  // Auto-route if requested or no type specified
  if (params.autoRoute || !params.agentType) {
    const taskRequest: TaskRequest = {
      task: params.task,
      context: params.context,
      priority: params.priority,
    };
    routingInfo = routeTask(taskRequest);
    agentType = routingInfo.recommendedAgent;
  } else {
    const found = getAgentType(params.agentType);
    if (!found) {
      return {
        success: false,
        agentId: "",
        agentType: getAgentType("worker")!, // fallback
        task: params.task,
        systemPrompt: "",
        maxIterations: 0,
        error: `Unknown agent type: ${params.agentType}. Valid types: coordinator, specialist, researcher, worker, reviewer`,
      };
    }
    agentType = found;
  }

  const agentId = generateAgentId(agentType.id);

  // Track agent spawn
  trackAgentSpawn(agentId, agentType.id);

  // Build system prompt with per-agent bootstrap
  let systemPrompt: string;
  try {
    const { prompt } = await buildAgentSystemPrompt(agentType, params);
    systemPrompt = prompt;
  } catch (error) {
    // Fallback to sync version if bootstrap loading fails
    console.warn(`[SpawnAgent] Bootstrap load failed, using fallback: ${error}`);
    systemPrompt = buildAgentSystemPromptSync(agentType, params);
  }

  // Override maxIterations if specified
  const maxIterations = params.maxIterations || agentType.maxIterations;

  return {
    success: true,
    agentId,
    agentType,
    task: params.task,
    systemPrompt,
    maxIterations,
    routingInfo,
  };
}

/**
 * Build system prompt for the agent (Hermes-style)
 * Loads instance-level identity (shared by all agents)
 * Plus agent-type-specific system prompt
 */
async function buildAgentSystemPrompt(
  agentType: AgentType, 
  params: SpawnAgentParams,
  workspaceDir?: string
): Promise<{ prompt: string; instanceFiles: BootstrapFile[] }> {
  const parts: string[] = [];
  const instanceFiles: BootstrapFile[] = [];
  
  // 1. Load instance-level identity (Hermes-style: shared by ALL agents)
  // This is SOUL.md, IDENTITY.md from KOBOLD_HOME - follows you everywhere
  try {
    const files = await loadInstanceFiles({
      homeDir: workspaceDir || process.env.KOBOLD_HOME,
    });
    instanceFiles.push(...files.filter(f => f.exists && !f.blocked));
  } catch (error) {
    console.warn(`[SpawnAgent] Could not load instance files: ${error}`);
  }
  
  // 2. Agent type definition (specific to this agent type)
  parts.push(`<!-- Agent Type Definition -->`);
  parts.push(`${agentType.systemPrompt}`);
  
  // 3. Instance-level identity (format directly, Hermes style)
  if (instanceFiles.length > 0) {
    parts.push("");
    for (const file of instanceFiles) {
      parts.push(file.content);
    }
  }

  // 4. Task context
  if (params.context) {
    parts.push("");
    parts.push(`<!-- Task Context -->`);
    parts.push(`Additional context: ${params.context}`);
  }

  // 5. Priority
  if (params.priority) {
    parts.push("");
    parts.push(`<!-- Priority -->`);
    parts.push(`Priority: ${params.priority.toUpperCase()}`);
  }

  // 6. Capabilities
  parts.push("");
  parts.push(`<!-- Your Capabilities -->`);
  parts.push(agentType.capabilities.map(c => `- ${c}`).join("\n"));

  // 7. Available tools
  parts.push("");
  parts.push(`<!-- Available Tools -->`);
  parts.push(agentType.tools.map(t => `- ${t}`).join("\n"));

  return {
    prompt: parts.join("\n\n"),
    instanceFiles,
  };
}

/**
 * Build system prompt synchronously (for backwards compatibility)
 */
function buildAgentSystemPromptSync(agentType: AgentType, params: SpawnAgentParams): string {
  const parts: string[] = [];

  // Agent identity
  parts.push(`${agentType.systemPrompt}`);

  // Task context
  if (params.context) {
    parts.push("");
    parts.push(`<!-- Task Context -->`);
    parts.push(`Additional context: ${params.context}`);
  }

  // Priority
  if (params.priority) {
    parts.push("");
    parts.push(`<!-- Priority -->`);
    parts.push(`Priority: ${params.priority.toUpperCase()}`);
  }

  // Capabilities reminder
  parts.push("");
  parts.push(`<!-- Your Capabilities -->`);
  parts.push(agentType.capabilities.map(c => `- ${c}`).join("\n"));

  // Available tools
  parts.push("");
  parts.push(`<!-- Available Tools -->`);
  parts.push(agentType.tools.map(t => `- ${t}`).join("\n"));

  return parts.join("\n\n");
}

/**
 * Spawn multiple agents in parallel
 */
export async function spawnAgents(
  tasks: Array<{ task: string; agentType?: string; context?: string }
>
): Promise<SpawnAgentResult[]> {
  const promises = tasks.map((t) =>
    spawnAgent({
      task: t.task,
      agentType: t.agentType,
      context: t.context,
      autoRoute: !t.agentType,
    })
  );

  const results = await Promise.all(promises);
  
  // Track each successful spawn
  for (const result of results) {
    if (result.success) {
      trackAgentSpawn(result.agentId, result.agentType.id);
    }
  }

  return results;
}

/**
 * Get agent spawn configuration for tool registration
 */
export function getSpawnAgentToolConfig() {
  return {
    name: "spawn_agent",
    description: `Spawn a specialized subagent to handle a task.

This tool creates a subagent of a specific type:
- coordinator (🎯): Plans and delegates complex tasks
- specialist (🧠): Deep domain expertise
- researcher (🔍): Gathers information and synthesizes findings  
- worker (⚒️): Implements code and executes tasks
- reviewer (👁️): Reviews code and validates quality

Use autoRoute: true to let the system choose the best agent type.`,
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The task to assign to the subagent. Be specific and clear.",
        },
        agentType: {
          type: "string",
          enum: ["coordinator", "specialist", "researcher", "worker", "reviewer"],
          description: "Type of agent to spawn. Use autoRoute: true to let system choose.",
        },
        autoRoute: {
          type: "boolean",
          description: "If true, automatically determine best agent type",
          default: true,
        },
        context: {
          type: "string",
          description: "Additional context for the agent",
        },
        priority: {
          type: "string",
          enum: ["low", "normal", "high"],
          default: "normal",
        },
      },
      required: ["task"],
    },
  };
}

/**
 * Spawn agent tool for ExtensionAPI
 */
export async function executeSpawnAgent(args: Record<string, unknown>) {
  const result = await spawnAgent({
    task: args.task as string,
    agentType: args.agentType as string | undefined,
    autoRoute: (args.autoRoute as boolean) ?? true,
    context: args.context as string | undefined,
    priority: (args.priority as "low" | "normal" | "high") ?? "normal",
    maxIterations: args.maxIterations as number | undefined,
    model: args.model as string | undefined,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      content: [
        {
          type: "text",
          text: `Failed to spawn agent: ${result.error}`,
        },
      ],
      details: { error: result.error },
    };
  }

  const routingText = result.routingInfo
    ? `\n\nAuto-routing analysis:\n${result.routingInfo.reasoning}\n\nConfidence: ${
        Math.round(result.routingInfo.confidence * 100)
      }%\n\nAlternative agents: ${result.routingInfo.alternativeAgents
        .map((a) => `${a.emoji} ${a.name}`)
        .join(", ") || "none"}`
    : "";

  return {
    success: true,
    content: [
      {
        type: "text",
        text: `Spawned ${result.agentType.emoji} ${result.agentType.name}\n\nID: ${result.agentId}\nTask: ${result.task}\nMax iterations: ${result.maxIterations}${routingText}`,
      },
    ],
    details: {
      agentId: result.agentId,
      agentType: result.agentType.id,
      task: result.task,
      systemPrompt: result.systemPrompt,
      maxIterations: result.maxIterations,
      routingInfo: result.routingInfo,
    },
  };
}
