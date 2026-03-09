#!/usr/bin/env python3
"""Scrape OpenClaw documentation using Playwright"""

import asyncio
import json
from playwright.async_api import async_playwright

URLS = [
    ("https://docs.openclaw.ai/pi", "pi-integration"),
    ("https://docs.openclaw.ai/concepts/architecture", "architecture"),
    ("https://docs.openclaw.ai/concepts/agent", "agent-runtime"),
    ("https://docs.openclaw.ai/concepts/agent-loop", "agent-loop"),
    ("https://docs.openclaw.ai/concepts/system-prompt", "system-prompt"),
    ("https://docs.openclaw.ai/concepts/context", "context"),
    ("https://docs.openclaw.ai/concepts/agent-workspace", "agent-workspace"),
    ("https://docs.openclaw.ai/concepts/multi-agent", "multi-agent"),
    ("https://docs.openclaw.ai/tools/agent-send", "agent-send"),
    ("https://docs.openclaw.ai/tools/subagents", "subagents"),
    ("https://docs.openclaw.ai/tools/acp-agents", "acp-agents"),
    ("https://docs.openclaw.ai/tools/multi-agent-sandbox-tools", "sandbox-tools"),
]

async def scrape_page(url, name):
    """Scrape a single page"""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        page = await context.new_page()
        
        try:
            print(f"Loading {name}...")
            await page.goto(url, wait_until='networkidle', timeout=60000)
            await page.wait_for_timeout(3000)  # Wait for content to render
            
            # Extract main content
            content = await page.evaluate('''() => {
                const article = document.querySelector('article, main, .content, #content, [role="main"]');
                return article ? article.innerText : document.body.innerText;
            }''')
            
            title = await page.title()
            
            await browser.close()
            
            return {
                'name': name,
                'url': url,
                'title': title,
                'content': content[:10000]  # First 10k chars
            }
        except Exception as e:
            await browser.close()
            return {'name': name, 'url': url, 'error': str(e)}

async def main():
    results = []
    for url, name in URLS:
        result = await scrape_page(url, name)
        results.append(result)
        print(f"✓ {name}: {len(result.get('content', ''))} chars")
    
    # Save results
    output_path = '/home/moika/Documents/code/0xKobolds/docs/openclaw-research.json'
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\nSaved to {output_path}")
    
    # Print summary
    print("\n" + "="*60)
    print("SCRAPING SUMMARY")
    print("="*60)
    for r in results:
        if 'error' in r:
            print(f"❌ {r['name']}: ERROR - {r['error']}")
        else:
            print(f"✓ {r['name']}: {len(r['content'])} chars - {r['title'][:60]}")

if __name__ == "__main__":
    asyncio.run(main())
