#!/bin/bash
# Backup to GitHub 0xKobold org
set -e

cd ~/code/0xkobolds
LOG="/mnt/5tb/logs/github-backup.log"
DATE=$(date "+%Y-%m-%d %H:%M:%S")

# Add github remote if not exists
if ! git remote | grep -q "^github$"; then
    git remote add github https://github.com/0xKobold/0xkobolds.git
fi

# Push to GitHub
echo "[$DATE] Pushing to GitHub..." >> $LOG
git push github master 2>&1 | tee -a $LOG || echo "[$DATE] Push failed (may need auth)" >> $LOG
