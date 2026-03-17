#!/bin/bash
# Auto-update 0xKobold from Gitea
# Runs at 3am daily via cron

set -e
LOG="/mnt/5tb/logs/auto-update.log"
DATE=$(date "+%Y-%m-%d %H:%M:%S")

echo "[$DATE] Starting auto-update..." >> $LOG

cd ~/code/0xkobolds

# Get current commit for rollback
CURRENT=$(git rev-parse HEAD)
echo "[$DATE] Current: $CURRENT" >> $LOG

# Pull latest
if git pull origin master 2>&1 | tee -a $LOG; then
    # Install dependencies
    ~/.bun/bin/bun install 2>&1 | tee -a $LOG
    
    # Build
    if ~/.bun/bin/bun run build 2>&1 | tee -a $LOG; then
        # Restart service
        sudo systemctl restart 0xkobold
        echo "[$DATE] ✅ Update successful" >> $LOG
    else
        echo "[$DATE] ❌ Build failed, rolling back..." >> $LOG
        git reset --hard $CURRENT
        sudo systemctl restart 0xkobold
    fi
else
    echo "[$DATE] ❌ Pull failed, skipping update" >> $LOG
    exit 1
fi
