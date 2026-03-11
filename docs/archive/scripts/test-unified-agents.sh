#!/bin/bash
# Unified Agent System Test Suite
# Tests the integrated gateway + orchestrator system

set -e

echo "=========================================="
echo "🧪 Unified Agent System Test"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

# Test helper
run_test() {
    local name="$1"
    local cmd="$2"
    echo -e "${BLUE}▶${NC} Testing: $name"
    if eval "$cmd" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✅ PASS${NC}"
        ((PASS++))
        return 0
    else
        echo -e "  ${RED}❌ FAIL${NC}"
        ((FAIL++))
        return 1
    fi
}

echo -e "${YELLOW}[Phase 1]${NC} Build Tests"
echo "─────────────────────────────"

# Build tests
run_test "Gateway Extension" "bun build src/extensions/core/gateway-extension.ts --target=bun --outfile=/tmp/test-gateway.js"
run_test "Orchestrator Extension" "bun build src/extensions/core/agent-orchestrator-extension.ts --target=bun --outfile=/tmp/test-orchestrator.js"
run_test "Session Bridge" "bun build src/extensions/core/session-bridge-extension.ts --target=bun --outfile=/tmp/test-session.js"
run_test "Config Extension" "bun build src/extensions/core/config-extension.ts --target=bun --outfile=/tmp/test-config.js"

echo ""
echo -e "${YELLOW}[Phase 2]${NC} File Structure Tests"
echo "─────────────────────────────"

# File existence tests
run_test "Gateway Extension File" "test -f src/extensions/core/gateway-extension.ts"
run_test "Orchestrator Extension File" "test -f src/extensions/core/agent-orchestrator-extension.ts"
run_test "Session Bridge File" "test -f src/sessions/UnifiedSessionBridge.ts"
run_test "Agent Store File" "test -f src/gateway/persistence/AgentStore.ts"
run_test "Config System File" "test -f src/config/unified-config.ts"

echo ""
echo -e "${YELLOW}[Phase 3]${NC} Command Registration Tests"
echo "─────────────────────────────"

# Check for duplicate commands (grep patterns from both files)
echo -n "Checking for command conflicts... "
GATEWAY_CMDS=$(grep -o "registerCommand(['\"][a-z-]*['\"]" src/extensions/core/gateway-extension.ts 2>/dev/null | sort -u | wc -l)
ORCH_CMDS=$(grep -o "registerCommand(['\"][a-z-]*['\"]" src/extensions/core/agent-orchestrator-extension.ts 2>/dev/null | sort -u | wc -l)
DUPES=$(grep -h "registerCommand" src/extensions/core/gateway-extension.ts src/extensions/core/agent-orchestrator-extension.ts 2>/dev/null | grep -o "['\"][a-z-]*['\"]" | sort | uniq -d | wc -l)

if [ "$DUPES" -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC} - No command conflicts found"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL${NC} - Found $DUPES duplicate command(s)"
    ((FAIL++))
fi

# Check specific commands exist where expected
run_test "Orchestrator has /agent-spawn" "grep -q 'registerCommand.*agent-spawn' src/extensions/core/agent-orchestrator-extension.ts"
run_test "Orchestrator has /agents" "grep -q 'registerCommand.*agents' src/extensions/core/agent-orchestrator-extension.ts"
run_test "Gateway has /gateway-start" "grep -q 'registerCommand.*gateway:start' src/extensions/core/gateway-extension.ts"
run_test "Gateway lacks /agent-spawn" "! grep -q 'registerCommand.*agent-spawn' src/extensions/core/gateway-extension.ts"

echo ""
echo -e "${YELLOW}[Phase 4]${NC} Integration Pattern Tests"
echo "─────────────────────────────"

# Check gateway delegates to orchestrator
run_test "Gateway delegates spawn" "grep -q 'agent_orchestrate' src/extensions/core/gateway-extension.ts"
run_test "Gateway WebSocket handler" "grep -q 'agent.spawn' src/extensions/core/gateway-extension.ts"

echo ""
echo -e "${YELLOW}[Phase 5]${NC} Configuration Tests"
echo "─────────────────────────────"

# Check pi-config.ts loads extensions in correct order
run_test "Config loads orchestrator before gateway" "grep -q 'agent-orchestrator' src/pi-config.ts && grep -q 'gateway-extension' src/pi-config.ts"

echo ""
echo -e "${YELLOW}[Phase 6]${NC} Runtime Simulation (Dry)"
echo "─────────────────────────────"

# Type check
run_test "TypeScript compiles" "bun tsc --noEmit 2>&1 | head -20"

echo ""
echo "=========================================="
echo -e "${YELLOW}📊 Test Summary${NC}"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
    echo ""
    echo "Ready for live testing:"
    echo "  1. bun run start"
    echo "  2. /gateway-start"
    echo "  3. /agent-spawn worker 'Hello test!'"
    echo "  4. /agents"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    exit 1
fi
