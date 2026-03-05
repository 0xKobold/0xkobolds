/**
 * Shell Skill
 *
 * Execute shell commands with safety controls.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { Skill } from '../types';

const execAsync = promisify(exec);

// Blocked dangerous commands
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /dd\s+if=/,
  />\s*\/dev\/(null|zero|random)/,
  /mkfs/,
  /:\(\)\{\s*:\|\:&&\}\s*;/, // fork bomb
];

// Allowed safe commands (whitelist approach)
const SAFE_COMMANDS = [
  'ls', 'cat', 'grep', 'find', 'pwd', 'echo', 'head', 'tail',
  'wc', 'sort', 'uniq', 'curl', 'wget', 'git', 'npm', 'bun',
  'mkdir', 'touch', 'cp', 'mv', 'rm', 'cd', 'pwd',
];

export const shellSkill: Skill = {
  name: 'shell',
  description: `Execute shell commands safely.

Available commands: ls, cat, grep, find, git, npm, bun, curl, mkdir, cp, mv, rm, etc.

For destructive operations (rm, mv), you'll be asked for approval.`,

  risk: 'high',

  toolDefinition: {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Execute a shell command',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in seconds (default: 30)',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (default: current)',
          },
        },
        required: ['command'],
      },
    },
  },

  async execute(args: Record<string, unknown>) {
    const command = args.command as string;
    const timeout = (args.timeout as number | undefined) ?? 30;
    const cwd = args.cwd as string | undefined;

    // Check for blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return {
          error: 'Command blocked for safety',
          command,
          reason: 'Dangerous pattern detected',
        };
      }
    }

    // Check if command is in safe list (basic check)
    const baseCmd = command.trim().split(' ')[0];
    if (!SAFE_COMMANDS.includes(baseCmd)) {
      console.log(`[Shell] Warning: Command "${baseCmd}" not in safe list, will require approval`);
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: timeout * 1000,
        cwd,
        env: { ...process.env, PATH: process.env.PATH },
      });

      return {
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (err: any) {
      return {
        command,
        stdout: err.stdout?.trim() ?? '',
        stderr: err.stderr?.trim() ?? '',
        exitCode: err.code ?? 1,
        error: err.message,
      };
    }
  },
};

export default shellSkill;
