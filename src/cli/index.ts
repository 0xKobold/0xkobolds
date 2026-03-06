#!/usr/bin/env bun
/**
 * 0xKobold CLI Entry Point
 * 
 * Unified command-line interface for 0xKobold multi-agent platform.
 * Replaces scattered TUI commands with structured CLI.
 */

import { createCli } from './program.js';

async function main(): Promise<void> {
  const program = createCli();
  
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error('CLI Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main();
}

export { main };
