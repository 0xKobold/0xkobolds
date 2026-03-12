/**
 * Cloudflare Browser Rendering Research Skill
 * 
 * Uses Cloudflare's Browser Rendering API to:
 * - Crawl and extract web content
 * - Take screenshots
 * - Generate PDFs
 * - Execute browser actions
 * 
 * Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars
 */

import { Skill } from "../src/skills/types";

interface CrawlRequest {
  url: string;
  actions?: BrowserAction[];
  screenshot?: boolean;
  pdf?: boolean;
  waitFor?: string | number;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
}

interface BrowserAction {
  type: "click" | "type" | "scroll" | "wait" | "screenshot";
  selector?: string;
  text?: string;
  duration?: number;
  x?: number;
  y?: number;
}

interface CrawlResponse {
  success: boolean;
  html?: string;
  screenshot?: string; // base64
  pdf?: string; // base64
  metadata?: {
    title: string;
    description?: string;
    url: string;
    timestamp: string;
  };
  actions?: Array<{
    type: string;
    success: boolean;
    screenshot?: string;
  }>;
  error?: string;
}

export const cloudflareResearchSkill: Skill = {
  name: "cloudflare_research",
  description: "Research web content using Cloudflare Browser Rendering API",
  risk: "medium",

  toolDefinition: {
    type: "function",
    function: {
      name: "cloudflare_research",
      description: "Crawl websites, take screenshots, and extract content using Cloudflare's browser rendering service. Useful for research, verification, and documentation.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to crawl/research"
          },
          mode: {
            type: "string",
            enum: ["crawl", "screenshot", "pdf", "actions"],
            description: "Research mode: crawl (extract HTML), screenshot (capture page), pdf (generate PDF), actions (execute browser actions)"
          },
          screenshot: {
            type: "boolean",
            description: "Include screenshot in crawl response",
            default: false
          },
          pdf: {
            type: "boolean",
            description: "Generate PDF of page",
            default: false
          },
          waitFor: {
            type: "string",
            description: "Wait for selector or time (ms) before capturing",
          },
          actions: {
            type: "array",
            description: "Browser actions to execute (for mode=actions)",
            items: {
              type: "object",
              properties: {
                type: { 
                  type: "string", 
                  enum: ["click", "type", "scroll", "wait", "screenshot"]
                },
                selector: { type: "string" },
                text: { type: "string" },
                duration: { type: "number" },
                x: { type: "number" },
                y: { type: "number" }
              }
            }
          },
          saveToObsidian: {
            type: "boolean",
            description: "Save results to Obsidian vault",
            default: false
          }
        },
        required: ["url", "mode"]
      }
    }
  },

  async execute(args: {
    url: string;
    mode: "crawl" | "screenshot" | "pdf" | "actions";
    screenshot?: boolean;
    pdf?: boolean;
    waitFor?: string | number;
    actions?: BrowserAction[];
    saveToObsidian?: boolean;
  }): Promise<CrawlResponse> {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken || !accountId) {
      return {
        success: false,
        error: "Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID environment variables"
      };
    }

    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/crawl`;
      
      const requestBody: any = {
        url: args.url,
      };

      if (args.screenshot || args.mode === "screenshot") {
        requestBody.screenshot = true;
      }

      if (args.pdf || args.mode === "pdf") {
        requestBody.pdf = true;
      }

      if (args.waitFor) {
        requestBody.wait_for = args.waitFor;
      }

      if (args.actions && args.mode === "actions") {
        requestBody.actions = args.actions;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(`Cloudflare API error: ${response.status} ${errorData?.errors?.[0]?.message || response.statusText}`);
      }

      const data = await response.json();

      if (!data.result) {
        throw new Error("Invalid response from Cloudflare API");
      }

      const result: CrawlResponse = {
        success: true,
        html: data.result.html,
        screenshot: data.result.screenshot,
        pdf: data.result.pdf,
        metadata: {
          title: data.result.title || "Untitled",
          description: data.result.description,
          url: data.result.url || args.url,
          timestamp: new Date().toISOString()
        },
        actions: data.result.actions
      };

      // Save to Obsidian if requested
      if (args.saveToObsidian && result.success) {
        await saveToObsidianVault(result, args.url);
      }

      return result;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

/**
 * Save research results to Obsidian vault
 */
async function saveToObsidianVault(result: CrawlResponse, url: string): Promise<void> {
  const { homedir } = await import("os");
  const { join } = await import("path");
  
  const vaultPath = join(homedir(), ".0xkobold", "obsidian_vault", "Research");
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `Web-Research-${dateStr}-${Date.now()}.md`;
  
  const content = `# Web Research: ${result.metadata?.title || url}

**URL:** ${url}  
**Date:** ${result.metadata?.timestamp}  
**Source:** Cloudflare Browser Rendering

---

## Content Extract

${result.html ? "HTML content extracted (see source for full)" : "No HTML content"}

## Screenshot

${result.screenshot ? `![Screenshot](data:image/png;base64,${result.screenshot.slice(0, 50)}...)` : "No screenshot"}

## PDF

${result.pdf ? "PDF generated (saved separately)" : "No PDF"}

## Metadata

| Field | Value |
|-------|-------|
| Title | ${result.metadata?.title || "N/A"} |
| Description | ${result.metadata?.description || "N/A"} |
| URL | ${result.metadata?.url || url} |

---

## Tags

#research #web #cloudflare
`;

  try {
    await Bun.write(join(vaultPath, filename), content);
    console.log(`[CloudflareResearch] Saved to Obsidian: ${filename}`);
  } catch (error) {
    console.error("[CloudflareResearch] Failed to save to Obsidian:", error);
  }
}

export default cloudflareResearchSkill;
