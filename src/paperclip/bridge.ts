/**
 * Paperclip Bridge - Connects to 0xKobolds Skills
 */

import * as fs from "fs";
import * as path from "path";

const PAPERCLIP_API = process.env.PAPERCLIP_API || "http://localhost:3101/api";
const PAPERCLIP_COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID || "73123205-060c-49eb-a654-dbd232476465";
const HOME = process.env.HOME || "/home/moikapy";

// Check both skill locations
const SKILL_PATHS = [
  path.join(HOME, ".0xkobold", "skills"),
  path.join(HOME, ".agents", "skills"),
];

// Agent to skill mapping
const AGENT_SKILLS: Record<string, string[]> = {
  "Shalom": ["task-management", "orchestrate", "proactive-agent"],
  "Moltbook": ["moltbook", "social-content"],
  "Moltx": ["social-content"],  // X/Twitter
  "Moltube": ["moltube"],
  "Clawchemy": ["clawchemy"],  // Element discovery game
  "Moltlaunch": ["moltbook", "coinbase-x402"],
  "Research": ["market-news-analyst", "reddit", "web-search"],
  "4claw": ["reddit"],
  "Clawdio": ["fal", "clawfm", "voicebox"],
  "Artist": ["fal", "create-viz", "pixel-art", "3d-avatar-pet", "game-engine", "browser-use"],
  // New agent for audio/content creation:
};

function findSkillPath(skillName: string): string | null {
  for (const skillPath of SKILL_PATHS) {
    const fullPath = path.join(skillPath, skillName, "SKILL.md");
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

export interface PaperclipAgent {
  id: string;
  name: string;
  role: string;
  title?: string;
  capabilities?: string;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  companyId: string;
}

export interface HeartbeatPayload {
  agentId?: string;
  task?: string;
  priority?: "low" | "normal" | "high" | "critical";
  metadata?: Record<string, unknown>;
}

export async function fetchPaperclipAgents(companyId?: string): Promise<PaperclipAgent[]> {
  try {
    const cid = companyId || PAPERCLIP_COMPANY_ID;
    const url = `${PAPERCLIP_API}/companies/${cid}/agents`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch agents: ${response.status}`);
    const agents: unknown = await response.json();
    return Array.isArray(agents) ? (agents as PaperclipAgent[]) : [];
  } catch (error) {
    console.error("[Paperclip] Failed to fetch agents:", error);
    return [];
  }
}

export async function fetchAgent(agentId: string): Promise<PaperclipAgent | null> {
  try {
    const response = await fetch(`${PAPERCLIP_API}/agents/${agentId}`);
    if (!response.ok) return null;
    return await response.json() as PaperclipAgent;
  } catch (error) {
    console.error(`[Paperclip] Failed to fetch agent ${agentId}:`, error);
    return null;
  }
}

export async function executeHeartbeat(payload: HeartbeatPayload): Promise<{
  ok: boolean;
  message: string;
  agent?: PaperclipAgent;
  result?: unknown;
}> {
  const { agentId, task, priority = "normal" } = payload;
  
  if (agentId) {
    const agent = await fetchAgent(agentId);
    if (!agent) return { ok: false, message: `Agent not found: ${agentId}` };
    
    console.log(`[Paperclip Bridge] Heartbeat for ${agent.name} (${agent.role}): ${task || "scheduled"}`);
    const result = await routeByAdapter(agent, task);
    return { ok: true, message: `Heartbeat executed for ${agent.name}`, agent, result };
  }
  
  const agents = await fetchPaperclipAgents();
  const results: Record<string, unknown> = {};
  for (const agent of agents) {
    console.log(`[Paperclip Bridge] Broadcasting to ${agent.name} (${agent.role})`);
    results[agent.id] = await routeByAdapter(agent, task);
  }
  
  return {
    ok: true,
    message: `Heartbeat broadcast to ${agents.length} agents`,
    result: { agentCount: agents.length, agents: agents.map(a => a.name) }
  };
}

async function routeByAdapter(agent: PaperclipAgent, task?: string): Promise<unknown> {
  const { adapterType, adapterConfig } = agent;
  const config = adapterConfig as { url?: string };
  
  if (config.url && (config.url.includes("localhost:7777") || config.url.includes("127.0.0.1:7777"))) {
    return executeLocalTask(agent, task);
  }
  
  switch (adapterType) {
    case "http": return executeHttpAdapter(agent, task);
    case "process": return executeProcessAdapter(agent, task);
    default: return { status: "skipped", reason: "unknown adapter" };
  }
}

async function executeLocalTask(agent: PaperclipAgent, task?: string): Promise<unknown> {
  const { name, role } = agent;
  const taskName = task || "scheduled heartbeat";
  const skills = AGENT_SKILLS[name] || [];
  
  console.log(`[Paperclip Bridge] Executing for ${name}: ${taskName} (skills: ${skills.join(", ") || "none"})`);
  
  const result: Record<string, unknown> = {
    agent: name,
    role: role,
    task: taskName,
    skills: skills,
    status: "ready",
  };
  
  // Load skill instructions from both locations
  for (const skillName of skills) {
    const skillPath = findSkillPath(skillName);
    if (skillPath) {
      try {
        const content = fs.readFileSync(skillPath, "utf-8");
        const descLine = content.split("\n").find(l => l.toLowerCase().startsWith("description:"));
        result[`skill_${skillName}`] = { 
          loaded: true, 
          description: descLine?.replace(/description:\s*/i, "").trim() || skillName,
          path: skillPath
        };
      } catch { /* skip */ }
    }
  }
  
  return result;
}

async function executeHttpAdapter(agent: PaperclipAgent, task?: string): Promise<unknown> {
  const config = agent.adapterConfig as { url?: string };
  if (!config.url) return { status: "error", reason: "No URL" };
  if (config.url.includes("localhost:7777")) return executeLocalTask(agent, task);
  
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: agent.id, task }),
    });
    return { status: "success", response: await res.json() };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}

async function executeProcessAdapter(agent: PaperclipAgent, task?: string): Promise<unknown> {
  const config = agent.adapterConfig as { command?: string };
  return { status: "queued", command: config.command, agent: agent.name, task };
}

export default { fetchPaperclipAgents, fetchAgent, executeHeartbeat };
