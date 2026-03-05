/**
 * Subagent Skill
 *
 * Built-in skill for spawning subagents.
 * This allows agents to delegate work to child agents.
 */

import type { Skill } from '../types';

export const subagentSkill: Skill = {
  name: 'spawn_subagent',
  description: `Spawn a subagent to handle a specific task in parallel.

Use this when you need to:
- Delegate work to a specialized agent
- Run multiple tasks in parallel
- Isolate a complex subtask
- Scale work across multiple agents

The subagent will have the same capabilities and tools as you,
but will be isolated in its own session. When the subagent completes,
you'll receive its result.`,

  risk: 'medium',

  toolDefinition: {
    type: 'function',
    function: {
      name: 'spawn_subagent',
      description: 'Spawn a subagent to handle a specific task',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The task to assign to the subagent. Be specific and clear.',
          },
          model: {
            type: 'string',
            description: 'Optional: Model to use (e.g., "fast" for quick tasks, "smart" for complex reasoning). Defaults to same model.',
          },
          maxIterations: {
            type: 'number',
            description: 'Optional: Maximum iterations for the subagent. Default: 10',
          },
        },
        required: ['task'],
      },
    },
  },

  async execute(args: Record<string, unknown>) {
    const task = args.task as string;
    const model = args.model as string | undefined;
    const maxIterations = args.maxIterations as number | undefined;

    // This will be handled by the agent system
    // The actual implementation is in pi-adapter.ts
    return {
      spawnRequested: true,
      task,
      model,
      maxIterations,
      message: 'Subagent spawn requested. This should be handled by the agent runner.',
    };
  },
};

export default subagentSkill;
