#!/bin/bash
# Cleanup old code after unified sessions migration
# Run this AFTER verifying unified sessions work correctly

set -e

echo "🧹 Cleaning up old code..."
echo ""

# Files to remove
OLD_FILES=(
  "src/extensions/core/session-manager-extension.ts"
  "src/extensions/core/session-bridge-extension.ts"
  "src/extensions/core/mode-manager-extension.ts"
  "src/extensions/core/context-aware-extension.ts"
)

echo "Files to remove:"
for file in "${OLD_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ❌ $file (exists - will remove)"
  else
    echo "  ✅ $file (already removed)"
  fi
done

echo ""
read -p "Are you sure you want to remove these files? (yes/no) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  echo "❌ Cancelled"
  exit 1
fi

# Backup before removal
BACKUP_DIR=".cleanup-backup-$(date +%s)"
echo "📦 Creating backup at $BACKUP_DIR..."
mkdir -p "$BACKUP_DIR"

for file in "${OLD_FILES[@]}"; do
  if [ -f "$file" ]; then
    cp "$file" "$BACKUP_DIR/"
    rm "$file"
    echo "  ✅ Removed: $file"
  fi
done

echo ""
echo "✅ Cleanup complete!"
echo "📦 Backup saved at: $BACKUP_DIR"
echo ""
echo "To restore: cp $BACKUP_DIR/* src/extensions/core/"
