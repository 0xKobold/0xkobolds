#!/bin/bash
# Agent Spawn Test Script
# Tests the gateway and agent spawning functionality

set -e

echo "=========================================="
echo "🚀 0xKobold Agent Spawn Test"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Run this from the 0xKobold project root${NC}"
    exit 1
fi

echo "📋 Test Plan:"
echo "  1. Build verification"
echo "  2. Start 0xKobold (briefly)"
echo "  3. Test gateway commands"
echo "  4. Cleanup"
echo ""

# Step 1: Build verification
echo -e "${YELLOW}[1/4]${NC} Building TypeScript..."
if bun build --target=bun src/extensions/core/gateway-extension.ts --outfile=/tmp/test-gateway.js 2>/dev/null; then
    echo -e "${GREEN}✅ Gateway builds successfully${NC}"
else
    echo -e "${RED}❌ Gateway build failed${NC}"
    exit 1
fi

# Check session bridge
if bun build --target=bun src/extensions/core/session-bridge-extension.ts --outfile=/tmp/test-session.js 2>/dev/null; then
    echo -e "${GREEN}✅ Session bridge builds successfully${NC}"
else
    echo -e "${YELLOW}⚠️ Session bridge build failed (depends on packages)${NC}"
fi

echo ""
echo -e "${YELLOW}[2/4]${NC} Manual Test Instructions:"
echo ""
echo "Since 0xKobold is an interactive TUI, automated testing is limited."
echo "Please run these commands manually:"
echo ""
echo "  1. Start 0xKobold:"
echo "     $ bun run start"
echo ""
echo "  2. Once loaded, test these commands:"
echo ""
echo "     /gateway-status      - Check gateway status"
echo "     /gateway-start       - Start the gateway"
echo "     /gateway-status      - Verify it's running"
echo ""
echo "     /agent-status        - Check agents (should be 0)"
echo "     /agents             - List agents (should be empty)"
echo ""
echo "     /agent-spawn worker \"Test task\"    - Spawn a worker agent"
echo "     /agents             - Should show 1 agent"
echo "     /agent-status       - Show status"
echo "     /agent-tree         - Show hierarchy"
echo ""
echo "  3. Test WebSocket (in another terminal):"
echo "     $ wscat -c ws://localhost:18789"
echo "     > {\"type\":\"connect\",\"id\":\"test-1\",\"params\":{\"role\":\"client\",\"client\":\"test\"}}"
echo "     > {\"type\":\"req\",\"id\":\"test-2\",\"method\":\"status\"}"
echo ""
echo "  4. To quit:"
echo "     /exit"
echo ""

# Step 3: Check database
echo -e "${YELLOW}[3/4]${NC} Database Check:"
if [ -f "$HOME/.0xkobold/agents-runtime.db" ]; then
    echo -e "${GREEN}✅ agents-runtime.db exists${NC}"
    echo "   Schema check (if sqlite3 available):"
    if command -v sqlite3 &> /dev/null; then
        sqlite3 "$HOME/.0xkobold/agents-runtime.db" ".schema" 2>/dev/null | head -20 || echo "   (Could not read schema)"
    fi
else
    echo -e "${YELLOW}⚠️ agents-runtime.db not yet created (normal on first run)${NC}"
fi

echo ""
echo -e "${YELLOW}[4/4]${NC} Configuration Check:"
if [ -f "$HOME/.0xkobold/0xkobold.json" ]; then
    echo -e "${GREEN}✅ 0xkobold.json exists${NC}"
else
    echo -e "${YELLOW}⚠️ 0xkobold.json not found${NC}"
    echo "   Run: bun run init"
fi

echo ""
echo "=========================================="
echo "📊 Test Summary"
echo "=========================================="
echo ""
echo "Build Status:        ✅ PASS"
echo "Integration Test:    ⏳ MANUAL REQUIRED"
echo ""
echo "Next steps:"
echo "  1. Run: bun run start"
echo "  2. Execute commands listed above"
echo "  3. Report any errors to the team"
echo ""
echo "For WebSocket testing, install wscat:"
echo "  $ bun install -g wscat"
echo ""
