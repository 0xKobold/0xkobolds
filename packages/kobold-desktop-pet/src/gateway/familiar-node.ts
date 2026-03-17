/**
 * Familiar Node - Gateway Integration
 *
 * Connects the desktop familiar to 0xKobold gateway as a "node",
 * making it an embodied interface for the agent.
 *
 * The familiar is a "body" for the agent - showing emotions,
 * responding to clicks, and displaying agent state.
 */

import { NodeClient, type CommandDefinition, type NodeEventHandler } from './node-client';
import type { BrowserWindow } from 'electron';

export interface FamiliarState {
  status: 'idle' | 'working' | 'thinking' | 'sleeping' | 'cheering' | 'walking';
  task: string | null;
  message: string | null;
  position: { x: number; y: number };
  visible: boolean;
}

export interface FamiliarEvent {
  type: 'click' | 'drag' | 'state_change' | 'animation_complete';
  data: Record<string, unknown>;
}

export type FamiliarStateListener = (state: FamiliarState) => void;
export type AgentMessageListener = (message: { status: string; task?: string; message?: string }) => void;

/**
 * Familiar Node Client
 *
 * Wraps NodeClient with familiar-specific functionality.
 */
export class FamiliarNode {
  private client: NodeClient;
  private window: BrowserWindow | null = null;
  private currentState: FamiliarState = {
    status: 'idle',
    task: null,
    message: null,
    position: { x: 0, y: 0 },
    visible: true,
  };
  private stateListeners: FamiliarStateListener[] = [];
  private messageListeners: AgentMessageListener[] = [];

  constructor(gatewayUrl: string = 'ws://localhost:7777') {
    this.client = new NodeClient({
      name: 'kobold-familiar',
      type: 'desktop-familiar',
      gatewayUrl,
      commands: this.getCommands(),
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
    });

    // Forward events from gateway
    this.client.onEvent((event, data) => {
      this.handleGatewayEvent(event, data);
    });
  }

