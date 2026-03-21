/**
 * Agent Body CLI Commands
 * 
 * Commands to interact with the body system:
 * - Check health
 * - View state
 * - Trigger proactive messages
 */

import { Command } from 'commander';
import { getAgentBody, resetAgentBody } from './init';

export function createBodyCommand(): Command {
  const cmd = new Command('body')
    .description('Agent body commands - sensing, health, and state');

  // Check health
  cmd
    .command('health')
    .description('Check agent body health')
    .action(async () => {
      console.log('🏥 Checking body health...\n');
      
      try {
        const body = getAgentBody();
        await body.initialize();
        
        const state = await body.getState();
        
        console.log('Status:', state.healthy ? '✅ Healthy' : '⚠️ Issues detected');
        
        if (state.issues.length > 0) {
          console.log('\nIssues:');
          for (const issue of state.issues) {
            console.log(`  - ${issue}`);
          }
        }
        
        if (state.body) {
          console.log('\nBody State:');
          console.log(`  CPU Temp: ${state.body.temperature ?? 'N/A'}°C`);
          console.log(`  Load: ${state.body.load ?? 'N/A'}`);
          console.log(`  Memory: ${state.body.memory?.percent ?? 'N/A'}%`);
          console.log(`  Uptime: ${state.body.uptime?.formatted ?? 'N/A'}`);
        }
        
        if (state.platform) {
          console.log('\nPlatform:');
          console.log(`  Type: ${state.platform.type}`);
          console.log(`  Model: ${state.platform.model || 'Unknown'}`);
        }
        
        console.log('\nSensors:', state.sensors.join(', ') || 'None');
        console.log('Actuators:', state.actuators.join(', ') || 'None');
        
        process.exit(state.healthy ? 0 : 1);
      } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
      }
    });

  // View state
  cmd
    .command('state')
    .description('View current body state')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      try {
        const body = getAgentBody();
        await body.initialize();
        
        const state = await body.getState();
        
        if (options.json) {
          console.log(JSON.stringify(state, null, 2));
        } else {
          console.log('📊 Agent Body State\n');
          console.log('Platform:', state.platform?.type || 'Unknown');
          console.log('Model:', state.platform?.model || 'Unknown');
          
          if (state.body) {
            console.log('\nSystem:');
            console.log(`  Temperature: ${state.body.temperature ?? 'N/A'}°C`);
            console.log(`  Load: ${state.body.load ?? 'N/A'}`);
            console.log(`  Memory: ${state.body.memory?.percent ?? 'N/A'}%`);
            console.log(`  Disk: ${state.body.disk?.percent ?? 'N/A'}%`);
          }
          
          if (state.environment) {
            console.log('\nEnvironment:');
            console.log(`  Time: ${state.environment.temporal.timeOfDay}`);
            console.log(`  Peers: ${state.environment.network.tailscale.length}`);
            console.log(`  Services: ${state.environment.services.filter(s => s.running).length}`);
          }
          
          console.log('\nHealth:', state.healthy ? '✅ OK' : '⚠️ Issues');
          if (state.issues.length > 0) {
            console.log('Issues:', state.issues.join(', '));
          }
        }
      } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
      }
    });

  // Feel state (interpret as mood)
  cmd
    .command('feel')
    .description('Interpret current state as mood')
    .action(async () => {
      try {
        const body = getAgentBody();
        await body.initialize();
        
        const state = await body.interpretState();
        
        console.log('🎭 Current Mood:', state.mood);
        if (state.message) {
          console.log('Message:', state.message);
        }
        console.log('Urgency:', state.urgency);
      } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
      }
    });

  // Scan environment
  cmd
    .command('scan')
    .description('Scan environment (network, services)')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      try {
        const body = getAgentBody();
        await body.initialize();
        
        const env = await body.scanEnvironment();
        
        if (options.json) {
          console.log(JSON.stringify(env, null, 2));
        } else {
          console.log('🌍 Environment Scan\n');
          
          console.log('Tailscale Peers:');
          for (const peer of env.network.tailscale) {
            console.log(`  ${peer.online ? '🟢' : '🔴'} ${peer.name} (${peer.ip})`);
          }
          
          console.log('\nServices:');
          for (const svc of env.services) {
            console.log(`  ${svc.running ? '✅' : '❌'} ${svc.name}${svc.port ? ` (port ${svc.port})` : ''}`);
          }
          
          console.log('\nTemporal:');
          console.log(`  Time: ${env.temporal.timeOfDay}`);
          console.log(`  Day: ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][env.temporal.dayOfWeek]}`);
          console.log(`  Workday: ${env.temporal.isWorkday ? 'Yes' : 'No'}`);
          console.log(`  Quiet hours: ${env.temporal.isQuietHours ? 'Yes' : 'No'}`);
        }
      } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
      }
    });

  // Sensors
  cmd
    .command('sensors')
    .description('List available sensors')
    .action(async () => {
      try {
        const body = getAgentBody();
        await body.initialize();
        
        const state = await body.getState();
        
        console.log('📡 Available Sensors\n');
        
        for (const name of state.sensors) {
          console.log(`  ✅ ${name}`);
        }
        
        console.log(`\nTotal: ${state.sensors.length} sensors`);
      } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
      }
    });

  // Platform info
  cmd
    .command('platform')
    .description('Show platform information')
    .action(async () => {
      try {
        const body = getAgentBody();
        await body.initialize();
        
        const platform = body.getPlatform();
        
        if (!platform) {
          console.log('❌ Platform not detected');
          process.exit(1);
        }
        
        console.log('🖥️ Platform Information\n');
        console.log('Type:', platform.type);
        console.log('Model:', platform.model || 'Unknown');
        console.log('Hostname:', platform.hostname);
        console.log('OS:', platform.os);
        console.log('Arch:', platform.arch);
        
        console.log('\nCapabilities:');
        const caps = Object.entries(platform.capabilities)
          .filter(([_, v]) => v)
          .map(([k]) => k);
        console.log('  ', caps.length > 0 ? caps.join(', ') : 'None');
        
        console.log('\nRecommended:');
        console.log('  Avatar:', platform.recommended.avatar);
        console.log('  Sensors:', platform.recommended.sensors.join(', '));
        console.log('  Actuators:', platform.recommended.actuators.join(', '));
      } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
      }
    });

  return cmd;
}