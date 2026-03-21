/**
 * 🐉 Draconic TUI - Dual Mode Orchestration Interface
 *
 * Provides unified interface for both local (direct) and remote (gateway) modes.
 * Local mode is default - uses agent_orchestrate tool directly.
 * Remote mode connects via WebSocket to gateway.
 */

import { EventEmitter } from "node:events";
import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getDraconicRunRegistry, DraconicAgentRun } from "../agent/DraconicRunRegistry.js";
import { runEmbeddedAgent } from "../agent/embedded-runner.js";
import { getAgentType } from "../agent/types/index.js";

// Types
export type AgentType = "coordinator" | "specialist" | "researcher" | "planner" | "reviewer";

export interface SpawnOptions {
  task: string;
  type: AgentType;
  parentId?: string;
  strategy?: "fast" | "thorough" | "auto";
  inherit?: boolean;
  notify?: boolean;
}

export interface SpawnResult {
  runId: string;
  parentId?: string;
  type: AgentType;
  status: "running" | "completed" | "error";
  task: string;
  tokens?: { estimated: number; actual?: number };
  duration?: number;
  artifactPath?: string;
  output?: string;
}

export interface AgentTree {
  runId: string;
  type: AgentType;
  status: string;
  task?: string;
  children: AgentTree[];
}

export interface AgentArtifact {
  runId: string;
  type: "file" | "text" | "json";
  path?: string;
  content?: string;
  key: string;
  createdAt: number;
}

// Draconic TUI Interface - both modes implement this
export interface DraconicTUI {
  readonly mode: "local" | "remote";
  readonly url?: string; // For remote mode

  spawnSubagent(options: SpawnOptions): Promise<SpawnResult>;
  listAgents(): Promise<AgentTree[]>;
  getAgentTree(runId?: string): Promise<AgentTree | null>;
  getResult(runId: string): Promise<AgentArtifact[] | null>;
  killAgent(runId: string): Promise<boolean>;
  getStatus(runId?: string): Promise<any>;

  // Event subscriptions
  on(event: "spawned", handler: (result: SpawnResult) => void): void;
  on(event: "completed", handler: (result: SpawnResult) => void): void;
  on(event: "error", handler: (error: Error) => void): void;
}

// Mode detection
export function detectMode(): "local" | "remote" {
  if (process.env.KOBOLD_REMOTE_URL) return "remote";
  if (process.argv.includes("--remote")) return "remote";
  return "local";
}

// Factory function
export function createDraconicTUI(): DraconicTUI {
  const mode = detectMode();
  
  if (mode === "remote") {
    const url = process.env.KOBOLD_REMOTE_URL || 
      process.argv[process.argv.indexOf("--remote") + 1] || 
      "ws://localhost:18789";
    return new GatewayDraconicTUI(url);
  }
  
  return new DirectDraconicTUI();
}

// ============================================================================
// LOCAL MODE: Direct registry access (default, superior)
// ============================================================================

class DirectDraconicTUI extends EventEmitter implements DraconicTUI {
  readonly mode = "local";
  readonly url = undefined;
  
  private currentRunId?: string;
  private registry = getDraconicRunRegistry();

  constructor() {
    super();
    // Get current run ID from environment if available
    this.currentRunId = process.env.DRACONIC_RUN_ID;
  }

