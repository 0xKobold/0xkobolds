/**
 * 🐉 Draconic Run Registry
 *
 * Superior to OpenClaw's basic Map-based registry:
 * - Hierarchical agent trees (parent/child relationships)
 * - Session-aware grouping
 * - Rich metrics and lifecycle
 * - Graceful abort with cleanup
 * - Message queuing during runs
 *
 * Inspired by OpenClaw's pi-embedded-runner/runs.ts but DRACONICALLY ENHANCED
 */

import { randomUUID } from "node:crypto";

// Run states
export type DraconicRunStatus =
  | "spawning"   // Initializing
  | "running"    // Active
  | "paused"     // User paused
  | "completed"  // Success
  | "error"      // Failed
  | "compacting" // Context overflow recovery
  | "aborting";  // In process of abort

// Token usage tracking
export interface DraconicTokenMetrics {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

// Context window usage
export interface DraconicContextMetrics {
  current: number;
  max: number;
  percent: number;
  compactionCount: number;
}

// Tool execution metrics
export interface DraconicToolMetrics {
  calls: number;
  succeeded: number;
  failed: number;
  duration: number; // Average ms per call
}

// Complete run metrics
export interface DraconicRunMetrics {
  startedAt: number;
  lastActivityAt: number;
  duration: number; // Total ms
  tokens: DraconicTokenMetrics;
  context: DraconicContextMetrics;
  tools: DraconicToolMetrics;
  apiCalls: number;
}

// Agent capabilities
export interface DraconicAgentCapabilities {
  primary: string[];     // Main capabilities
  secondary: string[];   // Secondary skills
  languages?: string[];  // Programming languages
  frameworks?: string[]; // Framework knowledge
}

// Complete agent run record
export interface DraconicAgentRun {
  id: string;                    // UUID
  sessionKey: string;            // Unified session key
  parentId?: string;             // Parent agent (for hierarchy)
  children: Set<string>;         // Child agent IDs
  depth: number;                 // Tree depth (0 = root)

  // Identity
  name: string;                  // Agent name
  type: "coordinator" | "specialist" | "researcher" | "planner" | "reviewer" | "worker";
  capabilities: DraconicAgentCapabilities;

  // Task
  task: string;
  taskDescription?: string;
  workspace: string;             // Working directory

  // State
  status: DraconicRunStatus;

  // Control
  abortController: AbortController;
  messageQueue: Array<{ id: string; text: string; timestamp: number }>;
  isProcessingQueue: boolean;

  // Metrics
  metrics: DraconicRunMetrics;

  // Relationships
  spawnedBy?: string;            // User command, cron, webhook, etc.
  spawnedAt: number;

  // Metadata
  model?: string;
  provider?: string;

  // 🐉 Artifacts (persisted outputs)
  artifacts?: Array<{
    type: "file" | "text" | "json";
    path?: string;
    content?: string;
    key: string;
    createdAt: number;
  }>;
}

// Tree structure for display
export interface AgentTreeNode {
  id: string;
  name: string;
  type: string;
  status: DraconicRunStatus;
  depth: number;
  task?: string;
  metrics: {
    tokens: number;
    duration: number;
    tools: number;
  };
  children: AgentTreeNode[];
}

// Filter criteria
export interface RunFilter {
  sessionKey?: string;
  status?: DraconicRunStatus | DraconicRunStatus[];
  type?: string;
  parentId?: string | null; // null = root only
  minDepth?: number;
  maxDepth?: number;
  startedAfter?: number;
  startedBefore?: number;
}

// Sort options
export type RunSortField =
  | "startedAt"
  | "lastActivityAt"
  | "metrics.tokens.total"
  | "metrics.duration"
  | "depth";

// Query result
export interface RunQueryResult {
  runs: DraconicAgentRun[];
  total: number;
  filter: RunFilter;
}

/**
 * 🐉 The Draconic Run Registry
 *
 * Superior to OpenClaw with hierarchical queries and session awareness
 */
export class DraconicRunRegistry {
  private runs = new Map<string, DraconicAgentRun>();
  private sessionRuns = new Map<string, Set<string>>();
  private eventListeners = new Map<string, Set<(event: unknown) => void>>();

  private static instance: DraconicRunRegistry | null = null;

  static getInstance(): DraconicRunRegistry {
    if (!DraconicRunRegistry.instance) {
      DraconicRunRegistry.instance = new DraconicRunRegistry();
    }
    return DraconicRunRegistry.instance;
  }

