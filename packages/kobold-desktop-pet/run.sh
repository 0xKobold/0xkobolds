#!/bin/bash
# Kobold Familiar - Launch Script
# Run this on your main PC to start the familiar

set -e

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Run this script from the kobold-desktop-pet directory"
    exit 1
fi

# Check for gateway URL (default to localhost)
GATEWAY_URL="${GATEWAY_URL:-ws://localhost:7777}"

echo "🐢 Kobold Familiar Launcher"
echo "============================="
echo ""
echo "Gateway: $GATEWAY_URL"
echo ""

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    bun install
fi

# Build if needed
if [ ! -f "dist/main.js" ]; then
    echo "Building..."
    bun run build
fi

# Set environment and launch
export GATEWAY_URL
echo "Starting familiar..."
echo ""
echo "The familiar window should appear on your desktop."
echo "It will connect to the gateway at: $GATEWAY_URL"
echo ""
echo "If running on a different machine than the gateway, set:"
echo "  export GATEWAY_URL=ws://<gateway-ip>:7777"
echo ""

bun run dev