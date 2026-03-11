#!/bin/bash
# Cleanup Dead Code Script
# Removes unused/old extensions that have been superseded

set -e

echo "🧹 Cleaning up dead code from 0xKobold..."
echo ""

EXTENSIONS_DIR="/home/moika/Documents/code/0xKobolds/src/extensions/core"
BACKUP_DIR="/home/moika/Documents/code/0xKobolds/.dead-code-backup/$(date +%Y%m%d-%H%M%S)"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "📦 Backup directory: $BACKUP_DIR"
echo ""

# Files to remove (already identified as dead)
DEAD_FILES=(
    # Old auto-compact (replaced by compaction-safeguard-v2.ts)
    "auto-compact-on-error-extension.ts"
    
    # Old compaction safeguard (not in pi-config, replaced by v2)
    "compaction-safeguard.ts"
    
    # Old session bridge (superseded by UnifiedSessionBridge.ts)
    "session-bridge-extension.ts"
    
    # If these exist (check first):
    # "mode-manager-extension.ts"
    # "context-aware-extension.ts"
    # "session-name-extension.ts"
    # "handoff-extension.ts"
    # "session-manager-extension.ts"
)

MOVED_COUNT=0
for file in "${DEAD_FILES[@]}"; do
    if [ -f "$EXTENSIONS_DIR/$file" ]; then
        echo "🗑️  Moving: $file"
        mv "$EXTENSIONS_DIR/$file" "$BACKUP_DIR/"
        ((MOVED_COUNT++))
    else
        echo "✅ Already gone: $file"
    fi
done

echo ""
echo "📊 Cleanup Summary"
echo "─────────────────"
echo "Files moved: $MOVED_COUNT"
echo "Backup location: $BACKUP_DIR"
echo ""

if [ $MOVED_COUNT -gt 0 ]; then
    echo "⚠️  Files backed up to: $BACKUP_DIR"
    echo "   Review before permanent deletion:"
    echo "   ls -la $BACKUP_DIR"
    echo ""
    echo "To restore if needed:"
    echo "   mv $BACKUP_DIR/FILENAME $EXTENSIONS_DIR/"
    echo ""
fi

echo "✅ Cleanup complete!"
echo ""
echo "Next steps:"
echo "  1. Test build: bun run build"
echo "  2. Test start: bun run start"
echo "  3. If all good, delete backup: rm -rf $BACKUP_DIR"
