/**
 * Agent Lifecycle Extension - v0.2.0
 * 
 * Manages main agent process lifecycle:
 * - Start/stop/restart agents
 * - Process management and monitoring
 * - State persistence
 * 
 * Each main agent runs as a separate pi-coding-agent process
 * with its own workspace and configuration.
 * 
 * @version 0.2.0
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn, ChildProcess } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

// State tracking
interface AgentProcess {
  name: string;
  process: ChildProcess;
  pid: number;
  startedAt: Date;
  status: "starting" | "running" | "error";
  lastError?: string;
  port?: number; // WebSocket port for communication
}

const runningAgents = new Map<string, AgentProcess>();
const AGENTS_DIR = path.join(homedir(), ".0xkobold", "agents");
const STATE_FILE = path.join(homedir(), ".0xkobold", "agent-state.json");

// Load persisted state
async function loadState(): Promise<Record<string, any>> {
  try {
    const content = await fs.readFile(STATE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// Save state
async function saveState(): Promise<void> {
  const state: Record<string, any> = {};
  
  for (const [name, agent] of runningAgents) {
    state[name] = {
      pid: agent.pid,
      startedAt: agent.startedAt.toISOString(),
      status: agent.status,
    };
  }
  
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

// Start a main agent
async function startAgent(
  name: string,
  ctx: ExtensionContext
): Promise<{ success: boolean; error?: string; pid?: number }> {
  if (runningAgents.has(name)) {
    return { success: false, error: "Agent already running" };
  }
  
  const agentDir = path.join(AGENTS_DIR, name);
  const workspaceDir = path.join(agentDir, "workspace");
  const logsDir = path.join(agentDir, "logs");
  
  // Ensure logs directory exists
  await fs.mkdir(logsDir, { recursive: true });
  
  // Generate unique port for this agent's gateway
  const port = 18790 + runningAgents.size + 1;
  
  // Build environment
  const env: Record<string, string> = {
    ...process.env,
    KOBOLD_AGENT_NAME: name,
    KOBOLD_AGENT_MODE: "main",
    KOBOLD_WORKSPACE: workspaceDir,
    PI_CODING_AGENT_DIR: agentDir,
    // Gateway config
    GATEWAY_PORT: port.toString(),
    GATEWAY_HOST: "127.0.0.1",
  };
  
  // Spawn the agent process
  const logFile = path.join(logsDir, "agent.log");
  
  return new Promise((resolve) => {
    const child = spawn(
      "bun",
      ["run", "src/cli/index.ts", "--local"],
      {
        cwd: process.cwd(),
        env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true, // Allows process to run independently
      }
    );
    
    if (!child.pid) {
      resolve({ success: false, error: "Failed to spawn process" });
      return;
    }
    
    const agentProcess: AgentProcess = {
      name,
      process: child,
      pid: child.pid,
      startedAt: new Date(),
      status: "starting",
      port,
    };
    
    runningAgents.set(name, agentProcess);
    
    // Handle stdout
    let buffer = "";
    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      buffer += text;
      
      // Check for ready signal
      if (text.includes("🐉 0xKobold starting") || text.includes("Extension loaded")) {
        agentProcess.status = "running";
        saveState();
      }
      
      // Log to file
      fs.appendFile(logFile, `[${new Date().toISOString()}] ${text}`).catch(() => {});
    });
    
    // Handle stderr
    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      fs.appendFile(logFile, `[${new Date().toISOString()}] ERROR: ${text}`).catch(() => {});
    });
    
    // Handle process exit
    child.on("exit", (code) => {
      runningAgents.delete(name);
      saveState();
      
      if (code !== 0 && code !== null) {
        console.log(`[AgentLifecycle] Agent ${name} exited with code ${code}`);
      }
    });
    
    // Wait for startup or timeout
    const checkInterval = setInterval(() => {
      if (agentProcess.status === "running") {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve({ success: true, pid: child.pid });
      }
    }, 100);
    
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (agentProcess.status === "starting") {
        agentProcess.status = "error";
        agentProcess.lastError = "Startup timeout";
        resolve({ success: false, error: "Agent startup timeout (30s)" });
      }
    }, 30000);
  });
}

// Stop a main agent
async function stopAgent(name: string): Promise<{ success: boolean; error?: string }> {
  const agent = runningAgents.get(name);
  
  if (!agent) {
    return { success: false, error: "Agent not running" };
  }
  
  // Graceful shutdown
  agent.process.kill("SIGTERM");
  
  // Wait for exit or force kill
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // Force kill if still running
      agent.process.kill("SIGKILL");
      runningAgents.delete(name);
      saveState();
      resolve({ success: true });
    }, 5000);
    
    agent.process.on("exit", () => {
      clearTimeout(timeout);
      runningAgents.delete(name);
      saveState();
      resolve({ success: true });
    });
  });
}

export default async function agentLifecycleExtension(pi: ExtensionAPI) {
  console.log("[AgentLifecycle] Extension loaded");
  
  // Load persisted state
  const state = await loadState();
  console.log(`[AgentLifecycle] Loaded state for ${Object.keys(state).length} agents`);
  
  // TOOL: agent_start
  pi.registerTool({
    name: "agent_start",
    label: "Start Main Agent",
    description: "Start a main agent as a background process",
    parameters: Type.Object({
      name: Type.String({ description: "Agent name" }),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ) {
      const name = params.name as string;
      
      ctx.ui.notify(`🚀 Starting agent: ${name}...`, "info");
      
      const result = await startAgent(name, ctx);
      
      if (result.success) {
        ctx.ui.notify(`✅ Agent ${name} started (PID: ${result.pid})`, "info");
        return {
          content: [{
            type: "text" as const,
            text: `✅ Agent '${name}' started\nPID: ${result.pid}\nPort: ${runningAgents.get(name)?.port}`,
          }],
          details: { name, pid: result.pid, status: "running" } as any,
        };
      } else {
        ctx.ui.notify(`❌ Failed to start ${name}: ${result.error}`, "error");
        return {
          content: [{ type: "text" as const, text: `❌ Failed: ${result.error}` }],
          details: { error: result.error } as any,
        };
      }
    },
  });
  
  // TOOL: agent_stop
  pi.registerTool({
    name: "agent_stop",
    label: "Stop Main Agent",
    description: "Stop a running main agent",
    parameters: Type.Object({
      name: Type.String({ description: "Agent name" }),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ) {
      const name = params.name as string;
      
      ctx.ui.notify(`🛑 Stopping agent: ${name}...`, "info");
      
      const result = await stopAgent(name);
      
      if (result.success) {
        ctx.ui.notify(`✅ Agent ${name} stopped`, "info");
        return {
          content: [{ type: "text" as const, text: `✅ Agent '${name}' stopped` }],
          details: { name, status: "stopped" } as any,
        };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ Failed: ${result.error}` }],
          details: { error: result.error } as any,
        };
      }
    },
  });
  
  // TOOL: agent_status
  pi.registerTool({
    name: "agent_status",
    label: "Get Agent Status",
    description: "Get status of a main agent",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Agent name (omit for all)" })),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ) {
      if (params.name) {
        const agent = runningAgents.get(params.name as string);
        if (!agent) {
          return {
            content: [{ type: "text" as const, text: `Agent '${params.name}' is not running` }],
            details: { name: params.name, status: "stopped", agents: undefined },
          } as any;
        }
        
        return {
          content: [{
            type: "text" as const,
            text: `Agent: ${agent.name}\nStatus: ${agent.status}\nPID: ${agent.pid}\nStarted: ${agent.startedAt.toISOString()}`,
          }],
          details: { 
            name: agent.name, 
            status: agent.status, 
            pid: agent.pid, 
            startedAt: agent.startedAt.toISOString(),
            agents: undefined 
          },
        } as any;
      }
      
      // All agents
      const list = Array.from(runningAgents.entries()).map(([name, info]) => ({
        name,
        status: info.status,
        pid: info.pid,
        uptime: Date.now() - info.startedAt.getTime(),
      }));
      
      return {
        content: [{
          type: "text" as const,
          text: `${list.length} agents running:\n\n${list.map(a => 
            `- ${a.name}: ${a.status} (PID: ${a.pid})`
          ).join('\n')}`,
        }],
        details: { name: undefined, status: undefined, agents: list },
      } as any;
    },
  });
  
  // COMMAND: /agent-start
  pi.registerCommand("agent-start", {
    description: "Start a main agent: /agent-start <name>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("❌ Usage: /agent-start <name>", "error");
        return;
      }
      
      await startAgent(name, ctx);
    },
  });
  
  // COMMAND: /agent-stop
  pi.registerCommand("agent-stop", {
    description: "Stop a main agent: /agent-stop <name>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("❌ Usage: /agent-stop <name>", "error");
        return;
      }
      
      await stopAgent(name);
    },
  });
  
  // COMMAND: /agent-status
  pi.registerCommand("agent-status", {
    description: "Check agent status: /agent-status [name]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const name = args.trim();
      
      if (name) {
        const agent = runningAgents.get(name);
        if (agent) {
          const uptime = Math.floor((Date.now() - agent.startedAt.getTime()) / 1000);
          ctx.ui.notify(
            `${name}: ${agent.status} (PID: ${agent.pid}, uptime: ${uptime}s)`,
            agent.status === "running" ? "info" : "warning"
          );
        } else {
          ctx.ui.notify(`${name}: not running`, "info");
        }
      } else {
        const count = runningAgents.size;
        ctx.ui.notify(`${count} agents running`, "info");
      }
    },
  });
  
  // Cleanup on shutdown
  process.on("SIGTERM", async () => {
    console.log("[AgentLifecycle] Shutting down agents...");
    for (const [name, agent] of runningAgents) {
      agent.process.kill("SIGTERM");
    }
    await saveState();
  });
  
  console.log("[AgentLifecycle] Ready");
}
