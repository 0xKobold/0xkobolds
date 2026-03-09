/**
 * Agent Workspace Extension - v0.2.0
 * 
 * Manages main agent workspaces and configuration.
 * Discovers agents from ~/.0xkobold/agents/
 * 
 * @version 0.2.0
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

const AGENTS_DIR = path.join(homedir(), ".0xkobold", "agents");

interface AgentWorkspaceConfig {
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
  memory: {
    enabled: boolean;
  };
}

interface AgentInfo {
  name: string;
  config: AgentWorkspaceConfig;
  status: "stopped" | "starting" | "running" | "error";
  pid?: number;
  lastStarted?: Date;
}

async function discoverAgents(): Promise<Map<string, AgentInfo>> {
  const agents = new Map<string, AgentInfo>();
  
  try {
    const entries = await fs.readdir(AGENTS_DIR, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agentDir = path.join(AGENTS_DIR, entry.name);
        const configPath = path.join(agentDir, "config.json");
        
        if (existsSync(configPath)) {
          try {
            const content = await fs.readFile(configPath, "utf-8");
            const config: AgentWorkspaceConfig = JSON.parse(content);
            
            // Validate required fields
            if (config.name && config.workspace) {
              agents.set(config.name, {
                name: config.name,
                config,
                status: "stopped",
              });
            }
          } catch (error) {
            console.log(`[AgentWorkspace] Failed to load ${entry.name}: ${error}`);
          }
        }
      }
    }
  } catch (error) {
    console.log(`[AgentWorkspace] Agents directory not accessible: ${AGENTS_DIR}`);
  }
  
  return agents;
}

async function createDefaultAgent(name: string): Promise<void> {
  const agentDir = path.join(AGENTS_DIR, name);
  const workspaceDir = path.join(agentDir, "workspace");
  const memoryDir = path.join(agentDir, "memory");
  const logsDir = path.join(agentDir, "logs");
  const agentsDir = path.join(agentDir, "agents");
  
  // Create directories
  await fs.mkdir(agentDir, { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(agentsDir, { recursive: true });
  
  // Create config
  const config: AgentWorkspaceConfig = {
    name,
    description: `Main agent for ${name}`,
    version: "1.0.0",
    enabled: true,
    autoStart: false,
    workspace: {
      path: workspaceDir,
    },
    activation: {
      manual: true,
    },
    model: {
      provider: "ollama",
      model: "qwen2.5-coder:14b",
    },
    capabilities: [
      "read", "write", "edit", "search", "shell", "subagent_spawn"
    ],
    memory: {
      enabled: true,
    },
  };
  
  await fs.writeFile(
    path.join(agentDir, "config.json"),
    JSON.stringify(config, null, 2)
  );
  
  console.log(`[AgentWorkspace] Created agent: ${name}`);
}

export default async function agentWorkspaceExtension(pi: ExtensionAPI) {
  console.log("[AgentWorkspace] Extension loaded");
  
  // Ensure agents directory exists
  await fs.mkdir(AGENTS_DIR, { recursive: true });
  
  // Discover agents
  const agents = await discoverAgents();
  console.log(`[AgentWorkspace] Discovered ${agents.size} agents`);
  
  // TOOL: agent_workspace_list
  pi.registerTool({
    name: "agent_workspace_list",
    label: "List Agent Workspaces",
    description: "List all configured agent workspaces with their status",
    parameters: Type.Object({}),
    async execute(
      _toolCallId: string,
      _params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ) {
      const list = Array.from(agents.entries()).map(([name, info]) => ({
        name,
        description: info.config.description,
        status: info.status,
        enabled: info.config.enabled,
        autoStart: info.config.autoStart,
        capabilities: info.config.capabilities.length,
      }));
      
      return {
        content: [{
          type: "text" as const,
          text: `Found ${list.length} agents:\n\n${list.map(a => 
            `- ${a.name}: ${a.status} (${a.enabled ? 'enabled' : 'disabled'})`
          ).join('\n')}`,
        }],
        details: { agents: list },
      };
    },
  });
  
  // TOOL: agent_workspace_create
  pi.registerTool({
    name: "agent_workspace_create",
    label: "Create Agent Workspace",
    description: "Create a new main agent workspace with directory structure",
    parameters: Type.Object({
      name: Type.String({ description: "Agent name" }),
      description: Type.Optional(Type.String({ description: "Agent description" })),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ) {
      const name = params.name as string;
      const description = params.description as string | undefined;
      
      if (agents.has(name)) {
        return {
          content: [{ type: "text" as const, text: `❌ Agent '${name}' already exists` }],
          details: { success: false, error: "agent_exists", name: undefined, path: undefined },
        };
      }
      
      try {
        await createDefaultAgent(name);
        
        // Reload agents
        const newAgents = await discoverAgents();
        agents.clear();
        for (const [k, v] of newAgents) agents.set(k, v);
        
        ctx.ui.notify(`✅ Created agent workspace: ${name}`, 'info');
        
        return {
          content: [{
            type: "text" as const,
            text: `✅ Created agent '${name}'\n\nWorkspace: ~/.0xkobold/agents/${name}/`,
          }],
          details: { success: true, name, path: path.join(AGENTS_DIR, name), error: undefined },
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `❌ Failed to create agent: ${error}` }],
          details: { success: false, name: undefined, path: undefined, error: String(error) },
        };
      }
    },
  });
  
  // COMMAND: /agents (replaces /subagents)
  pi.registerCommand("agents", {
    description: "List main agent workspaces",
    handler: async (_args: string, ctx: ExtensionContext) => {
      // This command will be enhanced by agent-lifecycle-extension
      const list = Array.from(agents.entries()).map(([name, info]) => 
        `- ${name}: ${info.status} (${info.config.capabilities.length} capabilities)`
      ).join('\n');
      
      ctx.ui.notify(`🤖 Main Agents (${agents.size}):\n${list}`, 'info');
    },
  });
  
  // COMMAND: /agent-init
  pi.registerCommand("agent-init", {
    description: "Initialize a new main agent workspace: /agent-init <name>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("❌ Usage: /agent-init <name>", 'error');
        return;
      }
      
      if (agents.has(name)) {
        ctx.ui.notify(`❌ Agent '${name}' already exists`, 'error');
        return;
      }
      
      try {
        await createDefaultAgent(name);
        ctx.ui.notify(`✅ Created agent '${name}'`, 'info');
      } catch (error) {
        ctx.ui.notify(`❌ Failed: ${error}`, 'error');
      }
    },
  });
  
  // Export for other extensions
  (pi as any).state = {
    ...(pi as any).state,
    agentWorkspace: {
      agents,
      discoverAgents,
      AGENTS_DIR,
    },
  };
  
  console.log("[AgentWorkspace] Ready");
}
