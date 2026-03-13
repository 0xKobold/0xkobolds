/**
 * Cloudflare Browser Rendering Extension for pi-coding-agent
 * 
 * Provides browser rendering capabilities via Cloudflare Browser Rendering API
 * Features: web crawling, screenshots, PDF generation, content extraction
 * 
 * Setup:
 * 1. Get API token from Cloudflare dashboard (Browser Rendering - Edit permission)
 * 2. Set environment variables or add to ~/.0xkobold/.env:
 *    CLOUDFLARE_API_TOKEN=your_token
 *    CLOUDFLARE_ACCOUNT_ID=your_account_id
 * 3. Optional: PI_CLOUDFLARE_VAULT=/path/to/obsidian/vault for auto-save
 * 
 * @module @0xkobold/pi-cloudflare-browser
 */

import type { ExtensionAPI, AgentToolResult, ExtensionContext } from "@mariozechner/pi-coding-agent";
// @ts-ignore - TypeBox version compatibility
import { Type } from "@sinclair/typebox";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

// ============================================================================
// CONFIGURATION
// ============================================================================

interface CloudflareConfig {
  apiToken: string | null;
  accountId: string | null;
  enabled: boolean;
  outputPath: string;
}

/**
 * Get output directory with priority:
 * 1. PI_CLOUDFLARE_OUTPUT env var
 * 2. PI_OUTPUT_DIR env var
 * 3. ~/.0xkobold/outputs (if .0xkobold exists)
 * 4. ~/.pi/outputs (fallback)
 */
function getDefaultOutputPath(): string {
  if (process.env.PI_CLOUDFLARE_OUTPUT) {
    return process.env.PI_CLOUDFLARE_OUTPUT;
  }
  if (process.env.PI_OUTPUT_DIR) {
    return process.env.PI_OUTPUT_DIR;
  }
  
  const koboldDir = join(homedir(), ".0xkobold");
  if (existsSync(koboldDir)) {
    return join(koboldDir, "outputs");
  }
  
  return join(homedir(), ".pi", "outputs");
}

/**
 * Load configuration from environment or .env file
 */
