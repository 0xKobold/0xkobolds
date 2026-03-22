/**
 * Telemetry CLI Commands
 * 
 * Usage:
 *   0xkobold telemetry summary
 *   0xkobold telemetry stats <metric>
 *   0xkobold telemetry benchmark
 */

import { telemetry } from "./index";

const args = process.argv.slice(3); // Skip '0xkobold telemetry'
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
  case "benchmark":
  case "b":
    showBenchmark();
    break;
  case "cleanup":
    const deleted = t.cleanup();
    console.log(`Cleaned ${deleted} rows`);
    break;
  case "enable":
    t.setEnabled(true);
    break;
  case "disable":
    t.setEnabled(false);
    break;
  default:
    showHelp();
}

function showSummary() {
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
  
  console.log("");
}

function showStats(metric?: string) {
  if (!metric) {
    console.log("Usage: 0xkobold telemetry stats <metric-name>\n");
    console.log("Available metrics:");
    console.log("  gateway.request.latency");
    console.log("  llm.request.latency");
    console.log("  skill.execution.latency");
    console.log("  cron.job.latency");
    console.log("  session.created.total");
    console.log("  agent.spawned.total");
    return;
  }

  const stats = t.getStats(metric, 7);
  
  if (!stats) {
    console.log(`No data for metric: ${metric}`);
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
  console.log("");
}

function showBenchmark() {
  const payload = t.generateBenchmarkPayload(7);
  
  console.log("\n📤 Benchmark Payload (anonymous)\n");
  console.log(payload);
  console.log("\nThis data can be submitted to a benchmark endpoint.");
  console.log("");
}

function showHelp() {
  console.log(`
📊 0xKobold Telemetry CLI

Usage:
  0xkobold telemetry <command>

Commands:
  summary, s      Show 7-day dashboard summary
  stats           Show detailed stats for a metric
  benchmark, b    Generate anonymous benchmark payload
  cleanup         Remove old data (keeps 30 days)
  enable          Enable telemetry collection
  disable         Disable telemetry collection

Examples:
  0xkobold telemetry summary
  0xkobold telemetry stats gateway.request.latency
  0xkobold telemetry benchmark
`);
}

t.close();
