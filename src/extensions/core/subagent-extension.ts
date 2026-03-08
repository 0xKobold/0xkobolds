/**
 * Subagent Extension - Parallel Agent Execution
 * 
 * Spawn specialized sub-agents with isolated context windows.
 * Supports three modes: single, parallel, and chain.
 * 
 * Inspired by pi-mono's subagent extension.
 * 
 * Usage:
 *   Single:   await agent_spawn({ agent: "scout", task: "Find auth code" })
 *   Parallel: await agent_spawn({ tasks: [{agent, task}, ...] })
 *   Chain:    await agent_spawn({ chain: [{agent, task}, ...] })
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

// Constants
const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const AGENTS_DIR = path.join(homedir(), ".0xkobold", "agents");

// Types
interface AgentConfig {
  name: string;
  description: string;
  tools: string[];
  model: string;
  systemPrompt: string;
}

interface SingleTask {
  agent: string;
  task: string;
}

interface SubagentResult {
  agent: string;
  task: string;
  exitCode: number;
  output: string;
  error?: string;
  duration: number;
}

// Agent discovery
async function discoverAgents(): Promise<Map<string, AgentConfig>> {
  const agents = new Map<string, AgentConfig>();
  
  try {
    const files = await fs.readdir(AGENTS_DIR);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = await fs.readFile(path.join(AGENTS_DIR, file), 'utf-8');
        const config = parseAgentDefinition(content, file.replace('.md', ''));
        if (config) {
          agents.set(config.name, config);
        }
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }
  
  // Add built-in agents if not found
  if (!agents.has('scout')) {
    agents.set('scout', getDefaultAgent('scout'));
  }
  if (!agents.has('planner')) {
    agents.set('planner', getDefaultAgent('planner'));
  }
  if (!agents.has('worker')) {
    agents.set('worker', getDefaultAgent('worker'));
  }
  if (!agents.has('reviewer')) {
    agents.set('reviewer', getDefaultAgent('reviewer'));
  }
  
  return agents;
}

function parseAgentDefinition(content: string, defaultName: string): AgentConfig | null {
  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;
  
  const frontmatter = frontmatterMatch[1];
  const systemPrompt = frontmatterMatch[2].trim();
  
  const lines = frontmatter.split('\n');
  let name = defaultName;
  let description = '';
  let tools: string[] = [];
  let model = 'qwen2.5-coder:14b';
  
  for (const line of lines) {
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    
    if (key === 'name') name = value;
    else if (key === 'description') description = value;
    else if (key === 'tools') tools = value.split(',').map(t => t.trim());
    else if (key === 'model') model = value;
  }
  
  return { name, description, tools, model, systemPrompt };
}

function getDefaultAgent(type: string): AgentConfig {
  const defaults: Record<string, AgentConfig> = {
    scout: {
      name: 'scout',
      description: 'Fast codebase reconnaissance',
      tools: ['read_file', 'search_files', 'list_directory'],
      model: 'qwen2.5-coder:14b',
      systemPrompt: `You are a fast reconnaissance agent. Your job:
1. Quickly scan the codebase structure
2. Find relevant files using search and list tools
3. Read key files to understand context
4. Return a COMPRESSED summary (max 500 tokens)

Be fast. Be concise. Focus on facts, not opinions.
Only use available tools. Never write files.`,
    },
    planner: {
      name: 'planner',
      description: 'Creates implementation plans',
      tools: ['read_file', 'search_files', 'list_directory'],
      model: 'qwen2.5-coder:14b',
      systemPrompt: `You are a planning specialist. Your job:
1. Analyze the existing code and requirements
2. Create a step-by-step implementation plan
3. Identify potential issues or blockers
4. Provide clear, actionable steps

Focus on planning, not implementation.
Provide specific file paths and code structure.`,
    },
    worker: {
      name: 'worker',
      description: 'General-purpose implementation',
      tools: ['read_file', 'write_file', 'edit_file', 'search_files', 'shell'],
      model: 'qwen2.5-coder:14b',
      systemPrompt: `You are an implementation specialist. Your job:
1. Implement features according to specifications
2. Write clean, well-tested code
3. Follow existing code patterns
4. Handle errors gracefully

You have full tool access including write operations.
Always verify changes before completing.`,
    },
    reviewer: {
      name: 'reviewer',
      description: 'Code review specialist',
      tools: ['read_file', 'search_files', 'shell'],
      model: 'qwen2.5-coder:14b',
      systemPrompt: `You are a code review specialist. Your job:
1. Review code changes thoroughly
2. Identify bugs, security issues, or style violations
3. Suggest specific improvements
4. Check for edge cases

Be thorough but constructive.
Provide specific line-by-line feedback.`,
    },
  };
  
  return defaults[type] || defaults.worker;
}

// Spawn a single subagent
async function spawnSubagent(
  agentConfig: AgentConfig,
  task: string,
  ctx: ExtensionContext
): Promise<SubagentResult> {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    // Build command
    const args = [
      'run',
      'src/cli/index.ts',
      '--command',
      `agent:${agentConfig.name}`,
      '--task',
      task,
    ];
    
    // Spawn process
    const child = spawn('bun', args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        KOBOLD_SUBAGENT: 'true',
        KOBOLD_AGENT_MODEL: agentConfig.model,
        KOBOLD_AGENT_TOOLS: agentConfig.tools.join(','),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let output = '';
    let error = '';
    
    child.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    
    child.stderr?.on('data', (data: Buffer) => {
      error += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        agent: agentConfig.name,
        task,
        exitCode: code || 0,
        output: output.trim(),
        error: error.trim() || undefined,
        duration: Date.now() - startTime,
      });
    });
    
    // Timeout after 5 minutes
    setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        agent: agentConfig.name,
        task,
        exitCode: 124,
        output: output.trim(),
        error: 'Timeout: Agent took too long',
        duration: Date.now() - startTime,
      });
    }, 5 * 60 * 1000);
  });
}

// Parallel execution with concurrency limiting
async function spawnParallel(
  tasks: SingleTask[],
  agents: Map<string, AgentConfig>,
  ctx: ExtensionContext
): Promise<SubagentResult[]> {
  const results: SubagentResult[] = [];
  const executing: Promise<void>[] = [];
  let completed = 0;
  
  // Progress update
  const updateProgress = () => {
    ctx.ui.notify(`⏳ ${completed}/${tasks.length} agents complete`, 'info');
  };
  
  for (const task of tasks) {
    const agentConfig = agents.get(task.agent);
    if (!agentConfig) {
      results.push({
        agent: task.agent,
        task: task.task,
        exitCode: 1,
        output: '',
        error: `Agent '${task.agent}' not found`,
        duration: 0,
      });
      continue;
    }
    
    // Wait if at concurrency limit
    while (executing.length >= MAX_CONCURRENCY) {
      await Promise.race(executing);
    }
    
    const promise = spawnSubagent(agentConfig, task.task, ctx).then((result) => {
      results.push(result);
      completed++;
      updateProgress();
    });
    
    executing.push(promise);
    
    // Clean up completed promises
    promise.then(() => {
      const index = executing.indexOf(promise);
      if (index > -1) executing.splice(index, 1);
    });
  }
  
  // Wait for all to complete
  await Promise.all(executing);
  
  return results;
}

// Chain execution
async function spawnChain(
  chain: SingleTask[],
  agents: Map<string, AgentConfig>,
  ctx: ExtensionContext
): Promise<SubagentResult[]> {
  const results: SubagentResult[] = [];
  let previousOutput = '';
  
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const agentConfig = agents.get(step.agent);
    
    if (!agentConfig) {
      results.push({
        agent: step.agent,
        task: step.task,
        exitCode: 1,
        output: '',
        error: `Agent '${step.agent}' not found`,
        duration: 0,
      });
      break;
    }
    
    // Replace {previous} placeholder
    const task = step.task.replace(/{previous}/g, previousOutput);
    
    ctx.ui.notify(`⏳ Step ${i + 1}/${chain.length}: ${step.agent}...`, 'info');
    
    const result = await spawnSubagent(agentConfig, task, ctx);
    results.push(result);
    
    if (result.exitCode !== 0) {
      ctx.ui.notify(`❌ Step ${i + 1} failed`, 'error');
      break;
    }
    
    previousOutput = result.output;
    ctx.ui.notify(`✅ Step ${i + 1} complete`, 'info');
  }
  
  return results;
}

export default async function subagentExtension(pi: ExtensionAPI) {
  console.log("[Subagent] Extension loaded");
  
  // Ensure agents directory exists
  await fs.mkdir(AGENTS_DIR, { recursive: true });
  
  // Discover agents
  const agents = await discoverAgents();
  console.log(`[Subagent] Found ${agents.size} agents: ${Array.from(agents.keys()).join(', ')}`);
  
  // TOOL: agent_spawn
  pi.registerTool({
    name: "agent_spawn",
    label: "Spawn Subagent",
    description: "Spawn single, parallel, or chained subagents with isolated context",
    parameters: Type.Object({
      // Single mode
      agent: Type.Optional(Type.String({ description: "Agent name" })),
      task: Type.Optional(Type.String({ description: "Task description" })),
      // Parallel mode
      tasks: Type.Optional(Type.Array(
        Type.Object({
          agent: Type.String({ description: "Agent name" }),
          task: Type.String({ description: "Task description" }),
        }),
        { description: "Array of tasks for parallel execution" }
      )),
      // Chain mode
      chain: Type.Optional(Type.Array(
        Type.Object({
          agent: Type.String({ description: "Agent name" }),
          task: Type.String({ description: "Task description" }),
        }),
        { description: "Array of tasks for sequential execution" }
      )),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ): Promise<AgentToolResult<unknown>> {
      const startTime = Date.now();
      
      // Mode detection
      if (params.tasks && Array.isArray(params.tasks)) {
        // Parallel mode
        const tasks = params.tasks as SingleTask[];
        
        if (tasks.length > MAX_PARALLEL_TASKS) {
          return {
            content: [{ type: "text" as const, text: `❌ Too many tasks (max ${MAX_PARALLEL_TASKS})` }],
            details: { error: "max_tasks_exceeded" },
          };
        }
        
        ctx.ui.notify(`🚀 Spawning ${tasks.length} agents in parallel...`, 'info');
        const results = await spawnParallel(tasks, agents, ctx);
        
        const success = results.filter(r => r.exitCode === 0).length;
        const failed = results.filter(r => r.exitCode !== 0).length;
        
        const summary = results.map(r => 
          `${r.exitCode === 0 ? '✅' : '❌'} ${r.agent}: ${r.task.slice(0, 50)}...`
        ).join('\n');
        
        return {
          content: [{
            type: "text" as const,
            text: `✅ ${success} success, ${failed} failed\n\n${summary}`,
          }],
          details: { mode: "parallel", results },
        };
        
      } else if (params.chain && Array.isArray(params.chain)) {
        // Chain mode
        const chain = params.chain as SingleTask[];
        
        ctx.ui.notify(`🔗 Starting chain of ${chain.length} agents...`, 'info');
        const results = await spawnChain(chain, agents, ctx);
        
        const success = results.filter(r => r.exitCode === 0).length;
        
        const summary = results.map((r, i) => 
          `${r.exitCode === 0 ? '✅' : '❌'} Step ${i + 1} (${r.agent}): ${r.task.slice(0, 40)}...`
        ).join('\n');
        
        return {
          content: [{
            type: "text" as const,
            text: `✅ Chain complete: ${success}/${chain.length} steps\n\n${summary}`,
          }],
          details: { mode: "chain", results },
        };
        
      } else if (params.agent && params.task) {
        // Single mode
        const agentConfig = agents.get(params.agent as string);
        
        if (!agentConfig) {
          return {
            content: [{ type: "text" as const, text: `❌ Agent '${params.agent}' not found` }],
            details: { error: "agent_not_found", available: Array.from(agents.keys()) },
          };
        }
        
        ctx.ui.notify(`🚀 Spawning ${agentConfig.name}...`, 'info');
        const result = await spawnSubagent(agentConfig, params.task as string, ctx);
        
        const status = result.exitCode === 0 ? '✅' : '❌';
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        return {
          content: [{
            type: "text" as const,
            text: `${status} ${result.agent} complete (${duration}s)\n\n${result.output}`,
          }],
          details: result,
        };
      }
      
      return {
        content: [{ type: "text" as const, text: "❌ Must provide either: (agent+task), tasks[], or chain[]" }],
        details: { error: "invalid_params" },
      };
    },
  });
  
  // COMMAND: /agents
  pi.registerCommand("agents", {
    description: "List available agents",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const list = Array.from(agents.values()).map(a => 
        `- ${a.name}: ${a.description} (${a.tools.length} tools)`
      ).join('\n');
      
      ctx.ui.notify(`🤖 Available Agents:\n${list}`, 'info');
    },
  });
  
  // COMMAND: /implement
  pi.registerCommand("implement", {
    description: "Implement with workflow: scout → planner → worker",
    handler: async (args: string, ctx: ExtensionContext) => {
      if (!args.trim()) {
        ctx.ui.notify("❌ Usage: /implement <feature description>", 'error');
        return;
      }
      
      const chain = [
        { agent: "scout", task: `Find all code related to: ${args}` },
        { agent: "planner", task: `Create implementation plan for: ${args}. Findings: {previous}` },
        { agent: "worker", task: `Implement: ${args}. Plan: {previous}` },
      ];
      
      ctx.ui.notify(`🚀 Starting /implement workflow for: ${args}`, 'info');
      await spawnChain(chain, agents, ctx);
    },
  });
  
  // COMMAND: /scout-and-plan
  pi.registerCommand("scout-and-plan", {
    description: "Scout and plan: scout → planner (no implementation)",
    handler: async (args: string, ctx: ExtensionContext) => {
      if (!args.trim()) {
        ctx.ui.notify("❌ Usage: /scout-and-plan <feature description>", 'error');
        return;
      }
      
      const chain = [
        { agent: "scout", task: `Find all code related to: ${args}` },
        { agent: "planner", task: `Create implementation plan for: ${args}. Findings: {previous}` },
      ];
      
      ctx.ui.notify(`🚀 Starting /scout-and-plan for: ${args}`, 'info');
      await spawnChain(chain, agents, ctx);
    },
  });
  
  // COMMAND: /parallel
  pi.registerCommand("parallel", {
    description: "Run agents in parallel: /parallel \"task1\" \"task2\" (uses scout)",
    handler: async (args: string, ctx: ExtensionContext) => {
      const tasks = args.split('"').filter((_, i) => i % 2 === 1);
      
      if (tasks.length === 0) {
        ctx.ui.notify("❌ Usage: /parallel \"task 1\" \"task 2\"", 'error');
        return;
      }
      
      if (tasks.length > MAX_PARALLEL_TASKS) {
        ctx.ui.notify(`❌ Max ${MAX_PARALLEL_TASKS} tasks`, 'error');
        return;
      }
      
      const parallelTasks = tasks.map(task => ({
        agent: "scout",
        task,
      }));
      
      ctx.ui.notify(`🚀 Running ${tasks.length} scouts in parallel...`, 'info');
      await spawnParallel(parallelTasks, agents, ctx);
    },
  });
  
  console.log("[Subagent] Ready");
}
