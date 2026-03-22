/**
 * Ephemeral Agent CLI
 */

import { ephemeralRegistry, spawnEphemeral, spawnEphemeralFanOut } from './index.js';

function showStatus() {
  const stats = ephemeralRegistry.stats();
  console.log('\n📊 Ephemeral Registry\n');
  console.log('Active:', stats.active);
  console.log('Finished:', stats.finished);
  console.log('Avg duration:', Math.round(stats.avgDuration / 1000) + 's');
  
  console.log('\nBy status:');
  for (const [status, count] of Object.entries(stats.byStatus)) {
    console.log('  ', status + ':', count);
  }
  
  const active = ephemeralRegistry.getActive();
  if (active.length > 0) {
    console.log('\nActive agents:');
    for (const a of active) {
      const age = Math.round((Date.now() - a.startedAt) / 1000);
      console.log('  ', a.type, a.id.slice(0, 8), '(' + age + 's ago)');
      console.log('     Task:', a.task.slice(0, 60) + (a.task.length > 60 ? '...' : ''));
    }
  }
  console.log('');
}

async function handleSpawn(args: string[]) {
  const task = args.join(' ');
  if (!task) {
    console.error('Usage: ephemeral spawn <task>');
    process.exit(1);
  }

  console.log('\n🚀 Spawning ephemeral agent...\n');
  console.log('Task:', task.slice(0, 100) + (task.length > 100 ? '...' : ''), '\n');

  const startTime = Date.now();
  const result = await spawnEphemeral({ task, agentType: 'worker' });
  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n${result.success ? '✅' : '❌'} Completed in ${duration}s`);
  console.log('\nResult:\n' + result.text.slice(0, 500) + (result.text.length > 500 ? '\n...' : ''));
  
  if (result.tokens) {
    console.log('\nTokens:', result.tokens.total, '(in:', result.tokens.input, ', out:', result.tokens.output + ')');
  }
}

async function handleFanout(args: string[]) {
  const tasks = args.join(' ').split('|').map(t => t.trim()).filter(Boolean);
  
  if (tasks.length < 2) {
    console.error('Usage: ephemeral fanout <task1> | <task2> | <task3>...');
    process.exit(1);
  }

  console.log('\n🚀 Fan-out:', tasks.length, 'tasks\n');
  
  for (let i = 0; i < tasks.length; i++) {
    console.log(' ', (i + 1) + '.', tasks[i].slice(0, 60) + (tasks[i].length > 60 ? '...' : ''));
  }
  console.log('');

  const startTime = Date.now();
  const results = await spawnEphemeralFanOut(tasks, 'worker', Math.min(4, tasks.length));
  const duration = Math.round((Date.now() - startTime) / 1000);

  const successful = results.filter(r => r.success).length;
  
  console.log('\n📊 Fan-out complete:', successful + '/' + tasks.length, 'succeeded in', duration + 's\n');
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log('[' + (i + 1) + ']', r.success ? '✅' : '❌', tasks[i].slice(0, 40) + '...');
    if (r.success && r.text) {
      console.log('    →', r.text.slice(0, 80) + (r.text.length > 80 ? '...' : ''));
    }
  }
  console.log('');
}

function handleCleanup() {
  const n = ephemeralRegistry.cleanup();
  console.log('\n🧹 Cleaned', n, 'expired entries\n');
  
  const stats = ephemeralRegistry.stats();
  console.log('Registry now:', stats.active, 'active,', stats.finished, 'finished\n');
}

function showHelp() {
  console.log(`
🤖 Ephemeral Agent CLI

Usage:
  bun run src/ephemeral-agents/cli.ts <command> [args]

Commands:
  status              Show registry status
  spawn <task>        Spawn single ephemeral agent
  fanout <t1>|<t2>    Spawn multiple in parallel
  cleanup             Clean up expired entries
  help                Show this help

Examples:
  bun run src/ephemeral-agents/cli.ts status
  bun run src/ephemeral-agents/cli.ts spawn "Write hello world in Python"
  bun run src/ephemeral-agents/cli.ts fanout "Task 1|Task 2|Task 3"
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'status':
      showStatus();
      break;

    case 'spawn':
      await handleSpawn(args.slice(1));
      break;

    case 'fanout':
      await handleFanout(args.slice(1));
      break;

    case 'cleanup':
      handleCleanup();
      break;

    case 'help':
    default:
      showHelp();
  }
}

main().catch(console.error);
