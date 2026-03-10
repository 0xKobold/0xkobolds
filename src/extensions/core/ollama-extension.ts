/**
 * Ollama Extension for 0xKobold
 * 
 * Unified local + cloud Ollama support
 * Refactored: DRY, Functional, OOP, KISS, SOC2 Compliant
 */

import type { ExtensionAPI, ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import { config } from "../../config/unified-config.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  LOCAL_URL: config.getPath("ollama.baseUrl") || "http://localhost:11434",
  CLOUD_URL: "https://ollama.com",
  API_KEY: config.getPath("ollama.apiKey") || "",
  DEFAULT_MODEL: config.getPath("ollama.defaultModel") || "",
  CUSTOM_MODELS: config.getPath("ollama.customModels") || [],
} as const;

// ============================================================================
// SECURITY LOGGER (SOC2 Compliance)
// ============================================================================

class SecurityLogger {
  static log(action: string, success: boolean): void {
    if (action.includes("key") || action.includes("auth")) {
      console.log(`[Security] ${action}: ${success ? "success" : "failed"}`);
    }
  }
}

// ============================================================================
// MODEL FACTORY (DRY: Single model creation)
// ============================================================================

function createModel(name: string, prefix: string, options: { label?: string; isCloud?: boolean } = {}): ProviderModelConfig {
  const { label = "", isCloud = false } = options;
  const displayName = label ? `${name} (${label})` : name;
  
  const lowerName = name.toLowerCase();
  
  // Detect reasoning capability
  const isReasoning = ["coder", "r1", "deepseek", "kimi", "think", "reason"].some(kw => 
    lowerName.includes(kw)
  );
  
  // Detect vision capability (models that can process images)
  const isVision = ["vision", "vl", "multimodal", "gpt-4", "claude-3", "llava", "bakllava", "moondream", "llava-phi3"].some(kw =>
    lowerName.includes(kw)
  );

  // Cloud models use :cloud suffix (Ollama convention)
  const modelId = isCloud ? `${name}:cloud` : name;
  
  // Vision models support both text and image input
  const inputTypes: ("text" | "image")[] = isVision ? ["text", "image"] : ["text"];
  
  const visionLabel = isVision ? "👁️ " : "";
  const cloudLabel = isCloud ? "☁️ " : "";

  return {
    id: modelId,
    name: `${cloudLabel}${visionLabel}${displayName}`,
    reasoning: isReasoning,
    input: inputTypes,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

// ============================================================================
// HTTP CLIENT
// ============================================================================

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function testLocalConnection(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${CONFIG.LOCAL_URL}/api/tags`,
      {},
      2000
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function testCloudConnection(): Promise<boolean> {
  if (!CONFIG.API_KEY) return false;
  try {
    const response = await fetchWithTimeout(
      `${CONFIG.CLOUD_URL}/api/tags`,
      { headers: { Authorization: `Bearer ${CONFIG.API_KEY}` } },
      5000
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function getLocalModels(): Promise<ProviderModelConfig[]> {
  try {
    console.log(`[Ollama] Fetching local models`);
    const response = await fetchWithTimeout(
      `${CONFIG.LOCAL_URL}/api/tags`,
      {},
      5000
    );

    if (!response.ok) {
      console.warn(`[Ollama] HTTP ${response.status}`);
      return [];
    }

    interface ApiResponse {
      models?: Array<{
        name: string;
        details?: { parameter_size?: string };
      }>;
    }

    const data = await response.json() as ApiResponse;
    
    if (!data.models?.length) {
      console.log("[Ollama] No local models installed");
      return [];
    }

    console.log(`[Ollama] Found ${data.models.length} local models`);
    
    return data.models.map(m => {
      const paramSize = m.details?.parameter_size || "";
      const label = paramSize ? `(${paramSize})` : "";
      return createModel(m.name, "ollama", { label });
    });
  } catch (err) {
    console.warn("[Ollama] Local fetch failed:", (err as Error).message);
    return [];
  }
}

async function getCloudModels(): Promise<ProviderModelConfig[]> {
  if (!CONFIG.API_KEY) {
    console.log("[Ollama] No API key configured");
    return [];
  }

  try {
    SecurityLogger.log("cloud_auth_attempt", true);
    
    const response = await fetchWithTimeout(
      `${CONFIG.CLOUD_URL}/api/tags`,
      { headers: { Authorization: `Bearer ${CONFIG.API_KEY}` } },
      10000
    );

    if (!response.ok) {
      SecurityLogger.log("cloud_auth_failed", false);
      console.warn(`[Ollama] Cloud auth failed: HTTP ${response.status}`);
      return [];
    }

    interface ApiResponse {
      models?: Array<{
        name: string;
        details?: { parameter_size?: string };
      }>;
    }

    const data = await response.json() as ApiResponse;
    
    if (!data.models?.length) {
      console.log("[Ollama] No cloud models available");
      return [];
    }

    SecurityLogger.log("cloud_models_fetched", true);
    console.log(`[Ollama] ${data.models.length} cloud models accessible`);
    
    return data.models.map(m => {
      const paramSize = m.details?.parameter_size || "";
      const label = paramSize ? `(${paramSize})` : "";
      return createModel(m.name, "cloud", { label, isCloud: true });
    });
  } catch (err) {
    SecurityLogger.log("cloud_fetch_error", false);
    console.warn("[Ollama] Cloud fetch failed:", (err as Error).message);
    return [];
  }
}

async function pullModel(modelName: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${CONFIG.LOCAL_URL}/api/pull`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, stream: false }),
    },
    30000
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

