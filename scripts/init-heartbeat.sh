#!/bin/bash
# Initialize heartbeat tasks from HEARTBEAT.md heartbeat schedule
# Run once to create heartbeat.json from HEARTBEAT.md

set -e

HEARTBEAT_MD="$HOME/.0xkobold/HEARTBEAT.md"
HEARTBEAT_JSON="$HOME/.0xkobold/config/heartbeat.json"

echo "[Heartbeat] Initializing heartbeat tasks..."

# Create config directory
mkdir -p "$(dirname "$HEARTBEAT_JSON")"

# If heartbeat.json doesn't exist, create it
if [ ! -f "$HEARTBEAT_JSON" ]; then
  echo "[Heartbeat] Creating heartbeat.json..."
  echo '[root@arch /home/moikapy/code/0xkobolds]# cat > "$HEARTBEAT_JSON" << 'EOF'
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "enabled": true,
        "every": "30m",
        "ackMaxChars": 300,
        "target": "none"
      }
    },
    "list": [
      {
        "id": "moltlaunch",
        "name": "Moltlaunch",
        "heartbeat": {
          "enabled": true,
          "every": "2h",
          "target": "none",
          "message": "Check Moltlaunch inbox for new gigs. Use: mltl inbox --agent 0x3bc7."
        }
      },
      {
        "id": "clawchemy",
        "name": "Clawchemy",
        "heartbeat": {
          "enabled": true,
          "every": "2h",
          "target": "none",
          "message": "Run Claychemy discovery session. Verify 3 combinations first, then make discoveries."
        }
      },
      {
        "id": "moltbook",
        "name": "Moltbook",
        "heartbeat": {
          "enabled": true,
          "every": "4h",
          "target": "none",
          "message": "Engage on Moltbook. Upvote 3-5 posts, respond to comments, maintain 5:1 ratio."
        }
      },
      {
        "id": "moltx",
        "name": "Moltx",
        "heartbeat": {
          "enabled": true,
          "every": "6h",
          "target": "none",
          "message": "Engage on Moltx. Like 3-5 posts, maintain 5:1 ratio."
        }
      },
      {
        "id": "4claw",
        "name": "4claw",
        "heartbeat": {
          "enabled": true,
          "every": "4h",
          "target": "none",
          "message": "Engage on 4claw. Check /singularity/ board, reply to threads."
        }
      },
      {
        "id": "music",
        "name": "Daily Music",
        "heartbeat": {
          "enabled": true,
          "cron": "0 12 * * *",
          "target": "none",
          "message": "Generate daily music track at 12pm. Create via fal.ai, submit to claw.fm, share to social."
        }
      },
      {
        "id": "polymarket",
        "name": "Polymarket",
        "heartbeat": {
          "enabled": true,
          "every": "3h",
          "target": "none",
          "message": "Polymarket research session. Run edge detector, update research log."
        }
      }
    ]
  }
}
EOF
  echo "[Heartbeat] heartbeat.json created"
else
  echo "[Heartbeat] heartbeat.json already exists"
fi

echo "[Heartbeat] Done"
