/**
 * Telemetry System Tests
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { Telemetry } from './index';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';

const TEST_DB = '/tmp/test-telemetry-v2.db';

describe('Telemetry v2', () => {
  let telemetry: Telemetry;

  beforeEach(() => {
    // Clean up test database
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB);
    }
    telemetry = new Telemetry(TEST_DB);
  });

  // ===========================================================================
  // Core Methods
  // ===========================================================================

  test('record metric', () => {
    telemetry.record('test.metric', 42, 'ms');
    const stats = telemetry.getStats('test.metric', 1);
    expect(stats?.count).toBe(1);
    expect(stats?.sum).toBe(42);
  });

  test('increment counter', () => {
    telemetry.increment('test.counter');
    telemetry.increment('test.counter', 5);
    const stats = telemetry.getStats('test.counter', 1);
    expect(stats?.sum).toBe(6);
  });

  test('timing helper', () => {
    telemetry.timing('test.duration', 150);
    const stats = telemetry.getStats('test.duration', 1);
    expect(stats?.sum).toBe(150);
  });

  test('gauge recording', () => {
    telemetry.gauge('test.gauge', 42, 'items');
    const stats = telemetry.getStats('test.gauge', 1);
    expect(stats?.sum).toBe(42);
  });

  test('event recording', () => {
    telemetry.event('gateway', 'request', {
      duration_ms: 100,
      success: true,
      properties: { method: 'test' }
    });
    const summary = telemetry.getDashboardSummary(1);
    expect(summary.gateway.count).toBe(1);
  });

  test('enable/disable', () => {
    telemetry.setEnabled(false);
    telemetry.record('test', 42, '');
    expect(telemetry.getStats('test', 1)).toBeNull();

    telemetry.setEnabled(true);
    telemetry.record('test', 42, '');
    expect(telemetry.getStats('test', 1)?.count).toBe(1);
  });

  // ===========================================================================
  // Timer Helpers
  // ===========================================================================

  test('startTimer', async () => {
    const timer = telemetry.startTimer('test.timer');
    await new Promise(r => setTimeout(r, 10));
    timer.end({ success: true });
    const stats = telemetry.getStats('test.timer', 1);
    expect(stats?.count).toBe(1);
    expect(stats?.min).toBeGreaterThanOrEqual(10);
  });

  test('trackSync', () => {
    const result = telemetry.trackSync('test.sync', () => 42);
    expect(result).toBe(42);
    expect(telemetry.getStats('test.sync', 1)?.count).toBe(1);
  });

  test('trackAsync', async () => {
    const result = await telemetry.trackAsync('test.async', async () => {
      await new Promise(r => setTimeout(r, 5));
      return 'done';
    });
    expect(result).toBe('done');
    expect(telemetry.getStats('test.async', 1)?.count).toBe(1);
  });

  // ===========================================================================
  // Gateway Tracker
  // ===========================================================================

  test('gateway.request', () => {
    telemetry.gateway.request({
      latency_ms: 100,
      success: true,
      method: 'agent.create'
    });
    const stats = telemetry.getStats('gateway.request.latency', 1);
    expect(stats?.count).toBe(1);
    expect(stats?.avg).toBe(100);
  });

  test('gateway.connect/disconnect', () => {
    telemetry.gateway.connect({ client_type: 'web' });
    telemetry.gateway.disconnect({ client_type: 'web', reason: 'timeout' });
    const stats = telemetry.getStats('gateway.connections.total', 1);
    expect(stats?.sum).toBe(1);
  });

  test('gateway.rateLimit', () => {
    telemetry.gateway.rateLimit({ client_type: 'api', endpoint: '/agent' });
    const stats = telemetry.getStats('gateway.rate_limits.total', 1);
    expect(stats?.sum).toBe(1);
  });

  // ===========================================================================
  // LLM Tracker
  // ===========================================================================

  test('llm.request', () => {
    telemetry.llm.request({
      model: 'gpt-4',
      latency_ms: 500,
      tokens_used: 1500,
      success: true,
      provider: 'openai'
    });
    const stats = telemetry.getStats('llm.request.latency', 1);
    expect(stats?.count).toBe(1);
    expect(stats?.avg).toBe(500);
  });

  test('llm.tokens tracked', () => {
    telemetry.llm.request({
      model: 'claude-3',
      latency_ms: 300,
      tokens_used: 500,
      success: true
    });
    const stats = telemetry.getStats('llm.tokens.used', 1);
    expect(stats?.sum).toBe(500);
  });

  test('llm.fallback', () => {
    telemetry.llm.fallback({
      from_model: 'gpt-4',
      to_model: 'gpt-3.5',
      reason: 'rate_limit'
    });
    const stats = telemetry.getStats('llm.fallbacks.total', 1);
    expect(stats?.sum).toBe(1);
  });

  test('llm.retry', () => {
    telemetry.llm.retry({ model: 'claude-3', attempt: 2 });
    const stats = telemetry.getStats('llm.retries.total', 1);
    expect(stats?.sum).toBe(1);
  });

  // ===========================================================================
  // Session Tracker
  // ===========================================================================

  test('session.create', () => {
    telemetry.session.create({ session_id: 'sess-123', type: 'new' });
    const stats = telemetry.getStats('session.created.total', 1);
    expect(stats?.sum).toBe(1);
  });

  test('session.resume', () => {
    telemetry.session.resume({ session_id: 'sess-456', age_hours: 24 });
    const stats = telemetry.getStats('session.resumed.total', 1);
    expect(stats?.sum).toBe(1);
  });

  test('session.fork', () => {
    telemetry.session.fork({ parent_id: 'p-1', child_id: 'c-1' });
    const stats = telemetry.getStats('session.forked.total', 1);
    expect(stats?.sum).toBe(1);
  });

  test('session.abandon', () => {
    telemetry.session.abandon({ session_id: 'sess-789', reason: 'timeout' });
    const stats = telemetry.getStats('session.abandoned.total', 1);
    expect(stats?.sum).toBe(1);
  });

  // ===========================================================================
  // Skill Tracker
  // ===========================================================================

  test('skill.execute', () => {
    telemetry.skill.execute({
      name: 'moltbook',
      latency_ms: 2000,
      success: true
    });
    const stats = telemetry.getStats('skill.execution.latency', 1);
    expect(stats?.count).toBe(1);
  });

  test('skill.invoke', () => {
    telemetry.skill.invoke({ name: 'moltx' });
    const stats = telemetry.getStats('skill.invocations.total', 1);
    expect(stats?.sum).toBe(1);
  });

  // ===========================================================================
  // Agent Tracker
  // ===========================================================================

  test('agent.spawn', () => {
    telemetry.agent.spawn({ agent_id: 'agent-1', type: 'subagent' });
    const stats = telemetry.getStats('agent.spawned.total', 1);
    expect(stats?.sum).toBe(1);
  });

  test('agent.complete', () => {
    telemetry.agent.complete({
      agent_id: 'agent-1',
      duration_ms: 5000,
      success: true
    });
    const stats = telemetry.getStats('agent.completion.latency', 1);
    expect(stats?.count).toBe(1);
  });

  test('agent.timeout', () => {
    telemetry.agent.timeout({ agent_id: 'agent-2', max_duration_ms: 30000 });
    const stats = telemetry.getStats('agent.timeouts.total', 1);
    expect(stats?.sum).toBe(1);
  });

  test('agent.message', () => {
    telemetry.agent.message({ agent_id: 'agent-1', sent: 5, received: 3 });
    expect(telemetry.getStats('agent.messages.sent', 1)?.sum).toBe(5);
    expect(telemetry.getStats('agent.messages.received', 1)?.sum).toBe(3);
  });

  // ===========================================================================
  // Storage Tracker
  // ===========================================================================

  test('storage.read', () => {
    telemetry.storage.read({
      operation: 'memory_query',
      latency_ms: 15,
      records: 100
    });
    const stats = telemetry.getStats('storage.read.latency', 1);
    expect(stats?.count).toBe(1);
  });

  test('storage.write', () => {
    telemetry.storage.write({
      operation: 'memory_write',
      latency_ms: 25,
      records: 50
    });
    const stats = telemetry.getStats('storage.write.latency', 1);
    expect(stats?.count).toBe(1);
  });

  test('storage.query', () => {
    telemetry.storage.query({
      operation: 'agent_search',
      latency_ms: 100
    });
    const stats = telemetry.getStats('storage.query.latency', 1);
    expect(stats?.count).toBe(1);
  });

  // ===========================================================================
  // WebSocket Tracker
  // ===========================================================================

  test('websocket.connect/disconnect', () => {
    telemetry.websocket.connect({ url: 'wss://api.example.com' });
    telemetry.websocket.disconnect({ url: 'wss://api.example.com', reason: 'idle' });
    expect(telemetry.getStats('websocket.connections.total', 1)?.sum).toBe(1);
    expect(telemetry.getStats('websocket.disconnections.total', 1)?.sum).toBe(1);
  });

  test('websocket.reconnect', () => {
    telemetry.websocket.reconnect({ url: 'wss://api.example.com', attempt: 3 });
    expect(telemetry.getStats('websocket.reconnects.total', 1)?.sum).toBe(1);
  });

  test('websocket.latency', () => {
    telemetry.websocket.latency({ latency_ms: 50, url: 'wss://api.example.com' });
    const stats = telemetry.getStats('websocket.latency', 1);
    expect(stats?.avg).toBe(50);
  });

  // ===========================================================================
  // Channel Tracker
  // ===========================================================================

  test('channel.message', () => {
    telemetry.channel.message({
      platform: 'discord',
      direction: 'in',
      message_count: 10
    });
    const stats = telemetry.getStats('channel.messages.total', 1);
    expect(stats?.sum).toBe(10);
  });

  test('channel.command', () => {
    telemetry.channel.command({ platform: 'discord', command: '/status' });
    const stats = telemetry.getStats('channel.commands.total', 1);
    expect(stats?.sum).toBe(1);
  });

  test('channel.error', () => {
    telemetry.channel.error({ platform: 'telegram', error: 'rate_limit' });
    expect(telemetry.getStats('channel.errors.total', 1)?.sum).toBe(1);
  });

  // ===========================================================================
  // Cron Tracker
  // ===========================================================================

  test('cron.job', () => {
    telemetry.cron.job({
      name: 'health_check',
      latency_ms: 1500,
      success: true
    });
    const stats = telemetry.getStats('cron.job.latency', 1);
    expect(stats?.count).toBe(1);
  });

  test('cron.skipped', () => {
    telemetry.cron.skipped({ name: 'sync', reason: 'already_running' });
    expect(telemetry.getStats('cron.skipped.total', 1)?.sum).toBe(1);
  });

  // ===========================================================================
  // System Tracker
  // ===========================================================================

  test('system.memory', () => {
    telemetry.system.memory({ heap_used_mb: 100, heap_total_mb: 512 });
    expect(telemetry.getStats('system.memory.heap_used', 1)?.avg).toBe(100);
  });

  test('system.error', () => {
    telemetry.system.error({ error_type: 'ReferenceError', message: 'undefined' });
    expect(telemetry.getStats('system.errors.total', 1)?.sum).toBe(1);
  });

  // ===========================================================================
  // Dashboard Summary
  // ===========================================================================

  test('getDashboardSummary', () => {
    // Generate test data
    telemetry.gateway.request({ latency_ms: 100, success: true, method: 'test' });
    telemetry.llm.request({ model: 'gpt-4', latency_ms: 500, tokens_used: 1000, success: true });
    telemetry.skill.execute({ name: 'test', latency_ms: 200, success: true });
    telemetry.cron.job({ name: 'test', latency_ms: 100, success: true });
    telemetry.session.create({ session_id: 's-1', type: 'new' });
    telemetry.agent.spawn({ agent_id: 'a-1', type: 'test' });

    const summary = telemetry.getDashboardSummary(1);

    expect(summary.gateway.count).toBe(1);
    expect(summary.llm.count).toBe(1);
    expect(summary.skill.count).toBe(1);
    expect(summary.cron.count).toBe(1);
    expect(summary.session.created).toBe(1);
    expect(summary.agent.spawned).toBe(1);
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  test('cleanup', () => {
    telemetry.record('old.data', 1, '');
    const deleted = telemetry.cleanup(0);
    expect(deleted).toBeGreaterThanOrEqual(0);
  });
});
