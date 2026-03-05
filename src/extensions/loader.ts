/**
 * Extension Loader for 0xKobold
 *
 * Dynamically loads pi-coding-agent extensions from the core/ directory
 * and external paths.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { readdir } from 'fs/promises';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

/**
 * Load extensions from specified paths
 */
export async function loadExtensions(
  pi: ExtensionAPI,
  extensionPaths: string[]
): Promise<void> {
  for (const path of extensionPaths) {
    try {
      const resolvedPath = resolve(path);
      const module = await import(pathToFileURL(resolvedPath).href);
      const extension = module.default || module;

      if (typeof extension === 'function') {
        await extension(pi);
        console.log(`[Extensions] Loaded: ${path}`);
      } else {
        console.error(`[Extensions] ${path} must export a function`);
      }
    } catch (err) {
      console.error(`[Extensions] Failed to load ${path}:`, err);
    }
  }
}

/**
 * Load built-in extensions from the core/ directory
 */
export async function loadBuiltInExtensions(pi: ExtensionAPI): Promise<void> {
  const coreDir = resolve(__dirname, 'core');

  try {
    const files = await readdir(coreDir);

    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        const path = `${coreDir}/${file}`;
        await loadExtensions(pi, [path]);
      }
    }
  } catch (err) {
    console.error('[Extensions] Failed to load built-in extensions:', err);
  }
}

/**
 * Create extension API wrapper with 0xKobold-specific helpers
 */
export function createKoboldExtensionAPI(baseApi: ExtensionAPI): ExtensionAPI {
  return {
    ...baseApi,

    // Add 0xKobold-specific utilities
    registerKoboldTool: (tool: KoboldTool) => {
      baseApi.registerTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        // @ts-ignore Tool execute signature
        execute: tool.execute,
      });
    },

    registerKoboldCommand: (name: string, command: KoboldCommand) => {
      baseApi.registerCommand(name, {
        description: command.description,
        handler: command.handler || command.execute,
      });
    },
  } as ExtensionAPI;
}

// Types for 0xKobold extensions
export interface KoboldTool {
  name: string;
  description: string;
  // @ts-ignore TSchema mismatch
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text?: string; [key: string]: unknown }>;
    details?: Record<string, unknown>;
  }>;
}

export interface KoboldCommand {
  description: string;
  handler?: (args?: string) => Promise<void>;
  execute?: (args?: Record<string, unknown>) => Promise<void>; // Deprecated, use handler
}

// Re-export ExtensionAPI type
export type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
