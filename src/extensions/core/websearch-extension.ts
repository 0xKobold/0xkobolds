import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { $ } from "bun";

/**
 * Web Search Tool - Ollama Integration
 * 
 * Provides web search capabilities using Ollama's built-in search functionality.
 * Falls back to alternative search methods if Ollama is not configured for web search.
 */

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  totalResults?: number;
}

/**
 * Perform web search using available methods
 */
async function performWebSearch(query: string, limit: number = 5): Promise<SearchResponse> {
  const results: SearchResult[] = [];
  
  try {
    // Try Ollama first if available
    const ollamaResults = await searchOllama(query, limit);
    if (ollamaResults.length > 0) {
      return {
        results: ollamaResults,
        query,
        totalResults: ollamaResults.length
      };
    }
  } catch {
    // Ollama not available or not configured, try alternatives
  }

  // Fallback: Try searx or other search APIs
  try {
    const fallbackResults = await searchFallback(query, limit);
    if (fallbackResults.length > 0) {
      return {
        results: fallbackResults,
        query,
        totalResults: fallbackResults.length
      };
    }
  } catch {
    // Fallback also failed
  }

  return {
    results,
    query,
    totalResults: 0
  };
}

/**
 * Search using Ollama's web search capability
 */
async function searchOllama(query: string, limit: number): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  // Check if Ollama is running and has web search enabled
  try {
    const response = await fetch("http://localhost:11434/api/version");
    if (!response.ok) {
      throw new Error("Ollama not available");
    }
    
    // Generate search query using Ollama
    // This uses Ollama's capability to generate search terms
    const searchPrompt = `Search the web for: ${query}

Provide search results in this format:
Title | URL | Brief description

Important: Only include real, factual results.`;

    const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_WEB_SEARCH_MODEL || "llama3.2",
        prompt: searchPrompt,
        stream: false,
        options: {
          // Enable web search if supported by the model
          capabilities: ["web_search"]
        }
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error("Ollama request failed");
    }

    const data = await ollamaResponse.json();
    const content = data.response || "";

    // Parse results from Ollama response
    // Expected format: Title | URL | Description
    const lines = content.split('\n').filter((line: string) => line.trim());
    
    for (const line of lines.slice(0, limit)) {
      const parts = line.split('|').map((p: string) => p.trim());
      if (parts.length >= 2) {
        results.push({
          title: parts[0] || "Untitled",
          url: parts[1] || "",
          snippet: parts[2] || ""
        });
      }
    }

  } catch (error) {
    console.log("[WebSearch] Ollama search not available:", error);
  }

  return results;
}

/**
 * Fallback search using system tools
 */
async function searchFallback(query: string, limit: number): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  // Try using curl with a search engine that supports no-JS queries
  // Using DuckDuckGo HTML version which works without JavaScript
  try {
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const html = await $`curl -s -A "Mozilla/5.0 (compatible; 0xKobold)" ${searchUrl}`.text();
    
    // Basic parsing - look for result links
    // DuckDuckGo HTML format: <a class="result__a" href="URL">Title</a>
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
    let match;
    let count = 0;
    
    while ((match = resultRegex.exec(html)) && count < limit) {
      const url = match[1];
      const title = match[2].replace(/<[^>]*>/g, ''); // Strip HTML
      
      if (url && title && !url.includes('duckduckgo.com')) {
        results.push({
          title: decodeHtmlEntities(title),
          url: decodeURIComponent(url),
          snippet: ""
        });
        count++;
      }
    }
  } catch (error) {
    console.log("[WebSearch] Fallback search failed:", error);
  }

  return results;
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' '
  };
  
  return text.replace(/&[^;]+;/g, (entity) => entities[entity] || entity);
}

/**
 * Fetch and extract content from a URL
 */
async function fetchUrlContent(url: string, maxLength: number = 5000): Promise<{ title: string; content: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; 0xKobold/0.1)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : "Untitled";
    
    // Extract main content (basic approach)
    const content = html
      .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>.*?<\/style>/gi, '') // Remove styles
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .slice(0, maxLength);
    
    return { title, content };
  } catch (error) {
    console.log("[WebSearch] Failed to fetch URL:", error);
    return null;
  }
}

