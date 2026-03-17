#!/bin/bash
# 0xKobold Health Check

LOG="/mnt/5tb/logs/healthcheck.log"
DATE=$(date "+%Y-%m-%d %H:%M:%S")

# Check Gateway
GATEWAY=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7777/health 2>/dev/null || echo "FAIL")

# Check Gitea
GITEA=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "FAIL")

# Check Ollama
OLLAMA=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:11434/api/tags 2>/dev/null || echo "FAIL")

# Check Cloudflared
CLOUDFLARED=$(systemctl is-active cloudflared 2>/dev/null || echo "inactive")

# Check disk space
DISK=$(df -h / | tail -1 | awk "{print \$5}" | tr -d "%")

# Temperature
TEMP=$(vcgencmd measure_temp 2>/dev/null | cut -d= -f2 || echo "N/A")

# Memory
MEM=$(free -m | grep Mem | awk "{print \$3/\$2*100}" | cut -d. -f1)

echo "$DATE | Gateway:$GATEWAY | Gitea:$GITEA | Ollama:$OLLAMA | Cloudflared:$CLOUDFLARED | Disk:${DISK}% | Temp:$TEMP | Mem:${MEM}%"

# Alert if issues
if [ "$GATEWAY" != "200" ] || [ "$GITEA" != "200" ] || [ "$OLLAMA" != "200" ]; then
    echo "$DATE WARNING: Service health check failed" >> /mnt/5tb/logs/alerts.log
fi

if [ "$DISK" -gt 80 ]; then
    echo "$DATE WARNING: Disk usage above 80%" >> /mnt/5tb/logs/alerts.log
fi
