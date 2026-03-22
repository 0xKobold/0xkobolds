/**
 * Ephemeral Agent CLI
 */

import { ephemeralRegistry, spawnEphemeral, spawnEphemeralFanOut } from './index.js';

function showStatus() {
  const stats = ephemeralRegistry.getStats();
  console.log('\n📊 Ephemeral Registry\n');
  console.log('Active:', stats.active);
  console.log('Total Spawned:', stats.totalSpawned);
  console.log('Total Completed:', stats.totalCompleted);
  console.log('Total Failed:', stats.totalFailed);
  console.log('Max TTL:', Math.round(stats.maxTtlMs / 1000) + 's');
  console.log('LRU Capacity:', stats.lruCapacity);
  
  if (stats.activeAgents.length > 0) {
    console.log('\nActive agents:');
    for (const a of stats.activeAgents) {
      const age = Math.round((Date.now() - a.startedAt) / 1000);
      console.log('  ', a.type, a.id.slice(0, 8), '(' + age + 's ago)');
      console.log('     Task:', a.task.slice(0, 60) + (a.task.length > 60 ? '...' : ''));
    }
  }
  console.log('');
}

async function spawnTask(task: string, type?: string) {
  console.log('\n🚀 Spawning agent...\n');
  
  const result = await spawnEphemeral({
    task,
    agentType: type,
  });
  
  console.log('Status:', result.success ? '✅ Success' : '❌ Failed');
  console.log('Duration:', result.durationMs + 'ms');
  console.log('\nOutput:');
  console.log(result.text);
}

async function fanOutTasks(tasks: string[], type?: string) {
  console.log('\n🔄 Fan-out:', tasks.length, 'tasks\n');
  
  const results = await spawnEphemeralFanOut(tasks, type);
  
  const successful = results.filter(r => r.success).length;
  console.log('\nResults:', successful + '/' + tasks.length, 'succeeded\n');
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log('[' + (i + 1) + ']', r.success ? '✅' : '❌', r.text.slice(0, 80));
  }
}

function cleanupAgents() {
  console.log('\n🧹 Cleaning up...\n');
  ephemeralRegistry.cleanup();
  console.log('Done.\n');
}

// Main CLI
const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case 'status':
    showStatus();
    break;
  case 'spawn':
    spawnTask(args.slice(1).join(' ') || 'echo hello', args[1]).catch(console.error);
    break;
  case 'fanout':
    fanOutTasks(args.slice(1), args[1]).catch(console.error);
    break;
  case 'cleanup':
    cleanupAgents();
    break;
  default:
    console.log('Ephemeral Agent CLI\n');
    console.log('Commands:');
    console.log('  status   - Show registry status');
    console.log('  spawn    - Spawn an agent');
    console.log('  fanout   - Run tasks in parallel');
    console.log('  cleanup  - Clean up expired agents');
}
