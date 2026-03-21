#!/bin/bash
# Start internal cron daemon in background
cd /home/moikapy/code/0xkobolds
nohup bun run src/cli/program.ts cron start > /mnt/5tb/logs/cron-daemon.log 2>&1 &
echo "Cron daemon starting (PID: $!)"
sleep 2
tail -5 /mnt/5tb/logs/cron-daemon.log 2>/dev/null
