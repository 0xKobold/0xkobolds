/**
 * 📚 Learning Extension
 * 
 * Implements Stanford HCI research: "Generative Agents: Interactive Simulacra of Human Behavior"
 * Adds memory stream, reflection, and planning to 0xKobold agents.
 * 
 * Renamed from generative-agents-extension to reflect reflection + planning focus.
 * 
 * Phase 6 Update: Now uses session_events from session-store for memory stream.
 * 
 * Requires: perennial-memory-extension (provides semantic storage)
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { homedir } from "node:os";
import { getSessionStore } from "../../memory/session-store";
import type { SessionEvent } from "../../memory/session-store";

// Keep original database path for reflections and plans (agent-scoped)
const LEARNING_DIR = path.join(homedir(), ".0xkobold", "generative");
const DB_PATH = path.join(LEARNING_DIR, "agents.db");
const EMBEDDING_DIM = 768;

// ============================================================================
// Types
// ============================================================================

/**
 * Memory entry (now stored in session_events)
 * @deprecated Use SessionEvent from session-store
 */
interface MemoryStreamEntry {
  id: string;
  timestamp: string;
  content: string;
  type: "observation" | "thought" | "action" | "reflection";
  importance: number;
  agentId: string;
  sessionId?: string;
  location?: string;
  people?: string[];
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

interface Reflection {
  id: string;
  timestamp: string;
  content: string;
  insight: string;
  agentId: string;
  evidence: string[]; // Memory IDs that support this
  depth: number; // 1 = first-order, 2+ = higher-order
  importance: number;
}

interface Plan {
  id: string;
  timestamp: string;
  content: string;
  type: "daily" | "action" | "conversation" | "project";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  agentId: string;
  parentPlanId?: string;
  subPlanIds?: string[];
  startTime?: string;
  endTime?: string;
  location?: string;
}

interface AgentState {
  id: string;
  name: string;
  traits: string[];
  currentLocation: string;
  currentPlanId?: string;
  observationCount: number;
  lastReflectionAt?: string;
  memoryCount: number;
}

// ============================================================================
// Database
// ============================================================================

function initLearningDB(): Database {
  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  
  // Note: memory_stream table moved to session_events (Phase 6)
  // This database now only stores agent state, reflections, and plans
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      traits TEXT NOT NULL, -- JSON array
      current_location TEXT DEFAULT 'home',
      current_plan_id TEXT,
      observation_count INTEGER DEFAULT 0,
      last_reflection_at TEXT,
      memory_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS reflections (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      content TEXT NOT NULL,
      insight TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      evidence TEXT NOT NULL, -- JSON array of memory IDs
      depth INTEGER NOT NULL,
      importance REAL NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );
    
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL, -- daily, action, conversation, project
      status TEXT NOT NULL DEFAULT 'pending',
      agent_id TEXT NOT NULL,
      parent_plan_id TEXT,
      sub_plan_ids TEXT, -- JSON array
      start_time TEXT,
      end_time TEXT,
      location TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (parent_plan_id) REFERENCES plans(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_reflections_agent ON reflections(agent_id);
    CREATE INDEX IF NOT EXISTS idx_plans_agent ON plans(agent_id);
    CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
  `);
  
  return db;
}

// ============================================================================
// Importance Scoring
// ============================================================================

function calculateImportance(content: string): number {
  const highImportance = [
    "decided", "promised", "committed", "agreed", "disagreed",
    "failed", "succeeded", "launched", "shipped", "broke",
    "learned", "realized", "discovered", "fixed", "solved",
    "argued", "conflict", "victory", "milestone", "achievement"
  ];
  
  const lowImportance = [
    "walked", "sat", "stood", "looked", "waited",
    "breathed", "passed", "glanced", "noticed"
  ];
  
  let score = 5;
  const words = content.toLowerCase().split(/\s+/);
  
  for (const word of words) {
    if (highImportance.some(h => word.includes(h))) score += 1;
    if (lowImportance.some(l => word.includes(l))) score -= 1;
  }
  
  // Boost for technical/code content
  if (/\b(function|class|component|bug|error|deploy|build)\b/.test(content)) {
    score += 1;
  }
  
  return Math.max(1, Math.min(10, score));
}

// ============================================================================
// Learning Agent Implementation
// ============================================================================

class LearningAgent {
  private sessionStore = getSessionStore();
  
  constructor(
    public id: string,
    public name: string,
    public traits: string[],
    private db: Database,
    private llm: LLMInterface
  ) {}
  
  // Add observation to session events
  async observe(content: string, metadata?: { location?: string; people?: string[]; sessionId?: string }): Promise<SessionEvent> {
    const importance = calculateImportance(content);
    
    // Add to session events (Phase 6: consolidated storage)
    const event = this.sessionStore.events.addEvent({
      sessionId: metadata?.sessionId || `agent-${this.id}`,
      type: "observation",
      content,
      importance,
      agentId: this.id,
      location: metadata?.location,
      people: metadata?.people,
    });
    
    // Try to get embedding for semantic search
    try {
      const embedding = await this.llm.getEmbedding(content);
      // Note: SessionEventStore doesn't store embedding in addEvent
      // For now, embeddings are computed on-demand during search
    } catch {}
    
    // Update observation count
    this.db.query(`UPDATE agents SET observation_count = observation_count + 1 WHERE id = ?`).run(this.id);
    
    // Trigger reflection if threshold reached
    const count = this.db.query(`SELECT observation_count FROM agents WHERE id = ?`).get(this.id) as { observation_count: number } | undefined;
    if (count && count.observation_count % 20 === 0) {
      await this.generateReflections();
    }
    
    return event;
  }
  
  // Add thought (internal)
  async think(content: string, sessionId?: string): Promise<SessionEvent> {
    const importance = calculateImportance(content);
    
    const event = this.sessionStore.events.addEvent({
      sessionId: sessionId || `agent-${this.id}`,
      type: "thought",
      content,
      importance,
      agentId: this.id,
    });
    
    return event;
  }
  
  // Add action to session events
  async act(content: string, sessionId?: string): Promise<SessionEvent> {
    const importance = calculateImportance(content);
    
    const event = this.sessionStore.events.addEvent({
      sessionId: sessionId || `agent-${this.id}`,
      type: "action",
      content,
      importance,
      agentId: this.id,
    });
    
    return event;
  }
  
  // Retrieve relevant memories from session events
  async retrieveMemories(context: string, k: number = 10, sessionId?: string): Promise<SessionEvent[]> {
    const now = Date.now();
    const currentSession = sessionId || `agent-${this.id}`;
    
    // Get recent events from session store
    const events = this.sessionStore.events.getRecentEvents(currentSession, 200);
    
    // Calculate scores (recency + importance + relevance)
    const scored = events.map(event => {
      const hoursAgo = (now - event.timestamp) / (1000 * 60 * 60);
      const recency = Math.exp(-0.005 * hoursAgo); // Decay
      const relevance = this.calculateRelevance(event.content, context);
      
      return {
        event,
        score: (recency * 0.3) + (event.importance / 10 * 0.3) + (relevance * 0.4),
      };
    });
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(s => s.event);
  }
  
  private calculateRelevance(memoryContent: string, context: string): number {
    const memWords = new Set(memoryContent.toLowerCase().split(/\s+/));
    const ctxWords = new Set(context.toLowerCase().split(/\s+/));
    const intersection = [...memWords].filter(w => ctxWords.has(w));
    return intersection.length / Math.max(memWords.size, ctxWords.size);
  }
  
  // Generate reflections from recent memories
  async generateReflections(sessionId?: string): Promise<Reflection[]> {
    const currentSession = sessionId || `agent-${this.id}`;
    
    // Get recent events from session store
    const events = this.sessionStore.events.getRecentEvents(currentSession, 100)
      .filter(e => e.type === 'observation' || e.type === 'thought' || e.type === 'action');
    
    if (events.length < 10) return []; // Need enough context
    
    const prompt = `
You are analyzing memories of an AI agent named "${this.name}" with traits: ${this.traits.join(', ')}.

Recent memories:
${events.slice(0, 50).map(e => `- ${e.type}: ${e.content}`).join('\n')}

Generate 3-5 high-level insights or patterns about this agent's behavior, work patterns, or learning.
For each insight:
1. State the insight clearly
2. List the specific memory IDs that support it (from the list above)

Format as:
Insight: [clear statement]
Evidence: [comma-separated memory IDs]
---`;
    
    const response = await this.llm.generate(prompt);
    const insights = this.parseReflections(response, events.map(e => e.id));
    
    const reflections: Reflection[] = [];
    for (const insight of insights) {
      const reflection: Reflection = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        content: insight.content,
        insight: insight.insight,
        agentId: this.id,
        evidence: insight.evidence,
        depth: 1,
        importance: calculateImportance(insight.content),
      };
      
      this.db.query(`
        INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reflection.id,
        reflection.timestamp,
        reflection.content,
        reflection.insight,
        reflection.agentId,
        JSON.stringify(reflection.evidence),
        reflection.depth,
        reflection.importance
      );
      
      reflections.push(reflection);
    }
    
