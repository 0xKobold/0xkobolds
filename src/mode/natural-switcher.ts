/**
 * Mode Natural Switcher - v0.2.0
 * 
 * Seamless automatic mode switching without explicit commands.
 * Part of Phase 2.3: Mode System Enhancement
 */

import {
  ModeType,
  ModeDetectionResult,
  detectModeFromPrompt,
  shouldAutoSwitch,
  shouldSuggestSwitch,
  getModeRecommendationText,
} from './auto-detector.js';

export interface ModeSwitch {
  from: ModeType;
  to: ModeType;
  reason: string;
  auto: boolean; // true = auto-switch, false = suggest only
}

export interface NaturalModeSwitcher {
  currentMode: ModeType;
  autonomous: boolean;
  
  getCurrentMode(): ModeType;
  setMode(mode: ModeType, reason?: string): void;
  setAutonomous(enabled: boolean): void;
  processPrompt(prompt: string): ModeSwitch | null;
  acceptSuggestion(): void;
  rejectSuggestion(): void;
  getPendingSuggestion(): ModeSwitch | null;
}

class NaturalModeSwitcherImpl implements NaturalModeSwitcher {
  private _currentMode: ModeType = 'plan';
  private _autonomous = false;
  private _pendingSuggestion: ModeSwitch | null = null;
  private _lastDetection: ModeDetectionResult | null = null;

  get currentMode(): ModeType {
    return this._currentMode;
  }

  get autonomous(): boolean {
    return this._autonomous;
  }

  getCurrentMode(): ModeType {
    return this._currentMode;
  }

  setMode(mode: ModeType, reason?: string): void {
    if (mode === this._currentMode) return;

    const oldMode = this._currentMode;
    this._currentMode = mode;
    this._pendingSuggestion = null; // Clear any pending suggestion

    console.log(
      `[Mode] Switched from ${oldMode.toUpperCase()} to ${mode.toUpperCase()}: ${
        reason || 'Manual switch'
      }`
    );
  }

  setAutonomous(enabled: boolean): void {
    this._autonomous = enabled;
    console.log(`[Mode] Autonomous mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  processPrompt(prompt: string): ModeSwitch | null {
    this._lastDetection = detectModeFromPrompt(prompt, this._currentMode);

    // Same mode - no switch needed
    if (this._lastDetection.recommendedMode === this._currentMode) {
      return null;
    }

    // Check if we should auto-switch (high confidence + autonomous)
    if (this._autonomous && shouldAutoSwitch(this._lastDetection)) {
      const switch_: ModeSwitch = {
        from: this._currentMode,
        to: this._lastDetection.recommendedMode,
        reason: this._lastDetection.reasoning,
        auto: true,
      };

      this.setMode(switch_.to, switch_.reason);
      return switch_;
    }

    // Check if we should suggest (medium confidence)
    if (shouldSuggestSwitch(this._lastDetection)) {
      const switch_: ModeSwitch = {
        from: this._currentMode,
        to: this._lastDetection.recommendedMode,
        reason: this._lastDetection.reasoning,
        auto: false,
      };

      this._pendingSuggestion = switch_;
      console.log(`[Mode] Suggestion: ${getModeRecommendationText(this._lastDetection)}`);
      return switch_;
    }

    return null;
  }

  acceptSuggestion(): void {
    if (this._pendingSuggestion) {
      this.setMode(this._pendingSuggestion.to, this._pendingSuggestion.reason);
    }
  }

  rejectSuggestion(): void {
    if (this._pendingSuggestion) {
      console.log(
        `[Mode] Suggestion rejected. Staying in ${this._currentMode.toUpperCase()} mode.`
      );
      this._pendingSuggestion = null;
    }
  }

  getPendingSuggestion(): ModeSwitch | null {
    return this._pendingSuggestion;
  }
}

// Singleton instance
let switcherInstance: NaturalModeSwitcher | null = null;

/**
 * Get or create mode switcher
 */
export function getModeSwitcher(): NaturalModeSwitcher {
  if (!switcherInstance) {
    switcherInstance = new NaturalModeSwitcherImpl();
  }
  return switcherInstance;
}

/**
 * Reset mode switcher
 */
export function resetModeSwitcher(): void {
  switcherInstance = null;
}

/**
 * Quick mode switch
 */
export function switchMode(mode: ModeType, reason?: string): void {
  const switcher = getModeSwitcher();
  switcher.setMode(mode, reason);
}

/**
 * Enable/disable autonomous mode
 */
export function setAutonomousMode(enabled: boolean): void {
  const switcher = getModeSwitcher();
  switcher.setAutonomous(enabled);
}

/**
 * Get current mode info
 */
export function getCurrentModeInfo(): {
  mode: ModeType;
  autonomous: boolean;
  pendingSuggestion: ModeSwitch | null;
} {
  const switcher = getModeSwitcher();
  return {
    mode: switcher.currentMode,
    autonomous: switcher.autonomous,
    pendingSuggestion: switcher.getPendingSuggestion(),
  };
}

export default getModeSwitcher;
