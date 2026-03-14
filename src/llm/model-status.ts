/**
 * Model Status State
 *
 * Shared state for tracking current model selection.
 * Used by router and footer extension.
 */

export interface ModelStatus {
  name: string;
  reason?: string;
  timestamp: number;
}

let currentModel: ModelStatus | null = null;

/**
 * Set the current model
 */
export function setCurrentModel(modelName: string, reason?: string): void {
  currentModel = {
    name: modelName,
    reason,
    timestamp: Date.now(),
  };
}

/**
 * Get the current model
 */
export function getCurrentModel(): ModelStatus | null {
  return currentModel;
}

/**
 * Clear the current model
 */
export function clearCurrentModel(): void {
  currentModel = null;
}
