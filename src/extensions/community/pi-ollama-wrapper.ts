/**
 * 🦙 Pi Ollama - Community Extension Wrapper
 * 
 * Wraps @0xkobold/pi-ollama npm package
 * 
 * Note: This extension is loaded via pi-config.ts
 * The npm package is loaded via `pi install npm:@0xkobold/pi-ollama`
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default async function register(pi: ExtensionAPI) {
  console.log("[🦙 PiOllama] Loading npm package...");
  
  try {
    // Dynamic import from npm package
    const ollamaMod = await import("@0xkobold/pi-ollama");
    const ollamaExt = ollamaMod.default || ollamaMod;
    
    // Initialize the extension
    await ollamaExt(pi);
    
    console.log("[🦙 PiOllama] npm package loaded successfully");
  } catch (err) {
    console.error("[🦙 PiOllama] Failed to load npm package:", err);
    throw err;
  }
}
