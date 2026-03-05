#!/bin/bash
# 0xKobold Multi-Agent Demo

echo "🐲 0xKobold Multi-Agent System Demo"
echo ""
echo "This will start:"
echo "  1. Gateway (WebSocket server on port 18789)"
echo "  2. TUI (Terminal UI with agent tree)"
echo ""
echo "Features:"
echo "  • Spawn agents: /spawn 'research AI safety'"
echo "  • Spawn swarms: /swarm 5 'analyze code'"
echo "  • View agent tree: /tree"
echo "  • List agents: /agents"
echo ""
echo "Press Enter to start..."
read

cd "$(dirname "$0")"

# Kill existing processes
pkill -f "bun gateway/index.ts" 2>/dev/null
pkill -f "bun tui/index.ts" 2>/dev/null
sleep 1

# Start Gateway
echo "🚀 Starting Gateway..."
bun gateway/index.ts &
GATEWAY_PID=$!
sleep 2

# Check health
if curl -s http://localhost:18789/health > /dev/null; then
    echo "✅ Gateway is running on port 18789"
else
    echo "❌ Gateway failed to start"
    exit 1
fi

# Start TUI
echo "🖥️  Starting TUI..."
echo ""
echo "Commands to try:"
echo "  /spawn research the latest AI papers"
echo "  /swarm 3 analyze this codebase"
echo "  /agents"
echo "  /tree"
echo "  /help"
echo ""
sleep 1

bun tui/index.ts

# Cleanup on exit
echo ""
echo "🛑 Stopping Gateway..."
kill $GATEWAY_PID 2>/dev/null || true

echo "✅ Demo complete"
