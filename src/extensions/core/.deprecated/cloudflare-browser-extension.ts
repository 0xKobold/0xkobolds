/**
 * Cloudflare Browser Rendering Extension for 0xKobold
 * 
 * Provides browser rendering capabilities via Cloudflare Browser Rendering API
 * Opt-in: Only loads if CLOUDFLARE_API_TOKEN exists in ~/.0xkobold/.env
 * 
 * Endpoints:
 * - /crawl - Crawl web content (multi-page)
 * - /content - Fetch HTML from single URL  
 * - /screenshot - Capture screenshot
 * - /pdf - Generate PDF
 * - /markdown - Extract markdown
 * - /json - Extract structured data with AI
 * 
 * Requirements:
 * - CLOUDFLARE_API_TOKEN with "Browser Rendering - Edit" permission
 * - CLOUDFLARE_ACCOUNT_ID from Cloudflare dashboard
 */

import type { ExtensionAPI, AgentToolResult, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { homedir } from "os";
import { join } from "path";

// ============================================================================
// CONFIGURATION (from .env or environment)
// ============================================================================

interface CloudflareConfig {
  apiToken: string | null;
  accountId: string | null;
  enabled: boolean;
}

async function loadConfig(): Promise<CloudflareConfig> {
  // Try environment first, then fallback to ~/.0xkobold/.env
  let apiToken = process.env.CLOUDFLARE_API_TOKEN || null;
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID || null;
  
  // If not in env, try to load from ~/.0xkobold/.env
  if (!apiToken || !accountId) {
    try {
      const envPath = join(homedir(), ".0xkobold", ".env");
      const envFile = Bun.file(envPath);
      
      if (await envFile.exists()) {
        const content = await envFile.text();
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('CLOUDFLARE_API_TOKEN=')) {
            apiToken = trimmed.slice('CLOUDFLARE_API_TOKEN='.length).replace(/^["']|["']$/g, '');
          }
          if (trimmed.startsWith('CLOUDFLARE_ACCOUNT_ID=')) {
            accountId = trimmed.slice('CLOUDFLARE_ACCOUNT_ID='.length).replace(/^["']|["']$/g, '');
          }
        }
      }
    } catch {
      // .env may not exist, that's ok
    }
  }
  
  return {
    apiToken,
    accountId,
    enabled: !!(apiToken && accountId)
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

  /**
   * Crawl web content (async job)
   * Returns job ID immediately, use getCrawlResult to poll
   */
  async crawl(params: CrawlParams): Promise<string> {
    const result = await this.request<{ id: string }>('/crawl', {
      method: 'POST',
      body: JSON.stringify(params)
    });
    return result.id;
  }

  /**
   * Get crawl job results
   */
  async getCrawlResult(jobId: string, limit?: number): Promise<CrawlResult> {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<CrawlResult>(`/crawl/${jobId}${query}`, { method: 'GET' });
  }

  /**
   * Cancel running crawl job
   */
  async cancelCrawl(jobId: string): Promise<void> {
    await this.request(`/crawl/${jobId}`, { method: 'DELETE' });
  }

  /**
   * Fetch single page content
   */
  async fetchContent(url: string, options: ContentOptions): Promise<ContentResult> {
    return this.request<ContentResult>('/content', {
      method: 'POST',
      body: JSON.stringify({ url, ...options })
    });
  }

  /**
   * Take screenshot
   */
  async screenshot(url: string, options: ScreenshotOptions): Promise<ScreenshotResult> {
    return this.request<ScreenshotResult>('/screenshot', {
      method: 'POST',
      body: JSON.stringify({ url, ...options })
    });
  }

  /**
   * Generate PDF
   */
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
  jsonOptions?: JsonOptions;
  maxAge?: number;
  modifiedSince?: number;
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

interface JsonOptions {
  prompt: string;
  response_format?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      properties: Record<string, unknown>;
    };
  };
  custom_ai?: {
    provider: string;
    api_key: string;
    model: string;
  };
}

// ============================================================================
// POLLING HELPER
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
// SAVES TO OBSIDIAN
// ============================================================================

async function saveToObsidian(
  type: 'crawl' | 'screenshot' | 'pdf' | 'content',
  data: unknown,
  sourceUrl: string,
  title?: string
): Promise<string> {
  const vaultPath = join(homedir(), '.0xkobold', 'obsidian_vault', 'Research');
  
  const dateStr = new Date().toISOString().split('T')[0];
  const safeTitle = (title || 'Untitled').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
  
  if (type === 'screenshot' || type === 'pdf') {
    const ext = type === 'screenshot' ? 'png' : 'pdf';
    const base64 = (data as ScreenshotResult | PdfResult)[type === 'screenshot' ? 'screenshot' : 'pdf'];
    const filename = `${dateStr}_${safeTitle}.${ext}`;
    const filepath = join(vaultPath, filename);
    
    await Bun.write(filepath, Buffer.from(base64, 'base64'));
    return filepath;
  } else if (type === 'crawl') {
    const result = data as CrawlResult;
    const filename = `${dateStr}_${safeTitle}_crawl.md`;
    const filepath = join(vaultPath, filename);
    
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
    const filepath = join(vaultPath, filename);
    
    const content = `# ${result.metadata.title}\n\n**Source:** ${result.metadata.url}\n\n---\n\n${result.html}`;
    await Bun.write(filepath, content);
    return filepath;
  }
}

// ============================================================================
// MAIN EXTENSION
// ============================================================================

export default async function cloudflareBrowserExtension(pi: ExtensionAPI): Promise<void> {
  const config = await loadConfig();
  
  if (!config.enabled) {
    console.log('[CloudflareBrowser] Skipped - no CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID');
    return;
  }

  const client = new CloudflareClient(config);
  
  console.log('[CloudflareBrowser] Extension loaded');
  console.log('[CloudflareBrowser] Account:', config.accountId?.slice(0, 8) + '...');

  // ========================================================================
  // TOOL: cloudflare_crawl - Crawl multiple pages
  // ========================================================================
  pi.registerTool({
    name: "cloudflare_crawl",
    label: "/cf_crawl",
    description: "Crawl website with Cloudflare Browser Rendering (multi-page)",
    parameters: Type.Object({
      url: Type.String({ description: "Starting URL to crawl" }),
      limit: Type.Number({ default: 10, description: "Max pages to crawl" }),
      depth: Type.Optional(Type.Number({ description: "Max link depth" })),
      formats: Type.Optional(Type.Array(Type.String({ 
        enum: ["html", "markdown", "json"] 
      }))),
      render: Type.Boolean({ default: true, description: "Execute JavaScript" }),
      saveToObsidian: Type.Boolean({ default: true, description: "Save results" })
    }),
    async execute(
      _toolCallId: string,
      params: { url: string; limit?: number; depth?: number; formats?: string[]; render?: boolean; saveToObsidian?: boolean },
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
          formats: (params.formats as ('html' | 'markdown' | 'json')[]) || ['markdown'],
          render: params.render ?? true
        });

        onUpdate?.({ content: [{ type: "text", text: `📋 Crawl job: ${jobId}` }] });

        const result = await pollCrawlJob(client, jobId, (status, progress) => {
          onUpdate?.({ content: [{ type: "text", text: `${status} (${progress.toFixed(0)}%)` }] });
        });

        let savedPath: string | undefined;
        if (params.saveToObsidian !== false) {
          const firstRecord = result.records[0];
          savedPath = await saveToObsidian('crawl', result, params.url, firstRecord?.metadata?.title);
        }

        const completedPages = result.records.filter(r => r.status === 'completed').length;
        const summary = `✅ Crawl ${result.status}\n📊 Pages: ${completedPages}/${result.total}\n⏱️ Browser: ${result.browserSecondsUsed.toFixed(1)}s` +
          (savedPath ? `\n💾 Saved: ${savedPath.split('/').pop()}` : '');

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
    description: "Take screenshot with Cloudflare Browser Rendering (inline + saved)",
    parameters: Type.Object({
      url: Type.String({ description: "URL to screenshot" }),
      fullPage: Type.Boolean({ default: false, description: "Full page vs viewport" }),
      saveToObsidian: Type.Boolean({ default: true, description: "Save PNG to vault" })
    }),
    async execute(
      _toolCallId: string,
      params: { url: string; fullPage?: boolean; saveToObsidian?: boolean }
    ): Promise<AgentToolResult<any>> {
      try {
        const result = await client.screenshot(params.url, { fullPage: params.fullPage });
        
        let savedPath: string | undefined;
        if (params.saveToObsidian !== false) {
          savedPath = await saveToObsidian('screenshot', result, params.url, result.metadata.title);
        }

        return {
          content: [
            { type: "text" as const, text: `📸 Screenshot: ${result.metadata.title}\n🌐 ${result.metadata.url}` },
            // Inline image for immediate viewing
            { type: "image" as const, data: result.screenshot, mimeType: "image/png" },
            ...(savedPath ? [{ type: "text" as const, text: `💾 Saved to: ${savedPath}` }] : [])
          ],
          details: { 
            title: result.metadata.title, 
            url: result.metadata.url, 
            savedPath,
            imageSize: result.screenshot.length 
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
    description: "Generate PDF from URL and save to Obsidian vault",
    parameters: Type.Object({
      url: Type.String({ description: "URL to convert to PDF" }),
      fullPage: Type.Boolean({ default: true, description: "Include full page" }),
      saveToObsidian: Type.Boolean({ default: true, description: "Save PDF to vault" })
    }),
    async execute(
      _toolCallId: string,
      params: { url: string; fullPage?: boolean; saveToObsidian?: boolean }
    ): Promise<AgentToolResult<any>> {
      try {
        const result = await client.pdf(params.url, { fullPage: params.fullPage });
        
        let savedPath: string | undefined;
        if (params.saveToObsidian !== false) {
          savedPath = await saveToObsidian('pdf', result, params.url, result.metadata.title);
        }

        return {
          content: [
            { type: "text" as const, text: `📄 PDF Generated: ${result.metadata.title}` },
            { type: "text" as const, text: `🌐 Source: ${result.metadata.url}` },
            ...(savedPath ? [
              { type: "text" as const, text: `💾 Saved to: ${savedPath}` },
              { type: "text" as const, text: `📝 Tip: Use file viewer to open the PDF` }
            ] : [])
          ],
          details: { 
            title: result.metadata.title, 
            url: result.metadata.url, 
            savedPath,
            pdfSize: result.pdf.length 
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
  // TOOL: cloudflare_content (single page)
  // ========================================================================
  pi.registerTool({
    name: "cloudflare_content",
    label: "/cf_fetch",
    description: "Fetch rendered HTML with Cloudflare Browser Rendering",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      waitFor: Type.Optional(Type.Union([Type.String(), Type.Number()], { description: "Wait for selector or ms" })),
      saveToObsidian: Type.Boolean({ default: true, description: "Save to Obsidian" })
    }),
    async execute(
      _toolCallId: string,
      params: { url: string; waitFor?: string | number; saveToObsidian?: boolean }
    ): Promise<AgentToolResult<any>> {
      try {
        const result = await client.fetchContent(params.url, { waitFor: params.waitFor });
        
        let savedPath: string | undefined;
        if (params.saveToObsidian !== false) {
          savedPath = await saveToObsidian('content', result, params.url, result.metadata.title);
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

  console.log('[CloudflareBrowser] Tools registered: cloudflare_crawl, cloudflare_screenshot, cloudflare_pdf, cloudflare_content');
}

export { CloudflareClient, loadConfig };
export type { CloudflareConfig, CrawlResult, CrawlParams };
