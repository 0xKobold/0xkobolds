/**
 * Cloudflare Browser Rendering Research Skill - v2.0
 *
 * FIXED: Uses correct REST API endpoints:
 * - /content (was /crawl) - Fetch HTML
 * - /screenshot - Capture screenshot  
 * - /pdf - Generate PDF
 * - /markdown - Extract Markdown
 * - /json - Extract structured data with AI
 *
 * Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars
 * Permissions needed: "Browser Rendering - Edit"
 */

import { Skill } from "../src/skills/types";

interface CloudflareResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: string[];
  result?: {
    html?: string;
    markdown?: string;
    screenshot?: string; // base64 PNG
    pdf?: string; // base64 PDF
    json?: unknown;
    title?: string;
    description?: string;
    url?: string;
    links?: Array<{ text: string; url: string }>;
  };
}

interface ResearchOptions {
  url: string;
  mode: "content" | "screenshot" | "pdf" | "markdown" | "json" | "links";
  screenshot?: boolean; // Include screenshot with content
  waitFor?: string | number; // Wait for selector (string) or ms (number)
  userAgent?: string;
  mobile?: boolean; // Mobile viewport
  fullPage?: boolean; // Full page screenshot (default: viewport only)
  saveToObsidian?: boolean;
}

export const cloudflareResearchSkill: Skill = {
  name: "cloudflare_research",
  description: "Research web content using Cloudflare Browser Rendering API (screenshots, PDFs, scraping)",
  risk: "medium",

  toolDefinition: {
    type: "function",
    function: {
      name: "cloudflare_research",
      description: "Extract web content, screenshots, PDFs, or structured data using Cloudflare Browser Rendering. Requires CLOUDFLARE_API_TOKEN env var.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to research/render"
          },
          mode: {
            type: "string",
            enum: ["content", "screenshot", "pdf", "markdown", "json", "links"],
            description: "Mode: content (HTML), screenshot (PNG), pdf (PDF), markdown (text), json (AI-structured data), links (URLs)"
          },
          waitFor: {
            type: ["string", "number"],
            description: "Wait for CSS selector to appear (string) or time in ms (number) before capturing"
          },
          fullPage: {
            type: "boolean",
            description: "Capture full page (screenshot/pdf modes only)",
            default: false
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

  async execute(args: ResearchOptions): Promise<{
    success: boolean;
    data?: CloudflareResponse["result"];
    metadata?: {
      url: string;
      mode: string;
      timestamp: string;
      apiTime?: number;
      savedPath?: string;
    };
    error?: string;
  }> {
    const startTime = Date.now();
    
    // Get credentials from environment
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken) {
      return {
        success: false,
        error: "Missing CLOUDFLARE_API_TOKEN environment variable. Get one at https://dash.cloudflare.com/profile/api-tokens with 'Browser Rendering - Edit' permission."
      };
    }

    // Build endpoint URL
    const baseEndpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId || ""}/browser-rendering`;
    const endpoint = `${baseEndpoint}/${args.mode}`;

    try {
      // Build request body
      const requestBody: Record<string, unknown> = {
        url: args.url,
      };

      // Add optional parameters
      if (args.waitFor) {
        if (typeof args.waitFor === "string") {
          requestBody.wait_for_selector = args.waitFor;
        } else {
          requestBody.wait_for_timeout = args.waitFor;
        }
      }

      if (args.userAgent) {
        requestBody.user_agent = args.userAgent;
      }

      if (args.mobile !== undefined) {
        requestBody.mobile = args.mobile;
      }

      if (args.fullPage !== undefined && (args.mode === "screenshot" || args.mode === "pdf")) {
        requestBody.full_page = args.fullPage;
      }

      // Make API request
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const apiTime = Date.now() - startTime;

      // Check for rate limit or other HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        if (response.status === 429) {
          errorMessage = "Rate limited by Cloudflare. Wait a moment and try again.";
        } else if (response.status === 401) {
          errorMessage = "Invalid API token. Check CLOUDFLARE_API_TOKEN.";
        } else if (response.status === 403) {
          errorMessage = "Missing Browser Rendering permission. Create token with 'Browser Rendering - Edit'.";
        }

        return {
          success: false,
          error: `${errorMessage}\nResponse: ${errorText.slice(0, 200)}`
        };
      }

      // Parse response
      const data: CloudflareResponse = await response.json();

      if (!data.success) {
        const errors = data.errors?.map(e => e.message).join("; ") || "Unknown error";
        return {
          success: false,
          error: `Cloudflare API error: ${errors}`
        };
      }

      // Check for browser time usage header
      const browserTime = response.headers.get("X-Browser-Ms-Used");

      const result = {
        success: true,
        data: data.result,
        metadata: {
          url: args.url,
          mode: args.mode,
          timestamp: new Date().toISOString(),
          apiTime: apiTime,
          browserTime: browserTime ? parseInt(browserTime) : undefined
        }
      };

      // Save to Obsidian if requested
      if (args.saveToObsidian && result.success) {
        try {
          const savedPath = await saveToObsidianVault(result, args);
          result.metadata.savedPath = savedPath;
        } catch (error) {
          console.warn("[CloudflareResearch] Failed to save to Obsidian:", error);
        }
      }

      return result;

    } catch (error) {
      return {
        success: false,
        error: `Request failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

/**
 * Save research results to Obsidian vault
 */
async function saveToObsidianVault(
  result: { data?: CloudflareResponse["result"]; metadata?: { url: string; mode: string; timestamp: string; browserTime?: number } },
  args: ResearchOptions
): Promise<string> {
  const { homedir } = await import("os");
  const { join } = await import("path");
  
  // Build vault path
  const vaultPath = join(homedir(), ".0xkobold", "obsidian_vault", "Research");
  
  // Ensure directory exists
  try {
    await Bun.mkdir(vaultPath, { recursive: true });
  } catch {
    // Directory might already exist
  }
  
  // Generate filename
  const dateStr = new Date().toISOString().split("T")[0];
  const urlHost = new URL(args.url).hostname.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filename = `${dateStr}-${urlHost}-${args.mode}.md`;
  const filepath = join(vaultPath, filename);

  // Build markdown content
  const title = result.data?.title || urlHost;
  const description = result.data?.description || "No description";
  
  let content = `---
url: ${args.url}
date: ${result.metadata?.timestamp}
mode: ${args.mode}
browser_time: ${result.metadata?.browserTime || "unknown"}ms
tags: [research, web, cloudflare${args.mode === "screenshot" ? ", screenshot" : ""}${args.mode === "pdf" ? ", pdf" : ""}]
---

# ${title}

**URL:** ${args.url}  
**Mode:** ${args.mode}  
**Date:** ${result.metadata?.timestamp}  
**Browser Render Time:** ${result.metadata?.browserTime || "unknown"}ms

## Description

${description}

`;

  // Add content based on mode
  if (args.mode === "content" && result.data?.html) {
    content += `## HTML Content

\`\`\`html
${result.data.html.slice(0, 10000)}${result.data.html.length > 10000 ? "\n<!-- Truncated... -->" : ""}
\`\`\`

`;
  } else if (args.mode === "markdown" && result.data?.markdown) {
    content += `## Markdown Content

${result.data.markdown.slice(0, 20000)}

`;
  } else if (args.mode === "json" && result.data?.json) {
    content += `## Extracted Data (JSON)

\`\`\`json
${JSON.stringify(result.data.json, null, 2)}
\`\`\`

`;
  } else if (args.mode === "links" && result.data?.links) {
    content += `## Links Found

| Text | URL |
|------|-----|
${result.data.links.slice(0, 100).map(l => `| ${l.text.slice(0, 50)} | ${l.url} |`).join("\n")}

Total: ${result.data.links.length} links

`;
  } else if (args.mode === "screenshot" && result.data?.screenshot) {
    const imageFilename = `${dateStr}-${urlHost}-screenshot.png`;
    const imagePath = join(vaultPath, imageFilename);
    
    // Save base64 screenshot as file
    const screenshotBuffer = Buffer.from(result.data.screenshot, "base64");
    await Bun.write(imagePath, screenshotBuffer);
    
    content += `## Screenshot

![Screenshot](./${imageFilename})

`;
  } else if (args.mode === "pdf" && result.data?.pdf) {
    const pdfFilename = `${dateStr}-${urlHost}.pdf`;
    const pdfPath = join(vaultPath, pdfFilename);
    
    // Save base64 PDF as file
    const pdfBuffer = Buffer.from(result.data.pdf, "base64");
    await Bun.write(pdfPath, pdfBuffer);
    
    content += `## PDF

Saved: [${pdfFilename}](./${pdfFilename})

`;
  }

  content += `---

*Generated by Cloudflare Browser Rendering API via 0xKobold*
`;

  // Write file
  await Bun.write(filepath, content);
  console.log(`[CloudflareResearch] Saved to Obsidian: ${filename}`);
  
  return filepath;
}

export default cloudflareResearchSkill;
