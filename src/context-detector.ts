/**
 * Context Detector for 0xKobold
 *
 * Detects when TUI was started with --local and switches
 * working directory accordingly.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

interface ContextInfo {
  workingDir: string;
  isLocal: boolean;
  timestamp: number;
}

const CONTEXT_FILE = resolve(homedir(), ".0xkobold", ".active-context");
const CONTEXT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Check if there's an active --local TUI context
 */
export function detectLocalContext(): ContextInfo | null {
  try {
    if (!existsSync(CONTEXT_FILE)) {
      return null;
    }

    const context = JSON.parse(readFileSync(CONTEXT_FILE, "utf-8")) as ContextInfo;

    // Check if context is still fresh
    const age = Date.now() - context.timestamp;
    if (age > CONTEXT_TIMEOUT) {
      return null;
    }

    return context;
  } catch {
    return null;
  }
}

/**
 * Check if we should switch to the local context directory
 * Call this at startup to detect --local mode
 */
export function checkAndPromptForContext(): boolean {
  const context = detectLocalContext();

  if (!context || !context.isLocal) {
    return false;
  }

  // If already in that directory, nothing to do
  if (process.cwd() === context.workingDir) {
    return false;
  }

  console.log(`🐉 Detected active TUI context in: ${context.workingDir}`);
  console.log(`   Use --local flag or cd to that directory to work there.`);

  return true;
}

/**
 * Get the context working directory if available
 */
export function getContextDirectory(): string | null {
  const context = detectLocalContext();
  return context?.workingDir ?? null;
}

// Auto-check on import (for non-interactive detection)
if (import.meta.main) {
  checkAndPromptForContext();
}
