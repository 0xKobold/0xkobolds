/**
 * Routed Ollama Extension
 * 
 * Unified integration point for adaptive model routing.
 * Uses native pi-coding-agent APIs for model switching.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getRouter, handleRouterCommand, handleModelsCommand, handleRateCommand, setCurrentModel } from "../../llm";

export default async function routedOllamaExtension(pi: ExtensionAPI) {
  console.log("[RoutedOllama] Extension loading...");

  // Track if adaptive routing is enabled
  let adaptiveRoutingEnabled = true;
  let lastRoutedModel: string | null = null;

  try {
    // Initialize router
    const router = await getRouter();
    console.log("[RoutedOllama] Router initialized with", (await router.listModels()).length, "models");

    /**
     * Switch to the best model for the given task
     * Uses native pi.setModel() API via ExtensionContext
     */
    async function routeToBestModel(userMessage: string, ctx: ExtensionContext): Promise<string | null> {
      if (!adaptiveRoutingEnabled) {
        console.log("[RoutedOllama] Adaptive routing disabled, skipping");
        return null;
      }

      // Select best model using our router
      const selectedModel = await router.selectModel(userMessage);
      
      // Avoid redundant switches
      if (selectedModel === lastRoutedModel) {
        return selectedModel;
      }

      // Parse model ID (format: "provider/model" or just "model")
      const [provider, modelId] = selectedModel.includes('/') 
        ? selectedModel.split('/', 2) 
        : ['ollama', selectedModel];

      // Find the model in registry via context
      const model = ctx.modelRegistry.find(provider, modelId);
      
      if (!model) {
        console.log(`[RoutedOllama] Model ${selectedModel} not in registry, using event override`);
        return selectedModel; // Will use event override fallback
      }

      // Check if model is available (has auth)
      const available = ctx.modelRegistry.getAvailable();
      const isAvailable = available.some(m => m.provider === provider && m.id === modelId);
      
      if (!isAvailable) {
        console.log(`[RoutedOllama] Model ${selectedModel} not available (no auth), skipping switch`);
        return null;
      }

      // Use native API to switch model
      console.log(`[RoutedOllama] Switching to ${selectedModel}...`);
      const success = await pi.setModel(model);
      
      if (success) {
        lastRoutedModel = selectedModel;
        setCurrentModel(selectedModel, "adaptive routing");
        console.log(`[RoutedOllama] Switched to ${selectedModel}`);
        return selectedModel;
      } else {
        console.log(`[RoutedOllama] Failed to switch to ${selectedModel}`);
        return null;
      }
    }

    // Hook into provider requests to route to best model
    pi.on("before_provider_request", async (event: any, ctx: ExtensionContext) => {
      try {
        const messages = event.messages || [];
        const lastUserMsg = messages.findLast((m: any) => m.role === "user")?.content || "";
        
        // Try to switch model natively
        const routedModel = await routeToBestModel(lastUserMsg, ctx);
        
        // Fallback: override event.model if native switch didn't work
        if (!routedModel && event.model) {
          const selectedModel = await router.selectModel(lastUserMsg);
          event.model = selectedModel;
          setCurrentModel(selectedModel, "event override");
        }
      } catch (err: any) {
        console.error("[RoutedOllama] Routing error:", err?.message);
      }
    });

    // Listen for model changes to track what was selected
    pi.on("model_select", (event: any) => {
      console.log(`[RoutedOllama] Model changed: ${event.previousModel?.id} -> ${event.model?.id} (${event.source})`);
    });
    
    console.log("[RoutedOllama] Routing hooks installed");

    // Register commands
    pi.registerCommand("router", {
      description: "Adaptive model routing. Usage: /router [auto|manual|info|favorites|fav|unfav|MODEL]",
      handler: async (args: string, ctx: ExtensionContext) => {
        try {
          const subcommand = args.trim().toLowerCase();
          
          // Handle auto/manual toggle
          if (subcommand === 'auto') {
            adaptiveRoutingEnabled = true;
            ctx.ui.notify("🧠 Adaptive routing enabled", "info");
            return;
          }
          
          if (subcommand === 'manual' || subcommand === 'static') {
            adaptiveRoutingEnabled = false;
            ctx.ui.notify("🎯 Static model selection (adaptive routing disabled)", "info");
            return;
          }
          
          // Handle direct model switch
          if (subcommand && !['info', 'favorites', 'favs', 'fav', 'unfav'].includes(subcommand.split(' ')[0])) {
            // Try to switch to specified model
            const [provider, modelId] = subcommand.includes('/') 
              ? subcommand.split('/', 2) 
              : ['ollama', subcommand];
            
            const model = ctx.modelRegistry.find(provider, modelId);
            if (model) {
              const success = await pi.setModel(model);
              if (success) {
                adaptiveRoutingEnabled = false; // Disable auto when manually set
                ctx.ui.notify(`🎯 Switched to ${subcommand} (adaptive routing disabled)`, "info");
              } else {
                ctx.ui.notify(`❌ Failed to switch to ${subcommand}`, "error");
              }
            } else {
              ctx.ui.notify(`❌ Model ${subcommand} not found`, "error");
            }
            return;
          }
          
          // Default: show router info
          const result = await handleRouterCommand(args);
          ctx.ui.notify(result, "info");
        } catch (err: any) {
          ctx.ui.notify(`Error: ${err?.message}`, "error");
        }
      },
    });
    console.log("[RoutedOllama] Registered /router command");

    pi.registerCommand("models", {
      description: "List available models with routing info",
      handler: async (args: string, ctx: ExtensionContext) => {
        try {
          // Show native available models
          const available = ctx.modelRegistry.getAvailable();
          const all = ctx.modelRegistry.getAll();
          
          let result = await handleModelsCommand(args);
          result += `\n\n📊 Registry: ${available.length}/${all.length} models available`;
          
          ctx.ui.notify(result, "info");
        } catch (err: any) {
          ctx.ui.notify(`Error: ${err?.message}`, "error");
        }
      },
    });
    console.log("[RoutedOllama] Registered /models command");

    pi.registerCommand("rate", {
      description: "Rate last response (1-5). Usage: /rate 4",
      handler: async (args: string, ctx: ExtensionContext) => {
        try {
          const result = await handleRateCommand(args);
          ctx.ui.notify(result, "info");
        } catch (err: any) {
          ctx.ui.notify(`Error: ${err?.message}`, "error");
        }
      },
    });
    console.log("[RoutedOllama] Registered /rate command");
    
  } catch (err: any) {
    console.error("[RoutedOllama] Failed to initialize:", err?.message);
    console.error("[RoutedOllama] Stack:", err?.stack);
  }
}
