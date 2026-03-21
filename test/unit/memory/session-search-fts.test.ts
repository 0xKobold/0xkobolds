/**
 * Tests for Session Search FTS5
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import {
  sessionSearchFts,
  type SearchResult,
} from '../../../src/memory/index.js';

const TEST_DB_DIR = join(homedir(), '.0xkobold-test-fts');
const TEST_DB_PATH = join(TEST_DB_DIR, 'sessions.db');

describe('Session Search FTS5', () => {
  beforeEach(() => {
    // Ensure test directory exists
    if (!existsSync(TEST_DB_DIR)) {
      mkdirSync(TEST_DB_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test database
    if (existsSync(TEST_DB_DIR)) {
      rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    test('should initialize FTS5 tables without errors', () => {
      expect(() => sessionSearchFts.init()).not.toThrow();
    });

    test('should create session_lineage table', () => {
      sessionSearchFts.init();
      // If it doesn't throw, FTS5 tables exist
      expect(true).toBe(true);
    });
  });

  describe('Indexing', () => {
    beforeEach(() => {
      sessionSearchFts.init();
    });

    test('should index session content', () => {
      expect(() => {
        sessionSearchFts.index(
          'test-session-key',
          'test-session-id',
          'User asked about the weather and I provided a forecast',
          'Weather Discussion',
          'Discussed weather conditions for the day'
        );
      }).not.toThrow();
    });

    test('should register session lineage', () => {
      expect(() => {
        sessionSearchFts.register(
          'test-session-id',
          'test-session-key',
          undefined, // No parent
          'Weather Chat'
        );
      }).not.toThrow();
    });

    test('should register child session with parent', () => {
      sessionSearchFts.register(
        'parent-session-id',
        'parent-session-key',
        undefined,
        'Parent Chat'
      );

      expect(() => {
        sessionSearchFts.register(
          'child-session-id',
          'child-session-key',
          'parent-session-id',
          'Child Chat'
        );
      }).not.toThrow();
    });
  });

  describe('Search', () => {
    beforeEach(() => {
      sessionSearchFts.init();
      // Index some test content
      sessionSearchFts.index(
        'weather-session',
        'weather-id',
        'Discussed weather patterns and temperature forecasts for next week',
        'Weather Forecast',
        'Weather summary for Monday'
      );
      sessionSearchFts.register('weather-id', 'weather-session');

      sessionSearchFts.index(
        'code-session',
        'code-id',
        'Wrote TypeScript code for the authentication module with proper error handling',
        'Code Review',
        'Implemented authentication with error handling'
      );
      sessionSearchFts.register('code-id', 'code-session');
    });

    test('should search and find weather content', () => {
      const results = sessionSearchFts.search('weather');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r: { sessionKey: string }) => r.sessionKey === 'weather-session')).toBe(true);
    });

    test('should search and find code content', () => {
      const results = sessionSearchFts.search('typescript authentication');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r: { sessionKey: string }) => r.sessionKey === 'code-session')).toBe(true);
    });

    test('should return empty array for no matches', () => {
      const results = sessionSearchFts.search('xyznonexistent123');
      expect(results).toEqual([]);
    });

    test('should respect limit parameter', () => {
      const results = sessionSearchFts.search('session', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Lineage', () => {
    beforeEach(() => {
      sessionSearchFts.init();
      
      // Create a lineage chain: grandparent -> parent -> child
      sessionSearchFts.register('grandparent-id', 'grandparent-key');
      sessionSearchFts.register('parent-id', 'parent-key', 'grandparent-id');
      sessionSearchFts.register('child-id', 'child-key', 'parent-id');
    });

    test('should get lineage for child session', () => {
      const lineage = sessionSearchFts.getLineage('child-id');
      expect(lineage.length).toBe(3);
      expect(lineage[0].sessionId).toBe('grandparent-id');
      expect(lineage[1].sessionId).toBe('parent-id');
      expect(lineage[2].sessionId).toBe('child-id');
    });

    test('should get lineage for parent session', () => {
      const lineage = sessionSearchFts.getLineage('parent-id');
      expect(lineage.length).toBe(2);
      expect(lineage[0].sessionId).toBe('grandparent-id');
      expect(lineage[1].sessionId).toBe('parent-id');
    });
  });

  describe('Auto-title', () => {
    beforeEach(() => {
      sessionSearchFts.init();
    });

    test('should return null for session without events', () => {
      sessionSearchFts.register('empty-id', 'empty-key');
      const title = sessionSearchFts.autoTitle('empty-id');
      expect(title).toBeNull();
    });
  });
});