#!/bin/bash
# File Share Server - Real-time file sharing over Tailscale
# Run: ./start.sh

PID_FILE="/tmp/file-share.pid"
LOG_FILE="/mnt/5tb/logs/file-share.log"

start() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "File Share already running (PID: $(cat $PID_FILE))"
        return 1
    fi
    
    echo "Starting File Share Server..."
    cd /home/moikapy/code/0xkobolds/apps/file-share
    bun run server.ts >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Started! PID: $(cat $PID_FILE)"
    echo "Access at: http://100.65.167.97:8080"
}

stop() {
    if [ -f "$PID_FILE" ]; then
        kill $(cat "$PID_FILE") 2>/dev/null
        rm -f "$PID_FILE"
        echo "Stopped"
    else
        echo "Not running"
    fi
}

status() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Running (PID: $(cat $PID_FILE))"
        tail -3 "$LOG_FILE"
    else
        echo "Not running"
    fi
}

case "$1" in
    start) start ;;
    stop) stop ;;
    restart) stop; sleep 1; start ;;
    status) status ;;
    *) echo "Usage: $0 {start|stop|restart|status}" ;;
esac
