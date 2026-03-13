# 🌐 Pi Cloudflare Browser

Cloudflare Browser Rendering for [pi-coding-agent](https://github.com/marioechler/pi-coding-agent).

Web scraping, screenshots, and PDF generation via Cloudflare's Browser Rendering API.

## Features

- 🕷️ **Web crawling** - Multi-page with depth control
- 📸 **Screenshots** - Inline display + saved files
- 📄 **PDF generation** - From any URL
- 📄 **Content extraction** - Rendered HTML/Markdown
- 🎯 **Standalone** - Works without 0xKobold
- 🔌 **Integrable** - Exposes client for custom use

## Installation

```bash
# Via pi CLI
pi install npm:@0xkobold/pi-cloudflare-browser

# Or in pi-config.ts
extensions: ['npm:@0xkobold/pi-cloudflare-browser']
```

## Setup

1. **Get Cloudflare credentials**:
   - Account ID: https://dash.cloudflare.com (right sidebar)
   - API Token: My Profile → API Tokens → Create → "Browser Rendering" template

2. **Configure**:
```bash
export CLOUDFLARE_API_TOKEN=your_token
export CLOUDFLARE_ACCOUNT_ID=your_account_id
export PI_OUTPUT_DIR=./outputs  # Optional: where to save files
```

## Usage

### Standalone

```typescript
import { CloudflareClient, loadConfig } from '@0xkobold/pi-cloudflare-browser';

// Load from env
const config = await loadConfig();
const client = new CloudflareClient(config);

// Take screenshot
const result = await client.screenshot('https://example.com', { fullPage: true });
// result.screenshot = base64 image
// result.metadata = { title, url, status }

// Crawl website
const crawlId = await client.crawl({
  url: 'https://example.com',
  limit: 10,
  render: true,
});

// Get crawl results
const crawl = await client.getCrawlResult(crawlId);
```

### With pi-coding-agent

```typescript
// Extension auto-registers tools:
// /cf_crawl      - Multi-page crawling
// /cf_screenshot - Capture screenshot
// /cf_pdf        - Generate PDF
// /cf_fetch      - Single page content
```

## Tools

| Tool | Description | Example |
|------|-------------|---------|
| `/cf_crawl` | Crawl multiple pages | `/cf_crawl url:https://example.com limit:20` |
| `/cf_screenshot` | Screenshot (shows inline) | `/cf_screenshot url:https://example.com fullPage:true` |
| `/cf_pdf` | Generate PDF | `/cf_pdf url:https://example.com` |
| `/cf_fetch` | Fetch rendered content | `/cf_fetch url:https://example.com` |

## API

### `CloudflareClient`

```typescript
class CloudflareClient {
  async crawl(params: CrawlParams): Promise<string>;      // Returns job ID
  async getCrawlResult(jobId: string): Promise<CrawlResult>;
  async screenshot(url: string, opts?: ScreenshotOptions): Promise<ScreenshotResult>;
  async pdf(url: string, opts?: PdfOptions): Promise<PdfResult>;
  async fetchContent(url: string, opts?: ContentOptions): Promise<ContentResult>;
}
```

### Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | ✅ | Account API token |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Account ID |
| `PI_OUTPUT_DIR` | - | Save directory |
| `PI_CLOUDFLARE_VAULT` | - | Obsidian vault path |

## Standalone Example

```typescript
// screenshot.ts - No pi-coding-agent needed
import { CloudflareClient, loadConfig } from '@0xkobold/pi-cloudflare-browser';

async function main() {
  const config = await loadConfig();
  if (!config.enabled) {
    console.log('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID');
    return;
  }

  const client = new CloudflareClient(config);
  
  const result = await client.screenshot('https://example.com', {
    fullPage: true,
  });

  // Save to file
  await Bun.write('screenshot.png', Buffer.from(result.screenshot, 'base64'));
  console.log('Saved!');
}

main();
```

## Links

- [GitHub](https://github.com/0xKobold/pi-cloudflare-browser)
- [Cloudflare Browser Rendering Docs](https://developers.cloudflare.com/browser-rendering/)

## License

MIT