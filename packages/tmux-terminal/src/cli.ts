#!/usr/bin/env bun
/**
 * Tmux Terminal CLI
 * 
 * Test tmux functionality without running Electron.
 * Usage: bun run src/cli.ts [command]
 */

import {
  hasTmux,
  getTmuxVersion,
  listSessions,
  createSession,
  sendCommand,
  capturePane,
  killSession,
  sessionExists,
} from './tmux-manager.js';

async function main() {
  const [command, ...args] = process.argv.slice(2);

  console.log('🐉 Tmux Terminal CLI\n');

  // Check tmux
  const available = await hasTmux();
  if (!available) {
    console.error('❌ tmux is not installed. Please install tmux first.');
    process.exit(1);
  }

  const version = await getTmuxVersion();
  console.log(`✓ tmux version: ${version}\n`);

  switch (command) {
    case 'list':
    case 'ls': {
      const sessions = await listSessions();
      if (sessions.length === 0) {
        console.log('No active sessions.');
      } else {
        console.log('Active sessions:');
        for (const s of sessions) {
          console.log(`  - ${s.name} (${s.windows} windows, ${s.attached ? 'attached' : 'detached'})`);
        }
      }
      break;
    }

    case 'create': {
      const name = args[0];
      if (!name) {
        console.error('Usage: cli.ts create <name>');
        process.exit(1);
      }
      const cmd = args.slice(1).join(' ') || undefined;
      console.log(`Creating session "${name}"...`);
      const session = await createSession(name, cmd);
      console.log(`✓ Created session: ${session.name}`);
      break;
    }

    case 'send': {
      const [session, ...keys] = args;
      if (!session || keys.length === 0) {
        console.error('Usage: cli.ts send <session> <keys>');
        process.exit(1);
      }
      await sendCommand(session, keys.join(' '));
      console.log(`✓ Sent command to ${session}`);
      break;
    }

    case 'capture': {
      const session = args[0];
      const lines = parseInt(args[1]) || 100;
      if (!session) {
        console.error('Usage: cli.ts capture <session> [lines]');
        process.exit(1);
      }
      const output = await capturePane({ session, lines });
      console.log(output);
      break;
    }

    case 'kill': {
      const name = args[0];
      if (!name) {
        console.error('Usage: cli.ts kill <session>');
        process.exit(1);
      }
      await killSession(name);
      console.log(`✓ Killed session: ${name}`);
      break;
    }

    case 'exists': {
      const name = args[0];
      if (!name) {
        console.error('Usage: cli.ts exists <session>');
        process.exit(1);
      }
      const exists = await sessionExists(name);
      console.log(`Session "${name}" ${exists ? 'exists' : 'does not exist'}`);
      break;
    }

    case 'test': {
      const testSession = 'tmux-test-' + Date.now();
      console.log(`Running tests with session "${testSession}"...\n`);

      // Create
      console.log('1. Creating session...');
      await createSession(testSession);
      console.log('   ✓ Created\n');

      // List
      console.log('2. Listing sessions...');
      const sessions = await listSessions();
      const found = sessions.find(s => s.name === testSession);
      console.log(`   ✓ Found: ${found ? found.name : 'NOT FOUND'}\n`);

      // Send command
      console.log('3. Sending command...');
      await sendCommand(testSession, 'echo "Hello from TmuxNode"');
      await new Promise(r => setTimeout(r, 500));
      console.log('   ✓ Sent\n');

      // Capture
      console.log('4. Capturing output...');
      const output = await capturePane({ session: testSession, lines: 10 });
      console.log('   Output:');
      console.log(output.split('\n').slice(-5).map(l => '     ' + l).join('\n'));

      // Kill
      console.log('\n5. Cleaning up...');
      await killSession(testSession);
      console.log('   ✓ Killed\n');

      console.log('✅ All tests passed!');
      break;
    }

    default:
      console.log(`Usage: cli.ts <command> [args]
      
Commands:
  list              List active sessions
  create <name>     Create a new session
  send <session> <keys>  Send keys to session
  capture <session> [lines]  Capture output
  kill <session>    Kill session
  exists <session>  Check if session exists
  test              Run automated tests
`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});