/**
 * Preload script for Electron
 * 
 * Exposes IPC methods to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';

export interface TmuxSession {
  name: string;
  id: string;
  windows: number;
  created: Date;
  attached: boolean;
  path: string;
}

export interface TmuxEvent {
  event: string;
  data: unknown;
}

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('tmuxAPI', {
  // Session management
  listSessions: (): Promise<{ success: boolean; sessions?: TmuxSession[]; error?: string }> => 
    ipcRenderer.invoke('tmux:list'),

  createSession: (name: string, command?: string): Promise<{ success: boolean; session?: TmuxSession; error?: string }> =>
    ipcRenderer.invoke('tmux:create', name, command),

  killSession: (name: string): Promise<{ success: boolean; error?: string }> =>
   ipcRenderer.invoke('tmux:kill', name),

  getAttachCommand: (name: string): Promise<{ command: string }> =>
    ipcRenderer.invoke('tmux:attach-command', name),

  // Connection
  isConnected: (): Promise<boolean> =>
    ipcRenderer.invoke('tmux:connected'),

  reconnect: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('tmux:reconnect'),

  // Event listeners
  onSessionsUpdate: (callback: (sessions: TmuxSession[]) => void) => {
    const handler = (_: unknown, sessions: TmuxSession[]) => callback(sessions);
    ipcRenderer.on('tmux:sessions', handler);
    return () => ipcRenderer.removeListener('tmux:sessions', handler);
  },

  onSessionCreated: (callback: (session: TmuxSession) => void) => {
    const handler = (_: unknown, session: TmuxSession) => callback(session);
    ipcRenderer.on('tmux:session-created', handler);
    return () => ipcRenderer.removeListener('tmux:session-created', handler);
  },

  onSessionKilled: (callback: (name: string) => void) => {
    const handler = (_: unknown, name: string) => callback(name);
    ipcRenderer.on('tmux:session-killed', handler);
    return () => ipcRenderer.removeListener('tmux:session-killed', handler);
  },

  onEvent: (callback: (event: TmuxEvent) => void) => {
    const handler = (_: unknown, event: TmuxEvent) => callback(event);
    ipcRenderer.on('tmux:event', handler);
    return () => ipcRenderer.removeListener('tmux:event', handler);
  },

  onError: (callback: (error: { message: string }) => void) => {
    const handler = (_: unknown, error: { message: string }) => callback(error);
    ipcRenderer.on('tmux:error', handler);
    return () => ipcRenderer.removeListener('tmux:error', handler);
  },
});

// TypeScript declaration for renderer
declare global {
  interface Window {
    tmuxAPI: {
      listSessions: () => Promise<{ success: boolean; sessions?: TmuxSession[]; error?: string }>;
      createSession: (name: string, command?: string) => Promise<{ success: boolean; session?: TmuxSession; error?: string }>;
      killSession: (name: string) => Promise<{ success: boolean; error?: string }>;
      getAttachCommand: (name: string) => Promise<{ command: string }>;
      isConnected: () => Promise<boolean>;
      reconnect: () => Promise<{ success: boolean; error?: string }>;
      onSessionsUpdate: (callback: (sessions: TmuxSession[]) => void) => () => void;
      onSessionCreated: (callback: (session: TmuxSession) => void) => () => void;
      onSessionKilled: (callback: (name: string) => void) => () => void;
      onEvent: (callback: (event: TmuxEvent) => void) => () => void;
      onError: (callback: (error: { message: string }) => void) => () => void;
    };
  }
}