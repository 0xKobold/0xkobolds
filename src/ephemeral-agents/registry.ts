/**
 * Ephemeral Agent Registry
 * 
 * Like Hermes ProcessRegistry - tracks all spawned agents.
 * Features:
 * - TTL-based cleanup (30min default)
 * - LRU eviction at max limit
 * - Cascade stop (parent stops all children)
 * - Telemetry integration
 */

import { randomUUID } from 'node:crypto';
import { trackAgentSpawn, trackAgentComplete, trackAgentTimeout } from '../telemetry/integration.js';
import type { EphemeralAgent, EphemeralResult, RegistryStats, SubAgentConfig, EphemeralStatus } from './types.js';

const DEFAULT_CONFIG: SubAgentConfig = {
  maxConcurrent: 8,
  maxChildrenPerAgent: 5,
  maxSpawnDepth: 2,
  defaultTimeoutMs: 5 * 60 * 1000, // 5 minutes
  archiveAfterMs: 30 * 60 * 1000,  // 30 minutes
  maxTtlMs: 30 * 60 * 1000,        // 30 minutes
  maxFinished: 64,                   // LRU capacity
};

class EphemeralRegistry {
  private static instance: EphemeralRegistry | null = null;
  
  private agents = new Map<string, EphemeralAgent>();
  private finished = new Map<string, EphemeralAgent>();
  private timers = new Map<string, NodeJS.Timeout>();
  private config: SubAgentConfig;
  private totalSpawned = 0;
  private totalCompleted = 0;
  private totalFailed = 0;

  static getInstance(): EphemeralRegistry {
    if (!EphemeralRegistry.instance) {
      EphemeralRegistry.instance = new EphemeralRegistry();
    }
    return EphemeralRegistry.instance;
  }

  private constructor(config: Partial<SubAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new ephemeral agent
   */
  create(params: {
    type: string;
    task: string;
    workspace: string;
    parentId?: string;
    ttlMs?: number;
  }): EphemeralAgent {
    const id = randomUUID();
    const ttlMs = params.ttlMs || this.config.defaultTimeoutMs;
    
    // Check parent children limit
    if (params.parentId) {
      const parent = this.agents.get(params.parentId);
      if (parent && parent.children.length >= this.config.maxChildrenPerAgent) {
        throw new Error(`Parent has max children (${this.config.maxChildrenPerAgent})`);
      }
      // Update parent's children
      if (parent) {
        parent.children.push(id);
      }
    }

    const agent: EphemeralAgent = {
      id,
      type: params.type,
      task: params.task,
      workspace: params.workspace,
      status: 'spawning',
      startedAt: Date.now(),
      parentId: params.parentId,
      children: [],
      ttlMs,
    };
    
    this.totalSpawned++;

    this.agents.set(id, agent);
    
    // Telemetry
    trackAgentSpawn(id, params.type);
    
    // Set TTL timeout
    const timer = setTimeout(() => {
      if (this.agents.has(id)) {
        this.timeout(id, ttlMs);
      }
    }, ttlMs);
    this.timers.set(id, timer);
    
    return agent;
  }

  /**
   * Start agent (mark as running)
   */
  start(id: string): void {
    const agent = this.agents.get(id);
    if (agent && agent.status === 'spawning') {
      agent.status = 'running';
    }
  }

  /**
   * Complete agent successfully
   */
  complete(id: string, result: EphemeralResult): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    agent.status = 'completed';
    agent.completedAt = Date.now();
    agent.result = result;

    this.finalize(id, result.success);

    // Telemetry
    const duration = agent.completedAt - agent.startedAt;
    trackAgentComplete(id, duration, true);
  }

  /**
   * Fail agent
   */
  fail(id: string, error: string): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    agent.status = 'failed';
    agent.completedAt = Date.now();
    agent.error = error;

    const result: EphemeralResult = {
      success: false,
      text: error,
      durationMs: agent.completedAt - agent.startedAt,
      status: 'failed',
    };
    agent.result = result;

