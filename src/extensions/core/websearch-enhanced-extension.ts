import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { $ } from "bun";
import { parseArgs } from "../command-args.js";
import { existsSync } from "fs";

/**
 * Enhanced Web Search Extension
 * 
 * Provides web search + advanced content extraction using:
 * 1. Standard fetch() for simple sites
 * 2. Playwright for JavaScript-rendered content
 * 3. Trafilatura for article extraction
 * 4. Cascade strategy: fast → detailed
 */

interface ScrapingResult {
  content: string;
  title: string;
  method: string;
  url: string;
}

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ═══════════════════════════════════════════════════════════════
// CONTENT EXTRACTION METHODS (Cascade)
// ═══════════════════════════════════════════════════════════════

/**
 * Method 1: Fast fetch for simple HTML sites
 */
async function fastFetch(url: string, maxLength: number): Promise<ScrapingResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) return null;
    
    const html = await response.text();
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || "Untitled";
    
    // Basic content extraction
    const content = html
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
    
    // Check if content is substantial
    if (content.length < 200) return null;
    
    return { content, title, method: 'fast', url };
  } catch {
    return null;
  }
}

/**
 * Method 2: Playwright scraper for JavaScript-heavy sites
 * Requires Playwright to be installed globally
 */
async function playwrightFetch(url: string, maxLength: number): Promise<ScrapingResult | null> {
  try {
    // Check if playwright is available
    const hasPlaywright = await $`which playwright`.quiet().then(() => true).catch(() => false);
    if (!hasPlaywright) {
      console.log("[WebSearch] Playwright not available, skipping");
      return null;
    }

    // Create temporary Python script for Playwright
    const script = `
import asyncio
from playwright.async_api import async_playwright
import sys

async def scrape():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        page = await context.new_page()
        
        try:
            await page.goto('${url}', wait_until='networkidle', timeout=30000)
            await page.wait_for_timeout(2000)  # Wait for JS to render
            
            # Extract content from main content areas
            content = await page.evaluate('''() => {
                const selectors = [
                    'article', 'main', '.content', '#content',
                    '[role="main"]', '.markdown-body', '.documentation',
                    '.prose', '.article-body'
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) return el.innerText;
                }
                // Fallback to body with excluded elements
                const scripts = document.querySelectorAll('script, style, nav, footer, header, aside');
                scripts.forEach(el => el.remove());
                return document.body.innerText;
            }''')
            
            title = await page.title()
            await browser.close()
            
            result = {'content': content[:${maxLength}], 'title': title, 'method': 'playwright'}
            print(json.dumps(result))
        except Exception as e:
            await browser.close()
            print(json.dumps({'error': str(e)}))

asyncio.run(scrape())
`;
    
    const tempFile = `/tmp/playwright_scrape_${Date.now()}.py`;
    await Bun.write(tempFile, `import json\n` + script);
    
    const result = await $`python3 ${tempFile}`.quiet().catch(() => ({ stdout: "" }));
    
    // Cleanup
    try { await $`rm ${tempFile}`.quiet(); } catch {}
    
    const output = result.stdout?.toString() || "";
    const match = output.match(/\{[^}]+\}/);
    if (!match) return null;
    
    const data = JSON.parse(match[0]);
    if (data.error || !data.content) return null;
    
    return {
      content: data.content,
      title: data.title,
      method: 'playwright',
      url
    };
  } catch (error) {
    console.log("[WebSearch] Playwright fetch failed:", error);
    return null;
  }
}

/**
 * Method 3: Readability-style extraction using Bun/regex
 */
async function readabilityFetch(url: string, maxLength: number): Promise<ScrapingResult | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)' }
    });
    
    if (!response.ok) return null;
    const html = await response.text();
    
    // Try to find article content
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const contentDiv = html.match(/<div[^>]*class="[^"]*(?:content|article|post)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    
    const rawContent = articleMatch?.[1] || mainMatch?.[1] || contentDiv?.[1];
    if (!rawContent) return null;
    
    // Clean the content
    const content = rawContent
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
    
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || "Untitled";
    
    if (content.length < 200) return null;
    
    return { content, title, method: 'readability', url };
  } catch {
    return null;
  }
}

/**
 * CASCADE: Try all methods in order of speed → quality
 */
