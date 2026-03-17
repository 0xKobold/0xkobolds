# Heartbeat Checklist

<!--
╔═════════════════════════════════════════════════════════════════════════════╗
║                        HEARTBEAT - OpenClaw Compatible                       ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ This file controls what the agent checks during periodic heartbeats.        ║
║                                                                              ║
║ Configuration (in kobold.json):                                              ║
║ - every: "30m"              → Interval between checks                        ║
║ - activeHours: {...}        → Restrict to business hours                     ║
║ - target: "last" | "none"   → Where to deliver alerts                       ║
║ - isolatedSession: true      → Run without history (saves tokens)             ║
║ - lightContext: true        → Only load this file, skip others              ║
║                                                                              ║
║ Response Contract:                                                           ║
║ - If nothing needs attention → reply "HEARTBEAT_OK"                          ║
║ - If something needs attention → describe the issue (no token)               ║
║ - Token at start/end gets stripped; reply dropped if remaining ≤ ackMaxChars║
╚═════════════════════════════════════════════════════════════════════════════╝
-->

## Response Protocol

Reply with **HEARTBEAT_OK** if nothing needs attention.
Describe issues (without the token) if action is needed.

---

## Regular Checks

- [ ] Are there pending tasks that need human input?
- [ ] Are there blocked items waiting on something?
- [ ] Is there system status that needs monitoring?

## Context-Aware Checks

Only check these when relevant to your role:

### If you manage tasks or reminders
- [ ] Check scheduled tasks or reminders
- [ ] Check follow-ups from previous conversations
- [ ] Check for stale work items

### If you have social platform integration
- [ ] Check for unread notifications or messages
- [ ] Check for pending DMs or requests
- [ ] Check engagement quotas if applicable

### If you have monitoring responsibilities
- [ ] Check health endpoints
- [ ] Check error logs or alerts
- [ ] Check resource usage

---

## Configuration Reference

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "prompt": "Read HEARTBEAT.md if it exists...",
        "ackMaxChars": 300,
        "target": "none",
        "activeHours": { "start": "09:00", "end": "22:00", "timezone": "America/New_York" },
        "isolatedSession": false,
        "lightContext": false,
        "model": null,
        "includeReasoning": false,
        "suppressToolErrorWarnings": false,
        "directPolicy": "allow"
      }
    },
    "list": [
      {
        "id": "ops-agent",
        "heartbeat": {
          "every": "1h",
          "target": "telegram",
          "to": "+15551234567",
          "activeHours": { "start": "08:00", "end": "20:00" }
        }
      }
    ]
  }
}
```

### Key Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| every | string | "30m" | Interval (30m, 1h, 2h30m) |
| target | string | "none" | Where alerts go: "none", "last", or channel |
| activeHours | object | null | Time window (start/end HH:MM, timezone) |
| isolatedSession | boolean | false | Fresh session each run (saves tokens) |
| lightContext | boolean | false | Only load HEARTBEAT.md, skip other files |
| model | string | null | Override model for heartbeat runs |
| ackMaxChars | number | 300 | Max chars after HEARTBEAT_OK before delivery |

### Per-Agent Override

If any agent in `agents.list` has a heartbeat block, only those agents run heartbeats.
Per-agent settings merge on top of defaults.

---

## Active Hours

Heartbeats only run within the configured time window:

```json
"activeHours": {
  "start": "09:00",
  "end": "22:00",
  "timezone": "America/New_York"
}
```

- Use "local" for system timezone
- Omit timezone to use user timezone from config
- Set `start: "00:00", end: "24:00"` for 24/7
- **Never** use equal start/end (zero-width window, always skipped)

---

## Delivery Targets

| Target | Behavior |
|--------|----------|
| "none" | Run heartbeat, don't deliver externally |
| "last" | Deliver to the last used external channel |
| "discord" | Deliver to Discord |
| "telegram" | Deliver to Telegram |
| "whatsapp" | Deliver to WhatsApp |
| Custom | Any configured channel ID |

Use `to` field for recipient override (e.g., `"+15551234567"` for WhatsApp).
Use `directPolicy: "block"` to suppress DM delivery.

---

HEARTBEAT_OK