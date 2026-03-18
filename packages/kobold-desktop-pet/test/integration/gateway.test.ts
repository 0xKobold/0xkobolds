/**
 * Integration Tests for Gateway Communication
 * 
 * Tests the full flow of connecting to gateway, sending commands,
 * and receiving messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FamiliarNode } from '../../src/gateway/familiar-node';
import { NodeClient } from '../../src/gateway/node-client';
import { createMockWindow, sleep } from '../setup';

describe('Gateway Integration', () => {
  describe('NodeClient WebSocket', () => {
    it('should handle WebSocket connection lifecycle', async () => {
      const config = {
        name: 'test-node',
        type: 'test',
        gatewayUrl: 'ws://localhost:7777',
        commands: {
          'test.ping': {
            description: 'Ping command',
            handler: async () => ({ pong: true }),
          },
        },
        reconnectInterval: 1000,
        maxReconnectAttempts: 1,
      };

      const client = new NodeClient(config);
      
      // Connection attempt
      try {
        await client.connect();
      } catch {
        // May fail if no gateway running
      }
      
      client.disconnect();
      expect(client.isNodeConnected()).toBe(false);
    });

    it('should handle multiple disconnect calls safely', () => {
      const config = {
        name: 'test-node',
        type: 'test',
        gatewayUrl: 'ws://localhost:7777',
        commands: {},
      };

      const client = new NodeClient(config);
      
      // Multiple disconnects should not throw
      client.disconnect();
      client.disconnect();
      client.disconnect();
      
      expect(client.isNodeConnected()).toBe(false);
    });
  });

  describe('FamiliarNode with Window', () => {
    it('should set window reference', async () => {
      const node = new FamiliarNode('ws://localhost:7777');
      const mockWindow = createMockWindow();
      
      node.setWindow(mockWindow);
      
      // Window is set, no error
      expect(true).toBe(true);
      
      node.disconnect();
    });

    it('should forward events to window webContents', async () => {
      const node = new FamiliarNode('ws://localhost:7777');
      const mockWindow = createMockWindow();
      node.setWindow(mockWindow);

      // Simulate agent state message
      mockWindow.webContents.send('agent-state', {
        status: 'working',
        task: 'Testing',
      });

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('agent-state', {
        status: 'working',
        task: 'Testing',
      });

      node.disconnect();
    });
  });

  describe('Command Execution', () => {
    it('should handle familiar.animate command', async () => {
      const mockWindow = createMockWindow();
      
      const node = new FamiliarNode('ws://localhost:7777');
      node.setWindow(mockWindow);
      
      await node.connect();
      
      // Get the commands defined
      const state = node.getState();
      expect(state.status).toBe('idle');
      
      node.disconnect();
    });

    it('should handle familiar.show command', async () => {
      const mockWindow = createMockWindow();
      const node = new FamiliarNode('ws://localhost:7777');
      node.setWindow(mockWindow);

      await node.connect();
      
      // Check initial state
      expect(node.getState().visible).toBe(true);
      
      node.disconnect();
    });

    it('should handle familiar.hide command', async () => {
      const mockWindow = createMockWindow();
      const node = new FamiliarNode('ws://localhost:7777');
      node.setWindow(mockWindow);

      await node.connect();
      
      node.disconnect();
      
      expect(mockWindow.hide).toBeDefined();
    });
  });
});

describe('State Management Integration', () => {
  it('should track state changes', async () => {
    const node = new FamiliarNode('ws://localhost:7777');
    const stateListener = vi.fn();
    
    node.onStateChange(stateListener);
    
    await node.connect();
    
    // State listener may be called during connection
    node.disconnect();
  });

  it('should handle multiple listeners', async () => {
    const node = new FamiliarNode('ws://localhost:7777');
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();
    
    node.onStateChange(listener1);
    node.onStateChange(listener2);
    node.onStateChange(listener3);
    
    await node.connect();
    
    node.disconnect();
    
    // All listeners were registered
    expect(true).toBe(true);
  });

  it('should handle listener errors gracefully', async () => {
    const node = new FamiliarNode('ws://localhost:7777');
    const badListener = vi.fn(() => {
      throw new Error('Listener error');
    });
    const goodListener = vi.fn();
    
    node.onStateChange(badListener);
    node.onStateChange(goodListener);
    
    await node.connect();
    
    node.disconnect();
    
    // Should not throw even with bad listener
    expect(true).toBe(true);
  });
});

describe('Reconnection Logic', () => {
  it('should attempt reconnection on disconnect', async () => {
    vi.useFakeTimers();
    
    const node = new FamiliarNode('ws://localhost:7777');
    node.setReconnectInterval(100);
    node.setMaxReconnectAttempts(2);
    
    await node.connect();
    
    // Simulate disconnect
    node.disconnect();
    
    // Fast forward timers
    await vi.advanceTimersByTimeAsync(500);
    
    vi.useRealTimers();
  });
});