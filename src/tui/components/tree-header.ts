/**
 * 🐉 Tree Header Component
 * 
 * Persistent header showing agent tree at the top of TUI
 */

import { Box, Text } from "@mariozechner/pi-tui";
import type { DraconicRunRegistry } from "../../agent/DraconicRunRegistry";

export class TreeHeader {
  private registry: DraconicRunRegistry;
  private maxHeight: number = 5; // Max 5 lines for header

  constructor(registry: DraconicRunRegistry) {
    this.registry = registry;
  }

  /**
   * Render the tree as compact header lines
   */
  render(width: number): string[] {
    // 🔧 FIX: Only show ACTIVE runs, not completed
    const activeRuns = this.registry.query({ status: "running" }).runs;
    
    if (activeRuns.length === 0) {
      return ["🐉 No active agents"];
    }

    const stats = this.registry.getStats();
    const lines: string[] = [];
    
    // Header line - just show ACTIVE count (not active/total)
    const totalActive = activeRuns.length;
    lines.push(`🐉 Agents: ${totalActive} running`);
    
    // Find root runs (depth 0 or no parent) - only active
    const rootRuns = activeRuns.filter(r => !r.parentId || r.depth === 0);
    
    // Show compact tree
    rootRuns.slice(0, 2).forEach((run, i) => {
      const status = run.status === "running" ? "●" : 
                     run.status === "completed" ? "✓" : 
                     run.status === "error" ? "✗" : "○";
      const type = run.type?.[0]?.toUpperCase() || "?";
      const task = run.task?.slice(0, width - 25) || "";
      
      // Find direct children - only active
      const children = activeRuns.filter(r => r.parentId === run.id);
      const childCount = children.length > 0 ? ` [+${children.length}]` : "";
      
      lines.push(`  ${status} [${type}] ${run.id.slice(-6)}${childCount} ${task}`);
      
      // Show up to 2 children
      children.slice(0, 2).forEach((child, ci) => {
        const cStatus = child.status === "running" ? "●" : 
                       child.status === "completed" ? "✓" : 
                       child.status === "error" ? "✗" : "○";
        const cType = child.type?.[0]?.toUpperCase() || "?";
        const isLast = ci === Math.min(children.length - 1, 1);
        const prefix = isLast ? "    └─" : "    ├─";
        lines.push(`${prefix} ${cStatus} [${cType}] ${child.id.slice(-6)} ${child.task?.slice(0, width - 35) || ""}`);
      });
      
      if (children.length > 2) {
        lines.push(`    └─ ... and ${children.length - 2} more`);
      }
    });
    
    if (rootRuns.length > 2) {
      lines.push(`  ... and ${rootRuns.length - 2} more agent trees`);
    }
    
    return lines.slice(0, this.maxHeight);
  }

  /**
   * Get compact one-line status for footer
   */
  getCompactStatus(): string {
    const stats = this.registry.getStats();
    const activeRuns = this.registry.query({ status: "running" }).runs;
    
    if (stats.activeRuns === 0) return "🐉 idle";
    
    // Prioritize running subagents (depth > 0)
    const displayRun = activeRuns
      .filter(r => r.depth > 0)
      .sort((a, b) => (b.metrics?.lastActivityAt || 0) - (a.metrics?.lastActivityAt || 0))[0]
      || activeRuns[0];
    
    // 🔧 Show "X running" (not X/Y which is confusing)
    const completedCount = stats.totalRuns - stats.activeRuns;
    const completedInfo = completedCount > 0 ? ` (+${completedCount} completed)` : "";
    
    if (displayRun) {
      const emoji = displayRun.type === "specialist" ? "👨‍💻" : 
                   displayRun.type === "researcher" ? "🔬" :
                   displayRun.type === "planner" ? "📋" :
                   displayRun.type === "reviewer" ? "👁️" : "🐉";
      const task = displayRun.task?.slice(0, 15) || "";
      return `🐉 ${stats.activeRuns} running${completedInfo} ${emoji} ${task}`;
    }
    
    return `🐉 ${stats.activeRuns} running${completedInfo}`;
  }
}