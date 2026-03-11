/**
 * 🐉 Draconic TUI Status Bar
 *
 * Displays real-time agent status AND gateway status
 * Green dot = gateway running, Red dot = gateway stopped
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

export interface GatewayStatus {
  running: boolean;
  url: string;
  connections: number;
  version?: string;
}

export class DraconicStatusBar {
  private state: StatusBarState = { active: 0, total: 0, depth: 0 };
  private gateway: GatewayStatus = { running: false, url: "", connections: 0 };
  private interval?: NodeJS.Timeout;
  private lastUpdate = 0;
  private gatewayCheckInterval?: NodeJS.Timeout;

  constructor(
    private tui: DraconicTUI,
    private updateInterval = 500,
    private gatewayUrl = `ws://${process.env.KOBOLD_GATEWAY_HOST || "localhost"}:${process.env.KOBOLD_GATEWAY_PORT || "7777"}`,
  ) {}

  start(): void {
    // Start agent updates
    this.interval = setInterval(() => this.refresh(), this.updateInterval);
    this.refresh();

    // Start gateway heartbeat checks
    this.gatewayCheckInterval = setInterval(() => this.checkGateway(), 5000);
    this.checkGateway();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    if (this.gatewayCheckInterval) {
      clearInterval(this.gatewayCheckInterval);
      this.gatewayCheckInterval = undefined;
    }
  }

  /**
   * Get the status bar text - now includes gateway link!
   */
  getText(): string {
    const gatewayEmoji = this.gateway.running ? "🟢" : "🔴";
    const gatewayDisplay = this.gateway.url
      ? `[${gatewayEmoji} ${this.gateway.url.replace("ws://", "").replace("wss://", "")}]`
      : `[${gatewayEmoji} --]`;

    if (this.state.active === 0) {
      return `🐉 idle ${gatewayDisplay}`;
    }

    const task = this.state.currentTask?.slice(0, 20) || "working...";
    const taskDisplay = task.length > 20 ? `${task}...` : task;

    return `🐉 ${this.state.active} | ${taskDisplay} ${gatewayDisplay}`;
  }

  /**
   * Get tooltip - shows expanded info
   */
  getTooltip(): string {
    const lines: string[] = [];

    // Gateway section
    lines.push(`Gateway: ${this.gateway.running ? "Running" : "Stopped"}`);
    if (this.gateway.url) {
      lines.push(`  URL: ${this.gateway.url}`);
      lines.push(`  Connections: ${this.gateway.connections}`);
    }
    lines.push("");

    // Agents section
    lines.push(`Active agents: ${this.state.active}`);
    lines.push(`Total agents: ${this.state.total}`);
    lines.push(`Max depth: ${this.state.depth}`);

    if (this.state.tokens) {
      lines.push(`Tokens: ${this.state.tokens.actual}/${this.state.tokens.estimated}k`);
    }

    if (this.state.currentAgent) {
      lines.push(`Current: ${this.state.currentAgent}`);
    }

    return lines.join("\n");
  }

  getDetailedStatus(): string {
    const gatewayStatus = this.gateway.running
      ? `🟢 Gateway running on ${this.gateway.url}`
      : `🔴 Gateway stopped`;

    if (this.state.active === 0) {
      return `${gatewayStatus}\n🐉 Draconic Orchestrator ready`;
    }

    return [
      gatewayStatus,
      `🐉 ${this.state.active} active agent${this.state.active > 1 ? "s" : ""}`,
      this.state.currentTask ? `  Task: ${this.state.currentTask.slice(0, 40)}` : "",
      this.state.depth > 0 ? `  Depth: ${this.state.depth}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Get the gateway status (for external use)
   */
  getGatewayStatus(): GatewayStatus {
    return { ...this.gateway };
  }

  /**
   * Check if gateway is running
   */
  private async checkGateway(): Promise<void> {
    try {
      // Check health endpoint
      const httpUrl = this.gatewayUrl.replace("ws://", "http://").replace("wss://", "https://");
      const response = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(3000) });

      if (response.ok) {
        const data = (await response.json()) as { version?: string };
        this.gateway = {
          running: true,
          url: this.gatewayUrl,
          connections: this.gateway.connections,
          version: data.version,
        };
      } else {
        this.gateway.running = false;
      }
    } catch {
      this.gateway.running = false;
    }
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

      if (!result.currentTask && childResult.currentTask) {
        result.currentTask = childResult.currentTask;
        result.currentAgent = childResult.currentAgent;
      }
    }

    result.depth = maxChildDepth;
    return result;
  }
}

// Factory for TUI integration
export function createStatusBarProvider(tui: DraconicTUI) {
  const statusBar = new DraconicStatusBar(tui);

  return {
    start: () => statusBar.start(),
    stop: () => statusBar.stop(),
    getText: () => statusBar.getText(),
    getTooltip: () => statusBar.getTooltip(),
    getDetailedStatus: () => statusBar.getDetailedStatus(),
    getGatewayStatus: () => statusBar.getGatewayStatus(),
  };
}
