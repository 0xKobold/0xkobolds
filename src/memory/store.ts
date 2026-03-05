/**
 * Memory Store
 *
 * Simple JSON-based persistence for conversation history.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Message } from '../llm/types';

const MEMORY_DIR = join(homedir(), '.0xkobold', 'memory');

export interface MemoryStore {
  load(sessionKey: string): Promise<Message[]>;
  save(sessionKey: string, messages: Message[]): Promise<void>;
  clear(sessionKey: string): Promise<void>;
}

/**
 * JSON file-based memory store
 */
export class JSONMemoryStore implements MemoryStore {
  private dir: string;

  constructor(dir = MEMORY_DIR) {
    this.dir = dir;
  }

  private getPath(sessionKey: string): string {
    // Sanitize session key for filename
    const safeKey = sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.dir, `${safeKey}.json`);
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.dir)) {
      await mkdir(this.dir, { recursive: true });
    }
  }

  async load(sessionKey: string): Promise<Message[]> {
    try {
      await this.ensureDir();
      const path = this.getPath(sessionKey);

      if (!existsSync(path)) {
        return [];
      }

      const data = await readFile(path, 'utf-8');
      const messages = JSON.parse(data);
      return Array.isArray(messages) ? messages : [];
    } catch (err) {
      console.error(`[Memory] Failed to load ${sessionKey}:`, err);
      return [];
    }
  }

  async save(sessionKey: string, messages: Message[]): Promise<void> {
    try {
      await this.ensureDir();
      const path = this.getPath(sessionKey);

      // Keep only last N messages to manage size
      const maxMessages = 100;
      const trimmed = messages.slice(-maxMessages);

      await writeFile(path, JSON.stringify(trimmed, null, 2));
    } catch (err) {
      console.error(`[Memory] Failed to save ${sessionKey}:`, err);
    }
  }

  async clear(sessionKey: string): Promise<void> {
    try {
      const path = this.getPath(sessionKey);
      if (existsSync(path)) {
        await writeFile(path, '[]');
      }
    } catch (err) {
      console.error(`[Memory] Failed to clear ${sessionKey}:`, err);
    }
  }
}

/**
 * In-memory store (non-persistent)
 */
export class InMemoryStore implements MemoryStore {
  private store = new Map<string, Message[]>();

  async load(sessionKey: string): Promise<Message[]> {
    return this.store.get(sessionKey) ?? [];
  }

  async save(sessionKey: string, messages: Message[]): Promise<void> {
    this.store.set(sessionKey, messages);
  }

  async clear(sessionKey: string): Promise<void> {
    this.store.delete(sessionKey);
  }
}

/**
 * Create default memory store
 */
export function createMemoryStore(persistent = true): MemoryStore {
  return persistent ? new JSONMemoryStore() : new InMemoryStore();
}
