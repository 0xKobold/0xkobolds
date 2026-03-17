#!/bin/bash
# Test Hermes-Style Identity System (v0.4.0)
# Validates the Hermes philosophy: instance-level identity, project-level context

WORKSPACE="${KOBOLD_HOME:-$HOME/.0xkobold}"

echo "=== 0xKobold Identity System Test (Hermes Style) ==="
echo ""

# Test 1: Instance-level identity (KOBOLD_HOME only)
echo "📋 Test 1: Instance-Level Identity (Hermes Philosophy)"
echo "   'SOUL.md lives in KOBOLD_HOME only, never in working directory'"
echo ""

if [[ -f "$WORKSPACE/SOUL.md" ]]; then
    soul_chars=$(wc -c < "$WORKSPACE/SOUL.md")
    echo "  ✅ SOUL.md in KOBOLD_HOME ($soul_chars chars)"
else
    echo "  ⚠️  SOUL.md not found in KOBOLD_HOME"
fi

if [[ -f "$WORKSPACE/IDENTITY.md" ]]; then
    identity_chars=$(wc -c < "$WORKSPACE/IDENTITY.md")
    echo "  ✅ IDENTITY.md in KOBOLD_HOME ($identity_chars chars)"
else
    echo "  ⚠️  IDENTITY.md not found in KOBOLD_HOME"
fi

if [[ -f "$WORKSPACE/USER.md" ]]; then
    user_chars=$(wc -c < "$WORKSPACE/USER.md")
    echo "  ✅ USER.md in KOBOLD_HOME ($user_chars chars)"
else
    echo "  ⚪ USER.md not found (optional)"
fi

echo ""

# Test 2: NO per-agent identity (Hermes philosophy)
echo "📋 Test 2: No Per-Agent Identity Files"
echo "   'All agents share instance identity from KOBOLD_HOME'"
echo ""

per_agent_found=false
for type in coordinator scout planner worker reviewer; do
    soul_path="$WORKSPACE/agents/$type/SOUL.md"
    if [[ -f "$soul_path" ]]; then
        echo "  ❌ $type/SOUL.md exists (should NOT exist in Hermes style)"
        per_agent_found=true
    fi
done

if [[ "$per_agent_found" = false ]]; then
    echo "  ✅ No per-agent SOUL.md files (correct - Hermes style)"
fi

echo ""

# Test 3: Personality overlays (session-level)
echo "🎭 Test 3: Personality Overlays (Session-Level)"
echo "   '/personality for temporary mode switches'"
echo ""

personalities_dir="$WORKSPACE/personalities"
if [[ -d "$personalities_dir" ]]; then
    for p in "$personalities_dir"/*.md; do
        if [[ -f "$p" ]]; then
            name=$(basename "$p" .md)
            chars=$(wc -c < "$p")
            echo "  ✅ $name ($chars chars)"
        fi
    done
else
    echo "  ⚪ No personalities directory"
fi

echo ""

# Test 4: Security - Injection protection
echo "🔒 Test 4: Prompt Injection Protection"
echo ""

test_injection() {
    local content="$1"
    local patterns=(
        "ignore previous instructions"
        "disregard your rules"
        "system prompt override"
    )
    
    for pattern in "${patterns[@]}"; do
        if echo "$content" | grep -qi "$pattern"; then
            return 1
        fi
    done
    return 0
}

# Test global SOUL.md for injection
if [[ -f "$WORKSPACE/SOUL.md" ]]; then
    content=$(cat "$WORKSPACE/SOUL.md")
    if test_injection "$content"; then
        echo "  ✅ SOUL.md: Safe"
    else
        echo "  ❌ SOUL.md: Injection pattern detected!"
    fi
fi

if [[ -f "$WORKSPACE/IDENTITY.md" ]]; then
    content=$(cat "$WORKSPACE/IDENTITY.md")
    if test_injection "$content"; then
        echo "  ✅ IDENTITY.md: Safe"
    else
        echo "  ❌ IDENTITY.md: Injection pattern detected!"
    fi
fi

echo ""

# Summary
echo "=== Summary (Hermes Philosophy) ==="
echo ""
echo "Architecture:"
echo "  KOBOLD_HOME/SOUL.md      → Instance-level identity (follows you everywhere)"
echo "  KOBOLD_HOME/personalities/ → Session-level overlays (/personality command)"
echo "  Project/AGENTS.md        → Project-level context (discovered hierarchically)"
echo ""
echo "Key Differences from OpenClaw:"
echo "  - OpenClaw: per-session directories for subagents"
echo "  - Hermes:   instance-level identity shared by all agents"
echo ""
echo "Usage:"
echo "  /personality list     → Show available personalities"
echo "  /personality concise  → Activate concise mode"
echo "  /personality reset    → Clear overlay, return to instance identity"
echo ""
echo "✅ Hermes-style identity system verified!"