  /**
   * Define the command surface exposed to the agent
   */
  private getCommands(): Record<string, CommandDefinition> {
    return {
      /**
       * Show the familiar window
       */
      'familiar.show': {
        description: 'Show the familiar window',
        handler: async () => {
          this.window?.show();
          this.currentState.visible = true;
          this.emitState();
          return { visible: true };
        },
      },

      /**
       * Hide the familiar window
       */
      'familiar.hide': {
        description: 'Hide the familiar window',
        handler: async () => {
          this.window?.hide();
          this.currentState.visible = false;
          this.emitState();
          return { visible: false };
        },
      },

      /**
       * Set familiar animation state
       */
      'familiar.animate': {
        description: 'Set the familiar animation state (idle, working, thinking, sleeping, cheering, walking)',
        params: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['idle', 'working', 'thinking', 'sleeping', 'cheering', 'walking'],
              description: 'Animation state',
            },
            task: {
              type: 'string',
              description: 'Current task description (shown in tooltip)',
            },
            message: {
              type: 'string',
              description: 'Brief message to display',
            },
          },
          required: ['status'],
        },
        handler: async (args) => {
          const params = args as { status?: string; task?: string; message?: string };
          const status = (params.status || 'idle') as FamiliarState['status'];

          this.currentState.status = status;
          if (params.task !== undefined) this.currentState.task = params.task || null;
          if (params.message !== undefined) this.currentState.message = params.message || null;

          // Send to renderer
          this.window?.webContents.send('agent-state', {
            status,
            task: this.currentState.task,
            message: this.currentState.message,
          });

          this.emitState();
          return { status, task: this.currentState.task };
        },
      },

      /**
       * Get current familiar state
       */
      'familiar.state': {
        description: 'Get the current familiar state',
        handler: async () => {
          return {
            ...this.currentState,
            nodeId: this.client.getNodeId(),
          };
        },
      },

      /**
       * Move familiar to position
       */
      'familiar.position': {
        description: 'Move the familiar to a screen position',
        params: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X position on screen' },
            y: { type: 'number', description: 'Y position on screen' },
          },
          required: ['x', 'y'],
        },
        handler: async (args) => {
          const params = args as { x: number; y: number };
          this.window?.setPosition(params.x, params.y);
          this.currentState.position = { x: params.x, y: params.y };
          this.emitState();
          return { position: this.currentState.position };
        },
      },

      /**
       * Display a message bubble
       */
      'familiar.message': {
        description: 'Display a message bubble from the familiar',
        params: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Message text to display' },
            duration: { type: 'number', description: 'Duration in ms (default: 3000)' },
          },
          required: ['text'],
        },
        handler: async (args) => {
          const params = args as { text: string; duration?: number };
          this.window?.webContents.send('familiar-message', {
            text: params.text,
            duration: params.duration || 3000,
          });
          return { displayed: true };
        },
      },

      /**
       * Execute a VRM animation
       */
      'familiar.animation': {
        description: 'Play a specific VRM animation',
        params: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Animation name (e.g., Walk, Wave, Idle, Thinking)',
            },
            loop: {
              type: 'boolean',
              description: 'Loop the animation (default: false)',
            },
          },
          required: ['name'],
        },
        handler: async (args) => {
          const params = args as { name: string; loop?: boolean };
          this.window?.webContents.send('play-animation', {
            name: params.name,
            loop: params.loop || false,
          });
          return { animation: params.name, playing: true };
        },
      },

      /**
       * Chat with the avatar - speak a message
       */
      'familiar.speak': {
        description: 'Make the familiar speak a message (shows bubble + animation)',
        params: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to speak' },
            emotion: {
              type: 'string',
              enum: ['happy', 'thinking', 'excited', 'worried', 'neutral'],
              description: 'Emotional expression',
            },
          },
          required: ['text'],
        },
        handler: async (args) => {
          const params = args as { text: string; emotion?: string };
          this.window?.webContents.send('familiar-speak', {
            text: params.text,
            emotion: params.emotion || 'neutral',
          });
          return { speaking: true };
        },
      },
    };
  }

  /**
   * Set the Electron window reference
   */
  setWindow(window: BrowserWindow): void {
    this.window = window;

    // Forward events from renderer to gateway
    window.webContents.on('ipc-message', (_event, channel, ...args) => {
      switch (channel) {
        case 'familiar-event':
          this.handleFamiliarEvent(args[0] as FamiliarEvent);
          break;
        case 'familiar-state':
          this.updateState(args[0] as Partial<FamiliarState>);
          break;
      }
    });
  }

  /**
   * Connect to the gateway
   */
  async connect(): Promise<void> {
    await this.client.connect();
    console.log('[FamiliarNode] Connected to 0xKobold gateway');

    // Start state polling
    this.startStatePolling();
  }

  /**
   * Disconnect from gateway
   */
  disconnect(): void {
    this.client.disconnect();
    console.log('[FamiliarNode] Disconnected from gateway');
  }

  /**
   * Handle event from familiar renderer (clicks, drags, etc.)
   */
  private handleFamiliarEvent(event: FamiliarEvent): void {
    // Send to gateway for agent to receive
    this.client.sendEvent(`familiar.${event.type}`, event.data);
  }

  /**
   * Handle event from gateway
   */
  private handleGatewayEvent(event: string, _data: unknown): void {
    // Handle specific gateway events if needed
    if (event === 'agent.state') {
      // Agent is reporting state, update display
      const data = _data as { status: string; task?: string };
      this.window?.webContents.send('agent-state', data);
    }
  }

  /**
   * Update familiar state
   */
  private updateState(state: Partial<FamiliarState>): void {
    this.currentState = { ...this.currentState, ...state };
    this.emitState();
  }

  /**
   * Notify listeners of state change
   */
  private emitState(): void {
    for (const listener of this.stateListeners) {
      try {
        listener(this.currentState);
      } catch (err) {
        console.error('[FamiliarNode] State listener error:', err);
      }
    }
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: FamiliarStateListener): () => void {
    this.stateListeners.push(listener);
    return () => {
      const index = this.stateListeners.indexOf(listener);
      if (index >= 0) this.stateListeners.splice(index, 1);
    };
  }

  /**
   * Subscribe to agent messages
   */
  onAgentMessage(listener: AgentMessageListener): () => void {
    this.messageListeners.push(listener);
    return () => {
      const index = this.messageListeners.indexOf(listener);
      if (index >= 0) this.messageListeners.splice(index, 1);
    };
  }

  /**
   * Poll agent state from gateway
   */
  private startStatePolling(): void {
    // Poll every 2 seconds for agent state
    // This could be replaced with WebSocket subscriptions
    setInterval(() => {
      if (this.client.isNodeConnected()) {
        // Could query agent state here
        // For now, we rely on agent pushing state via familiar.animate
      }
    }, 2000);
  }

  /**
   * Get current state
   */
  getState(): FamiliarState {
    return { ...this.currentState };
  }

  /**
   * Get node ID
   */
  getNodeId(): string | null {
    return this.client.getNodeId();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client.isNodeConnected();
  }
}

export default FamiliarNode;