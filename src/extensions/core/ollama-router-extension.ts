import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Ollama Router Extension
 * 
 * Routes Ollama requests between local and cloud providers.
 * Shows status in footer via pi.setStatus().
 */

interface OllamaRouterState {
  mode: "local" | "cloud" | "auto";
  localAvailable: boolean;
  cloudAvailable: boolean;
}

const routerState: OllamaRouterState = {
  mode: "auto",
  localAvailable: true,
  cloudAvailable: false,
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

function getStatusIcon(): string {
  if (routerState.mode === "cloud") return "🌩️";
  if (routerState.mode === "local") return "🏠";
  return routerState.localAvailable ? "🏠" : "🌩️";
}

function getStatusText(): string {
  const icon = getStatusIcon();
  if (routerState.mode === "cloud") return `${icon} Cloud`;
  if (routerState.mode === "local") return `${icon} Local`;
  return `${icon} Auto`;
}

export default function ollamaRouterExtension(pi: ExtensionAPI) {
  console.log("[OllamaRouter] Extension loaded");

  pi.on("session_start", async (_event, ctx) => {
    routerState.localAvailable = await checkLocalOllama();
    console.log(`[OllamaRouter] Local: ${routerState.localAvailable ? "up" : "down"}`);
    
    // Set footer status
    ctx.ui.setStatus("ollama-mode", getStatusText());
  });

  pi.registerCommand("ollama-mode", {
    description: "Switch Ollama mode: local | cloud | auto",
    handler: async (args: string, ctx) => {
      const mode = args.trim().toLowerCase();
      
      if (!mode) {
        // Show detailed status
        const lines = [
          `🔄 Ollama Router Status`,
          `─────────────────────`,
          `Mode: ${routerState.mode}`,
          `Local: ${routerState.localAvailable ? "✅" : "❌"}`,
          ``,
          `Usage: /ollama-mode [local|cloud|auto]`,
        ];
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }
      
      if (mode === "local" || mode === "cloud" || mode === "auto") {
        routerState.mode = mode;
        ctx.ui.setStatus("ollama-mode", getStatusText());
        ctx.ui.notify(`✅ Switched to ${mode} mode`, "info");
      } else {
        ctx.ui.notify("❌ Invalid mode. Use: local, cloud, or auto", "error");
      }
    },
  });

  pi.registerCommand("ollama-local", {
    description: "Quick switch to local Ollama mode",
    handler: async (_args, ctx) => {
      routerState.mode = "local";
      ctx.ui.setStatus("ollama-mode", getStatusText());
      ctx.ui.notify(`✅ Switched to local mode`, "info");
    },
  });

  pi.registerCommand("ollama-cloud", {
    description: "Quick switch to cloud Ollama mode",
    handler: async (_args, ctx) => {
      routerState.mode = "cloud";
      ctx.ui.setStatus("ollama-mode", getStatusText());
      ctx.ui.notify(`✅ Switched to cloud mode`, "info");
    },
  });

  (globalThis as any).__ollamaRouterState = routerState;
  console.log("[OllamaRouter] Commands registered: /ollama-mode, /ollama-local, /ollama-cloud");
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