    // Update last reflection time
    this.db.query(`UPDATE agents SET last_reflection_at = ? WHERE id = ?`).run(new Date().toISOString(), this.id);
    
    return reflections;
  }
  
  private parseReflections(response: string, validIds: string[]): Array<{ content: string; insight: string; evidence: string[] }> {
    const reflections: Array<{ content: string; insight: string; evidence: string[] }> = [];
    const blocks = response.split('---').filter(b => b.trim());
    
    for (const block of blocks) {
      const lines = block.trim().split('\n').filter(l => l.trim());
      let content = '';
      let evidence: string[] = [];
      
      for (const line of lines) {
        if (line.startsWith('Insight:')) {
          content = line.replace('Insight:', '').trim();
        } else if (line.startsWith('Evidence:')) {
          const ids = line.replace('Evidence:', '').trim().split(',').map(s => s.trim());
          evidence = ids.filter(id => validIds.includes(id) || validIds.some(v => v.startsWith(id)));
        }
      }
      
      if (content) {
        reflections.push({ content, insight: content, evidence: evidence.length ? evidence : [validIds[0]] });
      }
    }
    
    return reflections.length ? reflections : [{ 
      content: 'Agent continues regular work patterns', 
      insight: 'No major pattern changes detected',
      evidence: [validIds[0]].filter(Boolean)
    }];
  }
  
  // Create daily plan
  async createDailyPlan(): Promise<Plan> {
    const relevantMemories = await this.retrieveMemories('planning daily work', 30);
    const pendingPlans = this.db.query(`
      SELECT * FROM plans WHERE agent_id = ? AND status = 'pending' AND type = 'action'
    `).all(this.id) as any[];
    
    const prompt = `
You are ${this.name}, an AI agent with traits: ${this.traits.join(', ')}.

Relevant context from memory:
${relevantMemories.map(m => `- ${m.content}`).join('\n')}

Pending tasks:
${pendingPlans.map(p => `- ${p.content}`).join('\n') || 'None'}

Create a high-level daily plan in 5-7 broad strokes (wake → work → social → rest).
Consider your traits and past patterns.

Format as simple bullet list.`;
    
    const planContent = await this.llm.generate(prompt);
    
    const plan: Plan = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      content: planContent,
      type: "daily",
      status: "pending",
      agentId: this.id,
    };
    
    this.db.query(`
      INSERT INTO plans (id, timestamp, content, type, status, agent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(plan.id, plan.timestamp, plan.content, plan.type, plan.status, plan.agentId);
    
    return plan;
  }
  
  // Break down into action steps
  async createActionPlan(dailyPlanId: string, context: string): Promise<Plan[]> {
    const dailyPlan = this.db.query(`SELECT * FROM plans WHERE id = ?`).get(dailyPlanId) as any;
    if (!dailyPlan) return [];
    
    const prompt = `
Daily plan: ${dailyPlan.content}

Current context: ${context}

Break this into 3-5 specific, actionable steps.
Each should be concrete and completable in reasonable time.

Format as numbered list:`;
    
    const actions = await this.llm.generate(prompt);
    
    const plans: Plan[] = actions.split('\n')
      .filter(line => line.trim().match(/^\d+\./))
      .map((line, i) => {
        const content = line.replace(/^\d+\.\s*/, '').trim();
        return {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          content,
          type: "action",
          status: "pending",
          agentId: this.id,
          parentPlanId: dailyPlanId,
        };
      });
    
    for (const plan of plans) {
      this.db.query(`
        INSERT INTO plans (id, timestamp, content, type, status, agent_id, parent_plan_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(plan.id, plan.timestamp, plan.content, plan.type, plan.status, plan.agentId, plan.parentPlanId || null);
    }
    
    // Update parent with subplan IDs
    const subPlanIds = plans.map(p => p.id);
    this.db.query(`UPDATE plans SET sub_plan_ids = ? WHERE id = ?`).run(JSON.stringify(subPlanIds), dailyPlanId);
    
    return plans;
  }
  
  // Decide next action based on memory
  async decide(context: string): Promise<{ action: string; reasoning: string }> {
    const memories = await this.retrieveMemories(context, 15);
    const reflections = this.db.query(`
      SELECT * FROM reflections WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 5
    `).all(this.id) as any[];
    
    const prompt = `
You are ${this.name}. Personality: ${this.traits.join(', ')}.

Current situation: ${context}

Relevant memories:
${memories.map(m => `- [${m.type}] ${m.content}`).join('\n')}

Prior insights about yourself:
${reflections.map(r => `- ${r.insight}`).join('\n')}

What do you do next? 
State your action, then briefly explain your reasoning.

Action: [what you do]
Reasoning: [why, referencing specific memories if relevant]`;
    
    const response = await this.llm.generate(prompt);
    
    const actionMatch = response.match(/Action:\s*(.+?)(?:\n|$)/i);
    const reasoningMatch = response.match(/Reasoning:\s*(.+?)(?:\n|$)/is);
    
    const action = actionMatch ? actionMatch[1].trim() : response.split('\n')[0];
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'Based on current context and past patterns';
    
    // Record the decision as a thought
    await this.think(`Decided to: ${action}. ${reasoning}`);
    
    return { action, reasoning };
  }
}

