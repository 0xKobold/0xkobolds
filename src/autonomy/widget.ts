/**
 * Autonomy TUI Widget - Shows current thought/desire in footer
 * 
 * Displays:
 * - Current desire type and strength
 * - Last thought type
 * - Monologue status (running/paused)
 */

import { eventBus } from "../event-bus/index.js";
import type { DesireType } from "./desires.js";
import type { MonologueType } from "./monologue.js";

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

interface AutonomyWidgetState {
  monologueRunning: boolean;
  lastThoughtType: MonologueType | null;
  lastThoughtTime: Date | null;
  topDesireType: DesireType | null;
  topDesireStrength: number;
  topDesireContent: string | null;
  activeDesires: number;
  recentActions: number;
}

// ════════════════════════════════════════════════════════════════════════════
// WIDGET STATE
// ════════════════════════════════════════════════════════════════════════════

let widgetState: AutonomyWidgetState = {
  monologueRunning: false,
  lastThoughtType: null,
  lastThoughtTime: null,
  topDesireType: null,
  topDesireStrength: 0,
  topDesireContent: null,
  activeDesires: 0,
  recentActions: 0,
};

let listeners: Array<() => void> = [];

// ════════════════════════════════════════════════════════════════════════════
// WIDGET API
// ════════════════════════════════════════════════════════════════════════════

/**
 * Initialize widget and subscribe to events
 */
export function initAutonomyWidget(): void {
  // Subscribe to monologue events
  eventBus.on("autonomy.monologue_started", () => {
    widgetState.monologueRunning = true;
    notifyListeners();
  });
  
  eventBus.on("autonomy.monologue_stopped", () => {
    widgetState.monologueRunning = false;
    notifyListeners();
  });
  
  eventBus.on("autonomy.thought", (event) => {
    const { type } = event.payload as any;
    widgetState.lastThoughtType = type;
    widgetState.lastThoughtTime = new Date();
    notifyListeners();
  });
  
  // Subscribe to desire events
  eventBus.on("autonomy.desire_spawned", (event) => {
    const { type, content, strength } = event.payload as any;
    if (strength > widgetState.topDesireStrength) {
      widgetState.topDesireType = type;
      widgetState.topDesireStrength = strength;
      widgetState.topDesireContent = content;
    }
    widgetState.activeDesires++;
    notifyListeners();
  });
  
  eventBus.on("autonomy.desire_pursued", (event) => {
    widgetState.activeDesires = Math.max(0, widgetState.activeDesires - 1);
    notifyListeners();
  });
  
  // Subscribe to action events
  eventBus.on("autonomy.action_executed", () => {
    widgetState.recentActions++;
    notifyListeners();
  });
  
  console.log("[AutonomyWidget] Initialized");
}

/**
 * Get current widget state
 */
export function getWidgetState(): AutonomyWidgetState {
  return { ...widgetState };
}

/**
 * Get footer component for TUI
 */
export function getAutonomyFooterWidget(): {
  left: string | null;
  center: string | null;
  right: string | null;
} {
  const state = widgetState;
  
  // Left: Monologue status
  const left = state.monologueRunning 
    ? "🧠 Thinking..." 
    : "⏸️ Paused";
  
  // Center: Current desire
  let center: string | null = null;
  if (state.topDesireType && state.topDesireStrength > 0.5) {
    const desireEmoji = getDesireEmoji(state.topDesireType);
    const strength = Math.round(state.topDesireStrength * 100);
    center = `${desireEmoji} ${state.topDesireType} (${strength}%)`;
  }
  
  // Right: Last thought type + time
  let right: string | null = null;
  if (state.lastThoughtType && state.lastThoughtTime) {
    const age = Math.floor((Date.now() - state.lastThoughtTime.getTime()) / 1000);
    const thoughtEmoji = getThoughtEmoji(state.lastThoughtType);
    right = `${thoughtEmoji} ${age}s ago`;
  }
  
  return { left, center, right };
}

/**
 * Format for TUI status bar
 */
export function formatAutonomyStatus(): string {
  const state = widgetState;
  const parts: string[] = [];
  
  // Monologue status
  parts.push(state.monologueRunning ? "🧠" : "⏸️");
  
  // Top desire
  if (state.topDesireType) {
    const emoji = getDesireEmoji(state.topDesireType);
    parts.push(`${emoji}${Math.round(state.topDesireStrength * 100)}`);
  }
  
  // Active desires count
  if (state.activeDesires > 0) {
    parts.push(`💭${state.activeDesires}`);
  }
  
  // Recent actions
  if (state.recentActions > 0) {
    parts.push(`⚡${state.recentActions}`);
  }
  
  return parts.join(" ");
}

/**
 * Subscribe to widget updates
 */
export function subscribeToAutonomyWidget(callback: () => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(l => l !== callback);
  };
}

// ════════════════════════════════════════════════════════════════════════════
// INTERNAL
// ════════════════════════════════════════════════════════════════════════════

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.error("[AutonomyWidget] Listener error:", err);
    }
  }
}

function getDesireEmoji(type: DesireType): string {
  const emojis: Record<DesireType, string> = {
    curiosity: "🔍",
    connection: "🤝",
    completion: "✅",
    growth: "📈",
    preservation: "🛡️",
    expression: "🎨",
    mastery: "🏆",
  };
  return emojis[type] || "💭";
}

function getThoughtEmoji(type: MonologueType): string {
  const emojis: Record<MonologueType, string> = {
    observation: "👁️",
    wondering: "🤔",
    reflection: "🪞",
    intention: "🎯",
    realization: "💡",
    concern: "⚠️",
    connection: "🔗",
    memory: "📜",
    desire: "❤️",
    growth: "🌱",
  };
  return emojis[type] || "💭";
}

/**
 * Update widget state from autonomy systems
 */
export function updateWidgetFromOrchestrator(
  monologueRunning: boolean,
  activeDesires: number,
  topDesireType: DesireType | null,
  topDesireStrength: number
): void {
  widgetState.monologueRunning = monologueRunning;
  widgetState.activeDesires = activeDesires;
  widgetState.topDesireType = topDesireType;
  widgetState.topDesireStrength = topDesireStrength;
  notifyListeners();
}

/**
 * Reset recent action counter
 */
export function resetRecentActions(): void {
  widgetState.recentActions = 0;
  notifyListeners();
}