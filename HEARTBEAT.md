# Heartbeat Checklist

<!--
This file controls what the agent checks during periodic heartbeats.
Keep it short and actionable. If this file is empty or only contains headers,
heartbeats will be skipped to save tokens.

The agent can read this file using the /heartbeat now command or via
scheduled checks (if HEARTBEAT_ENABLED is set in environment).

If nothing needs attention, the agent should reply with HEARTBEAT_OK.
If something needs attention, the agent describes the issue.
-->

## Regular Checks

- [ ] Review any pending tasks flagged in the workspace
- [ ] Check for blocked items needing human input
- [ ] Verify no critical system alerts

## Context-Aware (only check when relevant)

- [ ] Sessions that haven't been updated recently  
- [ ] Scheduled tasks or reminders
- [ ] Follow-ups from previous conversations

## Response Protocol

| Situation | Response |
|-----------|----------|
| Nothing needs attention | Reply: `HEARTBEAT_OK` |
| Minor item noted | Brief description (no HEARTBEAT_OK) |
| Urgent issue | Alert message (no HEARTBEAT_OK) |

## Environment Variables

- `HEARTBEAT_ENABLED` - Set to "false" to disable (default: true)
- `HEARTBEAT_EVERY` - Interval like "30m", "1h", "2h" (default: 30m)
- `HEARTBEAT_ACK_MAX_CHARS` - Max length of ack message (default: 300)

## Commands

- `/heartbeat` - Show status
- `/heartbeat now` - Trigger immediate check
- `/heartbeat-init` - Create this template file
