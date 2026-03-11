/**
 * 🐉 Draconic Agent Tree Overlay (for TUI)
 *
 * Interactive agent hierarchy visualization.
 * Shows: tree view, status, actions (kill, view result, restart)
 *
 * Uses pi-tui component patterns for overlay rendering.
 */

import type { AgentTree, DraconicTUI } from "../draconic-tui";

export interface TreeOverlayOptions {
  tui: DraconicTUI;
  onSelect?: (runId: string) => void;
  onKill?: (runId: string) => void;
  onViewResult?: (runId: string) => void;
  onRestart?: (runId: string) => void;
  onClose?: () => void;
}

export interface TreeNodeUI {
  runId: string;
  type: string;
  status: string;
  task?: string;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  children: TreeNodeUI[];
}

export class AgentTreeOverlay {
  private tree: AgentTree | null = null;
  private nodes: Map<string, TreeNodeUI> = new Map();
  private selectedId: string | null = null;
  private expandedIds: Set<string> = new Set();

  constructor(private options: TreeOverlayOptions) {
    this.expandedIds.add("root"); // Always expand root
  }

  async load(rootId?: string): Promise<void> {
    this.tree = await this.options.tui.getAgentTree(rootId);
    this.buildNodeMap();
  }

  /**
   * Render tree as text (for TUI overlay)
   */
  render(): string[] {
    if (!this.tree) {
      return ["🐉 No agent tree available"];
    }

    const lines: string[] = ["🐉 Agent Hierarchy Tree", "─".repeat(50)];
    this.renderNode(this.tree, lines, "", true);
    
    lines.push("─".repeat(50));
    lines.push("[↑↓] Navigate  [Enter] Select  [k] Kill  [v] View  [r] Restart  [q] Close");
    
    return lines;
  }

  /**
   * Handle keyboard input
   */
  handleKey(key: string): boolean {
    switch (key) {
      case "q":
      case "escape":
        this.options.onClose?.();
        return true;
      
      case "enter":
        if (this.selectedId) {
          this.options.onSelect?.(this.selectedId);
          this.toggleExpanded(this.selectedId);
        }
        return true;
      
      case "k":
        if (this.selectedId) {
          this.options.onKill?.(this.selectedId);
        }
        return true;
      
      case "v":
        if (this.selectedId) {
          this.options.onViewResult?.(this.selectedId);
        }
        return true;
      
      case "r":
        if (this.selectedId) {
          this.options.onRestart?.(this.selectedId);
        }
        return true;
      
      case "up":
        this.selectPrevious();
        return true;
      
      case "down":
        this.selectNext();
        return true;
      
      case "left":
        if (this.selectedId) {
          this.expandedIds.delete(this.selectedId);
        }
        return true;
      
      case "right":
        if (this.selectedId) {
          this.expandedIds.add(this.selectedId);
        }
        return true;
    }

    return false;
  }

  /**
   * Get selected node
   */
  getSelected(): TreeNodeUI | null {
    return this.selectedId ? this.nodes.get(this.selectedId) || null : null;
  }

  private renderNode(node: AgentTree, lines: string[], prefix: string, isLast: boolean): void {
    const nodeUI = this.nodes.get(node.runId);
    if (!nodeUI) return;

    // Status emoji
    const statusEmoji: Record<string, string> = {
      running: "●",
      completed: "✓",
      error: "✗",
      idle: "○",
    };
    const emoji = statusEmoji[node.status] || "○";

    // Type color indicator (using text markers)
    const typeMarker: Record<string, string> = {
      coordinator: "[C]",
      specialist: "[S]",
      researcher: "[R]",
      planner: "[P]",
      reviewer: "[V]",
    };
    const marker = typeMarker[node.type] || "[?]";

    // Selection indicator
    const isSelected = node.runId === this.selectedId;
    const selectedMarker = isSelected ? "> " : "  ";

    // Expansion indicator for nodes with children
    const canExpand = node.children.length > 0;
    const isExpanded = this.expandedIds.has(node.runId);
    const expandMarker = canExpand ? (isExpanded ? "▼ " : "▶ ") : "  ";

    // Connector
    const connector = isLast ? "└── " : "├── ";

    // Build line
    const taskPreview = node.task ? `: ${node.task.slice(0, 30)}` : "";
    const line = `${prefix}${connector}${selectedMarker}${expandMarker}${emoji} ${marker} ${node.runId}${taskPreview}`;
    
    lines.push(line);

    // Render children if expanded
    if (isExpanded && node.children.length > 0) {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      node.children.forEach((child, i) => {
        const childIsLast = i === node.children.length - 1;
        this.renderNode(child, lines, childPrefix, childIsLast);
      });
    }
  }

  private buildNodeMap(): void {
    this.nodes.clear();
    if (this.tree) {
      this.buildNodeMapRecursive(this.tree, 0);
    }
    
    // Select first node if none selected
    if (!this.selectedId && this.nodes.size > 0) {
      this.selectedId = this.nodes.keys().next().value;
    }
  }

  private buildNodeMapRecursive(node: AgentTree, depth: number): void {
    this.nodes.set(node.runId, {
      runId: node.runId,
      type: node.type,
      status: node.status,
      task: node.task,
      depth,
      isSelected: node.runId === this.selectedId,
      isExpanded: this.expandedIds.has(node.runId),
      children: [], // Will be populated if needed
    });

    node.children.forEach((child) => this.buildNodeMapRecursive(child, depth + 1));
  }

  private toggleExpanded(runId: string): void {
    if (this.expandedIds.has(runId)) {
      this.expandedIds.delete(runId);
    } else {
      this.expandedIds.add(runId);
    }
  }

  private selectNext(): void {
    const ids = [...this.nodes.keys()];
    const currentIndex = this.selectedId ? ids.indexOf(this.selectedId) : -1;
    const nextIndex = Math.min(currentIndex + 1, ids.length - 1);
    this.selectedId = ids[nextIndex] || null;
    this.updateSelection();
  }

  private selectPrevious(): void {
    const ids = [...this.nodes.keys()];
    const currentIndex = this.selectedId ? ids.indexOf(this.selectedId) : 1;
    const prevIndex = Math.max(currentIndex - 1, 0);
    this.selectedId = ids[prevIndex] || null;
    this.updateSelection();
  }

  private updateSelection(): void {
    for (const node of this.nodes.values()) {
      node.isSelected = node.runId === this.selectedId;
    }
  }
}

// Factory for PI TUI integration
export function createAgentTreeOverlay(options: TreeOverlayOptions): AgentTreeOverlay {
  return new AgentTreeOverlay(options);
}

/**
 * Create overlay component for PI TUI
 * Returns a component that can be passed to tui.openOverlay()
 */
export async function createAgentTreeComponent(tui: DraconicTUI, title = "Agent Tree"): Promise<any> {
  // This would integrate with PI TUI's component system
  // For now, return a simple text-based component
  
  const overlay = new AgentTreeOverlay({
    tui,
    onSelect: (runId) => console.log("Selected:", runId),
    onKill: (runId) => console.log("Kill:", runId),
    onViewResult: (runId) => console.log("View:", runId),
    onClose: () => console.log("Close"),
  });

  await overlay.load();

  return {
    title,
    content: overlay.render().join("\n"),
    handleKey: (key: string) => overlay.handleKey(key),
  };
}
