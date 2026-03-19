/**
 * Routed Ollama Extension
 *
 * Unified integration point for adaptive model routing.
 * Uses native pi-coding-agent APIs for model switching.
 * Tracks performance for learning and rankings.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  getRouter,
  handleRouterCommand,
  handleModelsCommand,
  handleRateCommand,
  handleModelRankingsCommand,
  handleTierListCommand,
  handlePopularityCommand,
  handleRefreshPopularity,
  setCurrentModel,
  getCurrentModel,
} from "../../llm";
import { getModelPopularityService } from "../../llm/model-popularity";

// ============================================================================
// Embedding Model Detection
// ============================================================================

/**
 * Known embedding model name patterns.
 * These models ONLY support embeddings, NOT chat completion.
 */
const EMBEDDING_MODEL_PATTERNS = [
  'nomic-embed',
  'all-minilm',
  'mxbai-embed',
  'bge-',
  'e5-',
  'embed',
  'embedding',
  '-embed-',
  'text-embedding',
  'qwen3-embedding',  // Specific: qwen3-embedding is embedding
  'qwen3:0.6b',       // qwen3 0.6b is embedding-only
  'sentence-',
  'uae-',
];

/**
 * Check if a model name indicates it's an embedding-only model.
 */
function isEmbeddingModel(model: string): boolean {
  const modelLower = model.toLowerCase().replace(':cloud', '').replace(':latest', '');
  return EMBEDDING_MODEL_PATTERNS.some(pattern => 
    modelLower.includes(pattern) || modelLower.startsWith(pattern)
  );
}

/**
 * Filter out embedding models from router selection.
 * Returns a safe chat-capable model.
 */
async function selectSafeModel(router: any, userMessage: string): Promise<string> {
  let selectedModel = await router.selectModel(userMessage);
  
  // If router selected an embedding model, fall back to a safe chat model
  if (isEmbeddingModel(selectedModel)) {
    console.log(`[RoutedOllama] WARNING: Router selected embedding model "${selectedModel}" - falling back to chat model`);
    
    // Try to get next best model or use fallback
    const models = await router.listModels();
    
    // Priority order for safe chat models
    const preferredModels = [
      'llama3.2',
      'llama3.1',
      'gemma2',
      'qwen2.5',
      'phi4',
      'mistral',
    ];
    
    // Find first available preferred model
    for (const preferred of preferredModels) {
      const match = models.find((m: string) => 
        m.toLowerCase().startsWith(preferred.toLowerCase()) && !isEmbeddingModel(m)
      );
      if (match) {
        selectedModel = match;
        console.log(`[RoutedOllama] Fallback to: ${selectedModel}`);
        return selectedModel;
      }
    }
    
    // Fallback: any non-embedding model
    const safeModel = models.find((m: string) => !isEmbeddingModel(m));
    if (safeModel) {
      selectedModel = safeModel;
      console.log(`[RoutedOllama] Fallback to: ${selectedModel}`);
    } else {
      // Ultimate fallback - use cloud model
      selectedModel = 'minimax-m2.7:cloud';
      console.log(`[RoutedOllama] Ultimate fallback to: ${selectedModel}`);
    }
  }
  
  return selectedModel;
}