    this.finalize(id, false);

    // Telemetry
    const duration = agent.completedAt - agent.startedAt;
    trackAgentComplete(id, duration, false);
  }

  /**
   * Timeout agent
   */
  timeout(id: string, maxDurationMs: number): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    agent.status = 'timeout';
    agent.completedAt = Date.now();

    const result: EphemeralResult = {
      success: false,
      text: 'Agent timed out',
      durationMs: agent.completedAt - agent.startedAt,
      status: 'timed_out',
    };
    agent.result = result;

    this.finalize(id, false);

    // Telemetry
    trackAgentTimeout(id, maxDurationMs);
  }

  /**
   * Finalize - move to finished, clear timer, enforce limits
   */
  private finalize(id: string, success: boolean): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    this.agents.delete(id);
    this.finished.set(id, agent);
    this.clearTimer(id);
    this.enforceLimits();
    
    // Update counters
    if (success) {
      this.totalCompleted++;
    } else {
      this.totalFailed++;
    }

    // Schedule archive
    const archiveTimer = setTimeout(() => {
      this.finished.delete(id);
    }, this.config.archiveAfterMs);
    this.timers.set(`archive-${id}`, archiveTimer);
  }

  /**
   * Cascade stop - stop parent and all children
   */
  cascadeStop(id: string): string[] {
    const stopped: string[] = [];

    const stopRecursive = (agentId: string) => {
      const agent = this.agents.get(agentId);
      if (agent) {
        // Stop all children first
        for (const childId of agent.children) {
          stopRecursive(childId);
        }
        // Stop this agent
        this.fail(agentId, 'Cascade stop');
        stopped.push(agentId);
      }
    };

    stopRecursive(id);
    return stopped;
  }

  /**
   * Get agent by ID
   */
  get(id: string): EphemeralAgent | undefined {
    return this.agents.get(id) || this.finished.get(id);
  }

  /**
   * Get all active agents
   */
  getActive(): EphemeralAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get children of an agent
   */
  getChildren(parentId: string): EphemeralAgent[] {
    const parent = this.agents.get(parentId) || this.finished.get(parentId);
    if (!parent) return [];
    return parent.children
      .map(id => this.agents.get(id) || this.finished.get(id))
      .filter((a): a is EphemeralAgent => a !== undefined);
  }

  /**
   * Cleanup expired finished agents
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, agent] of this.finished) {
      const age = now - (agent.completedAt || agent.startedAt);
      if (age > this.config.archiveAfterMs) {
        this.finished.delete(id);
        this.clearTimer(`archive-${id}`);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get active count
   */
  getActiveCount(): number {
    return this.agents.size;
  }

  /**
   * Check if can spawn (under concurrency limit)
   */
  canSpawn(): boolean {
    return this.agents.size < this.config.maxConcurrent;
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  private enforceLimits(): void {
    if (this.finished.size <= this.config.maxFinished) return;
    const sorted = Array.from(this.finished.entries())
      .sort((a, b) => (a[1].completedAt || 0) - (b[1].completedAt || 0));
    for (const [id] of sorted.slice(0, this.finished.size - this.config.maxFinished)) {
      this.finished.delete(id);
      this.clearTimer(`archive-${id}`);
    }
  }

  /**
   * Get registry statistics
   */
  public getStats(): RegistryStats {
    const activeAgents = Array.from(this.agents.values()).map((a) => ({
      id: a.id,
      type: a.type,
      task: a.task,
      status: a.status,
      startedAt: a.startedAt,
      parentId: a.parentId,
      workspace: a.workspace,
    }));

    return {
      active: this.agents.size,
      totalSpawned: this.totalSpawned,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      maxTtlMs: this.config.maxTtlMs,
      lruCapacity: this.config.maxChildrenPerAgent,
      activeAgents,
    };
  }
}

export const ephemeralRegistry = EphemeralRegistry.getInstance();
export { EphemeralRegistry, DEFAULT_CONFIG };

// Add getStats method - need to modify the class
