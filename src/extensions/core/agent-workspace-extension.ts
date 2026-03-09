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

// ═══════════════════════════════════════════════════════════════
// ADVANCED WEB FETCH TOOL (Playwright-based)
// ═══════════════════════════════════════════════════════════════

interface FetchResult {
  content: string;
  title: string;
  url: string;
  method: string;
}

/**
 * Enhanced fetch with cascade strategy
 */
async function advancedWebFetch(
  url: string, 
  maxLength: number, 
  forcePlaywright: boolean
): Promise<FetchResult | null> {
  
  // Method 1: Fast fetch
  if (!forcePlaywright) {
    const fast = await fastFetch(url, maxLength);
    if (fast && fast.content.length > 500) return fast;
  }
  
  // Method 2: Readability extraction
  if (!forcePlaywright) {
    const readability = await readabilityFetch(url, maxLength);
    if (readability) return readability;
  }
  
  // Method 3: Playwright for JS-rendered sites
  const playwright = await playwrightFetch(url, maxLength);
  if (playwright) return playwright;
  
  return null;
}

async function fastFetch(url: string, maxLength: number): Promise<FetchResult | null> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)' },
      signal: controller.signal
    });
    
    if (!response.ok) return null;
    const html = await response.text();
    
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || "Untitled";
    const content = html
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
    
    if (content.length < 200) return null;
    return { content, title, url, method: 'html' };
  } catch {
    return null;
  }
}

async function readabilityFetch(url: string, maxLength: number): Promise<FetchResult | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)' }
    });
    
    if (!response.ok) return null;
    const html = await response.text();
    
    // Extract from semantic HTML elements
    const patterns = [
      /<article[^>]*>[\s\S]*?<\/article>/i,
      /<main[^>]*>[\s\S]*?<\/main>/i,
      /<div[^>]*class="[^"]*(?:content|article|post|docs)[^"]*"[^>]*>[\s\S]*?<\/div>/i,
    ];
    
    let rawContent = '';
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        rawContent = match[0];
        break;
      }
    }
    
    if (!rawContent) return null;
    
    const content = rawContent
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
    
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || "Untitled";
    
    if (content.length < 300) return null;
    return { content, title, url, method: 'readability' };
  } catch {
    return null;
  }
}

async function playwrightFetch(url: string, maxLength: number): Promise<FetchResult | null> {
  try {
    // Check if playwright available
    const hasPlaywright = await Bun.$`which playwright`.quiet().then(() => true).catch(() => false);
    if (!hasPlaywright) return null;
    
    // Use Python with Playwright
    const script = `import asyncio
import json
from playwright.async_api import async_playwright

async def scrape():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox'])
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080}
        )
        page = await context.new_page()
        
        try:
            await page.goto('${url}', wait_until='networkidle', timeout=30000)
            await page.wait_for_timeout(2000)
            
            result = await page.evaluate('''() => {
                const selectors = ['article', 'main', '.content', '.prose', '[role="main"]'];
                for (const s of selectors) {
                    const el = document.querySelector(s);
                    if (el) return el.innerText;
                }
                document.querySelectorAll('script, style, nav, footer').forEach(e => e.remove());
                return document.body.innerText;
            }''')
            
            title = await page.title()
            await browser.close()
            print(json.dumps({'content': result[:${maxLength}], 'title': title}))
        except Exception as e:
            await browser.close()
            print(json.dumps({'error': str(e)}))

asyncio.run(scrape())`;
    
    const tempFile = `/tmp/playwright_${Date.now()}.py`;
    await Bun.write(tempFile, script);
    
    const result = await Bun.$`python3 ${tempFile}`.quiet().catch(() => ({ stdout: "" }));
    try { await Bun.$`rm ${tempFile}`.quiet(); } catch {}
    
    const output = result.stdout?.toString() || "";
    const match = output.match(/{[^}]+}/);
    if (!match) return null;
    
    const data = JSON.parse(match[0]);
    if (data.error || !data.content) return null;
    
    return { content: data.content, title: data.title, url, method: 'playwright' };
  } catch {
    return null;
  }
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
  
  // Note: /agents command removed - use agent-orchestrator-extension instead
  // This extension provides the advanced_web_fetch tool
  
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
  
  // ═══════════════════════════════════════════════════════════════
  // TOOL: advanced_web_fetch
  // Allows agents to fetch content with Playwright support
  // ═══════════════════════════════════════════════════════════════
  pi.registerTool({
    name: "advanced_web_fetch",
    label: "Advanced Web Fetch",
    description: "Fetch content from websites including JavaScript-rendered pages. Uses cascade: fast HTML → readability → Playwright. Ideal for documentation, dashboards, and SPAs.",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch (http:// or https://)" }),
      max_length: Type.Optional(Type.Number({ default: 5000, description: "Max characters to return" })),
      use_playwright: Type.Optional(Type.Boolean({ default: false, description: "Force JavaScript rendering" })),
    }),
    // @ts-ignore execute signature
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ) {
      const url = params.url as string;
      const maxLength = (params.max_length as number) || 5000;
      const usePlaywright = (params.use_playwright as boolean) || false;
      
      if (!url?.startsWith("http")) {
        return {
          content: [{ type: "text" as const, text: "❌ URL must start with http:// or https://" }],
          details: { error: "invalid_url", url },
        };
      }
      
      ctx.ui.notify(`🔍 Fetching: ${url}`, "info");
      
      const result = await advancedWebFetch(url, maxLength, usePlaywright);
      
      if (!result) {
        return {
          content: [{ type: "text" as const, text: `❌ Failed to fetch ${url}` }],
          details: { error: "fetch_failed", url },
        };
      }
      
      return {
        content: [{
          type: "text" as const,
          text: `# ${result.title}\n\n${result.content}\n\n---\nSource: ${result.url} | Method: ${result.method}`,
        }],
        details: {
          url: result.url,
          title: result.title,
          method: result.method,
          length: result.content.length,
        },
      };
    },
  });
  
  console.log("[AgentWorkspace] Ready with advanced_web_fetch tool");
}