async function cascadeFetch(url: string, maxLength: number = 5000): Promise<ScrapingResult | null> {
  console.log(`[WebSearch] Starting cascade fetch for ${url}`);
  
  // Level 1: Fast HTML fetch
  console.log("[WebSearch] Trying fast fetch...");
  const fast = await fastFetch(url, maxLength);
  if (fast && fast.content.length > 1000) {
    console.log("[WebSearch] Fast fetch succeeded");
    return fast;
  }
  
  // Level 2: Readability extraction
  console.log("[WebSearch] Trying readability extraction...");
  const readability = await readabilityFetch(url, maxLength);
  if (readability) {
    console.log("[WebSearch] Readability extraction succeeded");
    return readability;
  }
  
  // Level 3: JavaScript rendering with Playwright
  console.log("[WebSearch] Trying Playwright...");
  const playwright = await playwrightFetch(url, maxLength);
  if (playwright) {
    console.log("[WebSearch] Playwright succeeded");
    return playwright;
  }
  
  // Fallback: Return whatever we got from fast fetch
  return fast;
}

// ═══════════════════════════════════════════════════════════════
// SEARCH METHODS
// ═══════════════════════════════════════════════════════════════

async function searchDuckDuckGo(query: string, limit: number): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];
  
  try {
    // Use Lite/DuckDuckGo HTML version
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const html = await $`curl -s -A "Mozilla/5.0 (compatible; SearchBot/1.0)" --max-time 10 ${searchUrl}`.text();
    
    // Parse results
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
    let match;
    
    while ((match = resultRegex.exec(html)) && results.length < limit) {
      const url = match[1].replace(/^\/l\/\?kh=-\d+&u=/, ''); // DuckDuckGo redirect
      const decodedUrl = decodeURIComponent(url);
      const title = match[2].replace(/<[^>]*>/g, '');
      
      if (decodedUrl && title && !decodedUrl.includes('duckduckgo.com')) {
        results.push({ title, url: decodedUrl, snippet: "" });
      }
    }
  } catch (error) {
    console.log("[WebSearch] DuckDuckGo search failed:", error);
  }
  
  return results;
}

