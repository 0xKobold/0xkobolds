import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks, OAuthPrompt } from "@mariozechner/pi-ai";

/**
 * Ollama Cloud Extension - Phase 1: Login & Auth
 * 
 * Provides secure OAuth-based login for Ollama Cloud API.
 * Users can authenticate via /login command and credentials
 * are stored securely in ~/.0xkobold/auth.json
 */

export default function ollamaCloudExtension(pi: ExtensionAPI) {
  console.log("[OllamaCloud] Extension loaded");

  // Register Ollama Cloud as an OAuth provider
  pi.registerProvider("ollama-cloud", {
    baseUrl: "https://ollama.com",
    api: "openai-chat",
    
    oauth: {
      name: "Ollama Cloud",
      
      /**
       * Login flow - prompts user for API key in TUI
       */
      async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
        const { onPrompt, onProgress } = callbacks;
        
        try {
          // Show connecting status
          onProgress?.("Connecting to Ollama Cloud...");
          
          // Prompt for API key
          const prompt: OAuthPrompt = {
            message: "Enter your Ollama API Key (from ollama.com/settings/keys):",
            placeholder: "sk-ollama-...",
          };
          
          const apiKey = await onPrompt(prompt);
          
          if (!apiKey || apiKey.trim() === "") {
            throw new Error("API key is required");
          }
          
          const trimmedKey = apiKey.trim();
          
          // Validate the key
          onProgress?.("Validating API key...");
          
          const response = await fetch("https://ollama.com/api/tags", {
            headers: {
              "Authorization": `Bearer ${trimmedKey}`,
            },
          });
          
          if (!response.ok) {
            if (response.status === 401) {
              throw new Error("Invalid API key");
            }
            throw new Error(`Connection failed: ${response.status}`);
          }
          
          onProgress?.("Connected to Ollama Cloud!");
          
          return {
            access: trimmedKey,
            refresh: "",
            expires: null,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Login failed: ${message}`);
        }
      },
      
      async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
        return credentials;
      },
      
      getApiKey(credentials: OAuthCredentials): string {
        return credentials.access;
      },
    },
    
    models: [
      {
        id: "gpt-oss:120b-cloud",
        name: "GPT-OSS 120B",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  });

  console.log("[OllamaCloud] Provider registered. Run /login to authenticate.");
}
