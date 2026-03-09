/**
 * Unified Agent Orchestration Extension - v0.2.0
 *
 * Provides a single, coherent API for all agent operations.
 * 
 * Hierarchy:
 *   Orchestrator (1) → Main Agents (N) → Subagents (M)
 * 
 * Replaces:
 *   - agent_spawn (agent-registry) - DEPRECATED
 *   - subagent_spawn (subagent-extension) - DEPRECATED  
 *   - agent_start/stop (agent-lifecycle) - INTEGRATED
 * 
 * New unified API:
 *   - agent_orchestrate() - Single tool for all operations
 *   - /agent command family - Simplified CLI
 *   - /autonomous - Delegation control
 * 
 * @version 0.2.0
 * @deprecated Use agent_orchestrate instead of agent_spawn/subagent_spawn
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn, ChildProcess } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

// Constants
const ORCHESTRATOR_VERSION = "0.2.0";
const AGENTS_DIR = path.join(homedir(), ".0xkobold", "agents");
const STATE_FILE = path.join(homedir(), ".0xkobold", "orchestrator-state.json");
const MAX_PARALLEL_SUBAGENTS = 8;
const MAX_CONCURRENT_SUBAGENTS = 4;

// Types
interface MainAgentConfig {
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  autoStart: boolean;
  workspace: {
    path: string;
    autoClone?: string;
    branch?: string;
  };
  activation: {
    manual: boolean;
    cron?: string[];
    heartbeat?: string;
  };
  model: {
    provider: string;
    model: string;
  };
  capabilities: string[];
  memory: { enabled: boolean };
}

interface SubagentConfig {
  name: string;
  description: string;
  tools: string[];
  model: string;
  systemPrompt: string;
  scope?: "builtin" | "user" | "project";
}

interface MainAgentProcess {
  name: string;
  process: ChildProcess;
  pid: number;
  startedAt: Date;
  status: "starting" | "running" | "error" | "stopped";
  lastError?: string;
  port?: number;
  config: MainAgentConfig;
}

interface SubagentResult {
  agent: string;
  task: string;
  exitCode: number;
  output: string;
  error?: string;
  duration: number;
}

interface TaskAnalysis {
  complexity: "simple" | "medium" | "complex";
  estimatedFiles: number;
  requiresResearch: boolean;
  requiresPlanning: boolean;
  suggestedStrategy: string;
  confidence: number;
}

// State management
const mainAgents = new Map<string, MainAgentProcess>();
const subagentAgents = new Map<string, SubagentConfig>();

let autonomyMode: "off" | "simple" | "medium" | "complex" | "always" = "medium";

// Initialize subagent definitions
function loadBuiltinSubagents(): Map<string, SubagentConfig> {
  const agents = new Map<string, SubagentConfig>();
  
  const definitions: SubagentConfig[] = [
    {
      name: "scout",
      description: "Fast codebase reconnaissance",
      tools: ["read", "search", "list"],
      model: "qwen2.5-coder:14b",
      systemPrompt: `You are a fast reconnaissance agent. Find relevant code quickly and return compressed summaries (max 500 tokens). Be concise. Focus on facts.`,
      scope: "builtin",
    },
    {
      name: "planner",
      description: "Creates implementation plans",
      tools: ["read", "search", "list"],
      model: "qwen2.5-coder:14b",
      systemPrompt: `You are a planning specialist. Analyze requirements and create step-by-step implementation plans with specific file paths.`,
      scope: "builtin",
    },
    {
      name: "worker",
      description: "Full implementation agent",
      tools: ["read", "write", "edit", "search", "shell"],
      model: "qwen2.5-coder:14b",
      systemPrompt: `You are an implementation specialist. Write clean, well-tested code following existing patterns. Verify changes work.`,
      scope: "builtin",
    },
    {
      name: "reviewer",
      description: "Code review specialist",
      tools: ["read", "search", "shell"],
      model: "qwen2.5-coder:14b",
      systemPrompt: `You are a code review specialist. Identify bugs, security issues, and style violations. Provide specific line-by-line feedback.`,
      scope: "builtin",
    },
  ];
  
  for (const agent of definitions) {
    agents.set(agent.name, agent);
  }
  
  return agents;
}

// Task analysis for autonomous delegation
function analyzeTask(task: string): TaskAnalysis {
  const taskLower = task.toLowerCase();
  const words = task.split(/\s+/).length;
  
  const simpleKeywords = ["fix", "update", "change", "add", "remove", "typo"];
  const mediumKeywords = ["implement", "create", "build", "refactor", "migrate", "add feature"];
  const complexKeywords = ["system", "architecture", "redesign", "framework", "platform", "microservices"];
  
  const filePatterns = task.match(/\b\w+\.(ts|js|tsx|jsx|py|rs|go)\b/g) || [];
  const specificFiles = filePatterns.length;
  
  let score = 0;
  if (words < 15) score += 1;
  else if (words < 50) score += 2;
  else score += 3;
  
  simpleKeywords.forEach(k => { if (taskLower.includes(k)) score += 1; });
  mediumKeywords.forEach(k => { if (taskLower.includes(k)) score += 2; });
  complexKeywords.forEach(k => { if (taskLower.includes(k)) score += 3; });
  
  if (specificFiles > 0 && specificFiles <= 3) score = Math.min(score, 4);
  if (specificFiles > 3) score += 1;
  
  let complexity: "simple" | "medium" | "complex";
  if (score <= 5) complexity = "simple";
  else if (score <= 10) complexity = "medium";
  else complexity = "complex";
  
  const strategies: Record<string, string> = {
    simple: "Execute directly",
    medium: "Scout → Worker",
    complex: "Scout → Planner → Workers → Reviewer",
  };
  
  return {
    complexity,
    estimatedFiles: specificFiles || (complexity === "simple" ? 1 : complexity === "medium" ? 3 : 5),
    requiresResearch: complexity !== "simple" && !specificFiles,
    requiresPlanning: complexity === "complex" || (complexity === "medium" && words > 30),
    suggestedStrategy: strategies[complexity],
    confidence: Math.min(0.9, 0.5 + score / 20),
  };
}

// Main agent lifecycle
async function startMainAgent(name: string, ctx: ExtensionContext): Promise<{ success: boolean; error?: string; pid?: number }> {
  if (mainAgents.has(name)) {
    return { success: false, error: "Agent already running" };
  }
  
  // Load config
  const configPath = path.join(AGENTS_DIR, name, "config.json");
  if (!existsSync(configPath)) {
    return { success: false, error: `Agent config not found: ${configPath}` };
  }
  
  let config: MainAgentConfig;
  try {
    const content = await fs.readFile(configPath, "utf-8");
    config = JSON.parse(content);
  } catch (error) {
    return { success: false, error: `Failed to load config: ${error}` };
  }
  
  const agentDir = path.join(AGENTS_DIR, name);
  const workspaceDir = path.join(agentDir, "workspace");
  const logsDir = path.join(agentDir, "logs");
  
  await fs.mkdir(logsDir, { recursive: true });
  
  const port = 18790 + mainAgents.size + 1;
  const logFile = path.join(logsDir, "agent.log");
  
  return new Promise((resolve) => {
    const child = spawn(
      "bun",
      ["run", "src/cli/index.ts", "--local"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          KOBOLD_AGENT_NAME: name,
          KOBOLD_AGENT_MODE: "main",
          KOBOLD_WORKSPACE: workspaceDir,
          PI_CODING_AGENT_DIR: agentDir,
          GATEWAY_PORT: port.toString(),
          GATEWAY_HOST: "127.0.0.1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      }
    );
    
    if (!child.pid) {
      resolve({ success: false, error: "Failed to spawn process" });
      return;
    }
    
    const agentProcess: MainAgentProcess = {
      name,
      process: child,
      pid: child.pid,
      startedAt: new Date(),
      status: "starting",
      port,
      config,
    };
    
    mainAgents.set(name, agentProcess);
    
    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      if (text.includes("🐉 0xKobold starting") || text.includes("Extension loaded")) {
        agentProcess.status = "running";
      }
      fs.appendFile(logFile, `[${new Date().toISOString()}] ${text}`).catch(() => {});
    });
    
    child.stderr?.on("data", (data: Buffer) => {
      fs.appendFile(logFile, `[${new Date().toISOString()}] ERROR: ${data.toString()}`).catch(() => {});
    });
    
    child.on("exit", (code) => {
      mainAgents.delete(name);
      if (code !== 0 && code !== null) {
        console.log(`[Orchestrator] Agent ${name} exited with code ${code}`);
      }
    });
    
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

async function stopMainAgent(name: string): Promise<{ success: boolean; error?: string }> {
  const agent = mainAgents.get(name);
  if (!agent) {
    return { success: false, error: "Agent not running" };
  }
  
  agent.process.kill("SIGTERM");
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      agent.process.kill("SIGKILL");
      mainAgents.delete(name);
      resolve({ success: true });
    }, 5000);
    
    agent.process.on("exit", () => {
      clearTimeout(timeout);
      mainAgents.delete(name);
      resolve({ success: true });
    });
  });
}

// Subagent spawning
async function spawnSubagent(
  agentName: string,
  task: string,
  ctx: ExtensionContext
): Promise<SubagentResult> {
  const startTime = Date.now();
  const agentConfig = subagentAgents.get(agentName);
  
  if (!agentConfig) {
    return {
      agent: agentName,
      task,
      exitCode: 1,
      output: "",
      error: `Subagent '${agentName}' not found`,
      duration: 0,
    };
  }
  
  return new Promise((resolve) => {
    const args = [
      "run",
      "src/cli/index.ts",
      "--command",
      `agent:${agentConfig.name}`,
      "--task",
      task,
    ];
    
    const child = spawn("bun", args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        KOBOLD_SUBAGENT: "true",
        KOBOLD_AGENT_MODEL: agentConfig.model,
        KOBOLD_AGENT_TOOLS: agentConfig.tools.join(","),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    let output = "";
    let error = "";
    
    child.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    
    child.stderr?.on("data", (data: Buffer) => {
      error += data.toString();
    });
    
    child.on("close", (code) => {
      resolve({
        agent: agentConfig.name,
        task,
        exitCode: code || 0,
        output: output.trim(),
        error: error.trim() || undefined,
        duration: Date.now() - startTime,
      });
    });
    
    setTimeout(() => {
      child.kill("SIGTERM");
    }, 5 * 60 * 1000);
  });
}

export default async function unifiedOrchestratorExtension(pi: ExtensionAPI) {
  console.log(`[Orchestrator] v${ORCHESTRATOR_VERSION} loaded`);
  
  // Initialize
  await fs.mkdir(AGENTS_DIR, { recursive: true });
  subagentAgents.clear();
  for (const [k, v] of loadBuiltinSubagents()) {
    subagentAgents.set(k, v);
  }
  
  // ============================================================================
  // UNIFIED TOOL: agent_orchestrate
  // ============================================================================
  pi.registerTool({
    name: "agent_orchestrate",
    label: "Unified Agent Orchestration",
    description: "Single API for all agent operations: spawn main agents, spawn subagents, check status, auto-delegate tasks",
    parameters: Type.Object({
      operation: Type.String({
        description: "Operation type: spawn_main, spawn_subagent, list, status, stop, analyze, delegate",
      }),
      // Main agent config
      mainAgent: Type.Optional(Type.String({ description: "Main agent name" })),
      // Subagent config
      subagent: Type.Optional(Type.String({ description: "Subagent type (scout, planner, worker, reviewer)" })),
      task: Type.Optional(Type.String({ description: "Task description" })),
      // Delegation
      autoDelegate: Type.Optional(Type.Boolean({ description: "Auto-analyze and delegate task", default: false })),
      strategy: Type.Optional(Type.String({ description: "Delegation strategy: simple, medium, complex", default: "medium" })),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ): Promise<AgentToolResult<any>> {
      const operation = params.operation as string;
      
      switch (operation) {
        case "spawn_main": {
          const name = params.mainAgent as string;
          if (!name) {
            return { content: [{ type: "text" as const, text: "❌ mainAgent required" }], details: { error: "missing_name" } };
          }
          
          const result = await startMainAgent(name, ctx);
          if (result.success) {
            return {
              content: [{ type: "text" as const, text: `✅ Main agent '${name}' started (PID: ${result.pid})` }],
              details: { name, pid: result.pid, status: "running" },
            };
          } else {
            return {
              content: [{ type: "text" as const, text: `❌ Failed: ${result.error}` }],
              details: { error: result.error },
            };
          }
        }
        
        case "spawn_subagent": {
          const agent = params.subagent as string;
          const task = params.task as string;
          
          if (!agent || !task) {
            return { content: [{ type: "text" as const, text: "❌ subagent and task required" }], details: { error: "missing_params" } };
          }
          
          ctx.ui.notify(`🚀 Spawning ${agent} for task...`, "info");
          const result = await spawnSubagent(agent, task, ctx);
          
          const status = result.exitCode === 0 ? "✅" : "❌";
          return {
            content: [{
              type: "text" as const,
              text: `${status} ${result.agent} complete (${result.duration}ms)\n\n${result.output}`,
            }],
            details: result,
          };
        }
        
        case "list": {
          const mainList = Array.from(mainAgents.entries()).map(([name, info]) => ({
            type: "main",
            name,
            status: info.status,
            pid: info.pid,
          }));
          
          const subList = Array.from(subagentAgents.keys()).map(name => ({
            type: "subagent",
            name,
            scope: subagentAgents.get(name)?.scope,
          }));
          
          return {
            content: [{
              type: "text" as const,
              text: `Main Agents (${mainList.length}):\n${mainList.map(a => `- ${a.name}: ${a.status}`).join("\n")}\n\nSubagents (${subList.length}):\n${subList.map(a => `- ${a.name}`).join("\n")}`,
            }],
            details: { main: mainList, subagents: subList },
          };
        }
        
        case "status": {
          const name = params.mainAgent as string;
          if (name) {
            const agent = mainAgents.get(name);
            if (!agent) {
              return { content: [{ type: "text" as const, text: `Agent '${name}' not running` }], details: { name, status: "stopped" } };
            }
            return {
              content: [{
                type: "text" as const,
                text: `Agent: ${agent.name}\nStatus: ${agent.status}\nPID: ${agent.pid}\nStarted: ${agent.startedAt.toISOString()}`,
              }],
              details: { name: agent.name, status: agent.status, pid: agent.pid, startedAt: agent.startedAt },
            };
          }
          
          const list = Array.from(mainAgents.entries()).map(([name, info]) => ({ name, status: info.status, pid: info.pid }));
          return {
            content: [{ type: "text" as const, text: `${list.length} main agents running` }],
            details: { agents: list },
          };
        }
        
        case "stop": {
          const name = params.mainAgent as string;
          if (!name) {
            return { content: [{ type: "text" as const, text: "❌ mainAgent required" }], details: { error: "missing_name" } };
          }
          
          const result = await stopMainAgent(name);
          return {
            content: [{ type: "text" as const, text: result.success ? `✅ Agent '${name}' stopped` : `❌ Failed: ${result.error}` }],
            details: { name, success: result.success },
          };
        }
        
        case "analyze": {
          const task = params.task as string;
          if (!task) {
            return { content: [{ type: "text" as const, text: "❌ task required" }], details: { error: "missing_task" } };
          }
          
          const analysis = analyzeTask(task);
          return {
            content: [{
              type: "text" as const,
              text: `**Task Analysis**\n\nTask: ${task}\nComplexity: ${analysis.complexity}\nStrategy: ${analysis.suggestedStrategy}\nConfidence: ${Math.round(analysis.confidence * 100)}%`,
            }],
            details: analysis,
          };
        }
        
        case "delegate": {
          const task = params.task as string;
          const strategy = (params.strategy as string) || autonomyMode;
          
          if (!task) {
            return { content: [{ type: "text" as const, text: "❌ task required" }], details: { error: "missing_task" } };
          }
          
          const analysis = analyzeTask(task);
          
          // Check if we should delegate based on strategy
          let shouldDelegate = false;
          switch (strategy) {
            case "always": shouldDelegate = true; break;
            case "complex": shouldDelegate = analysis.complexity === "complex"; break;
            case "medium": shouldDelegate = analysis.complexity !== "simple"; break;
            case "simple": shouldDelegate = analysis.complexity === "complex"; break;
            case "off": shouldDelegate = false; break;
          }
          
          if (!shouldDelegate) {
            return {
              content: [{ type: "text" as const, text: `Task complexity: ${analysis.complexity}. Strategy '${strategy}' says handle directly.` }],
              details: { analysis, delegated: false },
            };
          }
          
          ctx.ui.notify(`🤖 Delegating: ${analysis.suggestedStrategy}`, "info");
          
          // Execute delegation workflow
          let result = `**Autonomous Delegation**\n\nTask: ${task}\nComplexity: ${analysis.complexity}\nStrategy: ${analysis.suggestedStrategy}\n\n`;
          
          if (analysis.complexity === "medium") {
            result += "1. Spawn scout for reconnaissance\n2. Spawn worker for implementation\n\n✅ Delegation plan ready";
          } else if (analysis.complexity === "complex") {
            result += "1. Scout → finds relevant code\n2. Planner → creates implementation plan\n3. Workers → implement components\n4. Reviewer → reviews all changes\n\n✅ Full workflow ready";
          }
          
          return {
            content: [{ type: "text" as const, text: result }],
            details: { analysis, delegated: true, strategy },
          };
        }
        
        default:
          return {
            content: [{ type: "text" as const, text: `❌ Unknown operation: ${operation}` }],
            details: { error: "unknown_operation", valid: ["spawn_main", "spawn_subagent", "list", "status", "stop", "analyze", "delegate"] },
          };
      }
    },
  });
  
  // ============================================================================
  // UNIFIED COMMANDS: /agent family
  // ============================================================================
  
  // /agent create <name>
  pi.registerCommand("agent-create", {
    description: "Create new main agent workspace: /agent-create <name>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("❌ Usage: /agent-create <name>", "error");
        return;
      }
      
      const agentDir = path.join(AGENTS_DIR, name);
      if (existsSync(agentDir)) {
        ctx.ui.notify(`❌ Agent '${name}' already exists`, "error");
        return;
      }
      
      // Create structure
      await fs.mkdir(path.join(agentDir, "workspace"), { recursive: true });
      await fs.mkdir(path.join(agentDir, "memory"), { recursive: true });
      await fs.mkdir(path.join(agentDir, "logs"), { recursive: true });
      await fs.mkdir(path.join(agentDir, "agents"), { recursive: true });
      
      // Create config
      const config: MainAgentConfig = {
        name,
        description: `Main agent for ${name}`,
        version: "1.0.0",
        enabled: true,
        autoStart: false,
        workspace: { path: path.join(agentDir, "workspace") },
        activation: { manual: true },
        model: { provider: "ollama", model: "qwen2.5-coder:14b" },
        capabilities: ["read", "write", "edit", "search", "shell"],
        memory: { enabled: true },
      };
      
      await fs.writeFile(path.join(agentDir, "config.json"), JSON.stringify(config, null, 2));
      ctx.ui.notify(`✅ Created main agent: ${name}`, "info");
    },
  });
  
  // /agent start <name>
  pi.registerCommand("agent-start", {
    description: "Start main agent: /agent-start <name>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("❌ Usage: /agent-start <name>", "error");
        return;
      }
      
      ctx.ui.notify(`🚀 Starting ${name}...`, "info");
      const result = await startMainAgent(name, ctx);
      
      if (result.success) {
        ctx.ui.notify(`✅ Agent ${name} running (PID: ${result.pid})`, "info");
      } else {
        ctx.ui.notify(`❌ Failed: ${result.error}`, "error");
      }
    },
  });
  
  // /agent stop <name>
  pi.registerCommand("agent-stop", {
    description: "Stop main agent: /agent-stop <name>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("❌ Usage: /agent-stop <name>", "error");
        return;
      }
      
      ctx.ui.notify(`🛑 Stopping ${name}...`, "info");
      const result = await stopMainAgent(name);
      ctx.ui.notify(result.success ? `✅ Agent ${name} stopped` : `❌ ${result.error}`, result.success ? "info" : "error");
    },
  });
  
  // /agent status [name]
  pi.registerCommand("agent-status", {
    description: "Check agent status: /agent-status [name]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const name = args.trim();
      
      if (name) {
        const agent = mainAgents.get(name);
        if (agent) {
          const uptime = Math.floor((Date.now() - agent.startedAt.getTime()) / 1000);
          ctx.ui.notify(`${name}: ${agent.status} (${uptime}s uptime)`, "info");
        } else {
          ctx.ui.notify(`${name}: stopped`, "info");
        }
      } else {
        const count = mainAgents.size;
        const list = Array.from(mainAgents.keys()).join(", ");
        ctx.ui.notify(`${count} agents: ${list || "none"}`, "info");
      }
    },
  });
  
  // /agent spawn <type> <task>
  pi.registerCommand("agent-spawn", {
    description: "Spawn subagent: /agent-spawn <scout|planner|worker|reviewer> <task>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const parts = args.trim().split(/\s+/);
      const agentType = parts[0];
      const task = parts.slice(1).join(" ");
      
      if (!agentType || !task) {
        ctx.ui.notify("❌ Usage: /agent-spawn <type> <task>", "error");
        return;
      }
      
      if (!subagentAgents.has(agentType)) {
        ctx.ui.notify(`❌ Unknown subagent: ${agentType}`, "error");
        return;
      }
      
      ctx.ui.notify(`🚀 Spawning ${agentType}...`, "info");
      const result = await spawnSubagent(agentType, task, ctx);
      
      if (result.exitCode === 0) {
        ctx.ui.notify(`✅ ${agentType} complete`, "info");
      } else {
        ctx.ui.notify(`❌ ${agentType} failed`, "error");
      }
    },
  });
  
  // /agents
  pi.registerCommand("agents", {
    description: "List all agents (main and subagents)",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const mainList = Array.from(mainAgents.keys()).map(name => {
        const a = mainAgents.get(name);
        return `- ${name}: ${a?.status}`;
      }).join("\n") || "None running";
      
      const subList = Array.from(subagentAgents.keys()).join(", ");
      
      ctx.ui.notify(`Main: ${mainList}\n\nSubagents: ${subList}`, "info");
    },
  });
  
  // ============================================================================
  // AUTONOMOUS DELEGATION COMMANDS
  // ============================================================================
  
  // /autonomous [mode]
  pi.registerCommand("autonomous", {
    description: "Control autonomous delegation: /autonomous [off|simple|medium|complex|always]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const mode = args.trim() as typeof autonomyMode;
      
      if (mode && ["off", "simple", "medium", "complex", "always"].includes(mode)) {
        autonomyMode = mode;
        ctx.ui.notify(`✅ Autonomous mode: ${mode}`, "info");
      } else if (args.trim()) {
        ctx.ui.notify("❌ Invalid mode. Use: off, simple, medium, complex, always", "error");
      } else {
        ctx.ui.notify(`🔄 Autonomous mode: ${autonomyMode}`, "info");
      }
    },
  });
  
  // /analyze <task>
  pi.registerCommand("analyze", {
    description: "Analyze task complexity: /analyze <task description>",
    handler: async (args: string, ctx: ExtensionContext) => {
      if (!args.trim()) {
        ctx.ui.notify("❌ Usage: /analyze <task>", "error");
        return;
      }
      
      const analysis = analyzeTask(args);
      ctx.ui.notify(
        `Complexity: ${analysis.complexity}\nStrategy: ${analysis.suggestedStrategy}\nConfidence: ${Math.round(analysis.confidence * 100)}%`,
        "info"
      );
    },
  });
  
  console.log(`[Orchestrator] Ready with ${mainAgents.size} main agents, ${subagentAgents.size} subagents`);
  console.log("[Orchestrator] Use /agent commands or agent_orchestrate tool");
  console.log("[Orchestrator] ⚠️  agent_spawn and subagent_spawn are deprecated, use agent_orchestrate");
}
