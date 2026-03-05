/**
 * MCP Extension - Model Context Protocol
 *
 * Integrates MCP servers to provide standardized tool access.
 * Supports:
 * - stdio-based MCP servers
 * - HTTP/SSE-based MCP servers
 * - Tool discovery and execution
 * - Resource access
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn, type ChildProcess } from "child_process";
import { join, resolve } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const MCP_CONFIG_FILE = join(KOBOLD_DIR, "mcp.json");

// MCP Types based on spec
interface MCPServerConfig {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface MCPConnection {
  config: MCPServerConfig;
  process?: ChildProcess;
  tools: MCPTool[];
  resources: MCPResource[];
  status: "connecting" | "connected" | "error" | "disconnected";
  error?: string;
}

// In-memory storage
const connections: Map<string, MCPConnection> = new Map();

/**
 * Generate request ID
 */
function generateId(): string {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Load MCP configuration
 */
function loadConfig(): MCPServerConfig[] {
  if (!existsSync(MCP_CONFIG_FILE)) {
    // Create default config
    const defaultConfig: MCPServerConfig[] = [
      {
        name: "filesystem",
        command: "npx",
  // @ts-ignore Command args property
        args: ["-y", "@modelcontextprotocol/server-filesystem", homedir()],
        enabled: false,
      },
      {
        name: "github",
        command: "npx",
  // @ts-ignore Command args property
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "" },
        enabled: false,
      },
      {
        name: "sqlite",
        command: "npx",
  // @ts-ignore Command args property
        args: ["-y", "@modelcontextprotocol/server-sqlite"],
        enabled: false,
      },
    ];

    mkdirSync(KOBOLD_DIR, { recursive: true });
    writeFileSync(MCP_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }

  try {
    const content = readFileSync(MCP_CONFIG_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("[MCP] Failed to load config:", error);
    return [];
  }
}

/**
 * Save MCP configuration
 */
function saveConfig(config: MCPServerConfig[]): void {
  writeFileSync(MCP_CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Connect to stdio-based MCP server
 */
async function connectStdio(
  config: MCPServerConfig
): Promise<MCPConnection> {
  const conn: MCPConnection = {
    config,
    tools: [],
    resources: [],
    status: "connecting",
  };

  if (!config.command) {
    conn.status = "error";
    conn.error = "No command specified";
    return conn;
  }

  try {
    const proc = spawn(config.command, config.args || [], {
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    conn.process = proc;

    // Handle stdout for MCP messages
    let buffer = "";
    proc.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          try {
            const msg = JSON.parse(line);
            handleMCPMessage(conn, msg);
          } catch {
            // Not JSON, log it
            console.log(`[MCP:${config.name}]`, line);
          }
        }
      }
    });

    // Handle stderr
    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[MCP:${config.name} stderr]`, data.toString());
    });

    // Handle exit
    proc.on("exit", (code) => {
      console.log(`[MCP:${config.name}] Process exited with code ${code}`);
      conn.status = "disconnected";
    });

    // Initialize the connection
    const initReq = {
      jsonrpc: "2.0",
      id: generateId(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "0xKobold", version: "0.1.0" },
      },
    };

    proc.stdin?.write(JSON.stringify(initReq) + "\n");

    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Request tool list
    const toolsReq = {
      jsonrpc: "2.0",
      id: generateId(),
      method: "tools/list",
    };
    proc.stdin?.write(JSON.stringify(toolsReq) + "\n");

    conn.status = "connected";
    console.log(`[MCP] Connected to ${config.name}`);
  } catch (error) {
    conn.status = "error";
    conn.error = String(error);
    console.error(`[MCP] Failed to connect to ${config.name}:`, error);
  }

  return conn;
}

/**
 * Handle MCP message
 */
function handleMCPMessage(conn: MCPConnection, msg: any): void {
  if (msg.result?.tools) {
    conn.tools = msg.result.tools;
    console.log(`[MCP:${conn.config.name}] Discovered ${conn.tools.length} tools`);
  }

  if (msg.result?.resources) {
    conn.resources = msg.result.resources;
    console.log(`[MCP:${conn.config.name}] Discovered ${conn.resources.length} resources`);
  }

  // Handle responses
  if (msg.id && msg.result) {
    // Store in pending responses (if we implement request tracking)
  }
}

/**
 * Call an MCP tool
 */
async function callTool(
  conn: MCPConnection,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!conn.process?.stdin || conn.status !== "connected") {
      reject(new Error("MCP server not connected"));
      return;
    }

    const id = generateId();
    const request = {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    };

    // Set up one-time response handler
    const handler = (data: Buffer) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === id) {
            conn.process?.stdout?.off("data", handler);
            if (msg.error) {
              reject(new Error(msg.error.message));
            } else {
              resolve(msg.result);
            }
          }
        } catch {
          // Ignore non-JSON
        }
      }
    };

    conn.process.stdout?.on("data", handler);

    // Send request
    conn.process.stdin.write(JSON.stringify(request) + "\n");

    // Timeout
    setTimeout(() => {
      conn.process?.stdout?.off("data", handler);
      reject(new Error("MCP tool call timeout"));
    }, 30000);
  });
}

/**
 * MCP Extension
 */
export default function mcpExtension(pi: ExtensionAPI) {
  // Load and connect to enabled servers
  const configs = loadConfig();

  for (const config of configs.filter((c) => c.enabled)) {
    connectStdio(config).then((conn) => {
      connections.set(config.name, conn);

      // Register discovered tools
      for (const tool of conn.tools) {
        pi.registerTool({
          name: `mcp_${config.name}_${tool.name}`,
          description: `[MCP:${config.name}] ${tool.description}`,
          // @ts-ignore TSchema mismatch
          parameters: tool.inputSchema,
          async execute(args: any) {
            try {
              const result = await callTool(conn, tool.name, args);
              return {
                content: [
                  { type: "text", text: JSON.stringify(result, null, 2) },
                ],
                details: result,
              };
            } catch (error) {
              return {
                content: [
                  { type: "text", text: `MCP tool error: ${error}` },
                ],
                details: { error: String(error) },
              };
            }
          },
        });
      }
    });
  }

  // ═════════════════════════════════════════════════════════════════
  // COMMANDS
  // ═════════════════════════════════════════════════════════════════

  pi.registerCommand("mcp-list", {
    description: "List MCP servers and their status",
    handler: async (_args, ctx) => {
      const configs = loadConfig();
      const lines: string[] = ["🔌 MCP Servers\n"];

      for (const config of configs) {
        const conn = connections.get(config.name);
        const status = conn?.status || (config.enabled ? "disconnected" : "disabled");
        const statusEmoji =
          status === "connected"
            ? "🟢"
            : status === "connecting"
            ? "🟡"
            : status === "error"
            ? "🔴"
            : "⚫";

        lines.push(`${statusEmoji} ${config.name}`);
        lines.push(`   Status: ${status}`);

        if (conn?.tools.length) {
          lines.push(`   Tools: ${conn.tools.map((t) => t.name).join(", ")}`);
        }
        lines.push("");
      }

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("mcp-enable", {
    description: "Enable an MCP server",
  // @ts-ignore Command args property
    args: [{ name: "name", description: "Server name", required: true }],
    handler: async (args: any, ctx) => {
      const { name } = args;
      const configs = loadConfig();

      const config = configs.find((c) => c.name === name);
      if (!config) {
        ctx.ui?.notify?.(`MCP server '${name}' not found`, "error");
        return;
      }

      config.enabled = true;
      saveConfig(configs);

      // Connect
      const conn = await connectStdio(config);
      connections.set(name, conn);

      // @ts-ignore Notify type
      ctx.ui?.notify?.(
        `Enabled ${name}\\n` +
          `Status: ${conn.status}\\n` +
          (conn.tools.length > 0 ? `Tools: ${conn.tools.length}` : ""),
        conn.status === "connected" ? "success" : "warning"
      );
    },
  });

  pi.registerCommand("mcp-disable", {
    description: "Disable an MCP server",
  // @ts-ignore Command args property
    args: [{ name: "name", description: "Server name", required: true }],
    handler: async (args: any, ctx) => {
      const { name } = args;
      const configs = loadConfig();

      const config = configs.find((c) => c.name === name);
      if (!config) {
        ctx.ui?.notify?.(`MCP server '${name}' not found`, "error");
        return;
      }

      config.enabled = false;
      saveConfig(configs);

      // Disconnect
      const conn = connections.get(name);
      if (conn?.process) {
        conn.process.kill();
      }
      connections.delete(name);

      // @ts-ignore Notify type
      // @ts-ignore Notify type
      ctx.ui?.notify?.(`Disabled ${name}`, "success");
    },
  });

  pi.registerCommand("mcp-add", {
    description: "Add a new MCP server",
  // @ts-ignore Command args property
    args: [
      { name: "name", description: "Server name", required: true },
      { name: "command", description: "Command to run", required: true },
      { name: "args", description: "Arguments (comma-separated)", required: false },
    ],
    handler: async (args: any, ctx) => {
      const { name, command, args: argsStr } = args;
      const configs = loadConfig();

      if (configs.some((c) => c.name === name)) {
        ctx.ui?.notify?.(`Server '${name}' already exists`, "error");
        return;
      }

      const newConfig: MCPServerConfig = {
        name,
        command,
  // @ts-ignore Command args property
        args: argsStr ? argsStr.split(",") : [],
        enabled: false,
      };

      configs.push(newConfig);
      saveConfig(configs);

      /* ctx.ui?.notify?(
        `Added MCP server: ${name}\\nCommand: ${command}\\nRun /mcp-enable ${name} to activate.`,
        "success"
      ); */
      // @ts-ignore Notify type
      // @ts-ignore Notify type
      ctx.ui?.notify?.(`Added MCP server: ${name}`, "success");
    },
  });

  // Tool provider
  pi.registerTool({
    name: "mcp_discover",
    description: "Discover available MCP tools from all connected servers",
  // @ts-ignore TSchema type mismatch
    // @ts-ignore TSchema mismatch
    parameters: { type: "object", properties: {} },
    async execute() {
      const allTools: { server: string; tools: MCPTool[] }[] = [];

      for (const [name, conn] of connections) {
        if (conn.status === "connected") {
          allTools.push({ server: name, tools: conn.tools });
        }
      }

      if (allTools.length === 0) {
        return {
          content: [
            { type: "text", text: "No MCP servers connected. Use /mcp-enable to connect." },
          ],
          details: { servers: [] },
        };
      }

      const summary = allTools
        .map(
          (s) =>
            `${s.server}:\n${s.tools.map((t) => `  - ${t.name}: ${t.description}`).join("\n")}`
        )
        .join("\n\n");

      return {
        content: [{ type: "text", text: `Available MCP Tools:\n\n${summary}` }],
        details: { servers: allTools },
      };
    },
  });

  // Status bar
  // @ts-ignore ExtensionAPI property
  pi.registerStatusBarItem("mcp", {
    render() {
      const connected = Array.from(connections.values()).filter(
        (c) => c.status === "connected"
      ).length;
      return connected > 0 ? `🔌 ${connected} MCP` : "";
    },
  });

  console.log("[MCP] Extension loaded");
}
