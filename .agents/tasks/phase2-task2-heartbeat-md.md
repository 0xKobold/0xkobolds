> **Agent:** Worker ⚒️
> **Task ID:** phase2-task2-heartbeat-md
> **Priority:** High
> **Depends on:** phase2-task1

# Task 2: HEARTBEAT.md Integration

## Objective
Add HEARTBEAT.md to the bootstrap file system for user-configurable heartbeats.

## Deliverables

1. **Update src/agent/heartbeat-loader.ts**
   ```typescript
   interface HeartbeatProfile {
     enabled: boolean;
     checkins: CheckInConfig[];
     notifications: NotificationConfig;
     nurturePrompts: string[];
   }
   ```

2. **Update src/agent/bootstrap-loader.ts**
   - Add HEARTBEAT.md to DEFAULT_BOOTSTRAP_FILES
   - Parse HEARTBEAT.md format

3. **Create default HEARTBEAT.md template**
   ```markdown
   # HEARTBEAT.md
   
   ## Schedule
   - Morning check-in: 9:00 AM
   - Evening check-in: 6:00 PM
   - Idle threshold: 30 minutes
   
   ## Notification Preferences
   - Quiet hours: 10:00 PM - 8:00 AM
   - Max notifications per day: 5
   
   ## Nurture Prompts
   - "How's your day going?"
   - "Need help with anything?"
   - "Want to review today's progress?"
   ```

## Integration
- Load HEARTBEAT.md on startup
- Merge with defaults
- Provide config to heartbeat system

## Done When
- [ ] HEARTBEAT.md created and parsed
- [ ] Bootstrap loader includes heartbeat
- [ ] Config integrates with scheduler
- [ ] Tests pass

## Status
Write to: .agents/status/phase2-task2-done