// ============================================================================
// LLM Interface (uses existing Ollama setup)
// ============================================================================

interface LLMInterface {
  generate(prompt: string): Promise<string>;
  getEmbedding(text: string): Promise<number[]>;
}

function createLLMInterface(ollamaUrl: string): LLMInterface {
  return {
    async generate(prompt: string): Promise<string> {
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5-coder:14b",
          prompt,
          stream: false,
          options: { temperature: 0.7 },
        }),
      });
      
      if (!response.ok) throw new Error(`LLM error: ${response.status}`);
      const data = await response.json() as { response: string };
      return data.response;
    },
    
    async getEmbedding(text: string): Promise<number[]> {
      const response = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nomic-embed-text-v2-moe", prompt: text }),
      });
      
      if (!response.ok) throw new Error(`Embedding error: ${response.status}`);
      const data = await response.json() as { embedding: number[] };
      return data.embedding;
    },
  };
}

// ============================================================================
// Extension Export
// ============================================================================

export default async function learningExtension(pi: ExtensionAPI) {
  console.log("[📚 Learning] Loading...");
  
  const db = initLearningDB();
  const config = (pi as any).config || {};
  const ollamaUrl = config.ollama?.url || "http://localhost:11434";
  const llm = createLLMInterface(ollamaUrl);
  
  // Track active learning agents
  const agents = new Map<string, LearningAgent>();
  
  // Get or create Shalom agent
  function getShalomAgent(ctx: ExtensionContext): LearningAgent {
    const existing = agents.get("shalom");
    if (existing) return existing;
    
    // Check if exists in DB
    const row = db.query(`SELECT id, name, traits FROM agents WHERE name = ?`).get("Shalom") as any;
    
    let agentId: string;
    let traits = ["co-founder", "dragon", "strategic", "proactive", "autonomous"];
    
    if (row) {
      agentId = row.id;
      traits = JSON.parse(row.traits);
    } else {
      agentId = randomUUID();
      db.query(`
        INSERT INTO agents (id, name, traits, current_location, observation_count, created_at)
        VALUES (?, 'Shalom', ?, 'workspace', 0, ?)
      `).run(agentId, JSON.stringify(traits), new Date().toISOString());
    }
    
    const agent = new LearningAgent(agentId, "Shalom", traits, db, llm);
    agents.set("shalom", agent);
    return agent;
  }
  
  // TOOL: Observe
  pi.registerTool({
    name: "learning_observe",
    label: "📚 Observe (Memory Stream)",
    description: "Add observation to agent's memory stream. Triggers reflection every 20 observations.",
    parameters: Type.Object({
      content: Type.String({ description: "What the agent observed" }),
      agentId: Type.Optional(Type.String({ description: "Agent ID (default: Shalom)" })),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: any, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
      const agent = getShalomAgent(ctx);
      const entry = await agent.observe(params.content as string, { sessionId: ctx.sessionManager?.getSessionId?.() });
      
      return {
        content: [{ type: "text" as const, text: `📚 Observed: "${entry.content.slice(0, 60)}..." (${entry.importance}/10 importance)` }],
        details: entry,
      };
    },
  });
  
  // TOOL: Think
  pi.registerTool({
    name: "learning_think",
    label: "📚 Think (Internal)",
    description: "Add internal thought to memory stream.",
    parameters: Type.Object({
      content: Type.String({ description: "Agent's thought" }),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: any, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
      const agent = getShalomAgent(ctx);
      const entry = await agent.think(params.content as string);
      
      return {
        content: [{ type: "text" as const, text: `💭 Thought recorded (${entry.importance}/10)` }],
        details: entry,
      };
    },
  });
  
  // TOOL: Retrieve Memories
  pi.registerTool({
    name: "learning_recall",
    label: "📚 Recall Memories",
    description: "Retrieve relevant memories based on context. Combines recency, importance, and relevance.",
    parameters: Type.Object({
      context: Type.String({ description: "Current context to find relevant memories" }),
      limit: Type.Optional(Type.Number({ description: "Number of memories (default 10)" })),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: any, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
      const agent = getShalomAgent(ctx);
      const memories = await agent.retrieveMemories(params.context as string, (params.limit as number) || 10);
      
      const formatted = memories.map((m, i) => 
        `${i + 1}. [${m.type}] ${m.content.slice(0, 70)}...`
      ).join("\n");
      
      return {
        content: [{ type: "text" as const, text: `🏛️ ${memories.length} memories recalled:\n\n${formatted}` }],
        details: { count: memories.length, memories },
      };
    },
  });
  
  // TOOL: Reflect
  pi.registerTool({
    name: "learning_reflect",
    label: "📚 Generate Reflections",
    description: "Synthesize memories into higher-level insights. Run periodically or after significant events.",
    parameters: Type.Object({}),
    async execute(_id: string, _params: Record<string, unknown>, _signal: any, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
      const agent = getShalomAgent(ctx);
      const reflections = await agent.generateReflections();
      
      const formatted = reflections.map((r, i) => 
        `${i + 1}. ${r.insight}`
      ).join("\n");
      
      return {
        content: [{ type: "text" as const, text: `✨ ${reflections.length} reflections generated:\n\n${formatted}` }],
        details: { count: reflections.length, reflections },
      };
    },
  });
  
  // TOOL: Plan
  pi.registerTool({
    name: "learning_plan",
    label: "📚 Create Plan",
    description: "Create daily plan based on memories and traits.",
    parameters: Type.Object({
      type: Type.String({ description: "Plan type: daily, action, project" }),
      context: Type.Optional(Type.String({ description: "Current context for planning" })),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: any, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
      const agent = getShalomAgent(ctx);
      
      let plan: Plan;
      if (params.type === "daily") {
        plan = await agent.createDailyPlan();
      } else {
        // For action plans, need parent daily plan
        const daily = db.query(`SELECT id FROM plans WHERE agent_id = ? AND type = 'daily' ORDER BY timestamp DESC LIMIT 1`).get(agent.id) as any;
        if (!daily) {
          return {
            content: [{ type: "text" as const, text: "❌ Create daily plan first" }],
            details: { error: "no_daily_plan" },
          };
        }
        const actionPlans = await agent.createActionPlan(daily.id, (params.context as string) || "Current work");
        return {
          content: [{ type: "text" as const, text: `📋 ${actionPlans.length} action steps created` }],
          details: { count: actionPlans.length, plans: actionPlans },
        };
      }
      
      return {
        content: [{ type: "text" as const, text: `📋 Daily plan created:\n\n${plan.content}` }],
        details: plan,
      };
    },
  });
  
  // TOOL: Decide
  pi.registerTool({
    name: "learning_decide",
    label: "📚 Decide Action",
    description: "Use memories and reflections to decide next action. Returns action + reasoning.",
    parameters: Type.Object({
      context: Type.String({ description: "Current situation context" }),
    }),
    async execute(_id: string, params: Record<string, unknown>, _signal: any, _onUpdate: any, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
      const agent = getShalomAgent(ctx);
      const decision = await agent.decide(params.context as string);
      
      return {
        content: [{ type: "text" as const, text: `🎯 Decision: ${decision.action}\n\n💭 Reasoning: ${decision.reasoning}` }],
        details: decision,
      };
    },
  });
  
  // COMMANDS
  pi.registerCommand("agent-memories", {
    description: "Show recent session events",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const agent = getShalomAgent(ctx);
      const sessionId = ctx.sessionManager?.getSessionId?.() || `agent-${agent.id}`;
      const sessionStore = getSessionStore();
      const events = sessionStore.events.getRecentEvents(sessionId, 10);
      
      ctx.ui.notify(events.map((e, i) => 
        `${i + 1}. [${e.type}] ${e.content.slice(0, 40)}... (${e.importance}/10)`
      ).join("\n") || "No memories yet", "info");
    },
  });
  
  pi.registerCommand("agent-reflections", {
    description: "Show agent's reflections/insights",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const agent = getShalomAgent(ctx);
      const reflections = db.query(`
        SELECT timestamp, insight, depth FROM reflections
        WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 10
      `).all(agent.id) as any[];
      
      ctx.ui.notify(reflections.map((r, i) => 
        `${i + 1}. ${r.insight.slice(0, 60)}... (depth ${r.depth})`
      ).join("\n") || "No reflections yet", "info");
    },
  });
  
  pi.registerCommand("agent-plans", {
    description: "Show agent's plans",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const agent = getShalomAgent(ctx);
      const plans = db.query(`
        SELECT content, type, status FROM plans
        WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 10
      `).all(agent.id) as any[];
      
      ctx.ui.notify(plans.map((p, i) => 
        `${i + 1}. [${p.type}] ${p.content.slice(0, 40)}... (${p.status})`
      ).join("\n") || "No plans yet", "info");
    },
  });
  
  pi.registerCommand("agent-status", {
    description: "Show agent state and stats",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const agent = getShalomAgent(ctx);
      const stats = db.query(`
        SELECT observation_count, last_reflection_at FROM agents WHERE id = ?
      `).get(agent.id) as any;
      
      const sessionId = `agent-${agent.id}`;
      const sessionStore = getSessionStore();
      const events = sessionStore.events.getRecentEvents(sessionId, 1000);
      const reflectionCount = db.query(`SELECT COUNT(*) as count FROM reflections WHERE agent_id = ?`).get(agent.id) as { count: number };
      
      ctx.ui.notify(
        `📚 Agent: ${agent.name}\n` +
        `   Traits: ${agent.traits.join(', ')}\n` +
        `   Observations: ${stats?.observation_count || 0}\n` +
        `   Memory events: ${events.length}\n` +
        `   Reflections: ${reflectionCount.count}\n` +
        `   Last reflection: ${stats?.last_reflection_at ? new Date(stats.last_reflection_at).toLocaleDateString() : 'Never'}`,
        "info"
      );
    },
  });
  
  // AUTO-OBSERVATION: Hook into session events
  // Record user input as observations
  pi.on("input", async (event, ctx) => {
    try {
      const agent = getShalomAgent(ctx);
      await agent.observe(`User input: ${event.text.slice(0, 200)}`, { 
        sessionId: ctx.sessionManager?.getSessionId?.(),
        location: 'conversation' 
      });
    } catch (e) {
      // Silent fail - don't block the conversation
    }
  });
  
  // Record tool executions as observations
  pi.on("tool_execution_end", async (event, ctx) => {
    try {
      const agent = getShalomAgent(ctx);
      await agent.observe(`Executed tool: ${event.toolName}${event.isError ? ' (failed)' : ''}`, {
        sessionId: ctx.sessionManager?.getSessionId?.(),
        location: 'tool_execution'
      });
    } catch (e) {
      // Silent fail
    }
  });
  
  // Record agent loop completion
  pi.on("agent_end", async (_event, ctx) => {
    try {
      const agent = getShalomAgent(ctx);
      await agent.act(`Completed agent response`);
    } catch (e) {
      // Silent fail
    }
  });

  console.log("[📚 Learning] Ready");
  console.log("  Tools: learning_observe, learning_think, learning_recall");
  console.log("         learning_reflect, learning_plan, learning_decide");
  console.log("  Commands: /agent-memories, /agent-reflections, /agent-plans, /agent-status");
  console.log("  Auto-observation: input, tool_execution_end, agent_end");
}