async function searchSearX(query: string, limit: number, instance?: string): Promise<WebSearchResult[]> {
  const results: WebSearchResult[] = [];
  const searxInstances = instance ? [instance] : [
    "https://searx.be",
    "https://searx.tiekoetter.com",
    "https://search.sapti.me"
  ];
  
  for (const baseUrl of searxInstances) {
    try {
      const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;
      const response = await fetch(searchUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) continue;
      
      const data: any = await response.json();
      if (data.results) {
        for (const r of data.results.slice(0, limit)) {
          results.push({
            title: r.title || "Untitled",
            url: r.url,
            snippet: r.content || r.abstract || ""
          });
        }
        if (results.length >= limit) break;
      }
    } catch {
      continue;
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════
// ARGUMENT EXTRACTION
// ═══════════════════════════════════════════════════════════════

function extractArg<T = any>(args: any, key: string, defaultVal?: T): T | undefined {
  if (!args) return defaultVal;
  if (args[key] !== undefined) return args[key];
  if (args.parameters?.[key] !== undefined) return args.parameters[key];
  if (Array.isArray(args) && args[0]?.[key] !== undefined) return args[0][key];
  if (args.input?.[key] !== undefined) return args.input[key];
  if (args.arguments?.[key] !== undefined) return args.arguments[key];
  return defaultVal;
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXTENSION
// ═══════════════════════════════════════════════════════════════

export default function enhancedWebSearchExtension(pi: ExtensionAPI) {
  
  // ═══════════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════════
  
  pi.registerCommand("deep-fetch", {
    description: "Fetch JavaScript-rendered content from a URL using Playwright",
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        { name: "url", description: "URL to fetch", required: true },
        { name: "max", description: "Max characters", required: false }
      ]);
      
      const url = parsed.url!;
      const max = parseInt(String(parsed.max)) || 8000;
      
      if (!url?.startsWith("http")) {
        ctx.ui?.notify?.("❌ URL must start with http:// or https://", "error");
        return;
      }
      
      ctx.ui?.notify?.(`🔍 Deep fetching: ${url}`, "info");
      
      const result = await cascadeFetch(url, max);
      
      if (!result) {
        ctx.ui?.notify?.("❌ Failed to fetch content", "error");
        return;
      }
      
      const lines = [
        `📄 ${result.title}`,
        `Method: ${result.method} | Source: ${result.url}`,
        "─────────────────────────────────────────",
        "",
        result.content.slice(0, max),
        result.content.length > max 
          ? `\n... (${result.content.length - max} more chars)` 
          : "",
        "",
        "─────────────────────────────────────────"
      ];
      
      ctx.ui?.notify?.(lines.join("\n"), "info");
    }
  });
  
  pi.registerCommand("web-search-deep", {
    description: "Search web + fetch content from top results",
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        { name: "query", description: "Search query", required: true },
        { name: "results", description: "Number of results", required: false }
      ]);
      
      const query = parsed.query!;
      const numResults = parseInt(String(parsed.results)) || 3;
      
      ctx.ui?.notify?.(`🔍 Searching + fetching: "${query}"`, "info");
      
      // Search
      let results = await searchDuckDuckGo(query, numResults * 2);
      if (results.length < numResults) {
        const searxResults = await searchSearX(query, numResults * 2);
        results = [...results, ...searxResults].slice(0, numResults * 2);
      }
      
      if (results.length === 0) {
        ctx.ui?.notify?.("❌ No search results found", "error");
        return;
      }
      
      // Fetch content from top results
      ctx.ui?.notify?.(`📥 Fetching content from ${Math.min(numResults, results.length)} sources...`, "info");
      
      const fetched: ScrapingResult[] = [];
      for (let i = 0; i < Math.min(numResults, results.length); i++) {
        const r = results[i];
        ctx.ui?.notify?.(`  Fetching ${i + 1}/${numResults}: ${r.title.slice(0, 50)}...`, "info");
        const content = await cascadeFetch(r.url, 3000);
        if (content) fetched.push(content);
      }
      
      // Format output
      const lines = [
        `🔍 Research Results: "${query}"`,
        `Sources: ${fetched.length} / ${results.length} found`,
        "═══════════════════════════════════════════",
        ""
      ];
      
      for (let i = 0; i < fetched.length; i++) {
        const f = fetched[i];
        lines.push(`## ${i + 1}. ${f.title}`);
        lines.push(`Source: ${f.url} | Method: ${f.method}`);
        lines.push("");
        lines.push(f.content.slice(0, 2500));
        lines.push("");
        lines.push("─────────────────────────────────────────");
        lines.push("");
      }
      
      ctx.ui?.notify?.(lines.join("\n"), "info");
    }
  });
  
  // ═══════════════════════════════════════════════════════════════
  // ENHANCED TOOLS
  // ═══════════════════════════════════════════════════════════════
  
  // Replace existing web_fetch with enhanced version
  pi.registerTool({
    // @ts-ignore Tool
    name: "web_fetch",
    label: "Web Fetch",
    description: "Fetch and extract content from a web page. Uses cascade: fast HTML → readability → Playwright for JS sites.",
    // @ts-ignore TSchema
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
        },
        use_playwright: {
          type: "boolean",
          default: false,
          description: "Force use of Playwright for JavaScript-rendered content"
        }
      },
      required: ["url"],
    },
    async execute(toolCallId: string, args: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
      const url = extractArg(args, 'url');
      const max_length = extractArg(args, 'max_length', 5000);
      const use_playwright = extractArg(args, 'use_playwright', false);
      
      if (!url || typeof url !== 'string') {
        return {
          content: [{ type: "text", text: "Invalid URL provided" }],
          details: { error: "invalid_url" },
        };
      }
      
      if (!url.startsWith("http")) {
        return {
          content: [{ type: "text", text: "URL must start with http:// or https://" }],
          details: { error: "invalid_url_scheme" },
        };
      }
      
      let result: ScrapingResult | null;
      
      if (use_playwright) {
        result = await playwrightFetch(url, max_length);
      } else {
        result = await cascadeFetch(url, max_length);
      }
      
      if (!result) {
        return {
          content: [{ type: "text", text: `Failed to fetch content from ${url}` }],
          details: { error: "fetch_failed", url },
        };
      }
      
      return {
        content: [
          { 
            type: "text", 
            text: `# ${result.title}\n\n${result.content}\n\n[Source: ${result.url} | Method: ${result.method}]` 
          },
        ],
        details: {
          url,
          title: result.title,
          method: result.method,
          length: result.content.length,
        },
      };
    },
  });
  
  // Enhanced web search with content fetching
  pi.registerTool({
    // @ts-ignore Tool
    name: "web_search",
    label: "Web Search",
    description: "Search web and optionally fetch content from results. Use for research, documentation lookup, finding code examples.",
    // @ts-ignore Tool parameters schema
    parameters: {
      type: "object",
      properties: {
        query: { 
          type: "string", 
          description: "Search query - be specific"
        },
        limit: { 
          type: "number", 
          default: 5,
          description: "Number of results (1-10)"
        },
        fetch_content: {
          type: "boolean",
          default: false,
          description: "Whether to fetch full content from top results"
        },
        fetch_sources: {
          type: "number",
          default: 3,
          description: "How many sources to fetch content from (if fetch_content is true)"
        }
      },
      required: ["query"],
    },
    async execute(toolCallId: string, args: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
      const query = extractArg(args, 'query');
      const limit = extractArg(args, 'limit', 5);
      const fetch_content = extractArg(args, 'fetch_content', false);
      const fetch_sources = extractArg(args, 'fetch_sources', 3);
      
      if (!query || typeof query !== 'string') {
        return {
          content: [{ type: "text", text: "Invalid search query" }],
          details: { error: "invalid_query" },
        };
      }
      
      // Search
      let results = await searchDuckDuckGo(query, Math.min(limit, 10));
      if (results.length < limit) {
        const searxResults = await searchSearX(query, Math.min(limit, 10));
        results = [...results, ...searxResults].slice(0, limit);
      }
      
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No search results found" }],
          details: { query, error: "no_results" },
        };
      }
      
      // Format basic results
      const basicFormatted = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? "\n   " + r.snippet : ""}`)
        .join("\n\n");
      
      // Optionally fetch content
      if (fetch_content) {
        const fetchedContent: string[] = [];
        for (let i = 0; i < Math.min(fetch_sources, results.length); i++) {
          const result = await cascadeFetch(results[i].url, 3000);
          if (result) {
            fetchedContent.push(`## ${result.title}\n${result.content.slice(0, 2500)}...\n[Source: ${result.url}]`);
          }
        }
        
        return {
          content: [
            { type: "text", text: `Search results for "${query}":\n\n${basicFormatted}` },
            { type: "text", text: `\n\nDetailed content from ${fetchedContent.length} sources:\n\n${fetchedContent.join("\n\n---\n\n")}` }
          ],
          details: {
            query,
            results: results.length,
            fetched: fetchedContent.length,
            urls: results.map(r => r.url),
          },
        };
      }
      
      return {
        content: [
          { type: "text", text: `Search results for "${query}":\n\n${basicFormatted}` }
        ],
        details: {
          query,
          results: results.length,
          urls: results.map(r => r.url),
        },
      };
    },
  });
  
  // Deep research tool
  pi.registerTool({
    // @ts-ignore Tool
    name: "web_research",
    label: "Web Research",
    description: "Deep research: search + fetch content from multiple sources with synthesis. Best for comprehensive answers.",
    // @ts-ignore Tool parameters schema
    parameters: {
      type: "object",
      properties: {
        question: { 
          type: "string", 
          description: "The research question"
        },
        sources: { 
          type: "number", 
          default: 5,
          description: "Number of sources to analyze (1-10)"
        }
      },
      required: ["question"],
    },
    async execute(toolCallId: string, args: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
      const question = extractArg(args, 'question');
      const sources = Math.min(extractArg(args, 'sources', 5), 10);
      
      if (!question) {
        return {
          content: [{ type: "text", text: "Invalid question provided" }],
          details: { error: "invalid_question" },
        };
      }
      
      // Search
      let searchResults = await searchDuckDuckGo(question, sources * 2);
      if (searchResults.length < sources) {
        const searxResults = await searchSearX(question, sources * 2);
        searchResults = [...searchResults, ...searxResults].slice(0, sources * 2);
      }
      
      if (searchResults.length === 0) {
        return {
          content: [{ type: "text", text: `Could not find information about: "${question}"` }],
          details: { question, error: "no_results" },
        };
      }
      
      // Fetch content from sources
      const fetched: ScrapingResult[] = [];
      for (let i = 0; i < Math.min(sources, searchResults.length); i++) {
        const result = await cascadeFetch(searchResults[i].url, 3000);
        if (result) fetched.push(result);
      }
      
      const summary = fetched.length > 0
        ? `Research on: "${question}"\n\n` +
          `Found ${fetched.length} relevant sources:\n\n` +
          fetched.map((c, i) => `## ${i + 1}. ${c.title}\n${c.content.slice(0, 2000)}...\n(Source: ${c.url} | Method: ${c.method})`).join("\n\n---\n\n")
        : `Found ${searchResults.length} search results but could not fetch detailed content:\n\n` +
          searchResults.slice(0, sources).map(r => `- ${r.title}: ${r.url}`).join("\n");
      
      return {
        content: [{ type: "text", text: summary }],
        details: {
          question,
          sources_found: searchResults.length,
          sources_fetched: fetched.length,
          fetched,
        },
      };
    },
  });
  
  console.log("[WebSearch Enhanced] Extension loaded");
  console.log("[WebSearch Enhanced] Tools: web_search, web_fetch, web_research");
  console.log("[WebSearch Enhanced] Commands: /deep-fetch, /web-search-deep");
  console.log("[WebSearch Enhanced] Features: Cascade extraction (fast → readability → Playwright)");
}
