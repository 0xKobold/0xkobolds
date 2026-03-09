#!/bin/bash
#
# 0xKobold VPS Installation Script
#

set -e

echo "🐲 Installing 0xKobold..."

# Install Bun if needed
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Install globally
bun install -g 0xkobold

# Initialize
0xkobold init --quick

echo "✅ Installation complete!"
echo "Run: 0xkobold cron start" 
