#!/bin/bash
# Backup databases to external drive

BACKUP_DIR="/mnt/5tb/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# 0xKobold databases
cp -r ~/.0xkobold/*.db "$BACKUP_DIR/" 2>/dev/null

# Gitea database
sudo cp /var/lib/gitea/data/gitea.db "$BACKUP_DIR/" 2>/dev/null

# Keep last 7 days
find /mnt/5tb/backups -type d -mtime +7 -exec rm -rf {} + 2>/dev/null

echo "$(date): Databases backed up to $BACKUP_DIR"
