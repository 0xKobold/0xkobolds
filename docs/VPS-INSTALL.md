# VPS Installation Guide - 0xKobold

Quick deploy guide for installing 0xKobold on your VPS.

## Quick Install (Recommended)

```bash
# One-liner install
curl -fsSL https://bun.sh/install | bash && \
export PATH="$HOME/.bun/bin:$PATH" && \
bun install -g 0xkobold && \
0xkobold init --quick
```

## Systemd Service (Auto-start)

Create `/etc/systemd/system/0xkobold.service`:

```ini
[Unit]
Description=0xKobold
After=network.target

[Service]
Type=simple
User=root
ExecStart=/root/.bun/bin/0xkobold cron start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
systemctl daemon-reload
systemctl enable --now 0xkobold
```

## Usage

```bash
# Add job with notification
0xkobold cron add \
  --name "Daily Brief" \
  --cron "0 7 * * *" \
  --notify telegram:YOUR_CHAT_ID \
  --message "Generate briefing"

# List jobs
0xkobold cron list

# View logs
journalctl -u 0xkobold -f
```

## Environment Variables

```bash
export TELEGRAM_BOT_TOKEN="your_token"
export DISCORD_BOT_TOKEN="your_token"
export CLOUD_API_KEY="your_key"
```

## Files

- Config: `~/.0xkobold/config.json`
- Cron DB: `~/.0xkobold/cron.db`
- Main DB: `~/.0xkobold/kobold.db`
