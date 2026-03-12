/**
 * �️ Pi Ollama - Community Extension Wrapper
 * 
 * Wraps @0xkobold/pi-ollama npm package using Draconic Extension Loader
 */

import { createExtensionWrapper } from '../core/draconic-extension-loader.js';

export default createExtensionWrapper({
  name: 'pi-ollama',
  description: 'Ollama LLM integration with accurate context detection',
  npmPackage: '@0xkobold/pi-ollama',
  bridgeEvents: true,
  discordNotifications: false, // Can enable for model updates
  onLoad: (pi) => {
    console.log('[🦙] Ollama models ready via npm package');
  },
  onUnload: () => {
    console.log('[🦙] Ollama extension unloaded');
  },
});