  // ======== CRUD Operations ========

  /**
   * Create a new agent run
   */
  create(params: Omit<DraconicAgentRun, "id" | "children" | "status" | "metrics" | "messageQueue" | "abortController" | "spawnedAt">): DraconicAgentRun {
    const id = randomUUID();

    const run: DraconicAgentRun = {
      id,
      sessionKey: params.sessionKey,
      parentId: params.parentId,
      children: new Set(),
      depth: params.depth ?? (params.parentId ? ((this.get(params.parentId)?.depth ?? 0) + 1) : 0),
      name: params.name,
      type: params.type,
      capabilities: params.capabilities,
      task: params.task,
      taskDescription: params.taskDescription,
      workspace: params.workspace,
      status: "spawning",
      abortController: new AbortController(),
      messageQueue: [],
      isProcessingQueue: false,
      metrics: {
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        duration: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        context: { current: 0, max: 128000, percent: 0, compactionCount: 0 },
        tools: { calls: 0, succeeded: 0, failed: 0, duration: 0 },
        apiCalls: 0,
      },
      spawnedBy: params.spawnedBy,
      spawnedAt: Date.now(),
      model: params.model,
      provider: params.provider,
    };

    this.runs.set(id, run);

    // Track in session
    if (!this.sessionRuns.has(params.sessionKey)) {
      this.sessionRuns.set(params.sessionKey, new Set());
    }
    this.sessionRuns.get(params.sessionKey)!.add(id);

    // Track parent relationship
    if (params.parentId) {
      const parent = this.runs.get(params.parentId);
      if (parent) {
        parent.children.add(id);
      }
    }

    this.emit("run.created", { run });
    console.log(`[DraconicRunRegistry] Created run ${id} (${run.type})`);

    return run;
  }

  /**
   * Get a run by ID
   */
  get(id: string): DraconicAgentRun | undefined {
    return this.runs.get(id);
  }

  /**
   * Update run status
   * EPHEMERAL: Auto-deletes completed/error agents after 30s
   */
  updateStatus(id: string, status: DraconicRunStatus): boolean {
    const run = this.runs.get(id);
    if (!run) return false;

    const previousStatus = run.status;
    run.status = status;
    run.metrics.lastActivityAt = Date.now();

    this.emit("run.statusChanged", { id, previousStatus, status });
    
    // 🧹 EPHEMERAL: Auto-delete completed/error agents after 30s
    if (status === "completed" || status === "error") {
      setTimeout(() => {
        this.delete(id);
        console.log(`[🧹 Auto-cleanup] Agent ${id.slice(-8)} removed`);
      }, 30000); // 30 seconds display retention
    }
    
    return true;
  }

  /**
   * Update run metrics
   */
  updateMetrics(id: string, updates: Partial<DraconicRunMetrics>): boolean {
    const run = this.runs.get(id);
    if (!run) return false;

    Object.assign(run.metrics, updates);
    run.metrics.lastActivityAt = Date.now();

    // Recalculate derived metrics
    run.metrics.tokens.total =
      run.metrics.tokens.input +
      run.metrics.tokens.output +
      run.metrics.tokens.cacheRead;

    run.metrics.context.percent = Math.round(
      (run.metrics.context.current / run.metrics.context.max) * 100
    );

    return true;
  }

  /**
   * 🐉 Update run artifacts (persisted outputs)
   */
  updateArtifacts(
    id: string,
    artifacts: NonNullable<DraconicAgentRun["artifacts"]>
  ): boolean {
    const run = this.runs.get(id);
    if (!run) return false;

    if (!run.artifacts) {
      run.artifacts = [];
    }
    run.artifacts.push(...artifacts);
    run.metrics.lastActivityAt = Date.now();

    this.emit("run.artifactsUpdated", { id, artifacts });
    return true;
  }

  /**
   * Delete a run (with cleanup)
   */
  delete(id: string): boolean {
    const run = this.runs.get(id);
    if (!run) return false;

    // Remove from parent's children
    if (run.parentId) {
      const parent = this.runs.get(run.parentId);
      if (parent) {
        parent.children.delete(id);
      }
    }

    // Reassign children to parent or orphan them
    for (const childId of run.children) {
      const child = this.runs.get(childId);
      if (child) {
        child.parentId = run.parentId;
        if (run.parentId) {
          const grandparent = this.runs.get(run.parentId);
          if (grandparent) {
            grandparent.children.add(childId);
          }
        }
      }
    }

    // Remove from session tracking
    const sessionRuns = this.sessionRuns.get(run.sessionKey);
    if (sessionRuns) {
      sessionRuns.delete(id);
      if (sessionRuns.size === 0) {
        this.sessionRuns.delete(run.sessionKey);
      }
    }

    // Finalize metrics
    run.metrics.duration = Date.now() - run.metrics.startedAt;

    this.runs.delete(id);
    this.emit("run.deleted", { id, finalMetrics: run.metrics });
    console.log(`[DraconicRunRegistry] Deleted run ${id}`);

    return true;
  }

