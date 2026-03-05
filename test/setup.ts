/**
 * Test Setup
 * 
 * Shared test utilities and helpers
 */

import { beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const TEST_DIR = join(tmpdir(), "0xkobold-test-" + Date.now());

export async function setupTestEnvironment() {
  await mkdir(TEST_DIR, { recursive: true });
  process.env.KOBOLD_TEST_DIR = TEST_DIR;
  process.env.NODE_ENV = "test";
}

export async function teardownTestEnvironment() {
  await rm(TEST_DIR, { recursive: true, force: true });
}

export function createMockLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T> | T,
  options: { retries?: number; delay?: number } = {}
): Promise<T> {
  const { retries = 3, delay: delayMs = 100 } = options;
  let lastError: Error | undefined;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < retries - 1) {
        await delay(delayMs * (i + 1));
      }
    }
  }
  
  throw lastError;
}
