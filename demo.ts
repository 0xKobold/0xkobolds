#!/usr/bin/env bun
/**
 * 0xKobold Demo
 * 
 * Simple demo showing the TUI chat interface
 */

import { startChatUI } from "./tui/index";

console.log("Starting 0xKobold Demo...");
console.log("Press Enter to start the chat interface");
console.log("(Daemon does not need to be running for demo)");

process.stdin.once("data", async () => {
  try {
    await startChatUI();
  } catch (error) {
    console.error("Demo failed:", error);
    process.exit(1);
  }
});
