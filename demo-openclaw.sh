#!/bin/bash
# Demo script for OpenClaw-style TUI

echo "Starting 0xKobold OpenClaw TUI Demo..."
echo ""
echo "This will start:"
echo "  1. The daemon (if not running)"
echo "  2. The OpenClaw-style TUI"
echo ""
echo "Features:"
echo "  - Header with connection, agent, session"
echo "  - Chat log with colors"
echo "  - Status line showing connection state"
echo "  - Footer with agent/session/model/settings"
echo "  - Slash commands: /help, /status, /agent, /session, /quit"
echo "  - Keyboard shortcuts: Ctrl+?, Ctrl+L, Ctrl+G, Ctrl+P, Ctrl+T"
echo "  - Local shell: !command"
echo ""
echo "Press Enter to continue..."
read

cd "$(dirname "$0")"

# Check if daemon is running
if ! bun cli/index.ts daemon status > /dev/null 2>&1; then
    echo "Starting daemon..."
    bun cli/index.ts daemon start
    sleep 2
fi

# Start TUI
echo "Starting TUI..."
bun tui/openclaw.ts
