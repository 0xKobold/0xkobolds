/**
 * Model Scoring System Test Script
 *
 * Run with: bun test tests/model-scoring-test.ts
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';

// Import the modules to test
import { ModelScoringDB, getModelScoringDB, closeModelScoringDB } from '../src/llm/model-scoring-db';
import { ModelPopularityService, getModelPopularityService, closeModelPopularityService } from '../src/llm/model-popularity';

// Test database path
const TEST_DB = join(homedir(), '.0xkobold', 'test-scoring.db');
const TEST_POP_DB = join(homedir(), '.0xkobold', 'test-popularity.db');

describe('Model Scoring Database', () => {
  let db: ModelScoringDB;

  beforeAll(() => {
    // Use test database
    db = new ModelScoringDB(TEST_DB);
  });

  afterAll(() => {
    db.close();
    // Clean up test database
    const fs = require('fs');
    try {
      fs.unlinkSync(TEST_DB);
      fs.unlinkSync(TEST_DB + '-wal');
      fs.unlinkSync(TEST_DB + '-shm');
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('should record performance', () => {
    const id = db.recordPerformance({
      modelName: 'test-model',
      taskType: 'chat',
      complexity: 'medium',
      latencyMs: 1500,
      inputTokens: 100,
      outputTokens: 200,
      timestamp: Date.now(),
      success: true,
      userRating: 4,
    });

    expect(id).toBeDefined();
    expect(id).toMatch(/^perf-/);
  });

  test('should retrieve model score', () => {
    // Record some performance data
    db.recordPerformance({
      modelName: 'scored-model',
      taskType: 'code',
      complexity: 'high',
      latencyMs: 2000,
      inputTokens: 150,
      outputTokens: 300,
      timestamp: Date.now(),
      success: true,
    });

    const score = db.getModelScore('scored-model');
    expect(score).toBeDefined();
    expect(score?.modelName).toBe('scored-model');
    expect(score?.usageCount).toBeGreaterThan(0);
  });

  test('should add feedback', () => {
    const id = db.addFeedback('feedback-model', 5, 'code', 'Great response');
    expect(id).toBeDefined();
    expect(id).toMatch(/^fb-/);
  });

  test('should generate tier list', () => {
    // Add more performance data to generate a tier
    for (let i = 0; i < 5; i++) {
      db.recordPerformance({
        modelName: 'tier-model',
        taskType: 'chat',
        complexity: 'medium',
        latencyMs: 1000,
        inputTokens: 100,
        outputTokens: 100,
        timestamp: Date.now() + i,
        success: true,
        userRating: 5,
      });
    }

    const tiers = db.generateTierList('all');
    expect(tiers).toBeDefined();
    expect(Array.isArray(tiers)).toBe(true);
  });

  test('should get performance history', () => {
    const history = db.getPerformanceHistory(10);
    expect(Array.isArray(history)).toBe(true);
  });
});

describe('Model Popularity Service', () => {
  let pop: ModelPopularityService;

  beforeAll(() => {
    pop = new ModelPopularityService(TEST_POP_DB);
  });

  afterAll(() => {
    pop.close();
    const fs = require('fs');
    try {
      fs.unlinkSync(TEST_POP_DB);
      fs.unlinkSync(TEST_POP_DB + '-wal');
      fs.unlinkSync(TEST_POP_DB + '-shm');
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('should calculate popularity score', () => {
    const score = pop.calculatePopularityScore('unknown-model');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test('should increment local usage', () => {
    pop.incrementLocalUsage('test-model');
    const popularity = pop.getPopularity('test-model');

    expect(popularity).toBeDefined();
    expect(popularity?.localUsageCount).toBe(1);
  });

  test('should get most used locally', () => {
    // Add some usage
    for (let i = 0; i < 3; i++) {
      pop.incrementLocalUsage('popular-model');
    }

    const mostUsed = pop.getMostUsedLocally(5);
    expect(Array.isArray(mostUsed)).toBe(true);
    expect(mostUsed.length).toBeGreaterThan(0);
    expect(mostUsed[0].localUsageCount).toBeGreaterThanOrEqual(3);
  });

  test('should create Nostr report event', () => {
    const event = require('../src/llm/model-popularity').createModelReportEvent(
      'test-model',
      4,
      'code',
      1500,
      true
    );

    expect(event).toBeDefined();
    expect((event as any).kind).toBe(31234);
    expect((event as any).content).toContain('test-model');
  });
});

describe('Integration: Scoring + Popularity', () => {
  test('should combine for routing decisions', () => {
    const scoringDb = new ModelScoringDB(join(homedir(), '.0xkobold', 'test-int.db'));
    const pop = new ModelPopularityService(join(homedir(), '.0xkobold', 'test-pop.db'));

    // Record performance
    scoringDb.recordPerformance({
      modelName: 'integrated-model',
      taskType: 'chat',
      complexity: 'medium',
      latencyMs: 1000,
      inputTokens: 100,
      outputTokens: 100,
      timestamp: Date.now(),
      success: true,
      userRating: 5,
    });

    // Add feedback
    scoringDb.addFeedback('integrated-model', 5, 'chat');

    // Get score
    const score = scoringDb.getModelScore('integrated-model');
    expect(score).toBeDefined();

    // Calculate popularity
    const popScore = pop.calculatePopularityScore('integrated-model');
    expect(popScore).toBeGreaterThanOrEqual(0);

    // Cleanup
    scoringDb.close();
    pop.close();
  });
});

// Privacy & Security Tests
describe('Privacy Checks', () => {
  test('should NOT store prompts or responses', () => {
    const db = new ModelScoringDB(join(homedir(), '.0xkobold', 'test-privacy.db'));

    db.recordPerformance({
      modelName: 'privacy-test',
      taskType: 'chat',
      complexity: 'medium',
      latencyMs: 1000,
      inputTokens: 100,
      outputTokens: 100,
      timestamp: Date.now(),
      success: true,
      // Note: NO prompt or response fields!
    });

    // Verify schema doesn't have prompt/response columns
    const schema = db.exportData();
    const history = (schema as any).history as any[];

    // Check that no prompt/response data exists
    for (const record of history) {
      expect(record.prompt).toBeUndefined();
      expect(record.response).toBeUndefined();
      expect(record.content).toBeUndefined();
    }

    db.close();
  });

  test('should only store anonymized metrics', () => {
    const db = new ModelScoringDB(join(homedir(), '.0xkobold', 'test-anon.db'));

    db.recordPerformance({
      modelName: 'anon-test',
      taskType: 'code',
      complexity: 'high',
      latencyMs: 2000,
      inputTokens: 50,
      outputTokens: 150,
      timestamp: Date.now(),
      success: true,
      sessionId: 'session-123', // Anonymous session ID
    });

    const history = db.getPerformanceHistory(1);
    expect(history[0].modelName).toBe('anon-test');
    expect(history[0].sessionId).toBe('session-123');
    // No PII stored
    expect((history[0] as any).userId).toBeUndefined();
    expect((history[0] as any).ipAddress).toBeUndefined();

    db.close();
  });
});

console.log('✅ Model Scoring Test Suite Loaded');
console.log('Run with: bun test tests/model-scoring-test.ts');