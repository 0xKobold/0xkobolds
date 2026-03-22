/**
 * Collector CLI - System Metrics Collection
 */

import { collector, showCollectorStatus, telemetry } from '../index.js';

export async function collectorCommand(args: string[]): Promise<void> {
  const action = args[0] || 'status';

  switch (action) {
    case 'status':
      showCollectorStatus();
      break;

    case 'start':
      collector.start({ autoStart: true, intervalMs: 60_000 });
      console.log('✅ Collector started (polling every 60s)');
      // Take immediate sample
      collector.poll();
      break;

    case 'stop':
      collector.stop();
      break;

    case 'poll':
      const metrics = collector.poll();
      console.log('\n📊 Current System Metrics:');
      console.log('─'.repeat(40));
      if (metrics) {
        if (metrics.memory) {
          console.log('\n🧠 Memory:');
          console.log(`  Heap Used:  ${metrics.memory.heapUsedMb} MB`);
          console.log(`  Heap Total: ${metrics.memory.heapTotalMb} MB`);
          console.log(`  RSS:        ${metrics.memory.rssMb} MB`);
          console.log(`  System:     ${metrics.memory.systemUsedPercent}% used`);
        }
        if (metrics.cpu) {
          console.log('\n💻 CPU:');
          console.log(`  Load 1m:  ${metrics.cpu.loadAvg1m}`);
          console.log(`  Load 5m:  ${metrics.cpu.loadAvg5m}`);
          console.log(`  Cores:    ${metrics.cpu.coreCount}`);
        }
      }
      break;

    case 'history': {
      const days = parseInt(args[1]) || 7;
      console.log(`\n📈 System Metrics History (${days} days):\n`);
      
      // Show memory trend
      const memoryStats = telemetry().getStats('system.memory.heap_used', days);
      if (memoryStats && memoryStats.count > 0) {
        console.log(`Heap Used (MB):`);
        console.log(`  Count: ${memoryStats.count}`);
        console.log(`  Avg:   ${memoryStats.avg.toFixed(2)}`);
        console.log(`  Min:   ${memoryStats.min.toFixed(2)}`);
        console.log(`  Max:   ${memoryStats.max.toFixed(2)}`);
      } else {
        console.log('No memory data. Start collector to begin collecting.');
      }
      break;
    }

    case 'help':
      console.log(`
📊 TelemetryCollector Commands

  collector status   - Show collector status
  collector start    - Start polling (every 60s)
  collector stop     - Stop polling
  collector poll     - Take one sample now
  collector history  - Show metrics history (7 days)
  collector history <days> - Show history for N days
  collector help     - Show this help
`);
      break;

    default:
      console.log(`Unknown action: ${action}`);
      console.log('Run "collector help" for usage');
  }
}
