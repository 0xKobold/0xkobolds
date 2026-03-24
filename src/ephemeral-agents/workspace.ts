/**
 * Ephemeral Workspace Manager
 * 
 * Creates/cleanup isolated workspaces per sub-agent.
 * Pattern: /tmp/0xkobold/ephemeral/<agent-id>/
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';

const BASE_DIR = '/tmp/0xkobold/ephemeral';

export interface Workspace {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Create isolated workspace for an agent
 */
export async function createWorkspace(agentId: string): Promise<Workspace> {
  const workspacePath = path.join(BASE_DIR, agentId);
  
  // Create directory
  await fs.mkdir(workspacePath, { recursive: true });
  
  // Create subdirectories
  await Promise.all([
    fs.mkdir(path.join(workspacePath, 'input'), { recursive: true }),
    fs.mkdir(path.join(workspacePath, 'output'), { recursive: true }),
    fs.mkdir(path.join(workspacePath, 'tmp'), { recursive: true }),
  ]);

  return {
    path: workspacePath,
    cleanup: async () => {
      try {
        await fs.rm(workspacePath, { recursive: true, force: true });
      } catch (error) {
        console.warn(`[Workspace] Failed to cleanup ${workspacePath}:`, error);
      }
    },
  };
}

/**
 * Get workspace path (without creating)
 */
export function getWorkspacePath(agentId: string): string {
  return path.join(BASE_DIR, agentId);
}

/**
 * Check if workspace exists
 */
export function workspaceExists(agentId: string): boolean {
  return existsSync(getWorkspacePath(agentId));
}

/**
 * Cleanup workspace
 */
export async function cleanupWorkspace(agentId: string): Promise<void> {
  const workspacePath = getWorkspacePath(agentId);
  try {
    await fs.rm(workspacePath, { recursive: true, force: true });
  } catch (error) {
    console.warn(`[Workspace] Failed to cleanup ${workspacePath}:`, error);
  }
}

/**
 * Cleanup all ephemeral workspaces (orphaned)
 */
export async function cleanupAllWorkspaces(): Promise<number> {
  try {
    if (!existsSync(BASE_DIR)) return 0;

    const entries = await fs.readdir(BASE_DIR);
    let cleaned = 0;

    for (const entry of entries) {
      const fullPath = path.join(BASE_DIR, entry);
      try {
        await fs.rm(fullPath, { recursive: true, force: true });
        cleaned++;
      } catch {
        // Skip if can't remove
      }
    }

    return cleaned;
  } catch {
    return 0;
  }
}
