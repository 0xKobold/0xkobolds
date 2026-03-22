/**
 * Telemetry CLI Commands
 * 
 * Usage:
 *   bun run src/telemetry/cli.ts summary
 *   bun run src/telemetry/cli.ts jobs
 *   bun run src/telemetry/cli.ts stats <metric>
 */

import { telemetry } from "./index";

// Run CLI if executed directly (not imported)
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runCli();
}

function showSummary() {
  const t = telemetry();
  const summary = t.getDashboardSummary(7);
  
  console.log("\n📊 0xKobold Telemetry - 7 Day Summary\n");
  
  // Gateway
  console.log("🌐 Gateway");
  console.log(`  Requests:    ${summary.gateway.count}`);
  console.log(`  Success:     ${summary.gateway.success_rate.toFixed(1)}%`);
  console.log(`  Avg Latency: ${summary.gateway.avg_latency.toFixed(0)}ms`);
  
  // LLM
  console.log("\n🤖 LLM");
  console.log(`  Requests:    ${summary.llm.count}`);
  console.log(`  Avg Latency: ${summary.llm.avg_latency.toFixed(0)}ms`);
  
  // Skills
  console.log("\n⚡ Skills");
  console.log(`  Executions:  ${summary.skill.count}`);
  console.log(`  Success:     ${summary.skill.success_rate.toFixed(1)}%`);
  
  // Cron
  console.log("\n⏰ Cron");
  console.log(`  Jobs:        ${summary.cron.count}`);
  console.log(`  Success:     ${summary.cron.success_rate.toFixed(1)}%`);
  
  // Sessions
  console.log("\n💾 Sessions");
  console.log(`  Created:     ${summary.session.created}`);
  console.log(`  Resumed:     ${summary.session.resumed}`);
  console.log(`  Forked:      ${summary.session.forked}`);
  console.log(`  Abandoned:   ${summary.session.abandoned}`);
  
  // Agents
  console.log("\n🤖 Agents");
  console.log(`  Spawned:     ${summary.agent.spawned}`);
  console.log(`  Completed:   ${summary.agent.completed}`);
  console.log(`  Timeouts:    ${summary.agent.timeouts}`);
  
  t.close();
  console.log("");
}

function showStats(metric?: string) {
  const t = telemetry();
  if (!metric) {
    console.log("Usage: telemetry stats <metric-name>\n");
    console.log("Available metrics:");
    console.log("  gateway.request.latency");
    console.log("  llm.request.latency");
    console.log("  skill.execution.latency");
    console.log("  cron.job.latency");
    console.log("  session.created.total");
    console.log("  agent.spawned.total");
    t.close();
    return;
  }

  const stats = t.getStats(metric, 7);
  
  if (!stats) {
    console.log(`No data for metric: ${metric}`);
    t.close();
    return;
  }

  console.log(`\n📈 ${metric} - 7 Day Stats\n`);
  console.log(`  Count: ${stats.count}`);
  console.log(`  Sum:   ${stats.sum.toFixed(2)}`);
  console.log(`  Avg:   ${stats.avg.toFixed(2)}`);
  console.log(`  Min:   ${stats.min.toFixed(2)}`);
  console.log(`  Max:   ${stats.max.toFixed(2)}`);
  console.log(`  P50:   ${stats.p50.toFixed(2)}`);
  console.log(`  P95:   ${stats.p95.toFixed(2)}`);
  console.log(`  P99:   ${stats.p99.toFixed(2)}`);
  t.close();
  console.log("");
}

function showCronJobs() {
  const t = telemetry();
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoSec = Math.floor(sevenDaysAgo / 1000);
  
  const events = t.queryEvents('cron', 50).filter(e => e.timestamp > sevenDaysAgoSec);
  
  if (events.length === 0) {
    console.log("\n⏰ No cron jobs in the last 7 days\n");
    t.close();
    return;
  }
  
  console.log("\n⏰ Cron Job History (7 days)\n");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(" Job Name                  Duration  Status   Trigger");
  console.log("─────────────────────────────────────────────────────────────");
  
  for (const event of events) {
    const props = JSON.parse(event.properties || '{}');
    const trigger = props.triggered_by || 'schedule';
    const status = event.success ? '✅' : '❌';
    const duration = event.duration_ms ? `${event.duration_ms}ms` : '-';
    
    // Truncate name if needed
    const name = event.event_name.length > 24 ? event.event_name.slice(0, 21) + '...' : event.event_name;
    const time = new Date(event.timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ');
    
    console.log(` ${name.padEnd(24)} ${duration.padStart(8)} ${status}  ${trigger.padEnd(8)} ${time}`);
  }
  
  console.log("─────────────────────────────────────────────────────────────\n");
  
  // Summary by job name
  const summaryMap = new Map<string, { runs: number; successes: number; totalDuration: number; lastTime: number }>();
  
  for (const event of events) {
    const name = event.event_name;
    const existing = summaryMap.get(name) || { runs: 0, successes: 0, totalDuration: 0, lastTime: 0 };
    existing.runs++;
    if (event.success) existing.successes++;
    existing.totalDuration += event.duration_ms || 0;
    existing.lastTime = Math.max(existing.lastTime, event.timestamp);
    summaryMap.set(name, existing);
  }
  
  console.log("📊 By Job:\n");
  for (const [name, s] of summaryMap) {
    const rate = ((s.successes / s.runs) * 100).toFixed(0);
    const avgMs = s.totalDuration > 0 ? `${Math.round(s.totalDuration / s.runs)}ms` : '-';
    const lastRun = new Date(s.lastTime * 1000).toISOString().slice(0, 16).replace('T', ' ');
    console.log(`  ${name}`);
    console.log(`    Runs: ${s.runs} | Success: ${rate}% | Avg: ${avgMs} | Last: ${lastRun}`);
  }
  
  t.close();
  console.log("");
}

function showBenchmark() {
  const t = telemetry();
  const payload = t.generateBenchmarkPayload(7);
  
  console.log("\n📤 Benchmark Payload (anonymous)\n");
  console.log(payload);
  console.log("\nThis data can be submitted to a benchmark endpoint.\n");
  
  t.close();
}

function showHelp() {
  console.log(`
📊 0xKobold Telemetry CLI

Usage:
  bun run src/telemetry/cli.ts <command>

Commands:
  summary, s      Show 7-day dashboard summary
  stats           Show detailed stats for a metric
  jobs, cron      Show cron job history with metadata
  benchmark, b    Generate anonymous benchmark payload
  cleanup         Remove old data (keeps 30 days)
  enable          Enable telemetry collection
  disable         Disable telemetry collection

Examples:
  bun run src/telemetry/cli.ts summary
  bun run src/telemetry/cli.ts stats llm.request.latency
  bun run src/telemetry/cli.ts jobs
  bun run src/telemetry/cli.ts benchmark
`);
}

// Main CLI entry point
async function runCli() {
  const args = process.argv.slice(2); // Skip 'src/telemetry/cli.ts'
  const command = args[0] || "summary";
  const t = telemetry();

  switch (command) {
    case "summary":
    case "s":
      showSummary();
      break;
    case "stats":
      showStats(args[1]);
      break;
    case "jobs":
    case "cron":
      showCronJobs();
      break;
    case "benchmark":
    case "b":
      showBenchmark();
      break;
    case "cleanup":
      console.log(`Cleaned ${t.cleanup()} rows`);
      break;
    case "enable":
      t.setEnabled(true);
      console.log("Telemetry enabled");
      break;
    case "disable":
      t.setEnabled(false);
      console.log("Telemetry disabled");
      break;
    default:
      showHelp();
  }
  
  t.close();
}