export default async function routedOllamaExtension(pi: ExtensionAPI) {
  console.log("[RoutedOllama] Extension loading...");

  // Track if adaptive routing is enabled
  let adaptiveRoutingEnabled = true;
  let lastRoutedModel: string | null = null;
  let lastRequestStartTime: number | null = null;
  let lastTaskType: string = 'chat';

  try {
    // Initialize router
    const router = await getRouter();
    const popularity = getModelPopularityService();
    console.log("[RoutedOllama] Router initialized with", (await router.listModels()).length, "models");

    /**
     * Infer task type from message content
     */
    function inferTaskType(msg: unknown): string {
      // Handle non-string content safely
      let message: string;
      if (typeof msg === 'string') {
        message = msg;
      } else if (Array.isArray(msg)) {
        // Handle array content (multimodal)
        const textPart = msg.find(p => p?.type === 'text');
        message = textPart?.text || '';
      } else if (msg && typeof msg === 'object') {
        message = (msg as any).text || '';
      } else {
        message = String(msg ?? '');
      }
      
      const lower = message.toLowerCase();
      if (/\b(function|class|const|let|var|import|export|code|implement|debug)\b/.test(lower)) {
        return 'code';
      }
      if (/\b(image|picture|photo|look at|describe|see|visual)\b/.test(lower)) {
        return 'vision';
      }
      if (/\b(analyze|reason|think|step by step|explain why|compare)\b/.test(lower)) {
        return 'reasoning';
      }
      return 'chat';
    }

    /**
     * Switch to the best model for the given task
     * Uses native pi.setModel() API via ExtensionContext
     */
    async function routeToBestModel(userMessage: string, ctx: ExtensionContext): Promise<string | null> {
      if (!adaptiveRoutingEnabled) {
        console.log("[RoutedOllama] Adaptive routing disabled, skipping");
        return null;
      }

      // Store task type for tracking
      lastTaskType = inferTaskType(userMessage);

      // Select best model using our router (with embedding model protection)
      const selectedModel = await selectSafeModel(router, userMessage);

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

    // Hook into provider requests to route to best model and inject num_ctx for Ollama
    pi.on("before_provider_request", async (event: any, ctx: ExtensionContext) => {
      try {
        const payload = event.payload || event;
        const messages = payload.messages || [];
        const lastUserMsg = messages.findLast((m: any) => m.role === "user")?.content || "";

        // Track start time for latency measurement
        lastRequestStartTime = Date.now();

        // Try to switch model natively
        const routedModel = await routeToBestModel(lastUserMsg, ctx);

        // Fallback: override event.model if native switch didn't work
        if (!routedModel && event.model) {
          const selectedModel = await selectSafeModel(router, lastUserMsg);
          event.model = selectedModel;
          setCurrentModel(selectedModel, "event override");
        }

        // Inject num_ctx for Ollama models to use full context window
        // Ollama's OpenAI-compatible API accepts num_ctx as a top-level field
        const currentModel = getCurrentModel();
        if (currentModel?.name) {
          // Get context window from model discovery service
          const modelInfo = await router.getModelInfo(currentModel.name);

          // Check if this is an Ollama provider (local or cloud)
          const isOllama = event.provider === 'ollama' ||
                           event.provider === 'ollama-cloud' ||
                           currentModel.name.includes(':cloud') ||
                           !currentModel.name.includes('/');  // Ollama models don't have / in name

          if (isOllama && modelInfo?.contextWindow && modelInfo.contextWindow > 4096) {
            // Ollama accepts num_ctx as a top-level field in the OpenAI-compatible request
            // This tells Ollama to use the full context capacity
            payload.num_ctx = modelInfo.contextWindow;
            console.log(`[RoutedOllama] Injected num_ctx=${modelInfo.contextWindow} for ${currentModel.name}`);
          }
        }

        // Return the modified payload
        return payload;
      } catch (err: any) {
        console.error("[RoutedOllama] Routing error:", err?.message);
        return event.payload || event;
      }
    });

    // Track response completion for performance scoring
    pi.on("turn_end", async (event: any, ctx: ExtensionContext) => {
      try {
        const currentModelStatus = getCurrentModel();
        if (!currentModelStatus || !lastRequestStartTime) return;

        const latencyMs = Date.now() - lastRequestStartTime;
        const model = currentModelStatus.name;

        // Track in popularity service (local usage)
        popularity.incrementLocalUsage(model);

        // Track in router for performance history
        // Note: This stores model name, latency, tokens - NOT prompts/responses
        router.trackResponse(
          model,
          {
            usage: {
              inputTokens: event.tokenUsage?.sent || 0,
              outputTokens: event.tokenUsage?.received || 0,
            },
          } as any,
          latencyMs,
          lastTaskType,
          'medium', // Could be inferred from message complexity
          ctx.sessionManager?.getSessionId?.()
        );

        console.log(`[RoutedOllama] Tracked response: ${model} (${latencyMs}ms, ${lastTaskType})`);
      } catch (err: any) {
        console.error("[RoutedOllama] Tracking error:", err?.message);
      } finally {
        lastRequestStartTime = null;
      }
    });

    // Listen for model changes to track what was selected
    pi.on("model_select", (event: any) => {
      console.log(`[RoutedOllama] Model changed: ${event.previousModel?.id} -> ${event.model?.id} (${event.source})`);
    });

    console.log("[RoutedOllama] Routing hooks installed");

    // Register commands
    pi.registerCommand("router", {
      description: "Adaptive model routing. Usage: /router [auto|manual|info|favorites|stats|history|fav|unfav|MODEL]",
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
          if (subcommand && !['info', 'favorites', 'favs', 'fav', 'unfav', 'stats', 'history'].includes(subcommand.split(' ')[0])) {
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

    pi.registerCommand("model-rankings", {
      description: "Show model performance rankings. Usage: /model-rankings [day|week|month|all]",
      handler: async (args: string, ctx: ExtensionContext) => {
        try {
          const result = await handleModelRankingsCommand(args);
          ctx.ui.notify(result, "info");
        } catch (err: any) {
          ctx.ui.notify(`Error: ${err?.message}`, "error");
        }
      },
    });
    console.log("[RoutedOllama] Registered /model-rankings command");

    pi.registerCommand("tier-list", {
      description: "Show AI-generated model tier list. Usage: /tier-list [day|week|month|all]",
      handler: async (args: string, ctx: ExtensionContext) => {
        try {
          const result = await handleTierListCommand(args);
          ctx.ui.notify(result, "info");
        } catch (err: any) {
          ctx.ui.notify(`Error: ${err?.message}`, "error");
        }
      },
    });
    console.log("[RoutedOllama] Registered /tier-list command");

    pi.registerCommand("popularity", {
      description: "Show model popularity from Ollama library. Usage: /popularity [--refresh]",
      handler: async (args: string, ctx: ExtensionContext) => {
        try {
          let result: string;
          if (args.includes('--refresh')) {
            result = await handleRefreshPopularity();
          } else {
            result = await handlePopularityCommand(args);
          }
          ctx.ui.notify(result, "info");
        } catch (err: any) {
          ctx.ui.notify(`Error: ${err?.message}`, "error");
        }
      },
    });
    console.log("[RoutedOllama] Registered /popularity command");

    pi.registerCommand("community", {
      description: "Share anonymous model stats with the community. Usage: /community [status|enable|disable|export|fetch|merge|tier-list]",
      handler: async (args: string, ctx: ExtensionContext) => {
        try {
          const { handleCommunityCommand } = await import("../../llm/router-commands");
          const result = await handleCommunityCommand(args);
          ctx.ui.notify(result, "info");
        } catch (err: any) {
          ctx.ui.notify(`Error: ${err?.message}`, "error");
        }
      },
    });
    console.log("[RoutedOllama] Registered /community command");

    pi.registerCommand("best-for", {
      description: "Show best models for specific tasks. Usage: /best-for [code|chat|vision|reasoning|all]",
      handler: async (args: string, ctx: ExtensionContext) => {
        try {
          const { handleBestForCommand } = await import("../../llm/router-commands");
          const result = await handleBestForCommand(args);
          ctx.ui.notify(result, "info");
        } catch (err: any) {
          ctx.ui.notify(`Error: ${err?.message}`, "error");
        }
      },
    });
    console.log("[RoutedOllama] Registered /best-for command");

    // Refresh popularity data in background on startup (if cache stale)
    if (popularity.needsRefresh()) {
      popularity.refreshFromOllama().then(count => {
        if (count > 0) {
          console.log(`[RoutedOllama] Cached ${count} models from Ollama library`);
        }
      }).catch(err => {
        // Silently fail - uses cached data
      });
    }

  } catch (err: any) {
    console.error("[RoutedOllama] Failed to initialize:", err?.message);
    console.error("[RoutedOllama] Stack:", err?.stack);
  }
}
