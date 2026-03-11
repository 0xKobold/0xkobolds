/**
 * 🐉 Persistent Agent Tree Panel
 * 
 * Always-visible agent hierarchy that updates automatically.
 * Displays as a sidebar or top panel in the TUI.
 */

import type { DraconicTUI, AgentTree } from "../draconic-tui";
import { eventBus } from "../../event-bus";

interface TreePanelState {
  tree: AgentTree | null;
  selectedId: string | null;
  expandedIds: Set<string>;
  lastUpdate: number;
}

export class AgentTreePanel {
  private state: TreePanelState = {
    tree: null,
    selectedId: null,
    expandedIds: new Set(),
    lastUpdate: 0,
  };
  
  private updateInterval: NodeJS.Timeout | null = null;
  private listeners: Set<() => void> = new Set();

  constructor(private tui: DraconicTUI, private updateMs = 500) {
    this.setupEventListeners();
    this.startAutoUpdate();
  }

  /**
   * Subscribe to tree updates
   */
  onUpdate(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get current tree state
   */
  getState(): TreePanelState {
    return { ...this.state };
  }

  /**
   * Get tree as formatted string lines
   */
  getLines(maxWidth: number = 40): string[] {
    if (!this.state.tree) {
      return ["🐉 No agents"];
    }

    const lines: string[] = ["🐉 Agents"];
    this.renderNode(this.state.tree, lines, "", true, maxWidth);
    return lines;
  }

  /**
   * Get compact one-line status
   */
  getCompactStatus(): string {
    if (!this.state.tree) return "🐉 idle";
    
    const { active, total } = this.countAgents(this.state.tree);
    const currentTask = this.findActiveTask(this.state.tree);
    
    if (active === 0) return "🐉 idle";
    return `🐉 ${active}/${total} ${currentTask?.slice(0, 20) || ""}`;
  }

  /**
   * Select a node by ID
   */
  select(runId: string): void {
    this.state.selectedId = runId;
    this.notify();
  }

  /**
   * Toggle expanded state
   */
  toggleExpanded(runId: string): void {
    if (this.state.expandedIds.has(runId)) {
      this.state.expandedIds.delete(runId);
    } else {
      this.state.expandedIds.add(runId);
    }
    this.notify();
  }

  /**
   * Expand all nodes
   */
  expandAll(): void {
    this.expandAllRecursive(this.state.tree);
    this.notify();
  }

  /**
   * Collapse all except root
   */
  collapseAll(): void {
    this.state.expandedIds.clear();
    if (this.state.tree) {
      this.state.expandedIds.add(this.state.tree.runId);
    }
    this.notify();
  }

  /**
   * Force refresh
   */
  async refresh(): Promise<void> {
    await this.updateTree();
  }

  /**
   * Clean up
   */
  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  private setupEventListeners(): void {
    // Listen for agent events
    eventBus.on("agent.completed", async (event: any) => {
      const { runId, type } = event.payload;
      console.log(`[🐉 TreePanel] Agent ${runId} (${type}) completed`);
      await this.updateTree();
    });

    eventBus.on("agent.spawned", async (event: any) => {
      const { runId, type } = event.payload;
      console.log(`[🐉 TreePanel] Agent ${runId} (${type}) spawned`);
      this.state.expandedIds.add(runId); // Auto-expand new agents
      await this.updateTree();
    });
  }

  private startAutoUpdate(): void {
    this.updateTree(); // Initial load
    
    this.updateInterval = setInterval(async () => {
      await this.updateTree();
    }, this.updateMs);
  }

  private async updateTree(): Promise<void> {
    try {
      const tree = await this.tui.getAgentTree();
      
      // Only update if changed
      const treeChanged = JSON.stringify(tree) !== JSON.stringify(this.state.tree);
      
      if (treeChanged) {
        this.state.tree = tree;
        this.state.lastUpdate = Date.now();
        
        // Auto-expand root on first load
        if (tree && this.state.expandedIds.size === 0) {
          this.state.expandedIds.add(tree.runId);
        }
        
        this.notify();
      }
    } catch (err) {
      console.error("[🐉 TreePanel] Update failed:", err);
    }
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }

  private renderNode(
    node: AgentTree, 
    lines: string[], 
    prefix: string, 
    isLast: boolean,
    maxWidth: number
  ): void {
    const isSelected = node.runId === this.state.selectedId;
    const isExpanded = this.state.expandedIds.has(node.runId);
    const hasChildren = node.children.length > 0;

    // Status emoji
    const statusEmoji: Record<string, string> = {
      running: "●",
      completed: "✓",
      error: "✗",
      idle: "○",
    };

    // Type marker
    const typeMarker: Record<string, string> = {
      coordinator: "[C]",
      specialist: "[S]",
      researcher: "[R]",
      planner: "[P]",
      reviewer: "[V]",
    };

    const connector = isLast ? "└── " : "├── ";
    const expandMarker = hasChildren ? (isExpanded ? "▼ " : "▶ ") : "  ";
    const marker = typeMarker[node.type] || "[?]";
    const status = statusEmoji[node.status] || "○";

    // Truncate task to fit
    const maxTaskLen = maxWidth - prefix.length - connector.length - expandMarker.length - marker.length - 10;
    const taskDisplay = node.task 
      ? `: ${node.task.slice(0, maxTaskLen)}${node.task.length > maxTaskLen ? "…" : ""}` 
      : "";

    // Selection highlight
    const linePrefix = isSelected ? "> " : "  ";

    lines.push(`${prefix}${connector}${linePrefix}${expandMarker}${status} ${marker} ${node.runId.slice(-8)}${taskDisplay}`);

    // Render children if expanded
    if (isExpanded && hasChildren) {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      node.children.forEach((child, i) => {
        const childIsLast = i === node.children.length - 1;
        this.renderNode(child, lines, childPrefix, childIsLast, maxWidth);
      });
    }
  }

  private countAgents(tree: AgentTree): { active: number; total: number } {
    let active = tree.status === "running" ? 1 : 0;
    let total = 1;
    
    for (const child of tree.children) {
      const childCounts = this.countAgents(child);
      active += childCounts.active;
      total += childCounts.total;
    }
    
    return { active, total };
  }

  private findActiveTask(tree: AgentTree): string | undefined {
    if (tree.status === "running" && tree.task) {
      return tree.task;
    }
    
    for (const child of tree.children) {
      const task = this.findActiveTask(child);
      if (task) return task;
    }
    
    return undefined;
  }

  private expandAllRecursive(tree: AgentTree | null): void {
    if (!tree) return;
    this.state.expandedIds.add(tree.runId);
    tree.children.forEach(child => this.expandAllRecursive(child));
  }
}

// Factory
export function createAgentTreePanel(tui: DraconicTUI): AgentTreePanel {
  return new AgentTreePanel(tui);
}
