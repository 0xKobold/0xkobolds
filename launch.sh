#!/bin/bash
# 0xKobold Launcher - Starts Gateway + TUI automatically

cd "$(dirname "$0")"

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f "bun gateway/index.ts" 2>/dev/null
pkill -f "bun tui/index.ts" 2>/dev/null
lsof -ti:18789 | xargs kill -9 2>/dev/null
sleep 1

# Start Gateway
echo "🚀 Starting Gateway..."
bun gateway/index.ts &
GATEWAY_PID=$!

# Wait for gateway to be ready
echo "⏳ Waiting for Gateway to start..."
for i in {1..10}; do
    if curl -s http://localhost:18789/health > /dev/null 2>&1; then
        echo "✅ Gateway is running on port 18789"
        break
    fi
    sleep 0.5
done

# Check if gateway started
if ! curl -s http://localhost:18789/health > /dev/null 2>&1; then
    echo "❌ Gateway failed to start"
    exit 1
fi

# Start TUI
echo "🖥️  Starting TUI..."
echo ""
sleep 1

bun tui/index.ts

# Cleanup
echo ""
echo "🛑 Stopping Gateway..."
kill $GATEWAY_PID 2>/dev/null || true
pkill -f "bun gateway/index.ts" 2>/dev/null || true

echo "✅ Done"
