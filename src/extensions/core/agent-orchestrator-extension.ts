/**
 * Unified Agent Orchestration Extension - v0.3.0
 *
 * Provides a single, coherent API for all agent operations.
 * 
 * Hierarchy:
 *   Orchestrator (1) → Main Agents (N) → Subagents (M)
 * 
 * Subagents are INTERNAL implementation details:
 *   - NOT user-facing (no spawn_subagent command)
 *   - Automatically spawned by delegate operation
 *   - Scout, Planner, Worker, Reviewer execute based on task complexity
 * 
 * Operations:
 *   - list: List all agents
 *   - status: Check agent status
 *   - stop: Stop an agent
 *   - analyze: Analyze task complexity
 *   - delegate: Auto-delegate task to appropriate subagents
 * 
 * Delegation Flow:
 *   - Simple: Handle directly
 *   - Medium: Scout → Worker
 *   - Complex: Scout → Planner → Worker → Reviewer
 * 
 * @version 0.3.0
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { AGENT_TYPES } from "../../agent/types/definitions";
import { runEmbeddedAgent } from "../../agent/embedded-runner";
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
  
  console.log(`[Orchestrator] 🚀 Starting main agent '${name}' on port ${port}...`);
  
  return new Promise((resolve) => {
    // Use Bun.spawn for better integration
    const proc = Bun.spawn({
      cmd: [
        "bun",
        "run",
        "src/cli/index.ts",
        "--local",
        "--agent",
        name,
      ],
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
      stdout: "pipe",
      stderr: "pipe",
    });
    
    if (!proc.pid) {
      resolve({ success: false, error: "Failed to spawn process (no PID)" });
      return;
    }
    
    const agentProcess: MainAgentProcess = {
      name,
      process: proc as unknown as ChildProcess, // Type compat
      pid: proc.pid,
      startedAt: new Date(),
      status: "starting",
      port,
      config,
    };
    
    mainAgents.set(name, agentProcess);
    
    // Read stdout and log
    const reader = proc.stdout.getReader();
    const readStdout = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = new TextDecoder().decode(value);
          if (text.includes("🐉 0xKobold starting") || text.includes("Extension loaded")) {
            agentProcess.status = "running";
          }
          fs.appendFile(logFile, `[${new Date().toISOString()}] ${text}`).catch(() => {});
        }
      } catch (e) {}
    };
    readStdout();
    
    // Read stderr
    const errReader = proc.stderr.getReader();
    const readStderr = async () => {
      try {
        while (true) {
          const { done, value } = await errReader.read();
          if (done) break;
          const text = new TextDecoder().decode(value);
          fs.appendFile(logFile, `[${new Date().toISOString()}] ERROR: ${text}`).catch(() => {});
        }
      } catch (e) {}
    };
    readStderr();
    
    proc.exited.then((code) => {
      mainAgents.delete(name);
      if (code !== 0 && code !== null) {
        console.log(`[Orchestrator] Agent ${name} exited with code ${code}`);
      }
    }).catch((err) => {
      console.error(`[Orchestrator] Agent ${name} error:`, err);
      agentProcess.status = "error";
      agentProcess.lastError = err.message;
    });
    
    // Check for startup
    const checkInterval = setInterval(() => {
      if (agentProcess.status === "running") {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        console.log(`[Orchestrator] ✅ Agent '${name}' is running (PID: ${proc.pid})`);
        resolve({ success: true, pid: proc.pid });
      }
    }, 100);
    
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (agentProcess.status === "starting") {
        agentProcess.status = "error";
        agentProcess.lastError = "Startup timeout";
        console.error(`[Orchestrator] ❌ Agent '${name}' startup timeout`);
        proc.kill("SIGTERM");
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

// Subagent spawning - FIXED v0.2.1
/**
 * Internal Subagent Spawning - Direct Execution
 * 
 * Uses runEmbeddedAgent from embedded-runner for ephemeral subagent execution.
 * Subagents run in same process, sharing context and tools.
 */

// Map subagent types to agent types
const SUBAGENT_TO_AGENT_TYPE: Record<string, keyof typeof AGENT_TYPES> = {
  scout: "researcher",    // Scout = fast information gathering
  planner: "coordinator", // Planner = coordination/planning
  worker: "worker",        // Worker = implementation
  reviewer: "reviewer",    // Reviewer = validation
};

