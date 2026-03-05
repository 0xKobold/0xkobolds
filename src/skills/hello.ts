/**
 * Example Skill: Hello
 *
 * Demonstrates the hot-reload skill system.
 */

import type { Skill } from './types';

export const helloSkill: Skill = {
  name: 'hello',
  description: 'Say hello to someone. Use this to greet users.',
  risk: 'safe',

  toolDefinition: {
    type: 'function',
    function: {
      name: 'hello',
      description: 'Say hello to someone by name',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the person to greet',
          },
          enthusiasm: {
            type: 'number',
            description: 'Enthusiasm level 1-10 (default: 5)',
          },
        },
        required: ['name'],
      },
    },
  },

  async execute(args: Record<string, unknown>) {
    const name = args.name as string;
    const enthusiasm = (args.enthusiasm as number | undefined) ?? 5;

    const exclamation = '!'.repeat(Math.min(enthusiasm, 10));

    return {
      greeting: `Hello, ${name}${exclamation}`,
      timestamp: new Date().toISOString(),
    };
  },
};

export default helloSkill;