  async spawnSubagent(options: SpawnOptions): Promise<SpawnResult> {
    const startTime = Date.now();
    
    // Create run in registry
    const run = this.registry.create({
      sessionKey: process.env.DRACONIC_SESSION_KEY || "default",
      name: `${options.type}-${Date.now()}`,
      type: options.type,
      task: options.task,
      workspace: process.cwd(),
      capabilities: {
        primary: [options.type],
        secondary: [],
      },
      parentId: options.parentId || this.currentRunId,
      depth: options.parentId ? (this.registry.get(options.parentId)?.depth ?? 0) + 1 : 1,
      isProcessingQueue: false,
    });

    this.registry.updateStatus(run.id, "running");

    const spawnResult: SpawnResult = {
      runId: run.id,
      parentId: options.parentId || this.currentRunId,
      type: options.type,
      status: "running",
      task: options.task,
      tokens: { estimated: 1000 },
    };

    this.emit("spawned", spawnResult);
    
    // Get agent type definition for system prompt
    const agentTypeDef = getAgentType(options.type);
    const systemPrompt = agentTypeDef?.systemPrompt || "";
    
    // Actually run the agent
    try {
      const result = await runEmbeddedAgent({
        prompt: options.task,
        cwd: process.cwd(),
        extraSystemPrompt: systemPrompt,
        useTuiSettings: true,
      });
      
      // Update registry with result
      this.registry.updateStatus(run.id, result.output ? "completed" : "error");
      
      // Store artifacts
      if (result.output) {
        run.artifacts = [{
          type: "text",
          content: result.output,
          key: "output",
          createdAt: Date.now(),
        }];
      }
      
      spawnResult.status = "completed";
      spawnResult.output = result.output;
      spawnResult.duration = result.metadata?.duration || Date.now() - startTime;
      const tokens = result.metadata?.tokens as { input?: number; output?: number; total?: number } | undefined;
      spawnResult.tokens = {
        estimated: 1000,
        actual: tokens?.input !== undefined && tokens?.output !== undefined 
          ? tokens.input + tokens.output 
          : tokens?.total,
      };
      
      this.emit("completed", spawnResult);
    } catch (error) {
      this.registry.updateStatus(run.id, "error");
      spawnResult.status = "error";
      spawnResult.output = `Error: ${error}`;
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }

    return spawnResult;
  }

  async listAgents(): Promise<AgentTree[]> {
    const stats = this.registry.getStats();
    if (stats.totalRuns === 0) return [];
    
    // Get all root-level runs
    const allRuns = this.registry.query({}).runs;
    const rootRuns = allRuns.filter(r => !r.parentId);
    
    return rootRuns.map(run => this.runToTree(run));
  }

  async getAgentTree(runId?: string): Promise<AgentTree | null> {
    // If no runId specified, get first root run or return null
    if (!runId) {
      const allRuns = this.registry.query({}).runs;
      const rootRuns = allRuns.filter(r => !r.parentId);
      if (rootRuns.length === 0) return null;
      return this.runToTree(rootRuns[0]);
    }

    const run = this.registry.get(runId);
    if (!run) return null;
    return this.runToTree(run);
  }

  async getResult(runId: string): Promise<AgentArtifact[] | null> {
    const run = this.registry.get(runId);
    if (!run) return null;
    
    if (run.artifacts && run.artifacts.length > 0) {
      return run.artifacts.map(a => ({ ...a, runId }));
    }
    
    // Fallback: try to read from file
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const os = await import("node:os");
      
      const artifactDir = path.join(os.homedir(), ".0xkobold", "agents", "outputs");
      const artifactPath = path.join(artifactDir, `${runId}.json`);
      
      const content = await fs.readFile(artifactPath, "utf-8");
      const artifact: AgentArtifact = { ...JSON.parse(content), runId };
      return [artifact];
    } catch {
      return null;
    }
  }

  async killAgent(runId: string): Promise<boolean> {
    const run = this.registry.get(runId);
    if (!run) return false;
    
    this.registry.updateStatus(runId, "error");
    return true;
  }

  async getStatus(runId?: string): Promise<any> {
    if (runId) {
      const run = this.registry.get(runId);
      return run ? { run } : null;
    }
    return this.registry.getStats();
  }

  private runToTree(run: DraconicAgentRun): AgentTree {
    const children: AgentTree[] = [];
    
    for (const childId of run.children) {
      const childRun = this.registry.get(childId);
      if (childRun) {
        children.push(this.runToTree(childRun));
      }
    }

    return {
      runId: run.id,
      type: run.type as AgentType,
      status: run.status,
      task: run.task,
      children,
    };
  }
}

