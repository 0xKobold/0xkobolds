#!/bin/bash
cd /home/moikapy/code/0xkobolds/packages/mission-control

# Kill any existing next process on 5173
fuser -k 5173/tcp 2>/dev/null || true
sleep 1

exec /home/moikapy/.bun/bin/bun run /home/moikapy/code/0xkobolds/packages/mission-control/node_modules/.bin/next start -H 0.0.0.0 -p 5173
