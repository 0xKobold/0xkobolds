/**
 * Tool Adapter
 *
 * Converts our Skill format to Pi Agent Core tool format.
 */

import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Skill } from '../skills/types';
import type { ApprovalQueue } from '../approval/queue';

/**
 * Convert a Skill to a Pi Agent Tool
 */
export function skillToTool(skill: Skill, approvalQueue: ApprovalQueue): AgentTool {
  return {
    name: skill.name,
    description: skill.description,
    label: skill.name,
    parameters: skill.toolDefinition.function.parameters as any,

    async execute(toolCallId: string, args: any, signal?: AbortSignal) {
      // Check approval for risky skills
      if (skill.risk !== 'safe') {
        const approved = await approvalQueue.request({
          skill: skill.name,
          description: skill.description,
          args,
          risk: skill.risk,
        });

        if (!approved) {
          return {
            content: [],
            details: {
              error: 'User denied execution',
              denied: true,
            },
          };
        }
      }

      // Execute the skill
      const result = await skill.execute(args);

      return {
        content: [],
        details: result,
      };
    },
  };
}

/**
 * Create subagent spawn tool
 */
export function createSubagentTool(
  spawnFn: (task: string, parentId: string) => Promise<{ agentId: string; result: string }>
): Skill {
  return {
    name: 'spawn_subagent',
    description: 'Spawn a subagent to handle a specific task. Use this for parallel work or delegation.',
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
              description: 'The task to assign to the subagent',
            },
            model: {
              type: 'string',
              description: 'Optional: specific model to use (e.g., "ollama/llama3.2:3b")',
            },
            context: {
              type: 'string',
              description: 'Optional: additional context to pass to the subagent',
            },
          },
          required: ['task'],
        },
      },
    },

    async execute(args: Record<string, unknown>) {
      const task = args.task as string;
      const result = await spawnFn(task, 'parent'); // parentId will be injected by agent
      return {
        subagentId: result.agentId,
        result: result.result,
      };
    },
  };
}
