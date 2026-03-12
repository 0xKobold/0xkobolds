/**
 * 🐉 Draconic Extension Loader
 * 
 * Unified wrapper for npm-based pi extensions
 * Provides:
 * - 📦 Auto-import from npm packages
 * - 🌉 Event bus bridging
 * - 📊 Tool/command registration tracking
 * - 🔄 Lifecycle management
 * - 📡 Discord notifications (optional)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
// @ts-ignore - Event bus import
import { eventBus } from "../event-bus/index";

interface ExtensionWrapperOptions {
  name: string;
  description?: string;
  npmPackage: string;
  bridgeEvents?: boolean;
  discordNotifications?: boolean;
  onLoad?: (pi: ExtensionAPI) => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
}

interface LoadedExtension {
  name: string;
  api: any;
  registeredAt: number;
}

const loadedExtensions = new Map<string, LoadedExtension>();

/**
 * Create a standardized extension wrapper
 * 
 * Usage:
 * ```
 * export default createExtensionWrapper({
 *   name: 'pi-ollama',
 *   npmPackage: '@0xkobold/pi-ollama',
 *   bridgeEvents: true,
 *   onLoad: (pi) => console.log('[🦙] Ollama ready'),
 * });
 * ```
 */
export function createExtensionWrapper(options: ExtensionWrapperOptions) {
  return async function register(pi: ExtensionAPI) {
    const { name, npmPackage, description, bridgeEvents, onLoad, onUnload } = options;
    
    console.log(`[🐉 DraconicLoader] Loading ${name} from ${npmPackage}...`);
    
    try {
      // Dynamic import from npm package
      const extModule = await import(npmPackage);
      const extDefault = extModule.default || extModule;
      
      // Bridge events if requested
      if (bridgeEvents && extModule.eventNames) {
        bridgeExtensionEvents(name, pi, extModule);
      }
      
      // Initialize the extension
      await extDefault(pi);
      
      // Track loaded extension
      loadedExtensions.set(name, {
        name,
        api: extModule,
        registeredAt: Date.now(),
      });
      
      console.log(`[🐉 DraconicLoader] ✅ ${name} loaded`);
      
      // Call optional onLoad hook
      if (onLoad) {
        await onLoad(pi);
      }
      
      // Emit loaded event
      eventBus.emit("extension.loaded", { 
        name, 
        package: npmPackage,
        description: description || name,
      });
      
    } catch (err) {
      console.error(`[🐉 DraconicLoader] ❌ Failed to load ${name}:`, err);
      eventBus.emit("extension.error", { name, error: String(err) });
    }
  };
}

/**
 * Bridge extension events to Draconic event bus
 */
function bridgeExtensionEvents(extName: string, pi: ExtensionAPI, extModule: any) {
  const originalEmit = extModule.emit || (() => {});
  
  extModule.emit = (event: string, data: any) => {
    // Forward to Draconic event bus
    eventBus.emit(`${extName}.${event}`, data);
    
    // Also emit to pi events
    pi.events.emit(`${extName}:${event}`, data);
    
    return originalEmit.call(extModule, event, data);
  };
}

/**
 * Get list of loaded extensions
 */
export function getLoadedExtensions(): LoadedExtension[] {
  return Array.from(loadedExtensions.values());
}

/**
 * Check if extension is loaded
 */
export function isExtensionLoaded(name: string): boolean {
  return loadedExtensions.has(name);
}

/**
 * Unload an extension
 */
export async function unloadExtension(name: string): Promise<void> {
  const ext = loadedExtensions.get(name);
  if (ext) {
    loadedExtensions.delete(name);
    eventBus.emit("extension.unloaded", { name });
  }
}

// ============================================================================
// PRE-BUILT WRAPPERS
// ============================================================================

/**
 * 🦙 Ollama Extension (auto-wrapped)
 */
export const loadOllama = () => createExtensionWrapper({
  name: 'pi-ollama',
  description: 'Ollama LLM integration',
  npmPackage: '@0xkobold/pi-ollama',
  bridgeEvents: true,
  onLoad: (pi) => {
    console.log('[🦙] Ollama connected and ready');
  },
});

/**
 * 🪙 Wallet Extension (auto-wrapped)
 */
export const loadWallet = () => createExtensionWrapper({
  name: 'pi-wallet',
  description: 'CDP + Ethers.js wallet',
  npmPackage: '@0xkobold/pi-wallet',
  bridgeEvents: true,
});

/**
 * 🔐 ERC-8004 Extension (auto-wrapped)
 */
export const loadERC8004 = () => createExtensionWrapper({
  name: 'pi-erc8004',
  description: 'ERC-8004 identity & reputation',
  npmPackage: '@0xkobold/pi-erc8004',
  bridgeEvents: true,
});

// Export for use in pi-config
export default {
  createExtensionWrapper,
  getLoadedExtensions,
  isExtensionLoaded,
  unloadExtension,
  loadOllama,
  loadWallet,
  loadERC8004,
};
