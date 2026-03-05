/**
 * File Skills
 *
 * Read and write files with safety controls.
 */

import { readFile, writeFile, access, stat } from 'fs/promises';
import { join, resolve } from 'path';
import type { Skill } from '../types';

// Blocked paths (security)
const BLOCKED_PATHS = [
  '~/.ssh',
  '~/.aws',
  '~/.kube',
  '/etc/shadow',
  '/etc/passwd',
  process.env.SSH_KEY_PATH,
].filter(Boolean);

// Allowed paths (whitelist)
const ALLOWED_PATHS = [
  process.cwd(),
  '~/.0xkobold',
  '~/.openclaw',
];

function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return join(process.env.HOME ?? '', path.slice(2));
  }
  return resolve(path);
}

function isPathAllowed(path: string): boolean {
  const expanded = expandPath(path);

  // Check blocked paths
  for (const blocked of BLOCKED_PATHS) {
    if (blocked && expanded.startsWith(expandPath(blocked))) {
      return false;
    }
  }

  return true;
}

export const readFileSkill: Skill = {
  name: 'read_file',
  description: 'Read the contents of a file',
  risk: 'safe',

  toolDefinition: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file (relative or absolute)',
          },
          offset: {
            type: 'number',
            description: 'Optional: line offset to start reading',
          },
          limit: {
            type: 'number',
            description: 'Optional: maximum lines to read (default: 100)',
          },
        },
        required: ['path'],
      },
    },
  },

  async execute(args: Record<string, unknown>) {
    const path = expandPath(args.path as string);
    const offset = (args.offset as number | undefined) ?? 0;
    const limit = (args.limit as number | undefined) ?? 100;

    if (!isPathAllowed(path)) {
      return { error: 'Path not allowed for security', path };
    }

    try {
      const content = await readFile(path, 'utf-8');
      const lines = content.split('\n');
      const selected = lines.slice(offset, offset + limit);

      return {
        path,
        content: selected.join('\n'),
        totalLines: lines.length,
        returnedLines: selected.length,
      };
    } catch (err: any) {
      return { error: err.message, path };
    }
  },
};

export const writeFileSkill: Skill = {
  name: 'write_file',
  description: 'Write content to a file (creates if not exists)',
  risk: 'medium',

  toolDefinition: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file',
          },
          content: {
            type: 'string',
            description: 'Content to write',
          },
          append: {
            type: 'boolean',
            description: 'Append instead of overwrite',
          },
        },
        required: ['path', 'content'],
      },
    },
  },

  async execute(args: Record<string, unknown>) {
    const path = expandPath(args.path as string);
    const content = args.content as string;
    const append = args.append as boolean | undefined;

    if (!isPathAllowed(path)) {
      return { error: 'Path not allowed for security', path };
    }

    try {
      await writeFile(path, content, { flag: append ? 'a' : 'w' });
      return { path, written: content.length, append };
    } catch (err: any) {
      return { error: err.message, path };
    }
  },
};

export const listFilesSkill: Skill = {
  name: 'list_files',
  description: 'List files in a directory',
  risk: 'safe',

  toolDefinition: {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path (default: current)',
          },
          recursive: {
            type: 'boolean',
            description: 'List recursively',
          },
        },
      },
    },
  },

  async execute(args: Record<string, unknown>) {
    const { readdir } = await import('fs/promises');
    const path = expandPath((args.path as string) ?? '.');
    const recursive = args.recursive as boolean | undefined;

    if (!isPathAllowed(path)) {
      return { error: 'Path not allowed for security', path };
    }

    try {
      const entries = await readdir(path, { recursive, withFileTypes: true });
      return {
        path,
        files: entries.map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          isFile: e.isFile(),
        })),
      };
    } catch (err: any) {
      return { error: err.message, path };
    }
  },
};

export default [readFileSkill, writeFileSkill, listFilesSkill];