// ============================================================================
// REMOTE MODE: WebSocket gateway client
// ============================================================================

class GatewayDraconicTUI extends EventEmitter implements DraconicTUI {
  readonly mode = "remote";
  
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pending = new Map<string, { resolve: Function; reject: Function }>();

  constructor(readonly url: string) {
    super();
    this.connect();
  }

  async spawnSubagent(options: SpawnOptions): Promise<SpawnResult> {
    const result = await this.wsRequest({
      method: "agent.spawn",
      params: {
        type: options.type,
        task: options.task,
        parentId: options.parentId,
        strategy: options.strategy,
      },
    });

    const spawnResult: SpawnResult = {
      runId: result.runId,
      parentId: options.parentId,
      type: options.type,
      status: "running",
      task: options.task,
      tokens: result.tokens,
    };

    this.emit("spawned", spawnResult);
    
    // Listen for completion
    this.once(`completed:${result.runId}`, (completed) => {
      Object.assign(spawnResult, completed);
      this.emit("completed", spawnResult);
    });

    return spawnResult;
  }

  async listAgents(): Promise<AgentTree[]> {
    const result = await this.wsRequest({
      method: "agent.list",
    });
    return result.agents || [];
  }

  async getAgentTree(runId?: string): Promise<AgentTree | null> {
    const result = await this.wsRequest({
      method: "agent.tree",
      params: { runId },
    });
    return result.tree || null;
  }

  async getResult(runId: string): Promise<AgentArtifact[] | null> {
    const result = await this.wsRequest({
      method: "agent.artifacts",
      params: { runId },
    });
    return result.artifacts || null;
  }

  async killAgent(runId: string): Promise<boolean> {
    const result = await this.wsRequest({
      method: "agent.kill",
      params: { runId },
    });
    return result.success;
  }

  async getStatus(runId?: string): Promise<any> {
    const result = await this.wsRequest({
      method: "agent.status",
      params: { runId },
    });
    return result.status;
  }

  private async connect(): Promise<void> {
    // WebSocket connection with auto-reconnect
    // Implementation would use native WebSocket or ws library
    console.log(`[DraconicTUI] Connecting to ${this.url}...`);
  }

  private async wsRequest(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = String(++this.messageId);
      this.pending.set(id, { resolve, reject });
      
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ ...message, id }));
      } else {
        reject(new Error("WebSocket not connected"));
      }
      
      // Timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 30000);
    });
  }
}

// ============================================================================
// Status Provider for TUI Status Bar
// ============================================================================

export interface StatusProvider {
  getText(): string;
  getTooltip(): string;
}

export function createOrchestratorStatus(tui: DraconicTUI): StatusProvider {
  let lastStatus = { active: 0, total: 0, current: "" };
  
  // Subscribe to updates
  tui.on("spawned", () => update());
  tui.on("completed", () => update());
  
  async function update() {
    try {
      const tree = await tui.getAgentTree();
      const agents = await countAgents(tree);
      lastStatus = {
        active: agents.active,
        total: agents.total,
        current: agents.currentTask || "idle",
      };
    } catch {
      // Ignore errors
    }
  }
  
  async function countAgents(tree: AgentTree | null): Promise<any> {
    if (!tree) return { active: 0, total: 0 };
    
    let active = tree.status === "running" ? 1 : 0;
    let total = 1;
    let currentTask = tree.status === "running" ? tree.task : undefined;
    
    for (const child of tree.children) {
      const childCount = await countAgents(child);
      active += childCount.active;
      total += childCount.total;
      if (!currentTask && childCount.currentTask) {
        currentTask = childCount.currentTask;
      }
    }
    
    return { active, total, currentTask };
  }

  return {
    getText() {
      if (lastStatus.active === 0) return "🐉 idle";
      return `🐉 ${lastStatus.current.slice(0, 20)}... (${lastStatus.active})`;
    },
    getTooltip() {
      return `${lastStatus.active} active agents, ${lastStatus.total} total`;
    },
  };
}