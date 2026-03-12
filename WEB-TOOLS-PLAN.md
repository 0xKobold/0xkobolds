# Unified Web Tools Implementation Plan

## Current State Analysis

### Existing Extension: `websearch-enhanced-extension.ts`
**Location:** `/home/moika/Documents/code/0xKobolds/src/extensions/core/websearch-enhanced-extension.ts`

**Features (FREE - No Auth):**
- `web_search` - DuckDuckGo + SearX (privacy-focused, no API key)
- `web_fetch` - Cascade: fast fetch → readability → Playwright
- `web_research` - Search + fetch combined
- `/deep-fetch` command - Force Playwright for JS sites
- `/web-search-deep` command - Search + fetch top results

**What's Missing:**
- AI synthesis of search results (just raw data)
- Browser rendering screenshots/PDFs (heavy JS sites)
- Smart routing between methods

---

## What Requires API Keys

### pi-web-access (Already Installed)
❌ **Requires:** `PERPLEXITY_API_KEY` or `GEMINI_API_KEY`
- Why: Uses Perplexity AI or Google Gemini for search synthesis
- Cost: Perplexity has free tier, Gemini free tier available
- Why we might skip: You want Ollama integration instead

### Ollama Web Search
✅ **Requires:** `OLLAMA_API_KEY` (free Ollama account)
- Why: Ollama's hosted web search API
- Cost: FREE with Ollama account
- Benefit: Adds AI synthesis without Perplexity/Gemini dependency
- How: `curl https://ollama.com/api/web_search -H "Authorization: Bearer $OLLAMA_API_KEY"`

### Cloudflare Browser Rendering
✅ **Requires:** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
- Why: Server-side browser execution
- Cost: FREE tier (1,000 req/day), then paid
- Benefit: Screenshots, PDFs, better JS support than Playwright
- Endpoints: `/crawl`, `/content`, `/screenshot`, `/pdf`, `/json`

---

## Implementation Plan

### Phase 1: Add Ollama Web Search to Current Extension
**File:** `src/extensions/core/websearch-enhanced-extension.ts`
**Time:** 30 minutes
**Lines:** +150

```typescript
// Add to extension:

// 1. Check for OLLAMA_API_KEY
function hasOllamaKey(): boolean {
  return !!process.env.OLLAMA_API_KEY || existsSync('~/.0xkobold/.env');
}

// 2. Add Ollama web search method
async function searchOllama(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const apiKey = process.env.OLLAMA_API_KEY || loadFromDotEnv('OLLAMA_API_KEY');
  if (!apiKey) return [];
  
  const response = await fetch('https://ollama.com/api/web_search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, max_results: maxResults })
  });
  
  const data = await response.json();
  return data.results.map(r => ({ title: r.title, url: r.url, snippet: r.content }));
}

// 3. Add synthesis tool (NEW)
pi.registerTool({
  name: "web_synthesize",
  label: "Web Synthesis",
  description: "Search web and get AI-synthesized answer (requires OLLAMA_API_KEY)",
  parameters: { /* ... */ },
  async execute(args) {
    // Use Ollama search → return results with synthesis
  }
});

// 4. Modify web_search to use Ollama if available
// Priority: Ollama synthesis (if key) → DuckDuckGo raw results
```

**Result:** Free search gets AI synthesis if Ollama key present

---

### Phase 2: Create Cloudflare Browser Extension
**File:** `src/extensions/core/cloudflare-browser-extension.ts`  
**Time:** 45 minutes
**Lines:** ~300

```typescript
/**
 * Cloudflare Browser Rendering Extension
 * OPT-IN: Only loads if CLOUDFLARE_API_TOKEN in ~/.0xkobold/.env
 */

// Check credentials
function hasCloudflareAuth(): boolean {
  return !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
}

// Base endpoint
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering`;

// Cloudflare endpoints:
// - POST /content - Fetch HTML
// - POST /screenshot - PNG screenshot
// - POST /pdf - PDF generation
// - POST /markdown - Extract markdown
// - POST /json - AI-extracted structured data
// - POST /crawl - Crawl multiple pages

// Register tools only if auth exists
if (hasCloudflareAuth()) {
  pi.registerTool({
    name: "cloudflare_render",
    label: "Browser Render",
    description: "Render webpage with Cloudflare Browser Rendering (screenshot/PDF)",
    parameters: {
      url: { type: "string" },
      mode: { enum: ["screenshot", "pdf", "content", "markdown", "json"] },
      fullPage: { type: "boolean", default: false },
      waitFor: { type: ["string", "number"] }, // selector or ms
    },
    async execute(args) {
      // Call Cloudflare API
      // Save screenshot/PDF to Obsidian if requested
      // Return results
    }
  });
  
  console.log("[CloudflareBrowser] Extension loaded with API access");
} else {
  console.log("[CloudflareBrowser] Skipped - no CLOUDFLARE_API_TOKEN found in ~/.0xkobold/.env");
}
```

**Result:** Browser rendering available if user adds Cloudflare token

---

### Phase 3: Smart Router Commands
**File:** Update `websearch-enhanced-extension.ts`
**Time:** 30 minutes
**Lines:** +200

Add unified commands that route intelligently:

```typescript
// Command: /web "query" - Smart search
pi.registerCommand("web", {
  description: "Smart web search (automatically uses best available method)",
  handler: async (args: string, ctx) => {
    const query = args.trim();
    if (!query) {
      ctx.ui.notify("Usage: /web <query>", "warning");
      return;
    }
    
    // Strategy:
    // 1. If Ollama key exists: Use Ollama for AI synthesis
    // 2. Else: Use DuckDuckGo + SearX (free)
    // 3. If Cloudflare key exists: Can also fetch content if needed
    
    ctx.ui.notify(`🔍 Searching: "${query}"...`, "info");
    
    if (hasOllamaKey()) {
      // Use Ollama for AI synthesis
      const results = await searchOllama(query, 5);
      const summary = await synthesizeWithOllama(results);
      ctx.ui.notify(`✅ Found ${results.length} results (with AI synthesis)`, "success");
    } else {
      // Use free search
      const results = await searchDuckDuckGo(query, 5);
      ctx.ui.notify(`✅ Found ${results.length} results (raw results, add OLLAMA_API_KEY for AI synthesis)`, "success");
    }
  }
});