async function getRunningModels(): Promise<Array<{ name: string }>> {
  const response = await fetchWithTimeout(
    `${CONFIG.LOCAL_URL}/api/ps`,
    {},
    5000
  );
  
  interface PsResponse {
    models?: Array<{ name: string }>;
  }
  
  const data = await response.json() as PsResponse;
  return data.models || [];
}

// ============================================================================
// MODEL SERVICE
// ============================================================================

class ModelService {
  localModels: ProviderModelConfig[] = [];
  cloudModels: ProviderModelConfig[] = [];
  customModels: ProviderModelConfig[] = [];
  hasLocal = false;
  hasCloud = false;

  async initialize(): Promise<void> {
    console.log("[Ollama] Initializing...");

    [this.hasLocal, this.hasCloud] = await Promise.all([
      testLocalConnection(),
      testCloudConnection(),
    ]);

    console.log(`[Ollama] Local: ${this.hasLocal ? "✅" : "❌"}, Cloud: ${this.hasCloud ? "✅" : "❌"}`);

    if (this.hasLocal) {
      this.localModels = await getLocalModels();
    }

    if (this.hasCloud) {
      this.cloudModels = await getCloudModels();
    }

    this.customModels = this.buildCustomModels();
  }

  private buildCustomModels(): ProviderModelConfig[] {
    const models: ProviderModelConfig[] = [];
    const existingIds = new Set([
      ...this.localModels.map(m => m.id),
      ...this.cloudModels.map(m => m.id),
    ]);

    if (CONFIG.DEFAULT_MODEL && !existingIds.has(CONFIG.DEFAULT_MODEL)) {
      models.push(createModel(CONFIG.DEFAULT_MODEL, "ollama", { label: "Configured Default" }));
    }

    for (const custom of CONFIG.CUSTOM_MODELS) {
      const name = typeof custom === "string" ? custom : custom.name;
      if (!existingIds.has(name)) {
        models.push(createModel(name, "ollama", { label: "Custom" }));
      }
    }

    return models;
  }

  getAllModels(): ProviderModelConfig[] {
    return [...this.customModels, ...this.localModels, ...this.cloudModels];
  }

  getLocalModels(): ProviderModelConfig[] {
    return [...this.localModels];
  }

  getCloudModels(): ProviderModelConfig[] {
    return [...this.cloudModels];
  }
}

// ============================================================================
// COMMANDS
// ============================================================================

