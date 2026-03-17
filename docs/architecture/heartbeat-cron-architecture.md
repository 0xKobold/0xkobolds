# Heartbeat & Cron Scheduling Architecture

## Overview

0xKobold now has **two complementary scheduling systems** that work together:

1. **Heartbeat Scheduler** (Gateway-based) - Runs even when TUI is closed
2. **Cron Scheduler** (Gateway-based) - Exact-time scheduled tasks

Both run in the Gateway process, which stays alive as long as 0xKobold is running.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      0xKobold Process                        │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │    TUI      │  │   Gateway   │  │   Discord   │        │
│  │  (optional) │  │  (always)   │  │  (optional) │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │
│         └────────────────┴────────────────┘                │
│                          │                                 │
│              ┌───────────▼───────────┐                    │
│              │   Gateway Schedulers   │                    │
│              │                       │                    │
│              │  ┌─────────────────┐   │                    │
│              │  │ HeartbeatScheduler │◄── Every 30m       │
│              │  │ (flexible timing) │   │                    │
│              │  └─────────────────┘   │                    │
│              │                       │                    │
│              │  ┌─────────────────┐   │                    │
│              │  │   CronScheduler  │◄── "0 8 * * *"       │
│              │  │ (exact timing)   │   │                    │
│              │  └─────────────────┘   │                    │
│              │                       │                    │
│              │  ┌─────────────────┐   │                    │
│              │  │  Delivery Targets │◄── Discord/Telegram │
│              │  └─────────────────┘   │                    │
│              └───────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

## Heartbeat vs Cron

| Feature | Heartbeat | Cron |
|---------|-----------|------|
| **Timing** | Flexible intervals (~30m) | Exact times (08:00) |
| **Use Case** | Check email, disk, calendar | Daily briefing, reports |
| **Batching** | Multiple checks per run | Single task per run |
| **Model** | Cheapest (Haiku) | Configurable per job |
| **Session** | Light context | Isolated session |

## Configuration

### Heartbeat Configuration (kobold.json)

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "enabled": true,
        "every": "30m",
        "prompt": "Read HEARTBEAT.md if it exists...",
        "ackMaxChars": 300,
        "target": "none",
        "activeHours": {
          "start": "09:00",
          "end": "22:00",
          "timezone": "America/New_York"
        },
        "isolatedSession": false,
        "lightContext": true
      }
    },
    "list": [
      {
        "id": "ops",
        "heartbeat": {
          "every": "1h",
          "target": "telegram",
          "to": "+15551234567"
        }
      }
    ]
  }
}
```

### Cron Configuration (kobold.json)

```json
{
  "cron": {
    "jobs": [
      {
        "name": "Daily Briefing",
        "schedule": "0 8 * * *",
        "message": "Generate daily briefing and send to Telegram",
        "target": "default",
        "model": "claude-3-haiku"
      },
      {
        "name": "Weekly Report",
        "schedule": "weekly-monday-09:00",
        "message": "Generate weekly metrics summary",
        "target": "default"
      }
    ]
  }
}
```

## HEARTBEAT.md (Agent-Level Control)

```markdown
# HEARTBEAT.md

## Regular Checks
- [ ] Check email for unread important messages
- [ ] Check calendar for events in next 2 hours
- [ ] Check disk space (warn if >80%)

## State Tracking
Last email check: 2024-03-17T14:00:00Z
Last calendar check: 2024-03-17T14:00:00Z

## Delivery
If something needs attention, send to Discord channel #alerts.
If nothing needs attention, reply with HEARTBEAT_OK.
```

## Delivery Targets

| Target | Behavior |
|--------|----------|
| `"none"` | Run heartbeat, don't deliver externally |
| `"last"` | Deliver to last used channel |
| `"discord"` | Deliver to Discord channel |
| `"telegram"` | Deliver to Telegram |
| Custom | Deliver to specific channel ID |

## API

### Programmatic Usage

```typescript
import { getHeartbeatScheduler, getCronScheduler } from './gateway';

// Get heartbeat scheduler
const heartbeat = getHeartbeatScheduler();
await heartbeat.triggerNow('default');

// Get cron scheduler
const cron = getCronScheduler();
const jobId = await cron.addJob({
  name: "My Task",
  enabled: true,
  schedule: { type: "daily", time: "09:00" },
  target: "default",
  message: "Do something",
});
```

## State Persistence

- Heartbeat state: `~/.0xkobold/memory/heartbeat-states.json`
- Cron jobs: `~/.0xkobold/cron/jobs.json`

## Comparison with OpenClaw

| Feature | OpenClaw | 0xKobold |
|---------|----------|----------|
| Gateway-based | ✅ Yes | ✅ Yes |
| Heartbeat interval | ✅ Configurable | ✅ Configurable |
| Cron scheduling | ✅ Yes | ✅ Yes |
| Active hours | ✅ Yes | ✅ Yes |
| Delivery targets | ✅ Multi-channel | ✅ Multi-channel |
| Isolated sessions | ✅ Yes | ✅ Yes |
| Light context | ✅ Yes | ✅ Yes |
| Model override | ✅ Yes | ✅ Yes |

## Implementation Files

- `src/gateway/heartbeat-scheduler.ts` - Heartbeat scheduler
- `src/gateway/cron-scheduler.ts` - Cron scheduler
- `src/gateway/gateway-server.ts` - Gateway server (starts both schedulers)
- `src/extensions/core/heartbeat-extension.ts` - TUI heartbeat extension