// Command: /render <url> - Smart rendering
pi.registerCommand("render", {
  description: "Render webpage (uses Cloudflare if available, else Playwright)",
  handler: async (args: string, ctx) => {
    const url = args.trim();
    
    // Strategy:
    // 1. If Cloudflare key: Use Cloudflare (better for JS-heavy sites)
    // 2. Else: Use Playwright (current implementation)
    
    if (hasCloudflareAuth()) {
      // Use Cloudflare Browser Rendering
      const result = await cloudflareRender(url);
      ctx.ui.notify("Rendered with Cloudflare Browser API", "success");
    } else {
      // Use Playwright (existing)
      const result = await cascadeFetch(url, 5000, true);
      ctx.ui.notify("Rendered with local Playwright", "success");
    }
  }
});
```

**Result:** Single commands that adapt to available credentials

---

## File Structure

```
src/
├── extensions/core/
│   ├── websearch-enhanced-extension.ts  (MODIFIED - adds Ollama synthesis)
│   ├── cloudflare-browser-extension.ts    (NEW - optional browser rendering)
│   └── smart-web-router.ts              (OPTIONAL - command routing)
├── utils/
│   └── api-key-checker.ts               (NEW - shared key detection)
```

---

## Dependencies

**No new dependencies needed** - using:
- Built-in `fetch` for Ollama API
- Built-in `fetch` for Cloudflare API
- Existing `playwright` (already installed)
- Existing `Bun` APIs

---

## Testing

### Test 1: No API Keys (Default)
```bash
/web "TypeScript 2024 features"
# Expected: DuckDuckGo results (no AI synthesis)

/render https://example.com
# Expected: Playwright local rendering
```

### Test 2: With OLLAMA_API_KEY
```bash
export OLLAMA_API_KEY="..."

/web "TypeScript 2024 features"
# Expected: Ollama AI synthesis + search results

/web_synthesize <some content>
# Expected: AI summary using Ollama
```

### Test 3: With CLOUDFLARE_API_TOKEN
```bash
# Add to ~/.0xkobold/.env:
# CLOUDFLARE_API_TOKEN=...
# CLOUDFLARE_ACCOUNT_ID=...

/render https://complex-site.com
# Expected: Screenshot or PDF from Cloudflare

/web_pdf https://example.com
# Expected: PDF generated via Cloudflare
```

---

## Migration Path

1. **Immediate:** Current extension keeps working (no changes needed)
2. **Phase 1:** Add Ollama to current extension (enhances free search)
3. **Phase 2:** Add Cloudflare extension (opt-in extra features)
4. **Phase 3:** Add unified commands (user convenience)

---

## Cost Analysis

| Feature | Free Option | Paid Option | Your Choice |
|---------|-------------|-------------|-------------|
| **Web Search** | DuckDuckGo (always free) | Ollama API (free tier) | ✅ Keep free default, option for Ollama |
| **Fetch** | Playwright (always free) | - | ✅ Playwright already works |
| **Render** | Playwright (free) | Cloudflare (1k free/day) | ✅ Playwright default, Cloudflare optional |
| **AI Synthesis** | None | Ollama (free) | ✅ Add Ollama as free option |

**Your setup is optimal**: Free by default, premium features opt-in

---

## Decision Points

1. **Do you have OLLAMA_API_KEY?** 
   - If yes: Add Phase 1 immediately (free AI synthesis)
   - If no: Skip Phase 1, keep current extension

2. **Do you want Cloudflare screenshots/PDFs?**
   - If yes: Add Phase 2 (requires signing up for Cloudflare API)
   - If no: Skip Phase 2, Playwright is sufficient

3. **Want unified commands?**
   - If yes: Add Phase 3 (/web, /render smart commands)
   - If no: Keep current commands (/web_search, /deep-fetch)

---

## Recommended Implementation

**Option: Phase 1 Only (Quick Win)**
- Just add Ollama web search to current extension
- Adds AI synthesis without new dependencies
- Builds on what you already use
- Time: 30 minutes

**Option: Phases 1+2 (Full Coverage)**
- Add Ollama synthesis + Cloudflare rendering
- Complete web toolkit with opt-in premium features
- Time: 75 minutes

**Option: All Phases (Premium)**
- Smart routing, unified commands
- Cleanest UX
- Time: 90 minutes

---

## Next Steps

1. **Decide which phases** you want
2. **Check credentials:**
   - Do you have OLLAMA_API_KEY?
   - Do you want to get CLOUDFLARE_API_TOKEN?
3. I'll implement based on your choice

**Let's proceed?** 🚀