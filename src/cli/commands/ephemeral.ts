/**
 * Ephemeral Agent CLI Commands
 */

import { Command } from "commander";
import { spawnEphemeral, spawnEphemeralFanOut, ephemeralRegistry } from "../../ephemeral-agents/index.js";
import type { RegistryStats } from "../../ephemeral-agents/types.js";

/**
 * Create ephemeral command
 */
export function createEphemeralCommand() {
  const cmd = new Command("ephemeral")
    .description("Manage ephemeral sub-agents")
    .configureHelp({ showGlobalOptions: true });

  // Status command
  cmd
    .command("status")
    .description("Show ephemeral agent registry status")
    .action(async () => {
      const stats = ephemeralRegistry.getStats();
      console.log("\n=== Ephemeral Agent Registry ===\n");
      console.log(`Active Agents: ${stats.active}`);
      console.log(`Total Spawned: ${stats.totalSpawned}`);
      console.log(`Total Completed: ${stats.totalCompleted}`);
      console.log(`Total Failed: ${stats.totalFailed}`);
      console.log(`Max TTL: ${stats.maxTtlMs}ms`);
      console.log(`LRU Capacity: ${stats.lruCapacity}`);
      if (stats.activeAgents.length > 0) {
        console.log("\nActive Agents:");
        for (const agent of stats.activeAgents) {
          console.log(`  - ${agent.id.slice(0, 8)}: ${agent.type} (${agent.status})`);
        }
      }
      console.log();
    });

  // Spawn command
  cmd
    .command("spawn <task>")
    .description("Spawn an ephemeral agent with a task")
    .option("-t, --type <type>", "Agent type", "worker")
    .option("-m, --model <model>", "Model to use")
    .option("-p, --provider <provider>", "LLM provider (ollama, openai, anthropic, google)")
    .option("--timeout <ms>", "Timeout in milliseconds", "60000")
    .action(async (task: string, options: Record<string, string>) => {
      console.log(`\n=== Spawning Ephemeral Agent ===\n`);
      console.log(`Task: ${task.slice(0, 100)}...`);
      console.log(`Type: ${options.type || "worker"}`);
      console.log(`Timeout: ${options.timeout || "60000"}ms\n`);

      const result = await spawnEphemeral({
        task,
        agentType: options.type,
        model: options.model,
        provider: options.provider,
        timeoutMs: parseInt(options.timeout || "60000", 10),
      });

      console.log(`\n=== Result ===\n`);
      console.log(`Status: ${result.success ? "✅ Success" : "❌ Failed"}`);
      console.log(`Duration: ${result.durationMs}ms`);
      console.log(`\n${result.text}\n`);
    });

  // Fan-out command
  cmd
    .command("fanout <tasks...>")
    .description("Spawn multiple ephemeral agents in parallel")
    .option("-t, --type <type>", "Agent type", "worker")
    .option("-c, --concurrent <n>", "Max concurrent", "4")
    .action(async (tasks: string[], options: Record<string, string>) => {
      console.log(`\n=== Fan-Out: ${tasks.length} tasks ===\n`);

      const results = await spawnEphemeralFanOut(
        tasks,
        options.type,
        parseInt(options.concurrent || "4", 10)
      );

      const successful = results.filter((r) => r.success).length;
      console.log(`\n=== Results: ${successful}/${tasks.length} succeeded ===\n`);

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        console.log(`[${i + 1}] ${r.success ? "✅" : "❌"} ${r.text.slice(0, 100)}...`);
      }
      console.log();
    });

  // Cleanup command
  cmd
    .command("cleanup")
    .description("Clean up expired agents and workspaces")
    .action(async () => {
      console.log("\n=== Cleaning Up Ephemeral Agents ===\n");
      const stats = ephemeralRegistry.getStats();
      console.log(`Active before cleanup: ${stats.active}`);
      
      ephemeralRegistry.cleanup();
      
      const newStats = ephemeralRegistry.getStats();
      console.log(`Active after cleanup: ${newStats.active}`);
      console.log("\n✅ Cleanup complete\n");
    });

  return cmd;
}