async function loadConfig(): Promise<CloudflareConfig> {
  let apiToken = process.env.CLOUDFLARE_API_TOKEN || null;
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID || null;
  let outputPath = getDefaultOutputPath();

  // Fallback to .env file in standard locations
  if (!apiToken || !accountId) {
    const envPaths = [
      join(homedir(), ".0xkobold", ".env"),
      join(homedir(), ".pi", ".env"),
      ".env"
    ];

    for (const envPath of envPaths) {
      try {
        const envFile = Bun.file(envPath);
        if (await envFile.exists()) {
          const content = await envFile.text();
          const lines = content.split('\n');
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('CLOUDFLARE_API_TOKEN=') && !apiToken) {
              apiToken = trimmed.slice('CLOUDFLARE_API_TOKEN='.length).replace(/^["']|["']$/g, '');
            }
            if (trimmed.startsWith('CLOUDFLARE_ACCOUNT_ID=') && !accountId) {
              accountId = trimmed.slice('CLOUDFLARE_ACCOUNT_ID='.length).replace(/^["']|["']$/g, '');
            }
            if (trimmed.startsWith('PI_CLOUDFLARE_VAULT=') && !outputPath) {
              outputPath = trimmed.slice('PI_CLOUDFLARE_VAULT='.length).replace(/^["']|["']$/g, '');
            }
          }
          
          if (apiToken && accountId) break;
        }
      } catch {
        // Continue to next path
      }
    }
  }

  return {
    apiToken,
    accountId,
    enabled: !!(apiToken && accountId),
    outputPath
  };
}

// ============================================================================
// API CLIENT
// ============================================================================

class CloudflareClient {
  private config: CloudflareConfig;
  private baseUrl: string;

  constructor(config: CloudflareConfig) {
    this.config = config;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/browser-rendering`;
  }

  private async request<T>(endpoint: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json() as { success: boolean; errors?: unknown[]; result: T };
    if (!data.success) {
      throw new Error(`Cloudflare API failed: ${JSON.stringify(data.errors)}`);
    }

    return data.result;
  }

  async crawl(params: CrawlParams): Promise<string> {
    const result = await this.request<{ id: string }>('/crawl', {
      method: 'POST',
      body: JSON.stringify(params)
    });
    return result.id;
  }

  async getCrawlResult(jobId: string, limit?: number): Promise<CrawlResult> {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<CrawlResult>(`/crawl/${jobId}${query}`, { method: 'GET' });
  }

  async fetchContent(url: string, options: ContentOptions): Promise<ContentResult> {
    return this.request<ContentResult>('/content', {
      method: 'POST',
      body: JSON.stringify({ url, ...options })
    });
  }

  async screenshot(url: string, options: ScreenshotOptions): Promise<ScreenshotResult> {
    return this.request<ScreenshotResult>('/screenshot', {
      method: 'POST',
      body: JSON.stringify({ url, ...options })
    });
  }

  async pdf(url: string, options: PdfOptions): Promise<PdfResult> {
    return this.request<PdfResult>('/pdf', {
      method: 'POST',
      body: JSON.stringify({ url, ...options })
    });
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface CrawlParams {
  url: string;
  limit?: number;
  depth?: number;
  source?: 'all' | 'sitemaps' | 'links';
  formats?: ('html' | 'markdown' | 'json')[];
  render?: boolean;
  maxAge?: number;
  options?: {
    includeExternalLinks?: boolean;
    includeSubdomains?: boolean;
    includePatterns?: string[];
    excludePatterns?: string[];
  };
}

interface CrawlResult {
  id: string;
  status: 'running' | 'completed' | 'cancelled_due_to_timeout' | 'cancelled_due_to_limits' | 'cancelled_by_user' | 'errored';
  browserSecondsUsed: number;
  total: number;
  finished: number;
  records: CrawlRecord[];
  cursor?: string;
}

interface CrawlRecord {
  url: string;
  status: 'queued' | 'completed' | 'disallowed' | 'skipped' | 'errored' | 'cancelled';
  html?: string;
  markdown?: string;
  json?: unknown;
  metadata: {
    status: number;
    title: string;
    url: string;
  };
}

interface ContentOptions {
  waitFor?: string | number;
  userAgent?: string;
}

interface ContentResult {
  html: string;
  metadata: {
    status: number;
    title: string;
    url: string;
    contentType: string;
  };
}

interface ScreenshotOptions {
  fullPage?: boolean;
  waitFor?: string | number;
  userAgent?: string;
  mobile?: boolean;
}

interface ScreenshotResult {
  screenshot: string;
  metadata: {
    status: number;
    title: string;
    url: string;
  };
}

interface PdfOptions {
  fullPage?: boolean;
  waitFor?: string | number;
  userAgent?: string;
}

interface PdfResult {
  pdf: string;
  metadata: {
    status: number;
    title: string;
    url: string;
  };
}

// ============================================================================
// POLLING HELPERS
// ============================================================================

async function pollCrawlJob(
  client: CloudflareClient,
  jobId: string,
  onUpdate?: (status: string, progress: number) => void
): Promise<CrawlResult> {
  const maxAttempts = 180;
  const delayMs = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    const result = await client.getCrawlResult(jobId, 1);

    onUpdate?.(result.status, result.finished / result.total * 100 || 0);

    if (result.status !== 'running') {
      return client.getCrawlResult(jobId);
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error('Crawl job did not complete within 15 minute timeout');
}

// ============================================================================
// OUTPUT HELPERS
// ============================================================================

function getOutputPath(config: CloudflareConfig, subdir?: string): string {
  // Priority: env var > pi config > default
  const basePath = config.outputPath || 
                   process.env.PI_OUTPUT_DIR ||
                   join(homedir(), '.0xkobold', 'outputs');
  
  const path = subdir ? join(basePath, subdir) : basePath;
  
  // Ensure directory exists
  try {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  } catch {
    // Fallback to temp if no permissions
    return join('/tmp', 'pi-cloudflare', subdir || '');
  }
  
  return path;
}

async function saveOutput(
  config: CloudflareConfig,
  type: 'crawl' | 'screenshot' | 'pdf' | 'content',
  data: unknown,
  sourceUrl: string,
  title?: string
): Promise<string | null> {
  try {
    const outputPath = getOutputPath(config, type === 'crawl' ? 'crawls' : type === 'screenshot' ? 'screenshots' : 'pdfs');
    const dateStr = new Date().toISOString().split('T')[0];
    const safeTitle = (title || 'Untitled').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);

    if (type === 'screenshot' || type === 'pdf') {
      const ext = type === 'screenshot' ? 'png' : 'pdf';
      const base64 = (data as ScreenshotResult | PdfResult)[type === 'screenshot' ? 'screenshot' : 'pdf'];
      const filename = `${dateStr}_${safeTitle}.${ext}`;
      const filepath = join(outputPath, filename);
      
      await Bun.write(filepath, Buffer.from(base64, 'base64'));
      return filepath;
    } else if (type === 'crawl') {
      const result = data as CrawlResult;
      const filename = `${dateStr}_${safeTitle}_crawl.md`;
      const filepath = join(outputPath, filename);
      
      let content = `# Crawled: ${title || sourceUrl}\n\n`;
      content += `**Source:** ${sourceUrl}\n`;
      content += `**Date:** ${dateStr}\n`;
      content += `**Pages:** ${result.finished}/${result.total}\n`;
      content += `**Status:** ${result.status}\n\n`;
      content += `---\n\n`;
      
      for (const record of result.records.slice(0, 50)) {
        if (record.markdown || record.html) {
          content += `## ${record.metadata.title}\n`;
          content += `**URL:** ${record.url}\n`;
          content += `**Status:** ${record.status} (${record.metadata.status})\n\n`;
          content += record.markdown || record.html?.slice(0, 5000) || '(no content)';
          content += `\n\n---\n\n`;
        }
      }
      
      await Bun.write(filepath, content);
      return filepath;
    } else {
      const result = data as ContentResult;
      const filename = `${dateStr}_${safeTitle}.md`;
      const filepath = join(outputPath, filename);
      
      const content = `# ${result.metadata.title}\n\n**Source:** ${result.metadata.url}\n\n---\n\n${result.html}`;
      await Bun.write(filepath, content);
      return filepath;
    }
  } catch (error) {
    console.log(`[CloudflareBrowser] Could not save output: ${error}`);
    return null;
  }
}

// ============================================================================
// MAIN EXTENSION
// ============================================================================

/**
 * Cloudflare Browser Rendering Extension
 * 
 * @param pi - ExtensionAPI from pi-coding-agent
 */
export default async function cloudflareBrowserExtension(pi: ExtensionAPI): Promise<void> {
  const config = await loadConfig();
  
  if (!config.enabled) {
    console.log('[CloudflareBrowser] Extension not loaded - CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required');
    console.log('[CloudflareBrowser] Set environment variables or add to ~/.0xkobold/.env');
    return;
  }

  const client = new CloudflareClient(config);
  
  console.log('[CloudflareBrowser] Extension loaded 🌐');
  console.log('[CloudflareBrowser] Account:', config.accountId?.slice(0, 8) + '...');

  // ========================================================================
  // TOOL: cloudflare_crawl
  // ========================================================================
  pi.registerTool({
    name: "cloudflare_crawl",
    label: "/cf_crawl",
    description: "Crawl website with Cloudflare Browser Rendering (multi-page)",
    // @ts-ignore - TypeBox version compatibility
    parameters: Type.Object({
      url: Type.String({ description: "Starting URL to crawl" }),
      limit: Type.Number({ default: 10, description: "Max pages to crawl" }),
      depth: Type.Optional(Type.Number({ description: "Max link depth" })),
      render: Type.Boolean({ default: true, description: "Execute JavaScript" }),
      saveOutput: Type.Boolean({ default: true, description: "Save results to file" })
    }),
    async execute(
      _toolCallId: string,
      params: { url: string; limit?: number; depth?: number; render?: boolean; saveOutput?: boolean },
      _signal: AbortSignal,
      onUpdate: any,
      _ctx: ExtensionContext
    ): Promise<AgentToolResult<any>> {
      try {
        onUpdate?.({ content: [{ type: "text", text: `🕸️ Starting crawl of ${params.url}...` }] });

        const jobId = await client.crawl({
          url: params.url,
          limit: params.limit || 10,
          depth: params.depth,
          formats: ['markdown'],
          render: params.render ?? true
        });

        onUpdate?.({ content: [{ type: "text", text: `📋 Crawl job: ${jobId}` }] });

        const result = await pollCrawlJob(client, jobId, (status, progress) => {
          onUpdate?.({ content: [{ type: "text", text: `${status} (${progress.toFixed(0)}%)` }] });
        });

        let savedPath: string | null = null;
        if (params.saveOutput !== false) {
          const firstRecord = result.records[0];
          savedPath = await saveOutput(config, 'crawl', result, params.url, firstRecord?.metadata?.title);
        }

        const completedPages = result.records.filter(r => r.status === 'completed').length;
        const summary = `✅ Crawl ${result.status}\n📊 Pages: ${completedPages}/${result.total}\n⏱️ Browser: ${result.browserSecondsUsed.toFixed(1)}s` +
          (savedPath ? `\n💾 Saved: ${savedPath}` : '');

        return {
          content: [{ type: "text" as const, text: summary }],
          details: { jobId, status: result.status, total: result.total, savedPath }
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `❌ ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: String(error) }
        };
      }
    }
  });

  // ========================================================================
  // TOOL: cloudflare_screenshot
  // ========================================================================
  pi.registerTool({
    name: "cloudflare_screenshot",
    label: "/cf_screenshot",
    description: "Take screenshot with Cloudflare Browser Rendering",
    // @ts-ignore - TypeBox version compatibility
    parameters: Type.Object({
      url: Type.String({ description: "URL to screenshot" }),
      fullPage: Type.Boolean({ default: false, description: "Full page vs viewport" }),
      saveOutput: Type.Boolean({ default: true, description: "Save PNG to outputs" })
    }),
    async execute(
      _toolCallId: string,
      params: { url: string; fullPage?: boolean; saveOutput?: boolean }
    ): Promise<AgentToolResult<any>> {
      try {
        const result = await client.screenshot(params.url, { fullPage: params.fullPage });
        
        let savedPath: string | null = null;
        if (params.saveOutput !== false) {
          savedPath = await saveOutput(config, 'screenshot', result, params.url, result.metadata.title);
        }

        return {
          content: [
            { type: "text" as const, text: `📸 Screenshot: ${result.metadata.title}\n🌐 ${result.metadata.url}` },
            { type: "image" as const, data: result.screenshot, mimeType: "image/png" },
            ...(savedPath ? [{ type: "text" as const, text: `💾 Saved to: ${savedPath}` }] : [])
          ],
          details: { 
            title: result.metadata.title, 
            url: result.metadata.url, 
            savedPath
          }
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `❌ ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: String(error) }
        };
      }
    }
  });

  // ========================================================================
  // TOOL: cloudflare_pdf
  // ========================================================================
  pi.registerTool({
    name: "cloudflare_pdf",
    label: "/cf_pdf", 
    description: "Generate PDF from URL using Cloudflare Browser Rendering",
    // @ts-ignore - TypeBox version compatibility
    parameters: Type.Object({
      url: Type.String({ description: "URL to convert to PDF" }),
      fullPage: Type.Boolean({ default: true, description: "Include full page" }),
      saveOutput: Type.Boolean({ default: true, description: "Save PDF to outputs" })
    }),
    async execute(
      _toolCallId: string,
      params: { url: string; fullPage?: boolean; saveOutput?: boolean }
    ): Promise<AgentToolResult<any>> {
      try {
        const result = await client.pdf(params.url, { fullPage: params.fullPage });
        
        let savedPath: string | null = null;
        if (params.saveOutput !== false) {
          savedPath = await saveOutput(config, 'pdf', result, params.url, result.metadata.title);
        }

        return {
          content: [
            { type: "text" as const, text: `📄 PDF Generated: ${result.metadata.title}` },
            { type: "text" as const, text: `🌐 Source: ${result.metadata.url}` },
            ...(savedPath ? [
              { type: "text" as const, text: `💾 Saved to: ${savedPath}` }
            ] : [])
          ],
          details: { 
            title: result.metadata.title, 
            url: result.metadata.url, 
            savedPath
          }
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `❌ ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: String(error) }
        };
      }
    }
  });

  // ========================================================================
  // TOOL: cloudflare_content
  // ========================================================================
  pi.registerTool({
    name: "cloudflare_content",
    label: "/cf_fetch",
    description: "Fetch rendered HTML with Cloudflare Browser Rendering",
    // @ts-ignore - TypeBox version compatibility
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      waitFor: Type.Optional(Type.Union([Type.String(), Type.Number()], { description: "Wait for selector or ms" })),
      saveOutput: Type.Boolean({ default: false, description: "Save to file" })
    }),
    async execute(
      _toolCallId: string,
      params: { url: string; waitFor?: string | number; saveOutput?: boolean }
    ): Promise<AgentToolResult<any>> {
      try {
        const result = await client.fetchContent(params.url, { waitFor: params.waitFor });
        
        let savedPath: string | null = null;
        if (params.saveOutput) {
          savedPath = await saveOutput(config, 'content', result, params.url, result.metadata.title);
        }

        return {
          content: [
            { 
              type: "text" as const, 
              text: `📄 ${result.metadata.title}\nStatus: ${result.metadata.status}\n\n${result.html.slice(0, 3000)}${result.html.length > 3000 ? '...' : ''}`
            }
          ],
          details: { metadata: result.metadata, savedPath }
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `❌ ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: String(error) }
        };
      }
    }
  });

  console.log('[CloudflareBrowser] Tools registered:');
  console.log('  • /cf_crawl - Multi-page web crawling');
  console.log('  • /cf_screenshot - Capture screenshots (inline + saved)');
  console.log('  • /cf_pdf - Generate PDFs from URLs');
  console.log('  • /cf_fetch - Single page content extraction');
}

export { CloudflareClient, loadConfig };
export type { CloudflareConfig, CrawlResult, CrawlParams, ScreenshotResult, PdfResult, ContentResult };