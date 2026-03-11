/**
 * 🐉 Draconic TUI Status Bar
 * 
 * Displays real-time agent status in TUI status bar.
 * Updates every 500ms with: active agents, current task, hierarchy depth.
 */

import type { DraconicTUI, AgentTree } from "../draconic-tui";

export interface StatusBarState {
  active: number;
  total: number;
  currentTask?: string;
  currentAgent?: string;
  depth: number;
  tokens?: { estimated: number; actual: number };
}

export class DraconicStatusBar {
  private state: StatusBarState = { active: 0, total: 0, depth: 0 };
  private interval?: NodeJS.Timeout;
  private lastUpdate = 0;

  constructor(private tui: DraconicTUI, private updateInterval = 500) {}

  start(): void {
    this.interval = setInterval(() => this.refresh(), this.updateInterval);
    this.refresh();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  getText(): string {
    if (this.state.active === 0) {
      return "🐉 idle";
    }

    const task = this.state.currentTask?.slice(0, 25) || "working...";
    const taskDisplay = task.length > 25 ? `${task}...` : task;
    
    return `🐉 ${this.state.active} | ${taskDisplay}`;
  }

  getTooltip(): string {
    const lines = [
      `Active agents: ${this.state.active}`,
      `Total agents: ${this.state.total}`,
      `Max depth: ${this.state.depth}`,
    ];
    
    if (this.state.tokens) {
      lines.push(`Tokens: ${this.state.tokens.actual}/${this.state.tokens.estimated}k`);
    }
    
    if (this.state.currentAgent) {
      lines.push(`Current: ${this.state.currentAgent}`);
    }
    
    return lines.join("\n");
  }

  getDetailedStatus(): string {
    if (this.state.active === 0) {
      return "🐉 Draconic Orchestrator ready";
    }

    return [
      `🐉 ${this.state.active} active agent${this.state.active > 1 ? "s" : ""}`,
      this.state.currentTask ? `  Task: ${this.state.currentTask.slice(0, 40)}` : "",
      this.state.depth > 0 ? `  Depth: ${this.state.depth}` : "",
    ].filter(Boolean).join("\n");
  }

  private async refresh(): Promise<void> {
    // Throttle: max 1 update per second
    const now = Date.now();
    if (now - this.lastUpdate < 1000) return;
    this.lastUpdate = now;

    try {
      const tree = await this.tui.getAgentTree();
      this.state = this.aggregateTree(tree);
    } catch {
      // Ignore errors - registry might be temporarily unavailable
    }
  }

  private aggregateTree(tree: AgentTree | null): StatusBarState {
    if (!tree) {
      return { active: 0, total: 0, depth: 0 };
    }

    return this.countTree(tree, 0);
  }

  private countTree(node: AgentTree, depth: number): StatusBarState {
    const isActive = node.status === "running";
    let maxChildDepth = depth;
    
    const result: StatusBarState = {
      active: isActive ? 1 : 0,
      total: 1,
      currentTask: isActive ? node.task : undefined,
      currentAgent: isActive ? node.runId : undefined,
      depth,
    };

    for (const child of node.children) {
      const childResult = this.countTree(child, depth + 1);
      result.active += childResult.active;
      result.total += childResult.total;
      maxChildDepth = Math.max(maxChildDepth, childResult.depth);
      
      // Track first active task found
      if (!result.currentTask && childResult.currentTask) {
        result.currentTask = childResult.currentTask;
        result.currentAgent = childResult.currentAgent;
      }
    }

    result.depth = maxChildDepth;
    return result;
  }
}

// Factory for PI TUI integration
export function createStatusBarProvider(tui: DraconicTUI) {
  const statusBar = new DraconicStatusBar(tui);
  
  return {
    start: () => statusBar.start(),
    stop: () => statusBar.stop(),
    getText: () => statusBar.getText(),
    getTooltip: () => statusBar.getTooltip(),
    getDetailedStatus: () => statusBar.getDetailedStatus(),
  };
}
