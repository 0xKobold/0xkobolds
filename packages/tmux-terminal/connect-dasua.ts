#!/usr/bin/env bun
/**
 * Dasua Tmux Node - Connects to Pi Gateway via Tailscale
 * 
 * Run on Dasua:
 *   bun run connect-dasua.ts
 * 
 * This connects to the gateway on the Pi (kobold-pi)
 */

import { TmuxNode } from './src/tmux-node.js';

// Pi's Tailscale IP
const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://100.65.167.97:7777';

console.log('🐉 Dasua Tmux Node');
console.log(`Gateway (Pi): ${GATEWAY_URL}`);
console.log('');

async function main() {
  const node = new TmuxNode({
    name: 'dasua-tmux-node',
    gatewayUrl: GATEWAY_URL,
  });

  // Handle events from gateway
  node.onEvent((event: string, data: unknown) => {
    console.log(`[${new Date().toISOString()}] Event: ${event}`);
    if (data) {
      console.log('Data:', JSON.stringify(data, null, 2));
    }
  });

  try {
    console.log('Connecting to Pi gateway...');
    await node.connect();
    console.log('✅ Connected!\n');
    console.log('Available commands:');
    console.log('  - tmux.list    - List sessions');
    console.log('  - tmux.create  - Create session');
    console.log('  - tmux.send    - Send commands');
    console.log('  - tmux.capture - Get output');
    console.log('  - tmux.kill    - Kill session');
    console.log('\nNode is ready. Pi gateway can now control this machine\'s tmux.');
    console.log('Press Ctrl+C to disconnect.\n');

    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('\nDisconnecting...');
      await node.disconnect();
      process.exit(0);
    });

    // Keep process alive
    setInterval(() => {}, 1000 * 60 * 60);

  } catch (error) {
    console.error('❌ Connection failed:', error);
    process.exit(1);
  }
}

main();