/**
 * Web Search Extension
 */
export default function webSearchExtension(pi: ExtensionAPI) {
  // ═══════════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════════

  pi.registerCommand("web-search", {
    description: "Search the web for information",
  // @ts-ignore Command args property
    args: [
      { name: "query", description: "Search query", required: true },
      { name: "limit", description: "Number of results (default: 5)", required: false }
    ],
    handler: async (args, ctx) => {
      const { query, limit } = args;
      const resultLimit = parseInt(String(limit)) || 5;

      ctx.ui?.notify?.(`🔍 Searching for: ${query}`, "info");
      
      const results = await performWebSearch(query, resultLimit);

      if (results.results.length === 0) {
        ctx.ui?.notify?.("No results found", "warning");
        return;
      }

      const lines: string[] = [`🔍 Results for "${query}":\n`];
      
      for (let i = 0; i < results.results.length; i++) {
        const result = results.results[i];
        lines.push(`${i + 1}. ${result.title}`);
        lines.push(`   ${result.url}`);
        if (result.snippet) {
          lines.push(`   ${result.snippet}`);
        }
        lines.push("");
      }

      ctx.ui?.notify?.(lines.join("\n"), "info");
    }
  });

  pi.registerCommand("fetch", {
    description: "Fetch and display text content from a URL",
  // @ts-ignore Command args property
    args: [
      { name: "url", description: "URL to fetch (must start with http:// or https://)", required: true },
      { name: "max", description: "Maximum characters (default: 5000)", required: false }
    ],
    handler: async (args, ctx) => {
      const { url, max } = args;
      const maxLength = parseInt(String(max)) || 5000;

      if (!url?.startsWith("http")) {
        ctx.ui?.notify?.("URL must start with http:// or https://", "error");
        return;
      }

      ctx.ui?.notify?.(`📥 Fetching ${url}...`, "info");
      
      const result = await fetchUrlContent(url, maxLength);

      if (!result) {
        ctx.ui?.notify?.(`Failed to fetch ${url}`, "error");
        return;
      }

      // Format output
      const lines = [
        `📄 ${result.title}`,
        `Source: ${url}`,
        "─────────────────────────────────────────",
        "",
        result.content.slice(0, maxLength),
        "",
        "─────────────────────────────────────────",
        result.content.length > maxLength 
          ? `... (${result.content.length - maxLength} more characters)` 
          : ""
      ];

      ctx.ui?.notify?.(lines.join("\n"), "info");
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // TOOLS
  // ═══════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "web_search",
    description: "Search the web for current information. Use this when you need up-to-date information not in your training data.",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        query: { 
          type: "string", 
          description: "Search query - be specific for better results"
        },
        limit: { 
          type: "number", 
          default: 5,
          description: "Number of results to return (1-10)"
        }
      },
      required: ["query"],
    },
    async execute(args: any) {
  // @ts-ignore Command args property
      console.log("[WebSearch] Received args:", JSON.stringify(args, null, 2));
      
      // Handle different argument structures
      const query = args?.query || args?.parameters?.query || args?.[0]?.query;
      const limit = args?.limit || args?.parameters?.limit || args?.[0]?.limit || 5;
      
      console.log("[WebSearch] Extracted query:", query, "limit:", limit);

      if (!query || typeof query !== 'string' || !query.trim()) {
        return {
          content: [{ 
            type: "text", 
            text: `Invalid search query: received "${query}" (type: ${typeof query})` 
          }],
          details: { error: "invalid_query", received: args },
        };
      }

      const results = await performWebSearch(query, Math.min(limit, 10));

      if (results.results.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: "No search results found. The web search service may be unavailable." 
          }],
          details: { 
            query, 
            error: "no_results",
            note: "Ollama web search not configured or fallback failed" 
          },
        };
      }

      const formatted = results.results
        .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}${r.snippet ? "\n   " + r.snippet : ""}`)
        .join("\n\n");

      return {
        content: [
          { type: "text", text: `Search results for "${query}":\n\n${formatted}` },
        ],
        details: {
          query,
          results: results.results,
          total: results.totalResults,
        },
      };
    },
  });

  pi.registerTool({
    name: "web_fetch",
    description: "Fetch and read the content of a web page. Use this to get detailed information from a specific URL.",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        url: { 
          type: "string", 
          description: "Full URL to fetch (must include http:// or https://)"
        },
        max_length: { 
          type: "number", 
          default: 5000,
          description: "Maximum characters to retrieve"
        }
      },
      required: ["url"],
    },
    async execute(args: any) {
  // @ts-ignore Command args property
      console.log("[WebFetch] Received args:", JSON.stringify(args, null, 2));
      
      // Handle different argument structures that pi-coding-agent might send
      const url = args?.url || args?.parameters?.url || args?.[0]?.url;
      const max_length = args?.max_length || args?.parameters?.max_length || args?.[0]?.max_length || 5000;
      
      console.log("[WebFetch] Extracted url:", url, "max_length:", max_length);

      if (!url || typeof url !== 'string') {
        return {
          content: [{ 
            type: "text", 
            text: `Invalid URL: received "${url}" (type: ${typeof url}). Must be a string starting with http:// or https://` 
          }],
          details: { error: "invalid_url", received: args },
        };
      }

      if (!url.startsWith("http")) {
        return {
          content: [{ type: "text", text: `Invalid URL "${url}". Must start with http:// or https://` }],
          details: { error: "invalid_url_scheme", url },
        };
      }

      const content = await fetchUrlContent(url, max_length);

      if (!content) {
        return {
          content: [{ type: "text", text: `Failed to fetch content from ${url}` }],
          details: { error: "fetch_failed", url },
        };
      }

      return {
        content: [
          { 
            type: "text", 
            text: `# ${content.title}\n\n${content.content}\n\n[Source: ${url}]` 
          },
        ],
        details: {
          url,
          title: content.title,
          length: content.content.length,
        },
      };
    },
  });

  pi.registerTool({
    name: "web_qa",
    description: "Search the web and synthesize an answer. Combines search + fetch for comprehensive results.",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        question: { 
          type: "string", 
          description: "The question to answer using web search"
        },
        sources: { 
          type: "number", 
          default: 3,
          description: "Number of sources to check (1-5)"
        }
      },
      required: ["question"],
    },
    async execute(args: any) {
  // @ts-ignore Command args property
      console.log("[WebQA] Received args:", JSON.stringify(args, null, 2));
      
      // Handle different argument structures
      const question = args?.question || args?.parameters?.question || args?.[0]?.question;
      const sources = args?.sources || args?.parameters?.sources || args?.[0]?.sources || 3;
      
      console.log("[WebQA] Extracted question:", question, "sources:", sources);

      if (!question || typeof question !== 'string' || !question.trim()) {
        return {
          content: [{ 
            type: "text", 
            text: `Invalid question: received "${question}" (type: ${typeof question})` 
          }],
          details: { error: "invalid_question", received: args },
        };
      }

      // Search first
      const searchResults = await performWebSearch(question, Math.min(sources, 5));

      if (searchResults.results.length === 0) {
        return {
          content: [{ type: "text", text: "Could not find any information about that question online." }],
          details: { question, error: "no_search_results" },
        };
      }

      // Fetch content from top results
      const fetchedContents: { title: string; url: string; content: string }[] = [];
      
      for (const result of searchResults.results.slice(0, sources)) {
        const content = await fetchUrlContent(result.url, 3000);
        if (content) {
          fetchedContents.push({
            title: content.title,
            url: result.url,
            content: content.content
          });
        }
      }

      const summary = fetchedContents.length > 0
        ? `Found ${fetchedContents.length} relevant sources:\n\n` +
          fetchedContents.map(c => `## ${c.title}\n${c.content.slice(0, 1500)}...\n(Source: ${c.url})`).join("\n\n")
        : `Found ${searchResults.results.length} search results but could not fetch detailed content.\n\n` +
          searchResults.results.map(r => `- ${r.title}: ${r.url}`).join("\n");

      return {
        content: [{ type: "text", text: summary }],
        details: {
          question,
          sources_found: searchResults.results.length,
          sources_fetched: fetchedContents.length,
          results: searchResults.results,
        },
      };
    },
  });

  console.log("[WebSearch] Extension loaded with Ollama integration");
  console.log("[WebSearch] Tools: web_search, web_fetch, web_qa");
}