  // ======== Hierarchical Queries (Superior to OpenClaw) ========

  /**
   * Get all children of a run
   */
  getChildren(parentId: string): DraconicAgentRun[] {
    const parent = this.runs.get(parentId);
    if (!parent) return [];

    return Array.from(parent.children)
      .map((id) => this.runs.get(id))
      .filter((run): run is DraconicAgentRun => run !== undefined);
  }

  /**
   * Get all descendants (children, grandchildren, etc.)
   */
  getDescendants(parentId: string): DraconicAgentRun[] {
    const descendants: DraconicAgentRun[] = [];
    const toProcess = [parentId];

    while (toProcess.length > 0) {
      const currentId = toProcess.shift()!;
      const children = this.getChildren(currentId);
      descendants.push(...children);
      toProcess.push(...children.map((c) => c.id));
    }

    return descendants;
  }

  /**
   * Get the agent tree starting from a root
   */
  getTree(rootId?: string): AgentTreeNode | null {
    const runs = rootId
      ? [this.runs.get(rootId)].filter((r): r is DraconicAgentRun => r !== undefined)
      : this.getRootRuns();

    if (runs.length === 0) return null;

    // Build tree recursively
    const buildNode = (run: DraconicAgentRun): AgentTreeNode => ({
      id: run.id,
      name: run.name,
      type: run.type,
      status: run.status,
      depth: run.depth,
      task: run.task,
      metrics: {
        tokens: run.metrics.tokens.total,
        duration: run.metrics.duration,
        tools: run.metrics.tools.calls,
      },
      children: this.getChildren(run.id).map(buildNode),
    });

    const roots = runs.map(buildNode);
    return roots.length === 1 ? roots[0] : { id: "forest", name: "Forest", type: "root", status: "running", depth: 0, metrics: { tokens: 0, duration: 0, tools: 0 }, children: roots };
  }

  /**
   * Get all root runs (no parent)
   */
  getRootRuns(): DraconicAgentRun[] {
    return Array.from(this.runs.values()).filter((run) => !run.parentId);
  }

  // ======== Session-Based Queries ========

  /**
   * Get all runs for a session
   */
  getSessionRuns(sessionKey: string): DraconicAgentRun[] {
    const ids = this.sessionRuns.get(sessionKey);
    if (!ids) return [];

    return Array.from(ids)
      .map((id) => this.runs.get(id))
      .filter((run): run is DraconicAgentRun => run !== undefined);
  }

  /**
   * Query runs with filtering and sorting
   */
  query(filter: RunFilter = {}, sort: RunSortField = "startedAt", descending = true): RunQueryResult {
    let results = Array.from(this.runs.values());

    // Apply filters
    if (filter.sessionKey) {
      results = results.filter((r) => r.sessionKey === filter.sessionKey);
    }

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((r) => statuses.includes(r.status));
    }

    if (filter.type) {
      results = results.filter((r) => r.type === filter.type);
    }

    if (filter.parentId !== undefined) {
      if (filter.parentId === null) {
        results = results.filter((r) => !r.parentId);
      } else {
        results = results.filter((r) => r.parentId === filter.parentId);
      }
    }

    if (filter.minDepth !== undefined) {
      results = results.filter((r) => r.depth >= filter.minDepth!);
    }

    if (filter.maxDepth !== undefined) {
      results = results.filter((r) => r.depth <= filter.maxDepth!);
    }

    if (filter.startedAfter !== undefined) {
      results = results.filter((r) => r.metrics.startedAt >= filter.startedAfter!);
    }

    if (filter.startedBefore !== undefined) {
      results = results.filter((r) => r.metrics.startedAt <= filter.startedBefore!);
    }

