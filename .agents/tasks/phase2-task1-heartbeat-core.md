> **Agent:** Worker ⚒️
> **Task ID:** phase2-task1-heartbeat-core
> **Priority:** High

# Task 1: Heartbeat System Core

## Objective
Implement the core heartbeat system with scheduled check-ins, idle detection, and proactive notifications.

## Deliverables

1. **src/heartbeat/scheduler.ts**
   - Cron-based scheduling
   - Configurable check-in intervals
   - Schedule persistence

2. **src/heartbeat/checkin.ts**
   - Check-in logic and prompts
   - Different check-in types (morning, evening, idle)
   - Prompt generation

3. **src/heartbeat/notifications.ts**
   - Proactive notification system
   - Smart notification timing
   - Quiet hours support

4. **src/heartbeat/index.ts**
   - Public API exports

## API Design

```typescript
// Schedule a heartbeat
type CheckInType = 'morning' | 'evening' | 'idle' | 'nurture';

interface HeartbeatConfig {
  enabled: boolean;
  schedule: {
    morning?: string; // cron expression
    evening?: string;
    idleCheck?: number; // minutes of idle
    nurtureAfter?: number; // minutes of no interaction
  };
  notifications: {
    quietHoursStart?: number;
    quietHoursEnd?: number;
    maxPerDay: number;
  };
}

// Functions
initializeHeartbeat(config: HeartbeatConfig): void
scheduleCheckin(type: CheckInType): void
onIdleDetected(callback: () => void): void
sendNotification(message: string): void
```

## Testing
- Unit tests for scheduler
- Mock time for testing
- Idle detection accuracy

## Done When
- [ ] scheduler.ts implemented
- [ ] checkin.ts implemented
- [ ] notifications.ts implemented
- [ ] index.ts with exports
- [ ] Tests pass

## Status
Write status to: .agents/status/phase2-task1-done
