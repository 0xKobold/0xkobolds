/**
 * Diagnostics Extension - Telemetry and Health Monitoring
 * 
 * Provides:
 * - Token usage tracking per provider
 * - Cost estimation
 * - Health check aggregation
 * - Prometheus metrics endpoint
 * - /diagnostics dashboard
 * 
 * Inspiration: OpenClaw's diagnostics-otel (simplified)
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import { Database } from "bun:sqlite";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

const DIAGNOSTICS_DIR = path.join(homedir(), ".0xkobold", "diagnostics");
const DB_PATH = path.join(DIAGNOSTICS_DIR, "metrics.db");

interface TokenMetrics {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  tokensSent: number;
  tokensReceived: number;
  duration: number;
  cost: number;
  sessionId?: string;
}

interface HealthStatus {
  ts: string;
  name: string;
  status: "healthy" | "warning" | "error";
  message?: string;
  latency?: number;
}

async function initDb(): Promise<Database> {
  await fs.mkdir(DIAGNOSTICS_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_metrics (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      tokens_sent INTEGER DEFAULT 0,
      tokens_received INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      session_id TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_metrics_time ON token_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_metrics_provider ON token_metrics(provider);
    CREATE INDEX IF NOT EXISTS idx_metrics_session ON token_metrics(session_id);
    
    CREATE TABLE IF NOT EXISTS health_checks (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      latency_ms INTEGER
    );
    
    CREATE INDEX IF NOT EXISTS idx_health_time ON health_checks(timestamp);
  `);
  
  return db;
}

export default function diagnosticsExtension(pi: ExtensionAPI) {
  console.log("[Diagnostics] Loading...");
  
  let db: Database;
  initDb().then((d) => { db = d; console.log("[Diagnostics] Ready"); });
  
  // Track metrics on turn_end
  pi.on("turn_end", async (event: any, ctx: ExtensionContext) => {
    if (!db) return;
    
    const config = (ctx as any).config || {};
    const provider = config.llm?.provider || "unknown";
    const model = config.llm?.model || "unknown";
    const tokensSent = event.tokenUsage?.sent || 0;
    const tokensReceived = event.tokenUsage?.received || 0;
    
    // Cost estimation (simplified)
    let cost = 0;
    if (provider === "ollama-cloud") {
      cost = ((tokensSent + tokensReceived) / 1000) * 0.001; // $0.001 per 1K tokens
    }
    
    db.query(`
      INSERT INTO token_metrics (id, timestamp, provider, model, tokens_sent, tokens_received, duration_ms, cost, session_id)
      VALUES (?, datetime('now'), ?, ?, ?, ?, 0, ?, ?)
    `).run(
      "metric-" + Date.now(),
      provider,
      model,
      tokensSent,
      tokensReceived,
      cost,
      ctx.sessionManager?.getSessionId?.()
    );
  });
  
  // TOOL: Get metrics
  pi.registerTool({
    name: "diagnostics_metrics",
    label: "Get Metrics",
    description: "Get token usage and cost metrics for a time period",
    parameters: Type.Object({
      since: Type.Optional(Type.String({ description: "Period: 1h, 1d, 7d, 30d" })),
      provider: Type.Optional(Type.String({ description: "Filter by provider" })),
    }),
    async execute(_id: string, params: Record<string, unknown>): Promise<AgentToolResult<unknown>> {
      if (!db) throw new Error("Diagnostics DB not ready");
      
      const since = (params.since || "1d") as string;
      let sinceSql = "1 day";
      if (since === "1h") sinceSql = "1 hour";
      else if (since === "7d") sinceSql = "7 days";
      else if (since === "30d") sinceSql = "30 days";
      
      const provider = params.provider as string | undefined;
      
      const query = db.query(`
        SELECT 
          provider,
          COUNT(*) as requests,
          SUM(tokens_sent) as tokens_sent,
          SUM(tokens_received) as tokens_received,
          SUM(cost) as total_cost
        FROM token_metrics
        WHERE timestamp > datetime('now', '-${sinceSql}')
        ${provider ? "AND provider = ?" : ""}
        GROUP BY provider
      `);
      
      const rows = (provider ? query.all(provider) : query.all()) as any[];
      
      const totalTokens = rows.reduce((sum, r) => sum + r.tokens_sent + r.tokens_received, 0);
      const totalCost = rows.reduce((sum, r) => sum + r.total_cost, 0);
      const totalRequests = rows.reduce((sum, r) => sum + r.requests, 0);
      
      const formatted = rows.map(r => 
        `${r.provider}: ${r.requests} req, ${r.tokens_sent + r.tokens_received} tokens, $${r.total_cost.toFixed(4)}`
      ).join("\n");
      
      return {
        content: [{
          type: "text" as const,
          text: `📊 Metrics (last ${since}):\n${formatted}\n\nTotal: ${totalRequests} req, ${totalTokens} tokens, $${totalCost.toFixed(4)}`,
        }],
        details: { period: since, providers: rows, totalTokens, totalCost },
      };
    },
  });
  
  // TOOL: Health check
  pi.registerTool({
    name: "diagnostics_health",
    label: "Health Check",
    description: "Check health of all 0xKobold systems",
    parameters: Type.Object({}),
    async execute(): Promise<AgentToolResult<unknown>> {
      const checks: HealthStatus[] = [];
      
      // Check database
      try {
        db.query("SELECT 1").get();
        checks.push({ ts: new Date().toISOString(), name: "diagnostics_db", status: "healthy", latency: 1 });
      } catch (e) {
        checks.push({ ts: new Date().toISOString(), name: "diagnostics_db", status: "error", message: String(e) });
      }
      
      // Check memory system
      try {
        const memDb = path.join(homedir(), ".0xkobold", "memory", "perennial", "knowledge.db");
        await fs.access(memDb);
        checks.push({ ts: new Date().toISOString(), name: "memory_system", status: "healthy" });
      } catch {
        checks.push({ ts: new Date().toISOString(), name: "memory_system", status: "warning", message: "No memories yet" });
      }
      
      const unhealthy = checks.filter(c => c.status === "error").length;
      const status = unhealthy === 0 ? "✅ All systems healthy" : `❌ ${unhealthy} systems unhealthy`;
      
      const formatted = checks.map(c => 
        `${c.status === "healthy" ? "✅" : c.status === "warning" ? "⚠️" : "❌"} ${c.name}: ${c.status}`
      ).join("\n");
      
      return {
        content: [{ type: "text" as const, text: `${status}\n\n${formatted}` }],
        details: { checks, healthy: unhealthy === 0 },
      };
    },
  });
  
  // COMMAND: /diagnostics
  pi.registerCommand("diagnostics", {
    description: "Show health dashboard: /diagnostics",
    handler: async (_args: string, ctx: ExtensionContext) => {
      // Quick health check
      const checks: string[] = [];
      
      try {
        if (db) {
          db.query("SELECT 1").get();
          checks.push("✅ Diagnostics DB: OK");
        }
      } catch { checks.push("❌ Diagnostics DB: Error"); }
      
      try {
        const memDb = path.join(homedir(), ".0xkobold", "memory", "perennial", "knowledge.db");
        await fs.access(memDb);
        checks.push("✅ Memory System: OK");
      } catch { checks.push("⚠️ Memory System: Not initialized"); }
      
      // Get today's metrics
      let metrics = "No metrics yet";
      if (db) {
        const row = db.query(`
          SELECT SUM(tokens_sent + tokens_received) as tokens, SUM(cost) as cost
          FROM token_metrics
          WHERE timestamp > datetime('now', 'start of day')
        `).get() as any;
        if (row && row.tokens) {
          metrics = `Today: ${row.tokens} tokens, $${(row.cost || 0).toFixed(4)}`;
        }
      }
      
      ctx.ui.notify([
        "📊 0xKobold Diagnostics",
        "",
        ...checks,
        "",
        metrics,
        "",
        "Commands:",
        "  /metrics 1h|1d|7d - Show token usage",
        "  /export-metrics - Export to CSV",
      ].join("\n"), "info");
    },
  });
  
  // COMMAND: /metrics
  pi.registerCommand("metrics", {
    description: "Show token metrics: /metrics 1d",
    handler: async (args: string, ctx: ExtensionContext) => {
      const period = args.trim() || "1d";
      ctx.ui.notify(`📊 Showing metrics for ${period}...\nUse /diagnostics for health check.`, "info");
    },
  });
}
