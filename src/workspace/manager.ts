/**
 * Multi-Agent Workspace Manager - v0.2.0
 * 
 * Per-project agent isolation and persistence.
 * Part of Phase 5.2: Multi-Agent Workspaces
 */

import * as path from "path";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";

export interface Workspace {
  id: string;
  name: string;
  path: string;
  agents: AgentInstance[];
  createdAt: string;
  lastActive: string;
  config: WorkspaceConfig;
}

export interface AgentInstance {
  id: string;
  type: "coordinator" | "specialist" | "researcher" | "worker" | "reviewer";
  name: string;
  status: "idle" | "working" | "error" | "stopped";
  taskId?: string;
}

export interface WorkspaceConfig {
  autoStart: boolean;
  shareContext: boolean;
  maxAgents: number;
  activation: {
    manual: boolean;
    cron?: string[];
    heartbeat?: boolean;
  };
}

const WORKSPACES_FILE = path.join(process.env.HOME || "~", ".0xkobold", "workspaces.json");

class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private loaded = false;

  /**
   * Load workspaces from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      if (existsSync(WORKSPACES_FILE)) {
        const data = await fs.readFile(WORKSPACES_FILE, "utf-8");
        const workspaces = JSON.parse(data);
        
        for (const ws of workspaces) {
          this.workspaces.set(ws.id, ws);
        }
      }
    } catch (error) {
      console.warn("[Workspace] Failed to load workspaces:", error);
    }

    this.loaded = true;
  }

  /**
   * Save workspaces to disk
   */
  async save(): Promise<void> {
    const data = JSON.stringify(Array.from(this.workspaces.values()), null, 2);
    await fs.mkdir(path.dirname(WORKSPACES_FILE), { recursive: true });
    await fs.writeFile(WORKSPACES_FILE, data, "utf-8");
  }

  /**
   * Create new workspace
   */
  async create(
    name: string,
    workspacePath: string,
    config: Partial<WorkspaceConfig> = {}
  ): Promise<Workspace> {
    await this.load();

    const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const workspace: Workspace = {
      id,
      name,
      path: workspacePath,
      agents: [],
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      config: {
        autoStart: false,
        shareContext: true,
        maxAgents: 5,
        activation: {
          manual: true,
        },
        ...config,
      },
    };

    this.workspaces.set(id, workspace);
    await this.save();

    console.log(`[Workspace] Created: ${name} at ${workspacePath}`);
    return workspace;
  }

  /**
   * Get workspace by ID
   */
  get(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  /**
   * Get workspace by path
   */
  getByPath(workspacePath: string): Workspace | undefined {
    return Array.from(this.workspaces.values()).find(
      (ws) => ws.path === workspacePath
    );
  }

  /**
   * List all workspaces
   */
  list(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  /**
   * Delete workspace
   */
  async delete(id: string): Promise<boolean> {
    const result = this.workspaces.delete(id);
    if (result) {
      await this.save();
    }
    return result;
  }

  /**
   * Spawn agent in workspace
   */
  async spawnAgent(
    workspaceId: string,
    agentType: AgentInstance["type"],
    taskId?: string
  ): Promise<AgentInstance | null> {
    const ws = this.get(workspaceId);
    if (!ws) return null;

    if (ws.agents.length >= ws.config.maxAgents) {
      console.warn(`[Workspace] Max agents reached for ${ws.name}`);
      return null;
    }

    const agent: AgentInstance = {
      id: `agent-${Date.now()}`,
      type: agentType,
      name: `${agentType}-${ws.agents.length + 1}`,
      status: "idle",
      taskId,
    };

    ws.agents.push(agent);
    ws.lastActive = new Date().toISOString();
    await this.save();

    console.log(`[Workspace] Spawned ${agentType} in ${ws.name}`);
    return agent;
  }

  /**
   * Kill agent in workspace
   */
  async killAgent(workspaceId: string, agentId: string): Promise<boolean> {
    const ws = this.get(workspaceId);
    if (!ws) return false;

    const index = ws.agents.findIndex((a) => a.id === agentId);
    if (index >= 0) {
      ws.agents.splice(index, 1);
      ws.lastActive = new Date().toISOString();
      await this.save();
      return true;
    }
    return false;
  }

  /**
   * Share context between agents
   */
  shareContext(workspaceId: string, context: Record<string, unknown>): void {
    const ws = this.get(workspaceId);
    if (!ws || !ws.config.shareContext) return;

    // Store shared context (implementation would persist to file/memory)
    console.log(`[Workspace] Context shared in ${ws.name}:`, Object.keys(context));
  }

  /**
   * Get active agent count
   */
  getAgentCount(workspaceId: string): number {
    const ws = this.get(workspaceId);
    return ws ? ws.agents.length : 0;
  }
}

// Singleton
let manager: WorkspaceManager | null = null;

export function getWorkspaceManager(): WorkspaceManager {
  if (!manager) {
    manager = new WorkspaceManager();
  }
  return manager;
}

export function resetWorkspaceManager(): void {
  manager = null;
}

/**
 * Get or create workspace for current directory
 */
export async function getCurrentWorkspace(): Promise<Workspace | null> {
  const cwd = process.cwd();
  const wm = getWorkspaceManager();
  await wm.load();
  
  const ws = wm.getByPath(cwd);
  if (ws) return ws;

  // Create new workspace
  return wm.create(path.basename(cwd), cwd);
}

export default getWorkspaceManager;
