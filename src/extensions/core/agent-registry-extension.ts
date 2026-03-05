/**
 * Agent Registry Extension - OpenClaw Style Multi-Agent System
 *
 * Inspired by OpenClaw (docs.openclaw.ai)
 * Features:
 * - Agent definitions in AGENTS.md and AGENTS.default
 * - Capability-based agent discovery
 * - Inter-agent messaging
 * - Agent lifecycle management
 * - Specialized agent types
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { spawn } from "child_process";

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const AGENTS_DIR = join(KOBOLD_DIR, "agents");
const REGISTRY_DB = join(KOBOLD_DIR, "agents.db");

// Agent Types inspired by OpenClaw
type AgentType = 
  | "coordinator"    // Orchestrates other agents
  | "specialist"     // Deep expertise in one area
  | "worker"         // General purpose task executor
  | "reviewer"       // Code review, analysis
  | "researcher"     // Information gathering
  | "planner"        // Breaks down complex tasks
  | "executor";      // Executes plans

interface AgentDefinition {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  capabilities: string[];
  model: string;
  systemPrompt?: string;
  maxDepth: number;  // How many sub-agents this agent can spawn
  timeout: number;   // Default timeout in seconds
  enabled: boolean;
}

interface RunningAgent {
  id: string;
  definitionId: string;
  sessionId: string;
  parentId?: string;
  task: string;
  status: "idle" | "working" | "completed" | "error" | "terminated";
  startedAt: number;
  completedAt?: number;
  spawnDepth: number;
  children: string[];
  messages: AgentMessage[];
  process?: any;  // Child process reference
}

interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: "request" | "response" | "announce" | "error";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

let db: Database | null = null;
const activeAgents = new Map<string, RunningAgent>();

// ═════════════════════════════════════════════════════════════════
// DATABASE
// ═════════════════════════════════════════════════════════════════

function initDatabase(): Database {
  if (db) return db;

  if (!existsSync(KOBOLD_DIR)) {
    mkdirSync(KOBOLD_DIR, { recursive: true });
  }

  db = new Database(REGISTRY_DB);
  db.run("PRAGMA journal_mode = WAL;");

  // Agent definitions (from AGENTS.md)
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      capabilities TEXT NOT NULL,  -- JSON array
      model TEXT DEFAULT 'ollama/llama3.2',
      system_prompt TEXT,
      max_depth INTEGER DEFAULT 2,
      timeout INTEGER DEFAULT 300,
      enabled INTEGER DEFAULT 1,
      source TEXT DEFAULT 'registry',  -- 'registry' or 'session'
      created_at INTEGER NOT NULL
    )
  `);

  // Running agents
  db.run(`
    CREATE TABLE IF NOT EXISTS running_agents (
      id TEXT PRIMARY KEY,
      definition_id TEXT,
      session_id TEXT NOT NULL,
      parent_id TEXT,
      task TEXT NOT NULL,
      status TEXT DEFAULT 'idle',
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      spawn_depth INTEGER DEFAULT 0,
      result TEXT,
      FOREIGN KEY (definition_id) REFERENCES agent_definitions(id)
    )
  `);

  // Agent messages
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      session_id TEXT NOT NULL
    )
  `);

  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_agents_session ON running_agents(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session ON agent_messages(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agents_status ON running_agents(status)`);

  console.log("[AgentRegistry] Database initialized");
  return db;
}

// ═════════════════════════════════════════════════════════════════
// AGENT DEFINITIONS (AGENTS.md style)
// ═════════════════════════════════════════════════════════════════

function loadAgentDefinitions(database: Database): void {
  // Create default definitions if none exist
// @ts-ignore SQLite binding
  const count = (database.query("SELECT COUNT(*) as count FROM agent_definitions").get() as any)?.count || 0;
  
  if (count === 0) {
    const defaults: Omit<AgentDefinition, "id">[] = [
      {
        name: "coordinator",
        type: "coordinator",
        description: "Orchestrates complex tasks by delegating to specialists",
        capabilities: ["task-delegation", "planning", "coordination", "orchestration"],
        model: "kimi-k2.5:cloud",
        maxDepth: 3,
        timeout: 600,
        enabled: true,
      },
      {
        name: "code-specialist",
        type: "specialist",
        description: "Deep expertise in code generation and review",
        capabilities: ["coding", "refactoring", "code-review", "debugging", "architecture"],
        model: "minimax-m2.5:cloud",
        maxDepth: 1,
        timeout: 300,
        enabled: true,
      },
      {
        name: "researcher",
        type: "researcher",
        description: "Gathers information and analyzes data",
        capabilities: ["research", "analysis", "documentation", "search"],
        model: "kimi-k2.5:cloud",
        maxDepth: 2,
        timeout: 300,
        enabled: true,
      },
      {
        name: "planner",
        type: "planner",
        description: "Breaks down complex tasks into actionable steps",
        capabilities: ["planning", "architecture-design", "task-breakdown"],
        model: "kimi-k2.5:cloud",
        maxDepth: 2,
        timeout: 300,
        enabled: true,
      },
      {
        name: "reviewer",
        type: "reviewer",
        description: "Reviews code, designs, and plans for quality",
        capabilities: ["code-review", "quality-assurance", "security-review"],
        model: "minimax-m2.5:cloud",
        maxDepth: 0,
        timeout: 300,
        enabled: true,
      },
    ];

    const now = Date.now();
    for (const def of defaults) {
// @ts-ignore SQLite binding
      database.run(
        `INSERT INTO agent_definitions 
         (id, name, type, description, capabilities, model, max_depth, timeout, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`def-${def.name}`,
        def.name,
        def.type,
        def.description,
        JSON.stringify(def.capabilities),
        def.model,
        def.maxDepth,
        def.timeout,
        def.enabled ? 1 : 0,
        now]
      );
    }

    console.log("[AgentRegistry] Created default agent definitions");
  }
}

// ═════════════════════════════════════════════════════════════════
// AGENT LIFECYCLE
// ═════════════════════════════════════════════════════════════════

async function spawnAgent(
  database: Database,
  definitionId: string,
  task: string,
  sessionId: string,
  parentId?: string
): Promise<RunningAgent> {
// @ts-ignore SQLite binding
  const def = database.query("SELECT * FROM agent_definitions WHERE id = ?").get([definitionId]) as any;
  if (!def) {
    throw new Error(`Agent definition not found: ${definitionId}`);
  }

  const parent = parentId ? activeAgents.get(parentId) : undefined;
  const spawnDepth = parent ? parent.spawnDepth + 1 : 0;

  // Check depth limit
  if (spawnDepth > def.max_depth) {
    throw new Error(`Max spawn depth exceeded for ${def.name}`);
  }

  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();

  const agent: RunningAgent = {
    id,
    definitionId,
    sessionId,
    parentId,
    task,
    status: "idle",
    startedAt: now,
    spawnDepth,
    children: [],
    messages: [],
  };

  // Store in database
// @ts-ignore SQLite binding
  database.run(
    `INSERT INTO running_agents 
     (id, definition_id, session_id, parent_id, task, status, started_at, spawn_depth)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, definitionId, sessionId, parentId || null, task, "idle", now, spawnDepth]
  );

  activeAgents.set(id, agent);

  // Add to parent's children
  if (parent) {
    parent.children.push(id);
  }

  console.log(`[AgentRegistry] Spawned ${def.name} (${id.slice(0, 20)}...) at depth ${spawnDepth}`);
  return agent;
}

function updateAgentStatus(
  database: Database,
  agentId: string,
  status: RunningAgent["status"],
  result?: string
): void {
  const agent = activeAgents.get(agentId);
  if (!agent) return;

  agent.status = status;
  if (status === "completed" || status === "error" || status === "terminated") {
    agent.completedAt = Date.now();
  }

// @ts-ignore SQLite binding
  database.run(
    `UPDATE running_agents SET status = ?, completed_at = ?, result = ? WHERE id = ?`,
    [status,
    agent.completedAt || null,
    result || null,
    agentId]
  );
}

// ═════════════════════════════════════════════════════════════════
// MESSAGING
// ═════════════════════════════════════════════════════════════════

function sendMessage(
  database: Database,
  from: string,
  to: string,
  type: AgentMessage["type"],
  content: string,
  sessionId: string,
  metadata?: Record<string, unknown>
): void {
  const msg: AgentMessage = {
    id: `msg-${Date.now()}`,
    from,
    to,
    type,
    content,
    timestamp: Date.now(),
    metadata,
  };

// @ts-ignore SQLite binding
  database.run(
    `INSERT INTO agent_messages 
     (id, from_agent, to_agent, type, content, timestamp, metadata, session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [msg.id,
    from,
    to,
    type,
    content,
    msg.timestamp,
    JSON.stringify(metadata || {}),
    sessionId]
  );

  // Add to in-memory agent
  const agent = activeAgents.get(to);
  if (agent) {
    agent.messages.push(msg);
  }

  console.log(`[AgentRegistry] Message ${from} → ${to}: ${type}`);
}

function getMessages(database: Database, agentId: string, since?: number): AgentMessage[] {
  const query = since
    ? `SELECT * FROM agent_messages WHERE to_agent = ? AND timestamp > ? ORDER BY timestamp`
    : `SELECT * FROM agent_messages WHERE to_agent = ? ORDER BY timestamp`;
  
  const rows = since
    ? database.query(query).all(agentId, since) as any[]
    : database.query(query).all(agentId) as any[];

  return rows.map(r => ({
    id: r.id,
    from: r.from_agent,
    to: r.to_agent,
    type: r.type,
    content: r.content,
    timestamp: r.timestamp,
    metadata: JSON.parse(String(r.metadata || "{}")),
  }));
}

// ═════════════════════════════════════════════════════════════════
// CAPABILITY DISCOVERY
// ═════════════════════════════════════════════════════════════════

function findAgentsByCapability(database: Database, capability: string): AgentDefinition[] {
  const rows = database.query(
    `SELECT * FROM agent_definitions WHERE enabled = 1`
  ).all() as any[];

  return rows
    .map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description,
      capabilities: JSON.parse(String(r.capabilities || "[]")),
      model: r.model,
      systemPrompt: r.system_prompt,
      maxDepth: r.max_depth,
      timeout: r.timeout,
      enabled: r.enabled === 1,
    }))
    .filter(def => def.capabilities.includes(capability));
}

// ═════════════════════════════════════════════════════════════════
// EXTENSION
// ═════════════════════════════════════════════════════════════════

export default function agentRegistryExtension(pi: ExtensionAPI) {
  const database = initDatabase();
  loadAgentDefinitions(database);
  let currentSessionId: string | null = null;

  pi.on("session_start", async (_event, ctx) => {
    currentSessionId = process.env.KOBOLD_SESSION_ID || null;
  });

  // ═══════════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════════

  pi.registerCommand("agents", {
    description: "List all agent definitions (OpenClaw style)",
    handler: async (_args, ctx) => {
      const rows = database.query(
        `SELECT * FROM agent_definitions WHERE enabled = 1 ORDER BY type, name`
      ).all() as any[];

      if (rows.length === 0) {
        ctx.ui?.notify?.("No agent definitions found", "warning");
        return;
      }

      const byType: Record<string, typeof rows> = {};
      for (const row of rows) {
        if (!byType[row.type]) byType[row.type] = [];
        byType[row.type].push(row);
      }

      const lines: string[] = ["🤖 Agent Registry (OpenClaw Style)\n"];
      
      for (const [type, agents] of Object.entries(byType)) {
        lines.push(`${type.toUpperCase()}:`);
        for (const agent of agents) {
          const caps = JSON.parse(String(agent.capabilities || "[]")).slice(0, 3).join(", ");
          lines.push(`  • ${agent.name} - ${agent.description.slice(0, 50)}...`);
          lines.push(`    Capabilities: ${caps}${JSON.parse(String(agent.capabilities)).length > 3 ? "..." : ""}`);
          lines.push(`    Model: ${agent.model}`);
        }
        lines.push("");
      }

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("agent-spawn", {
    description: "Spawn an agent by definition",
  // @ts-ignore Command args property
    args: [
      { name: "name", description: "Agent definition name (e.g., 'code-specialist')", required: true },
      { name: "task", description: "Task description", required: true },
    ],
    handler: async (args: any, ctx) => {
      const { name, task } = args;
      
      const def = database.query(
        "SELECT * FROM agent_definitions WHERE name = ? AND enabled = 1"
      // @ts-ignore SQLite binding
      ).get([name]) as any;

      if (!def) {
        ctx.ui?.notify?.(`Agent '${name}' not found. Use /agents to list.`, "error");
        return;
      }

      try {
        const agent = await spawnAgent(
          database,
          def.id,
          task,
          currentSessionId || "orphan"
        );

        // Simulate work (in real implementation, this would spawn a subprocess)
        updateAgentStatus(database, agent.id, "working");

        ctx.ui?.notify?.(
          `🤖 Spawned ${def.name}\n` +
          `ID: ${agent.id}\n` +
          `Task: ${task.slice(0, 50)}...\n` +
          `Status: ${agent.status}\n` +
          `Depth: ${agent.spawnDepth}`,
          // @ts-ignore Notify type
          "success"
        );

        // Simulate completion after delay
        setTimeout(() => {
          updateAgentStatus(database, agent.id, "completed", "Task completed successfully");
          console.log(`[AgentRegistry] Agent ${agent.id.slice(0, 20)}... completed`);
        }, 5000);

      } catch (error) {
        ctx.ui?.notify?.(`Failed to spawn: ${error}`, "error");
      }
    },
  });

  pi.registerCommand("agent-status", {
    description: "Show running agents",
    handler: async (_args, ctx) => {
      const rows = database.query(
        `SELECT ra.*, ad.name as def_name, ad.type 
         FROM running_agents ra
         JOIN agent_definitions ad ON ra.definition_id = ad.id
         WHERE ra.status IN ('idle', 'working')
         ORDER BY ra.started_at DESC`
      ).all() as any[];

      if (rows.length === 0) {
        ctx.ui?.notify?.("No active agents", "info");
        return;
      }

      const lines = ["🤖 Active Agents\n"];
      
      for (const agent of rows) {
        const runtime = Math.floor((Date.now() - agent.started_at) / 1000);
        const indent = "  ".repeat(agent.spawn_depth);
        const parent = agent.parent_id ? `(child of ${agent.parent_id.slice(0, 8)}...)` : "(root)";
        
        lines.push(`${indent}▸ ${agent.def_name}`);
        lines.push(`${indent}  ID: ${agent.id.slice(0, 20)}... ${parent}`);
        lines.push(`${indent}  Status: ${agent.status} (${runtime}s)`);
        lines.push(`${indent}  Task: ${agent.task.slice(0, 40)}...`);
        lines.push("");
      }

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("agent-cap", {
    description: "Find agents by capability",
  // @ts-ignore Command args property
    args: [{ name: "capability", description: "e.g., 'coding', 'research', 'planning'", required: true }],
    handler: async (args: any, ctx) => {
      const { capability } = args;
      const agents = findAgentsByCapability(database, capability);

      if (agents.length === 0) {
        ctx.ui?.notify?.(`No agents found with capability: ${capability}`, "warning");
        return;
      }

      const lines = [`🔍 Agents with '${capability}':\n`];
      for (const agent of agents) {
        lines.push(`• ${agent.name} (${agent.type})`);
        lines.push(`  ${agent.description}`);
        lines.push(`  All capabilities: ${agent.capabilities.join(", ")}`);
        lines.push("");
      }

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("agent-tree", {
    description: "Show agent hierarchy",
    handler: async (_args, ctx) => {
      const rows = database.query(
        `SELECT ra.*, ad.name as def_name 
         FROM running_agents ra
         JOIN agent_definitions ad ON ra.definition_id = ad.id
         ORDER BY ra.started_at`
      ).all() as any[];

      if (rows.length === 0) {
        ctx.ui?.notify?.("No agents", "info");
        return;
      }

      // Build tree
      const tree: Record<string, any> = {};
      const children: Record<string, string[]> = {};

      for (const agent of rows) {
        children[agent.id] = [];
      }

      for (const agent of rows) {
        if (agent.parent_id) {
          if (!children[agent.parent_id]) children[agent.parent_id] = [];
          children[agent.parent_id].push(agent.id);
        } else {
          tree[agent.id] = agent;
        }
      }

      const lines = ["🌳 Agent Tree\n"];

      function printTree(id: string, depth: number) {
        const agent = rows.find(r => r.id === id);
        if (!agent) return;

        const indent = "  ".repeat(depth);
        const icon = agent.status === "completed" ? "✓" : 
                    agent.status === "error" ? "✗" :
                    agent.status === "working" ? "◐" : "○";
        
        lines.push(`${indent}${icon} ${agent.def_name} ${agent.id.slice(0, 8)}...`);
        lines.push(`${indent}  "${agent.task.slice(0, 40)}..."`);

        for (const childId of children[id] || []) {
          printTree(childId, depth + 1);
        }
      }

      for (const rootId of Object.keys(tree)) {
        printTree(rootId, 0);
      }

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // TOOLS (AI-facing)
  // ═══════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "agent_spawn",
    description: "Spawn a specialized agent for a specific task",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        agent_type: { 
          type: "string", 
          description: "Type of agent to spawn",
          enum: ["coordinator", "specialist", "worker", "reviewer", "researcher", "planner", "executor"]
        },
        task: { type: "string", description: "Task description" },
        capabilities_needed: { 
          type: "array", 
          items: { type: "string" },
          description: "Required capabilities"
        },
      },
      required: ["agent_type", "task"],
    },
    async execute(args: any) {
      const { agent_type, task, capabilities_needed } = args as {
        agent_type: AgentType;
        task: string;
        capabilities_needed?: string[];
      };

      // Find best matching agent
      let defQuery = "SELECT * FROM agent_definitions WHERE type = ? AND enabled = 1";
      let defs = database.query(defQuery).all(agent_type) as any[];

      // If no exact type match, find by capability
      if (defs.length === 0 && capabilities_needed) {
        for (const cap of capabilities_needed) {
          const capAgents = findAgentsByCapability(database, cap);
          if (capAgents.length > 0) {
            defs = [{ ...capAgents[0], id: capAgents[0].id }];
            break;
          }
        }
      }

      if (defs.length === 0) {
        return {
          content: [{ type: "text", text: `No ${agent_type} agent available` }],
          details: { error: "no_agent", type: agent_type },
        };
      }

      const def = defs[0];
      const agent = await spawnAgent(
        database,
        def.id,
        task,
        currentSessionId || "orphan"
      );

      return {
        content: [
          { type: "text", text: `Spawned ${def.name} for: ${task.slice(0, 50)}...` },
        ],
        details: {
          agent_id: agent.id,
          name: def.name,
          type: def.type,
          capabilities: JSON.parse(String(def.capabilities || "[]")),
          depth: agent.spawnDepth,
        },
      };
    },
  });

  pi.registerTool({
    name: "agent_delegate",
    description: "Delegate a task to the most appropriate agent",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        task: { type: "string" },
        preferred_type: { type: "string" },
      },
      required: ["task"],
    },
    async execute(args: any) {
      const { task, preferred_type } = args;

      // Analyze task to determine best agent type
      const taskLower = String(task).toLowerCase();
      let targetType: AgentType = "worker";

      if (taskLower.includes("orchestrate") || taskLower.includes("coordinate")) {
        targetType = "coordinator";
      } else if (taskLower.includes("code") || taskLower.includes("implement")) {
        targetType = "specialist";
      } else if (taskLower.includes("research") || taskLower.includes("find")) {
        targetType = "researcher";
      } else if (taskLower.includes("plan") || taskLower.includes("design")) {
        targetType = "planner";
      } else if (taskLower.includes("review") || taskLower.includes("check")) {
        targetType = "reviewer";
      }

      if (preferred_type) {
        targetType = preferred_type as AgentType;
      }

      const defs = database.query(
        "SELECT * FROM agent_definitions WHERE type = ? AND enabled = 1"
      ).all(targetType) as any[];

      if (defs.length === 0) {
        return {
          content: [{ type: "text", text: `No ${targetType} agent available` }],
          details: { error: "no_agent", requested_type: targetType },
        };
      }

      const def = defs[0];
      const agent = await spawnAgent(
        database,
        def.id,
        task,
        currentSessionId || "orphan"
      );

      return {
        content: [
          { type: "text", text: `Delegated to ${def.name} (${targetType})` },
        ],
        details: {
          agent_id: agent.id,
          type: targetType,
          capabilities: JSON.parse(String(def.capabilities || "[]")),
        },
      };
    },
  });

  pi.registerTool({
    name: "agent_list",
    description: "List available agent types and their capabilities",
  // @ts-ignore TSchema type mismatch
    // @ts-ignore TSchema mismatch
    parameters: { type: "object", properties: {} },
    async execute() {
      const rows = database.query(
        "SELECT * FROM agent_definitions WHERE enabled = 1"
      ).all() as any[];

      const agents = rows.map(r => ({
        name: r.name,
        type: r.type,
        description: r.description,
        capabilities: JSON.parse(String(r.capabilities || "[]")),
        model: r.model,
      }));

      return {
        content: [
          { type: "text", text: `Available agents:\n${agents.map(a => 
            `- ${a.name} (${a.type}): ${a.capabilities.join(", ")}`
          ).join("\n")}` },
        ],
        details: { agents },
      };
    },
  });

  // Status bar
  // @ts-ignore ExtensionAPI property
//   pi.registerStatusBarItem("agents", {
//     render() {
//       const active = database.query(
//         "SELECT COUNT(*) as count FROM running_agents WHERE status = 'working'"
//       ).get() as any;
//       return active?.count > 0 ? `🤖 ${active.count}` : "";
//     },
//   });

  console.log("[AgentRegistry] OpenClaw-style multi-agent system loaded");
  console.log("[AgentRegistry] Commands: /agents, /agent-spawn, /agent-status, /agent-tree");
}