async function spawnSubagentInternal(
  agentName: string,
  task: string,
  ctx: ExtensionContext
): Promise<SubagentResult> {
  const startTime = Date.now();
  const agentConfig = subagentAgents.get(agentName);
  
  if (!agentConfig) {
    console.error(`[Orchestrator] ❌ Subagent '${agentName}' not found. Available: ${Array.from(subagentAgents.keys()).join(", ")}`);
    return {
      agent: agentName,
      task,
      exitCode: 1,
      output: "",
      error: `Subagent '${agentName}' not found. Available: ${Array.from(subagentAgents.keys()).join(", ")}`,
      duration: 0,
    };
  }
  
  console.log(`[Orchestrator] 🚀 Spawning subagent '${agentName}' for: ${task.slice(0, 100)}...`);
  
  try {
    // Get agent type definition
    const agentTypeName = SUBAGENT_TO_AGENT_TYPE[agentName] || "worker";
    const agentTypeDef = AGENT_TYPES[agentTypeName];
    
    if (!agentTypeDef) {
      console.error(`[Orchestrator] ❌ Agent type '${agentTypeName}' not found`);
      return {
        agent: agentName,
        task,
        exitCode: 1,
        output: "",
        error: `Agent type '${agentTypeName}' not found`,
        duration: Date.now() - startTime,
      };
    }
    
    // Build system prompt (subagent config has the prompt, agent type has capabilities)
    const systemPrompt = `${agentTypeDef.systemPrompt}\n\n${agentConfig.systemPrompt}`;
    
    // Use runEmbeddedAgent for ephemeral execution
    console.log(`[Orchestrator] 🏃 Running ${agentName} as ${agentTypeName}...`);
    
    const result = await runEmbeddedAgent({
      prompt: task,
      cwd: process.cwd(),
      extraSystemPrompt: systemPrompt,
      model: agentConfig.model,
      extensions: [], // Filtered extensions for subagent
      useTuiSettings: false, // Don't load TUI settings
    });
    
    const duration = Date.now() - startTime;
    console.log(`[Orchestrator] ✅ ${agentName} completed in ${duration}ms`);
    
    return {
      agent: agentName,
      task,
      exitCode: result.text ? 0 : 1,
      output: result.text || "",
      error: result.text ? undefined : "No output from subagent",
      duration,
    };
    
  } catch (err: any) {
    console.error(`[Orchestrator] ❌ Subagent execution error:`, err?.message);
    return {
      agent: agentName,
      task,
      exitCode: 1,
      output: "",
      error: `Subagent execution failed: ${err?.message}`,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Check if gateway is running (kept for reference)
 */
async function checkGatewayRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Spawn subagent via gateway HTTP API (kept for reference, not used)
 */
async function spawnViaGateway(
  agentConfig: SubagentConfig,
  task: string,
  ctx: ExtensionContext,
  port: number
): Promise<SubagentResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`http://localhost:${port}/agent.run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: task,
        agentId: agentConfig.name,
        thinking: "medium",
      }),
      signal: AbortSignal.timeout(120000),
    });
    
    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }
    
    const result = await response.json() as { status: string; result?: { payloads?: Array<{ content?: string }>; }; error?: string };
    
    return {
      agent: agentConfig.name,
      task,
      exitCode: result.status === "ok" ? 0 : 1,
      output: result.result?.payloads?.[0]?.content || "",
      error: result.error,
      duration: Date.now() - startTime,
    };
  } catch (err: any) {
    throw new Error(`Gateway spawn failed: ${err?.message}`);
  }
}

/**
 * Legacy CLI-based spawning (DEPRECATED - KEPT FOR REFERENCE)
 * 
 * This approach is broken because CLI doesn't support --mode subagent.
 * Use spawnSubagentInternal instead.
 */
async function spawnSubagent(
  agentName: string,
  task: string,
  ctx: ExtensionContext
): Promise<SubagentResult> {
  // DEPRECATED: Use spawnSubagentInternal instead
  console.warn(`[Orchestrator] ⚠️ spawnSubagent CLI approach is deprecated. Using internal spawn.`);
  return spawnSubagentInternal(agentName, task, ctx);
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
  
  /**
   * ⚠️  OPERATION NAMES for delegate:
   *
   * Valid operations (case-sensitive):
   *   - "list"            → List all agents
   *   - "status"          → Check agent status
   *   - "stop"            → Stop an agent
   *   - "analyze"         → Analyze task complexity
   *   - "delegate"        → Auto-delegate task to subagents (INTERNAL)
   *
   * ❌ spawn_main and spawn_subagent are INTERNAL - use delegate instead
   * ❌ WRONG: operation="autoDelegate"
   * ✅ CORRECT: operation="delegate"
   *
   * For task breakdown (kanban), use task_breakdown tool instead.
   */
  pi.registerTool({
    name: "agent_orchestrate",
    label: "Unified Agent Orchestration",
    description: "Agent operations: list, status, stop, analyze, delegate. Subagents are spawned INTERNALLY based on task complexity - use delegate for autonomous workflow.",
    parameters: Type.Object({
      operation: Type.String({
        description: "Operation: list | status | stop | analyze | delegate (NOT spawn_main/spawn_subagent)",
      }),
      // Main agent config
      mainAgent: Type.Optional(Type.String({ description: "Main agent name (for status/stop)" })),
      // Task for delegation
      task: Type.Optional(Type.String({ description: "Task description (for analyze/delegate)" })),
      // Delegation strategy
      strategy: Type.Optional(Type.String({ description: "Delegation strategy: simple, medium, complex, always, off", default: "medium" })),
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
          // INTERNAL: Use /agent commands for main agent management
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
          // INTERNAL: Subagents are spawned by delegate, not directly by users
          // Redirect to delegate operation for proper workflow
          const task = params.task as string;
          if (!task) {
            return { content: [{ type: "text" as const, text: "❌ task required. Use delegate operation for autonomous subagent spawning." }], details: { error: "missing_task" } };
          }
          
          ctx.ui.notify(`ℹ️ Use delegate operation instead. Spawning subagent directly...`, "info");
          const agent = params.subagent as string || "worker";
          const result = await spawnSubagentInternal(agent, task, ctx);
          
          const status = result.exitCode === 0 ? "✅" : "❌";
          return {
            content: [{
              type: "text" as const,
              text: `${status} ${result.agent} complete (${result.duration}ms)\n\n${result.output}\n\n💡 Tip: Use delegate operation for autonomous multi-agent workflows.`,
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
          
          // Actually spawn subagents based on complexity
          const results: SubagentResult[] = [];
          let result = `**Autonomous Delegation**\n\nTask: ${task}\nComplexity: ${analysis.complexity}\nStrategy: ${analysis.suggestedStrategy}\n\n`;
          
          try {
            if (analysis.complexity === "medium") {
              // Medium: Scout → Worker
              result += "---\n### Phase 1: Scout\n";
              const scoutResult = await spawnSubagentInternal("scout", task, ctx);
              results.push(scoutResult);
              result += `**Scout Output:**\n${scoutResult.output}\n\n`;
              
              // Check if scout found anything useful before proceeding
              if (scoutResult.exitCode === 0) {
                result += "---\n### Phase 2: Worker\n";
                const workerResult = await spawnSubagentInternal("worker", task, ctx);
                results.push(workerResult);
                result += `**Worker Output:**\n${workerResult.output}\n`;
              }
              
            } else if (analysis.complexity === "complex") {
              // Complex: Scout → Planner → Worker → Reviewer
              result += "---\n### Phase 1: Scout\n";
              const scoutResult = await spawnSubagentInternal("scout", task, ctx);
              results.push(scoutResult);
              result += `**Scout Output:**\n${scoutResult.output}\n\n`;
              
              if (scoutResult.exitCode === 0) {
                result += "---\n### Phase 2: Planner\n";
                const planResult = await spawnSubagentInternal("planner", task, ctx);
                results.push(planResult);
                result += `**Plan:**\n${planResult.output}\n\n`;
                
                result += "---\n### Phase 3: Worker\n";
                const workerResult = await spawnSubagentInternal("worker", task, ctx);
                results.push(workerResult);
                result += `**Worker Output:**\n${workerResult.output}\n\n`;
                
                result += "---\n### Phase 4: Reviewer\n";
                const reviewResult = await spawnSubagentInternal("reviewer", task, ctx);
                results.push(reviewResult);
                result += `**Review:**\n${reviewResult.output}\n`;
              }
            }
            
            // Summarize results
            const successCount = results.filter(r => r.exitCode === 0).length;
            const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
            
            result += `\n---\n**Summary:** ${successCount}/${results.length} subagents succeeded (${totalDuration}ms total)`;
            
          } catch (err: any) {
            result += `\n\n❌ Error during delegation: ${err?.message}`;
          }
          
          return {
            content: [{ type: "text" as const, text: result }],
            details: { analysis, delegated: true, strategy, results },
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