function registerCommands(pi: ExtensionAPI, service: ModelService): void {
  // Status command
  pi.registerCommand("ollama-status", {
    description: "Show Ollama status and models",
    handler: async () => {
      const allModels = service.getAllModels();
      const visionModels = allModels.filter(m => m.input.includes("image"));
      
      const lines = [
        "🤖 Ollama Status",
        `Local: ${service.hasLocal ? "✅ Connected" : "❌ Not detected"}`,
        `Cloud: ${service.hasCloud ? "✅ Authenticated" : CONFIG.API_KEY ? "⚠️ Invalid Key" : "Not Configured"}`,
        "",
        `Models: ${allModels.length} available`,
        ...(visionModels.length > 0 ? [`👁️ Vision models: ${visionModels.length}`] : []),
        ...(service.getLocalModels().length > 0 ? ["", "Local:"] : []),
        ...service.getLocalModels().slice(0, 10).map(m => `  • ${m.name}`),
        ...(service.getCloudModels().length > 0 ? ["", "Cloud:"] : []),
        ...service.getCloudModels().map(m => `  • ${m.name}`),
      ];
      
      // @ts-ignore
      pi.sendMessage?.({
        customType: "ollama.info",
        content: [{ type: "text", text: lines.join("\n") }],
        display: false,
      });
    },
  });

  // Pull command
  pi.registerCommand("ollama-pull", {
    description: "Pull model from ollama.com",
    handler: async (args: string) => {
      const modelName = args.trim();
      
      if (!modelName || !/^[a-zA-Z0-9._:-]+$/.test(modelName)) {
        // @ts-ignore
        pi.sendMessage?.({
          customType: "ollama.warning",
          content: [{ type: "text", text: "Usage: /ollama-pull <model>" }],
          display: false,
        });
        SecurityLogger.log("invalid_pull_input", false);
        return;
      }

      if (!service.hasLocal) {
        // @ts-ignore
        pi.sendMessage?.({
          customType: "ollama.error",
          content: [{ type: "text", text: "Start Ollama first: ollama serve" }],
          display: false,
        });
        return;
      }

      // @ts-ignore
      pi.sendMessage?.({
        customType: "ollama.info",
        content: [{ type: "text", text: `⬇️ Pulling ${modelName}...` }],
        display: false,
      });
      
      try {
        await pullModel(modelName);
        SecurityLogger.log("model_pulled", true);
        // @ts-ignore
        pi.sendMessage?.({
          customType: "ollama.info",
          content: [{ type: "text", text: `✅ Downloaded ${modelName}` }],
          display: false,
        });
      } catch (err) {
        SecurityLogger.log("model_pull_failed", false);
        // @ts-ignore
        pi.sendMessage?.({
          customType: "ollama.error",
          content: [{ type: "text", text: `❌ ${(err as Error).message}` }],
          display: false,
        });
      }
    },
  });

  // Running models
  pi.registerCommand("ollama-running", {
    description: "Show models in memory",
    handler: async () => {
      if (!service.hasLocal) {
        // @ts-ignore
        pi.sendMessage?.({
          customType: "ollama.error",
          content: [{ type: "text", text: "Ollama not running" }],
          display: false,
        });
        return;
      }

      const models = await getRunningModels();
      
      if (!models.length) {
        // @ts-ignore
        pi.sendMessage?.({
          customType: "ollama.info",
          content: [{ type: "text", text: "No models loaded" }],
          display: false,
        });
        return;
      }

      const lines = [
        `🤖 Running Models (${models.length}):`,
        ...models.map(m => `  • ${m.name}`),
      ];
      
      // @ts-ignore
      pi.sendMessage?.({
        customType: "ollama.info",
        content: [{ type: "text", text: lines.join("\n") }],
        display: false,
      });
    },
  });

  // Cloud mode toggle
  pi.registerCommand("ollama-cloud-mode", {
    description: "Show cloud connection status",
    handler: async () => {
      const isCloudOnly = !service.hasLocal && service.hasCloud;
      // @ts-ignore
      pi.sendMessage?.({
        customType: "ollama.info",
        content: [{ type: "text", text: isCloudOnly ? "☁️ Cloud-only mode" : "🔄 Local mode preferred" }],
        display: false,
      });
    },
  });
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export default async function ollamaExtension(pi: ExtensionAPI): Promise<void> {
  console.log("[Ollama] Extension loading...");

  try {
    const service = new ModelService();
    await service.initialize();

    let models = service.getAllModels();
    if (models.length === 0) {
      console.log("[Ollama] No models - using fallback");
      models = [createModel("llama3.2", "ollama", { label: "Install: ollama pull llama3.2" })];
    }

    // Determine endpoint: cloud if API key exists, else local
    const hasApiKey = !!CONFIG.API_KEY;
    const effectiveBaseUrl = hasApiKey ? CONFIG.CLOUD_URL : CONFIG.LOCAL_URL;
    const effectiveApiKey = hasApiKey ? CONFIG.API_KEY : "ollama-local";
    
    console.log(`[Ollama] Using ${hasApiKey ? 'cloud' : 'local'} endpoint: ${effectiveBaseUrl}`);

    pi.registerProvider("ollama", {
      baseUrl: effectiveBaseUrl,
      apiKey: effectiveApiKey,
      api: "anthropic-messages",
      models,
    });

    registerCommands(pi, service);

    SecurityLogger.log("extension_loaded", true);
    console.log(`[Ollama] Ready with ${models.length} models`);
  } catch (err) {
    SecurityLogger.log("extension_load_failed", false);
    console.error("[Ollama] Extension failed:", err);
    throw err;
  }
}


// ============================================================================
// LEGACY EXPORTS (for LLM provider and other consumers)
// ============================================================================

/** Get API key if configured */
export function getOllamaApiKey(): string | undefined {
  return CONFIG.API_KEY || undefined;
}

/** Test if local Ollama is running */
export function checkLocalOllama(): Promise<boolean> {
  return testLocalConnection();
}

/** Check if model requires API key */
export function modelRequiresApiKey(modelId: string): boolean {
  // Only cloud models (with :cloud suffix) need API key for direct access
  const isCloudModel = modelId.endsWith(":cloud") || modelId.includes("/cloud/");
  return isCloudModel && !!CONFIG.API_KEY;
}

/** Get base URL for a specific model (handles cloud vs local routing)
 * @param modelId - the model ID
 * @param useOpenAiEndpoint - if true, returns /v1 endpoint for OpenAI compatibility
 */
export function getOllamaBaseUrl(modelId: string, useOpenAiEndpoint = false): string {
  // Check if it's a cloud model (has :cloud suffix)
  const isCloudModel = modelId.endsWith(":cloud") || modelId.includes("/cloud/");
  
  let baseUrl: string;
  
  if (isCloudModel) {
    // Cloud models: use API key/direct URL ONLY if configured
    if (CONFIG.API_KEY) {
      baseUrl = CONFIG.CLOUD_URL;
    } else {
      // Fall back to local proxy (may work if user logged in via CLI)
      baseUrl = CONFIG.LOCAL_URL;
    }
  } else {
    // Regular local model
    baseUrl = CONFIG.LOCAL_URL;
  }
  
  // Return /v1 endpoint for OpenAI compatibility if requested
  return useOpenAiEndpoint ? `${baseUrl}/v1` : baseUrl;
}

/** Get appropriate headers for a model request */
export function getOllamaHeaders(modelId: string): Record<string, string> {
  return getOllamaHeadersInternal(modelId);
}

// Internal version for use within this module
function getOllamaHeadersInternal(modelId: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  // Only add auth for cloud models when API key is explicitly set
  const isCloudModel = modelId.endsWith(":cloud") || modelId.includes("/cloud/");
  if (isCloudModel && CONFIG.API_KEY) {
    headers["Authorization"] = `Bearer ${CONFIG.API_KEY}`;
  }
  
  return headers;
}
