#!/usr/bin/env bun
/**
 * 0xKobold Gateway Daemon
 * Entry point - delegates to src/gateway/gateway-server.ts
 */

import { startGateway, stopGateway } from '../src/gateway/gateway-server';

const PORT = parseInt(process.env.KOBOLD_PORT || '7777');

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[daemon] SIGTERM, shutting down...');
  stopGateway();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[daemon] SIGINT, shutting down...');
  stopGateway();
  process.exit(0);
});

// Start
console.log(`[daemon] Starting on port ${PORT}...`);
startGateway({ port: PORT });

// Keep alive
await new Promise(() => {});
