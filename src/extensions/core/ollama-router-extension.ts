import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Ollama Router Extension
 * 
 * Routes Ollama requests between local and cloud providers.
 */

interface OllamaRouterState {
  mode: "local" | "cloud" | "auto";
  localAvailable: boolean;
}

const routerState: OllamaRouterState = {
  mode: "auto",
  localAvailable: true,
};

async function checkLocalOllama(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch("http://localhost:11434/api/version", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export default function ollamaRouterExtension(pi: ExtensionAPI) {
  console.log("[OllamaRouter] Extension loaded");

  pi.on("session_start", async () => {
    routerState.localAvailable = await checkLocalOllama();
    console.log(`[OllamaRouter] Local Ollama: ${routerState.localAvailable ? "up" : "down"}`);
  });

  pi.registerCommand("ollama-mode", {
    description: "Switch Ollama mode: local | cloud | auto",
    handler: async (args: string, ctx) => {
      const mode = args.trim().toLowerCase();
      if (!mode) {
        ctx.ui?.notify?.(`Current: ${routerState.mode}`, "info");
        return;
      }
      if (mode === "local" || mode === "cloud" || mode === "auto") {
        routerState.mode = mode;
        ctx.ui?.notify?.(`Switched to ${mode} mode`, "info");
      }
    },
  });

  (globalThis as any).__ollamaRouterState = routerState;
  console.log("[OllamaRouter] Commands registered");
}

export function getOllamaRouterState(): OllamaRouterState {
  return (globalThis as any).__ollamaRouterState || routerState;
}

export function shouldUseCloud(): boolean {
  const state = getOllamaRouterState();
  if (state.mode === "cloud") return true;
  if (state.mode === "local") return false;
  return !state.localAvailable;
}
