/**
 * 🐉 Draconic Subagents - Community Extension Wrapper
 * 
 * Wraps pi-subagents with Draconic enhancements:
 * - Bridges pi-subagents events to our event bus
 * - Discord notifications on subagent lifecycle
 * - Real-time tree visualization
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { eventBus } from "../../event-bus/index.js";

// Track pi-subagents jobs for tree visualization
interface SubagentJob {
  id: string;
  agent?: string;
  chain?: string[];
  status: "queued" | "running" | "complete" | "failed";
  startedAt: number;
  completedAt?: number;
  asyncDir?: string;
}

const activeJobs = new Map<string, SubagentJob>();

// 🔄 AUTO-CLEAR ON RELOAD: Clear stale jobs when module reloads
const staleJobs = Array.from(activeJobs.values()).filter(j => j.status !== "running");
for (const job of staleJobs) {
  activeJobs.delete(job.id);
}
if (staleJobs.length > 0) {
  console.log(`[🧹 Auto-clear] Removed ${staleJobs.length} stale pi-subagents on reload`);
}

export default async function register(pi: ExtensionAPI) {
  console.log("[🐉 DraconicSubagents] Wiring to pi-subagents...");
  
  // 🐉 BRIDGE: pi-subagents events → our event bus
  
  // When a subagent starts
  pi.events.on("subagent:started", (data: any) => {
    const { id, agent, chain, asyncDir } = data;
    if (!id) return;
    
    const job: SubagentJob = {
      id,
      agent,
      chain,
      status: "running",
      startedAt: Date.now(),
      asyncDir,
    };
    
    activeJobs.set(id, job);
    
    // Emit to our event system
    eventBus.emit("agent.spawned", {
      runId: id,
      type: agent || (chain?.[0]) || "subagent",
      task: `pi-subagents: ${agent || chain?.join(" -> ")}`,
      agentType: agent || "subagent",
      parentId: undefined, // pi-subagents doesn't expose parent
      timestamp: Date.now(),
    });
    
    // 🐉 Discord notification
    eventBus.emit("discord.notify", {
      message: `🐉 Subagent started: ${agent || chain?.[0] || "subagent"}`,
      channel: "agents",
    });
    
    console.log(`[🐉 Subagent] Started ${id.slice(-8)}: ${agent || chain?.join(" -> ")}`);
  });
  
  // When a subagent completes
  pi.events.on("subagent:complete", (data: any) => {
    const { id, success, asyncDir } = data;
    if (!id) return;
    
    const job = activeJobs.get(id);
    if (job) {
      job.status = success ? "complete" : "failed";
      job.completedAt = Date.now();
      if (asyncDir) job.asyncDir = asyncDir;
    }
    
    // Emit to our event system
    eventBus.emit("agent.completed", {
      runId: id,
      type: job?.agent || "subagent",
      status: success ? "completed" : "error",
      duration: job ? Date.now() - job.startedAt : 0,
      artifactPath: asyncDir,
      timestamp: Date.now(),
    });
    
    // 🐉 Discord notification
    const emoji = success ? "✅" : "❌";
    eventBus.emit("discord.notify", {
      message: `${emoji} Subagent ${success ? "completed" : "failed"}: ${job?.agent || id.slice(-8)}`,
      channel: "agents",
    });
    
    console.log(`[🐉 Subagent] ${success ? "Completed" : "Failed"} ${id.slice(-8)}`);
    
    // 🔧 FIX: Remove completed jobs after 30 seconds to keep display clean
    setTimeout(() => {
      activeJobs.delete(id);
      console.log(`[🐉 Subagent] Cleaned up job ${id.slice(-8)} from tracking`);
    }, 30000); // 30 second display retention
  });
  
  // 🐉 Register /draconic-agents command (enhanced view)
  pi.registerCommand("draconic-agents", {
    description: "Show Draconic agent tree",
    async handler(args: string, ctx: any) {
      const jobs = Array.from(activeJobs.values());
      
      if (jobs.length === 0) {
        ctx.ui.notify("No active subagents", "info");
        return;
      }
      
      const lines = [
        "🐉 Active Subagents:",
        ...jobs.map(j => {
          const status = j.status === "running" ? "●" : j.status === "complete" ? "✓" : "✗";
          const duration = j.completedAt 
            ? `${Math.round((j.completedAt - j.startedAt) / 1000)}s`
            : "running";
          return `  ${status} ${j.agent || j.chain?.[0]} (${duration})`;
        }),
      ];
      
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
  
  // 🐉 Expose API for tree components
  (global as any).draconicSubagents = {
    getActiveJobs: () => Array.from(activeJobs.values()),
    getJob: (id: string) => activeJobs.get(id),
  };
  
  console.log("[🐉 DraconicSubagents] Wired to pi-subagents events");
}
