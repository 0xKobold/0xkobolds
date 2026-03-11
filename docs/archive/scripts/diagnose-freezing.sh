#!/bin/bash
# Diagnostic script for freezing issues

echo "🔍 0xKobold Performance Diagnostic"
echo "===================================="
echo ""

# Check for resource-heavy processes
echo "📊 Memory Usage:"
free -h | head -2

echo ""
echo "📊 CPU Load:"
uptime

echo ""
echo "🐢 Slow Startup Suspects:"
echo "1. TypeScript compilation (bun build)"
echo "2. Extension loading (24 extensions)"
echo "3. SQLite migrations"
echo "4. Auto-compact extension (error monitoring)"
echo "5. File watchers"

echo ""
echo "⚡ Quick Fixes:"
echo ""
echo "Option A: Use bun watch mode (faster restart)"
echo "  $ bun run --watch src/index.ts"
echo ""
echo "Option B: Disable auto-compact temporarily"
echo "  Edit src/pi-config.ts and comment out:"
echo "    // './src/extensions/core/auto-compact-on-error-extension.ts'"
echo ""
echo "Option C: Test with minimal extensions"
echo "  $ bun run src/index.ts --config ./scripts/minimal-config.ts"
echo ""
echo "Option D: Check extension load times"
echo "  $ time bun run src/index.ts --help 2>&1 | head -20"
echo ""
echo "📁 Logs to check:"
echo "  ~/.0xkobold/logs/ (if exists)"
echo "  /tmp/0xkobold-*.log"
echo ""
