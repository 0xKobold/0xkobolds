/**
 * Subagent Extension - v0.0.6 Polish
 * 
 * Improvements:
 * - Real-time stream handling
 * - Better error classification
 * - Result merging strategies
 * - Custom agent loading from ~/.0xkobold/agents/
 * - Project agent loading from .0xkobold/agents/
 * 
 * @version 0.0.6
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

// Constants
const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const USER_AGENTS_DIR = path.join(homedir(), ".0xkobold", "agents");
const PROJECT_AGENTS_DIR = path.join(process.cwd(), ".0xkobold", "agents");

// Types
interface AgentConfig {
  name: string;
  description: string;
  tools: string[];
  model: string;
  systemPrompt: string;
  scope?: "user" | "project" | "builtin";
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
  streamed?: boolean;
  chunks?: StreamChunk[];
}

interface StreamChunk {
  type: "stdout" | "stderr" | "system";
  content: string;
  timestamp: number;
}

interface MergeStrategy {
  name: string;
  description: string;
  merge(results: SubagentResult[]): string;
}

// Error classification
interface AgentError {
  code: string;
  message: string;
  category: "timeout" | "not_found" | "execution" | "unknown";
  suggestion: string;
}

// Agent discovery with user/project/builtin scopes
async function discoverAgents(): Promise<Map<string, AgentConfig>> {
  const agents = new Map<string, AgentConfig>();
  
  // 1. Load built-in agents
  const builtinAgents = loadBuiltinAgents();
  for (const [name, config] of builtinAgents) {
    config.scope = "builtin";
    agents.set(name, config);
  }
  console.log(`[Subagent] Loaded ${builtinAgents.size} built-in agents`);
  
  // 2. Load user agents from ~/.0xkobold/agents/
  try {
    await fs.mkdir(USER_AGENTS_DIR, { recursive: true });
    const userFiles = await fs.readdir(USER_AGENTS_DIR);
    for (const file of userFiles) {
      if (file.endsWith('.md')) {
        const content = await fs.readFile(path.join(USER_AGENTS_DIR, file), 'utf-8');
        const config = parseAgentDefinition(content, file.replace('.md', ''));
        if (config) {
          config.scope = "user";
          agents.set(config.name, config);
          console.log(`[Subagent] Loaded user agent: ${config.name}`);
        }
      }
    }
  } catch (error) {
    console.log(`[Subagent] User agents dir not accessible: ${USER_AGENTS_DIR}`);
  }
  
  // 3. Load project agents from .0xkobold/agents/ (only if exists)
  if (existsSync(PROJECT_AGENTS_DIR)) {
    try {
      const projectFiles = await fs.readdir(PROJECT_AGENTS_DIR);
      for (const file of projectFiles) {
        if (file.endsWith('.md')) {
          const content = await fs.readFile(path.join(PROJECT_AGENTS_DIR, file), 'utf-8');
          const config = parseAgentDefinition(content, file.replace('.md', ''));
          if (config) {
            config.scope = "project";
            // Prefix with project_ to avoid conflicts
            const fullName = `project:${config.name}`;
            agents.set(fullName, config);
            console.log(`[Subagent] Loaded project agent: ${fullName}`);
          }
        }
      }
    } catch (error) {
      console.log(`[Subagent] Project agents dir not accessible`);
    }
  }
  
  console.log(`[Subagent] Total agents: ${agents.size}`);
  return agents;
}

function loadBuiltinAgents(): Map<string, AgentConfig> {
  const agents = new Map<string, AgentConfig>();
  
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
  
  for (const [name, config] of Object.entries(defaults)) {
    agents.set(name, config);
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

// Error classification
function classifyError(result: SubagentResult): AgentError {
  if (result.exitCode === 124 || result.error?.includes("Timeout")) {
    return {
      code: "AGENT_TIMEOUT",
      message: `Agent '${result.agent}' timed out after 5 minutes`,
      category: "timeout",
      suggestion: "Try breaking the task into smaller chunks or increasing timeout"
    };
  }
  
  if (result.exitCode === 127 || result.error?.includes("not found")) {
    return {
      code: "AGENT_NOT_FOUND",
      message: `Agent '${result.agent}' not found`,
      category: "not_found",
      suggestion: "Check available agents with /agents command"
    };
  }
  
  if (result.exitCode !== 0) {
    return {
      code: "AGENT_EXECUTION_ERROR",
      message: `Agent '${result.agent}' failed with exit code ${result.exitCode}`,
      category: "execution",
      suggestion: result.error || "Check agent logs for details"
    };
  }
  
  return {
    code: "UNKNOWN_ERROR",
    message: "Unknown error occurred",
    category: "unknown",
    suggestion: "Try again or check system logs"
  };
}

// Merge strategies
function getMergeStrategies(): MergeStrategy[] {
  return [
    {
      name: "concatenate",
      description: "Simple concatenation with headers",
      merge: (results) => {
        return results.map(r => 
          `## ${r.agent}\n\n${r.output}`
        ).join("\n\n---\n\n");
      }
    },
    {
      name: "summary",
      description: "Summary with key points from each agent",
      merge: (results) => {
        const successful = results.filter(r => r.exitCode === 0);
        const failed = results.filter(r => r.exitCode !== 0);
        
        let output = `## Summary\n\n`;
        output += `✅ ${successful.length} agents succeeded\n`;
        output += `❌ ${failed.length} agents failed\n\n`;
        
        if (successful.length > 0) {
          output += "### Results\n\n";
          successful.forEach(r => {
            output += `**${r.agent}**: ${r.output.slice(0, 200)}${r.output.length > 200 ? '...' : ''}\n\n`;
          });
        }
        
        if (failed.length > 0) {
          output += "### Failures\n\n";
          failed.forEach(r => {
            const error = classifyError(r);
            output += `**${r.agent}**: ${error.message}\n`;
          });
        }
        
        return output;
      }
    },
    {
      name: "structured",
      description: "JSON-structured output",
      merge: (results) => {
        const structured = {
          total: results.length,
          successful: results.filter(r => r.exitCode === 0).length,
          failed: results.filter(r => r.exitCode !== 0).length,
          results: results.map(r => ({
            agent: r.agent,
            success: r.exitCode === 0,
            duration: r.duration,
            output: r.output.slice(0, 500), // Truncate for JSON
          }))
        };
        return JSON.stringify(structured, null, 2);
      }
    }
  ];
}

// Spawn a single subagent with optional streaming
async function spawnSubagent(
  agentConfig: AgentConfig,
  task: string,
  ctx: ExtensionContext,
  options: { stream?: boolean } = {}
): Promise<SubagentResult> {
  const startTime = Date.now();
  const chunks: StreamChunk[] = [];
  
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
    
    // Real-time streaming
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      
      if (options.stream) {
        chunks.push({
          type: 'stdout',
          content: text,
          timestamp: Date.now()
        });
        // Stream to UI
        ctx.ui.notify(`[${agentConfig.name}] ${text.slice(0, 100)}`, 'info');
      }
    });
    
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      error += text;
      
      if (options.stream) {
        chunks.push({
          type: 'stderr',
          content: text,
          timestamp: Date.now()
        });
        ctx.ui.notify(`[${agentConfig.name}] ERR: ${text.slice(0, 100)}`, 'error');
      }
    });
    
    child.on('close', (code) => {
      const result: SubagentResult = {
        agent: agentConfig.name,
        task,
        exitCode: code || 0,
        output: output.trim(),
        error: error.trim() || undefined,
        duration: Date.now() - startTime,
        streamed: options.stream,
        chunks: options.stream ? chunks : undefined,
      };
      
      resolve(result);
    });
    
    // Timeout after 5 minutes
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 5 * 60 * 1000);
  });
}

// Parallel execution with merge strategy
async function spawnParallel(
  tasks: SingleTask[],
  agents: Map<string, AgentConfig>,
  ctx: ExtensionContext,
  options: { mergeStrategy?: string; stream?: boolean } = {}
): Promise<{ results: SubagentResult[]; mergedOutput: string }> {
  const results: SubagentResult[] = [];
  const executing: Promise<void>[] = [];
  let completed = 0;
  
  const updateProgress = () => {
    ctx.ui.notify(`⏳ ${completed}/${tasks.length} agents complete`, 'info');
  };
  
  for (const task of tasks) {
    const agentConfig = agents.get(task.agent);
    
    if (!agentConfig) {
      const error = {
        agent: task.agent,
        task: task.task,
        exitCode: 1,
        output: '',
        error: `Agent '${task.agent}' not found. Available: ${Array.from(agents.keys()).join(', ')}`,
        duration: 0,
      };
      results.push(error);
      completed++;
      updateProgress();
      continue;
    }
    
    // Wait if at concurrency limit
    while (executing.length >= MAX_CONCURRENCY) {
      await Promise.race(executing);
    }
    
    const promise = spawnSubagent(agentConfig, task.task, ctx, { 
      stream: options.stream 
    }).then((result) => {
      results.push(result);
      completed++;
      updateProgress();
      
      // Show error details if failed
      if (result.exitCode !== 0) {
        const classified = classifyError(result);
        ctx.ui.notify(
          `❌ ${result.agent} failed: ${classified.message}. ${classified.suggestion}`,
          'error'
        );
      }
    });
    
    executing.push(promise);
    
    promise.then(() => {
      const index = executing.indexOf(promise);
      if (index > -1) executing.splice(index, 1);
    });
  }
  
  await Promise.all(executing);
  
  // Apply merge strategy
  const strategies = getMergeStrategies();
  const strategy = strategies.find(s => s.name === options.mergeStrategy) || strategies[1]; // Default to summary
  const mergedOutput = strategy.merge(results);
  
  return { results, mergedOutput };
}

// Chain execution
async function spawnChain(
  chain: SingleTask[],
  agents: Map<string, AgentConfig>,
  ctx: ExtensionContext,
  options: { stream?: boolean } = {}
): Promise<SubagentResult[]> {
  const results: SubagentResult[] = [];
  let previousOutput = '';
  
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const agentConfig = agents.get(step.agent);
    
    if (!agentConfig) {
      const error = classifyError({
        agent: step.agent,
        task: step.task,
        exitCode: 1,
        output: '',
        error: `Agent '${step.agent}' not found`,
        duration: 0,
      });
      
      ctx.ui.notify(`❌ ${error.message}`, 'error');
      results.push({
        agent: step.agent,
        task: step.task,
        exitCode: 1,
        output: '',
        error: error.message,
        duration: 0,
      });
      break;
    }
    
    // Replace {previous} placeholder
    const task = step.task.replace(/{previous}/g, previousOutput);
    
    ctx.ui.notify(`⏳ Step ${i + 1}/${chain.length}: ${step.agent}...`, 'info');
    
    const result = await spawnSubagent(agentConfig, task, ctx, { 
      stream: options.stream 
    });
    results.push(result);
    
    if (result.exitCode !== 0) {
      const error = classifyError(result);
      ctx.ui.notify(`❌ Step ${i + 1} failed: ${error.message}`, 'error');
      break;
    }
    
    previousOutput = result.output;
    ctx.ui.notify(`✅ Step ${i + 1} complete`, 'info');
  }
  
  return results;
}

export default async function subagentExtension(pi: ExtensionAPI) {
  console.log("[Subagent] Extension loaded v0.0.6");
  
  // Ensure directories exist
  await fs.mkdir(USER_AGENTS_DIR, { recursive: true });
  
  // Discover agents from all scopes
  const agents = await discoverAgents();
  
  // TOOL: agent_spawn (enhanced for v0.0.6)
  pi.registerTool({
    name: "subagent_spawn",
    label: "Spawn Subagent",
    description: "Spawn single, parallel, or chained subagents with streaming and merge strategies",
    parameters: Type.Object({
      agent: Type.Optional(Type.String({ description: "Agent name" })),
      task: Type.Optional(Type.String({ description: "Task description" })),
      tasks: Type.Optional(Type.Array(
        Type.Object({
          agent: Type.String({ description: "Agent name" }),
          task: Type.String({ description: "Task description" }),
        }),
        { description: "Array of tasks for parallel execution" }
      )),
      chain: Type.Optional(Type.Array(
        Type.Object({
          agent: Type.String({ description: "Agent name" }),
          task: Type.String({ description: "Task description" }),
        }),
        { description: "Array of tasks for sequential execution" }
      )),
      stream: Type.Optional(Type.Boolean({ 
        description: "Enable real-time streaming to TUI",
        default: false 
      })),
      mergeStrategy: Type.Optional(Type.String({
        description: "Merge strategy for parallel results: concatenate, summary, structured",
        default: "summary"
      })),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ): Promise<AgentToolResult<unknown>> {
      const startTime = Date.now();
      const stream = params.stream as boolean || false;
      
      // Mode detection
      if (params.tasks && Array.isArray(params.tasks)) {
        const tasks = params.tasks as SingleTask[];
        
        if (tasks.length > MAX_PARALLEL_TASKS) {
          return {
            content: [{ type: "text" as const, text: `❌ Too many tasks (max ${MAX_PARALLEL_TASKS})` }],
            details: { error: "max_tasks_exceeded" },
          };
        }
        
        ctx.ui.notify(`🚀 Spawning ${tasks.length} agents in parallel...`, 'info');
        const { results, mergedOutput } = await spawnParallel(
          tasks, 
          agents, 
          ctx, 
          { 
            mergeStrategy: params.mergeStrategy as string,
            stream 
          }
        );
        
        const success = results.filter(r => r.exitCode === 0).length;
        const failed = results.filter(r => r.exitCode !== 0).length;
        
        return {
          content: [{
            type: "text" as const,
            text: `✅ ${success} success, ${failed} failed\n\n${mergedOutput}`,
          }],
          details: { 
            mode: "parallel", 
            results,
            mergeStrategy: params.mergeStrategy || "summary"
          },
        };
        
      } else if (params.chain && Array.isArray(params.chain)) {
        const chain = params.chain as SingleTask[];
        
        ctx.ui.notify(`🔗 Starting chain of ${chain.length} agents...`, 'info');
        const results = await spawnChain(chain, agents, ctx, { stream });
        
        const success = results.filter(r => r.exitCode === 0).length;
        
        const summary = results.map((r, i) => 
          `${r.exitCode === 0 ? '✅' : '❌'} Step ${i + 1} (${r.agent})`
        ).join('\n');
        
        return {
          content: [{
            type: "text" as const,
            text: `✅ Chain complete: ${success}/${chain.length} steps\n\n${summary}`,
          }],
          details: { mode: "chain", results },
        };
        
      } else if (params.agent && params.task) {
        const agentConfig = agents.get(params.agent as string);
        
        if (!agentConfig) {
          return {
            content: [{ 
              type: "text" as const, 
              text: `❌ Agent '${params.agent}' not found. Available:\n${Array.from(agents.keys()).map(k => `- ${k}`).join('\n')}` 
            }],
            details: { error: "agent_not_found", available: Array.from(agents.keys()) },
          };
        }
        
        ctx.ui.notify(`🚀 Spawning ${agentConfig.name}...`, 'info');
        const result = await spawnSubagent(agentConfig, params.task as string, ctx, { stream });
        
        if (result.exitCode !== 0) {
          const error = classifyError(result);
          return {
            content: [{
              type: "text" as const,
              text: `❌ ${error.message}\n\nSuggestion: ${error.suggestion}\n\nDetails:\n${result.error || 'No error details'}`,
            }],
            details: { ...result, errorCategory: error.category },
          };
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return {
          content: [{
            type: "text" as const,
            text: `✅ ${result.agent} complete (${duration}s)\n\n${result.output}`,
          }],
          details: result,
        };
      }
      
      return {
        content: [{ type: "text" as const, text: "❌ Must provide: (agent+task), tasks[], or chain[]" }],
        details: { 
          error: "invalid_params",
          hint: "Use `agent`+`task` for single, `tasks` array for parallel, or `chain` array for sequential"
        },
      };
    },
  });
  
  // COMMAND: /agents (enhanced with scope info)
  pi.registerCommand("subagents", {
    description: "List available agents with scope info",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const list = Array.from(agents.entries()).map(([name, a]) => {
        const scopeIcon = a.scope === "builtin" ? "🔧" : 
                         a.scope === "user" ? "👤" : "📁";
        return `${scopeIcon} ${name}: ${a.description} (${a.tools.length} tools)`;
      }).join('\n');
      
      ctx.ui.notify(`🤖 Available Agents:\n\n${list}\n\n🔧 = built-in, 👤 = user, 📁 = project`, 'info');
    },
  });
  
  // COMMAND: /implement (with streaming)
  pi.registerCommand("implement", {
    description: "Implement with workflow: scout → planner → worker (with streaming)",
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
      await spawnChain(chain, agents, ctx, { stream: true });
    },
  });
  
  // COMMAND: /scout-and-plan
  pi.registerCommand("scout-and-plan", {
    description: "Scout and plan with streaming",
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
      await spawnChain(chain, agents, ctx, { stream: true });
    },
  });
  
  // COMMAND: /parallel (with merge strategy)
  pi.registerCommand("parallel", {
    description: "Run agents in parallel with merge: /parallel [--merge=summary|concatenate|structured] \"task1\" \"task2\"",
    handler: async (args: string, ctx: ExtensionContext) => {
      // Parse merge strategy
      const mergeMatch = args.match(/--merge=(\w+)/);
      const mergeStrategy = mergeMatch ? mergeMatch[1] : "summary";
      const cleanArgs = args.replace(/--merge=\w+/, '').trim();
      
      const tasks = cleanArgs.split('"').filter((_, i) => i % 2 === 1);
      
      if (tasks.length === 0) {
        ctx.ui.notify("❌ Usage: /parallel [--merge=strategy] \"task 1\" \"task 2\"", 'error');
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
      
      ctx.ui.notify(`🚀 Running ${tasks.length} scouts in parallel (merge: ${mergeStrategy})...`, 'info');
      await spawnParallel(parallelTasks, agents, ctx, { mergeStrategy, stream: true });
    },
  });
  
  // COMMAND: /agent-create (new in 0.0.6)
  pi.registerCommand("agent-create", {
    description: "Create a new custom agent: /agent-create <name>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("❌ Usage: /agent-create <name>", 'error');
        return;
      }
      
      const template = `---
name: ${name}
description: Custom agent for specific tasks
tools: read_file, search_files, list_directory
model: qwen2.5-coder:14b
---

You are a specialized agent for: ${name}.

## Responsibilities
1. Task 1
2. Task 2
3. Task 3

## Output Format
...
`;
      
      const agentPath = path.join(USER_AGENTS_DIR, `${name}.md`);
      await fs.writeFile(agentPath, template);
      
      ctx.ui.notify(`✅ Created custom agent: ${name}\nEdit at: ${agentPath}`, 'info');
    },
  });
  
  console.log("[Subagent] Ready v0.0.6 with streaming, custom agents, and merge strategies");
}
