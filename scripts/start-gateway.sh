#!/bin/bash
cd /home/moikapy/code/0xkobolds
exec /home/moikapy/.bun/bin/bun run src/cli/index.ts gateway start --host 0.0.0.0 --port 7777