    // Sort
    const sortFunctions: Record<RunSortField, (a: DraconicAgentRun, b: DraconicAgentRun) => number> = {
      startedAt: (a, b) => a.metrics.startedAt - b.metrics.startedAt,
      lastActivityAt: (a, b) => a.metrics.lastActivityAt - b.metrics.lastActivityAt,
      "metrics.tokens.total": (a, b) => a.metrics.tokens.total - b.metrics.tokens.total,
      "metrics.duration": (a, b) => a.metrics.duration - b.metrics.duration,
      depth: (a, b) => a.depth - b.depth,
    };

    results.sort((a, b) => {
      const comparison = sortFunctions[sort](a, b);
      return descending ? -comparison : comparison;
    });

    return {
      runs: results,
      total: results.length,
      filter,
    };
  }

  // ======== Message Queuing (Superior to OpenClaw) ========

  /**
   * Queue a message for a run
   */
  queueMessage(runId: string, text: string): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;

    // Can only queue if running or spawning
    if (!["running", "spawning", "paused"].includes(run.status)) return false;

    run.messageQueue.push({
      id: randomUUID(),
      text,
      timestamp: Date.now(),
    });

    this.emit("run.messageQueued", { runId, queueLength: run.messageQueue.length });
    return true;
  }

  /**
   * Get next message from queue
   */
  dequeueMessage(runId: string): { id: string; text: string; timestamp: number } | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;

    return run.messageQueue.shift();
  }

  /**
   * Clear message queue
   */
  clearMessageQueue(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;

    run.messageQueue.length = 0;
    return true;
  }

  // ======== Abort Handling (Superior to OpenClaw) ========

  /**
   * Abort a single run gracefully
   */
  async abortRun(runId: string, reason: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run) return false;

    // Already aborting or done
    if (["completed", "error", "aborting"].includes(run.status)) {
      return false;
    }

    this.updateStatus(runId, "aborting");
    console.log(`[DraconicRunRegistry] Aborting run ${runId}: ${reason}`);

    // Signal abort
    run.abortController.abort(reason);

    this.emit("run.aborted", { runId, reason });
    this.updateStatus(runId, "error");

    return true;
  }

  /**
   * Abort all runs in a session
   */
  async abortSession(sessionKey: string, reason: string): Promise<number> {
    const runs = this.getSessionRuns(sessionKey);
    let aborted = 0;

    // Abort in reverse depth order (children first)
    const sorted = runs.sort((a, b) => b.depth - a.depth);

    for (const run of sorted) {
      if (await this.abortRun(run.id, reason)) {
        aborted++;
      }
    }

    console.log(`[DraconicRunRegistry] Aborted ${aborted} runs in session ${sessionKey}`);
    return aborted;
  }

  /**
   * Abort all runs (emergency)
   */
  async abortAll(reason: string): Promise<number> {
    let aborted = 0;
    for (const [id] of this.runs) {
      if (await this.abortRun(id, reason)) {
        aborted++;
      }
    }
    return aborted;
  }

  // ======== Event System ========

  on(event: string, handler: (event: unknown) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);

    return () => {
      this.eventListeners.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[DraconicRunRegistry] Event handler error:`, err);
        }
      }
    }
  }

  // ======== Utility ========

  /**
   * Get registry statistics
   */
  getStats(): {
    totalRuns: number;
    activeRuns: number;
    byStatus: Record<DraconicRunStatus, number>;
    byType: Record<string, number>;
    totalTokens: number;
    sessions: number;
  } {
    const runs = Array.from(this.runs.values());

    return {
      totalRuns: runs.length,
      activeRuns: runs.filter((r) => ["running", "spawning", "compacting"].includes(r.status)).length,
      byStatus: runs.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {} as Record<DraconicRunStatus, number>),
      byType: runs.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalTokens: runs.reduce((sum, r) => sum + r.metrics.tokens.total, 0),
      sessions: this.sessionRuns.size,
    };
  }

  /**
   * Clear all runs (dangerous)
   */
  clear(): void {
    this.runs.clear();
    this.sessionRuns.clear();
  }
}

// Export singleton accessor
export const getDraconicRunRegistry = DraconicRunRegistry.getInstance;

// 🔄 AUTO-CLEAR ON RELOAD: Clear any completed agents on module load (hot reload)
const registry = getDraconicRunRegistry();
const initialRuns = registry.query({}).runs;
const completedRuns = initialRuns.filter(r => r.status !== "running");
if (completedRuns.length > 0) {
  for (const run of completedRuns) {
    registry.delete(run.id);
  }
  console.log(`[🧹 Auto-clear] Removed ${completedRuns.length} stale agents on reload`);
}

// Types already exported at top of file
