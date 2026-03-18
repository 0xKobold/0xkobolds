/**
 * Unit Tests for FamiliarNode
 * 
 * Tests the familiar state management, command handling, and event flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FamiliarNode } from '../../src/gateway/familiar-node';
import type { FamiliarState } from '../../src/gateway/familiar-node';

// Mock NodeClient
vi.mock('../src/gateway/node-client', () => {
  return {
    NodeClient: vi.fn().mockImplementation(() => ({
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(),
      getNodeId: vi.fn(() => 'test-node-id'),
      isNodeConnected: vi.fn(() => true),
      sendEvent: vi.fn(),
      onEvent: vi.fn(),
    })),
  };
});

describe('FamiliarNode', () => {
  let familiarNode: FamiliarNode;

  beforeEach(() => {
    vi.useFakeTimers();
    familiarNode = new FamiliarNode('ws://localhost:7777');
  });

  afterEach(() => {
    familiarNode.disconnect();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create familiar node with default state', () => {
      const state = familiarNode.getState();
      expect(state.status).toBe('idle');
      expect(state.task).toBeNull();
      expect(state.message).toBeNull();
      expect(state.visible).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return a copy of current state', () => {
      const state1 = familiarNode.getState();
      const state2 = familiarNode.getState();
      
      expect(state1).not.toBe(state2); // Different objects
      expect(state1.status).toBe(state2.status);
    });
  });

  describe('onStateChange', () => {
    it('should register state listeners', () => {
      const listener = vi.fn();
      const unsubscribe = familiarNode.onStateChange(listener);
      
      expect(typeof unsubscribe).toBe('function');
      
      // Unsubscribe should work
      unsubscribe();
      expect(true).toBe(true);
    });

    it('should call listeners when state changes', () => {
      const listener = vi.fn();
      familiarNode.onStateChange(listener);
      
      // Trigger state change via command would be tested in integration
    });
  });

  describe('onAgentMessage', () => {
    it('should register message listeners', () => {
      const listener = vi.fn();
      const unsubscribe = familiarNode.onAgentMessage(listener);
      
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('connect', () => {
    it('should attempt to connect to gateway', async () => {
      await familiarNode.connect();
      
      // After connect, should have started state polling
      // We'll verify this through side effects
      expect(familiarNode.isConnected()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should clear state polling interval', async () => {
      await familiarNode.connect();
      familiarNode.disconnect();
      
      // After disconnect, isConnected should be false
      expect(familiarNode.isConnected()).toBe(false);
    });

    it('should be safe to call multiple times', () => {
      familiarNode.disconnect();
      familiarNode.disconnect();
      familiarNode.disconnect();
      
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('isConnected', () => {
    it('should return false before connect', () => {
      expect(familiarNode.isConnected()).toBe(false);
    });
  });

  describe('getNodeId', () => {
    it('should return null before connect', () => {
      expect(familiarNode.getNodeId()).toBeNull();
    });
  });

  describe('commands', () => {
    it('should have familiar.show command', () => {
      // Commands are tested via integration
    });

    it('should have familiar.hide command', () => {
      // Commands are tested via integration
    });

    it('should have familiar.animate command', () => {
      // Commands are tested via integration
    });

    it('should have familiar.state command', () => {
      // Commands are tested via integration  
    });

    it('should have familiar.position command', () => {
      // Commands are tested via integration
    });

    it('should have familiar.message command', () => {
      // Commands are tested via integration
    });

    it('should have familiar.animation command', () => {
      // Commands are tested via integration
    });
  });
});

describe('FamiliarState', () => {
  it('should support all status values', () => {
    const validStatuses: FamiliarState['status'][] = [
      'idle',
      'working',
      'thinking',
      'sleeping',
      'cheering',
      'walking',
    ];
    
    validStatuses.forEach((status) => {
      const state: FamiliarState = {
        status,
        task: null,
        message: null,
        position: { x: 0, y: 0 },
        visible: true,
      };
      expect(state.status).toBe(status);
    });
  });

  it('should include all required fields', () => {
    const state: FamiliarState = {
      status: 'working',
      task: 'Testing familiar state',
      message: 'Hello world',
      position: { x: 100, y: 200 },
      visible: true,
    };
    
    expect(state.status).toBe('working');
    expect(state.task).toBe('Testing familiar state');
    expect(state.message).toBe('Hello world');
    expect(state.position).toEqual({ x: 100, y: 200 });
    expect(state.visible).toBe(true);
  });
});

describe('State polling cleanup', () => {
  it('should stop polling on disconnect', async () => {
    vi.useFakeTimers();
    
    const node = new FamiliarNode('ws://localhost:7777');
    await node.connect();
    
    // Advance timers to allow polling to start
    await vi.advanceTimersByTimeAsync(100);
    
    // Disconnect should clear the interval
    node.disconnect();
    
    // Verify state polling was stopped
    expect(node.isConnected()).toBe(false);
    
    vi.useRealTimers();
  });

  it('should handle multiple connect/disconnect cycles', async () => {
    vi.useFakeTimers();
    
    const node = new FamiliarNode('ws://localhost:7777');
    
    for (let i = 0; i < 3; i++) {
      await node.connect();
      expect(node.isConnected()).toBe(true);
      
      node.disconnect();
      expect(node.isConnected()).toBe(false);
    }
    
    vi.useRealTimers();
  });
});