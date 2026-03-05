# Heartbeat System

## Overview

The Heartbeat System is a periodic task scheduler that runs inside the 0xKobold daemon. It maintains a regular "heartbeat" every 60 seconds and executes scheduled tasks at specified intervals.

## How It Works

### Beat Interval
- **Frequency**: Every 60 seconds (1 minute)
- **Counter**: Incremental beat count starting from 0
- **Persistence**: Runs continuously while daemon is active

### Built-in Tasks

| Task | Interval | Description |
|------|----------|-------------|
| Memory Consolidation | Every 10 beats (10 min) | Archives old memories, updates priorities |
| Project Indexing | Every 30 beats (30 min) | Indexes files in active projects |
| Proactive Notifications | Every 5 beats (5 min) | Checks for notifications to send |

### Custom Tasks

You can schedule custom tasks using the cron system or programmatically:

```typescript
const heartbeat = new HeartbeatSystem();
heartbeat.start();

// Schedule a custom task
const taskId = heartbeat.schedule('my-task', 5, (beatCount) => {
  console.log(`Task running on beat ${beatCount}`);
});

// Control tasks
heartbeat.disable(taskId);  // Pause task
heartbeat.enable(taskId);   // Resume task
heartbeat.unschedule(taskId); // Remove task
```

## Events

The heartbeat system emits events that can be listened to:

```typescript
const unsubscribe = heartbeat.onBeat((state) => {
  console.log(`Beat #${state.beatCount}`);
  console.log(`Tasks: ${state.tasks.size}`);
});

// Later: unsubscribe();
```

## State Management

The heartbeat maintains state that can be queried:

```typescript
const state = heartbeat.getState();
console.log(state.beatCount);        // Total beats
console.log(state.startTime);        // When heartbeat started
console.log(state.lastBeatTime);     // Last beat timestamp
console.log(state.tasks);            // All scheduled tasks

const uptime = heartbeat.getUptime(); // Milliseconds since start
```

## Integration with MEMORY.md

The heartbeat system periodically updates MEMORY.md:

- **Every 10 beats**: Consolidates working memory into long-term
- **Every 30 beats**: Updates project knowledge and indexes
- **Every 60 beats**: Full memory sync to disk

## Health Monitoring

The heartbeat serves as a health indicator:
- Daemon is considered healthy if heartbeat is active
- Missed beats can trigger alerts
- Task failures are logged but don't stop the heartbeat

## Configuration

Tasks can be configured in the main agent config:

```json
{
  "heartbeat": {
    "interval": 60000,
    "tasks": {
      "memory-consolidation": {
        "enabled": true,
        "interval": 10
      },
      "proactive-notifications": {
        "enabled": true,
        "interval": 5
      }
    }
  }
}
```

## Task Handlers

Task handlers receive the current beat count and can be sync or async:

```typescript
// Sync handler
heartbeat.schedule('sync-task', 5, (beatCount) => {
  console.log('Sync task');
});

// Async handler
heartbeat.schedule('async-task', 5, async (beatCount) => {
  await someAsyncOperation();
  console.log('Async task complete');
});
```

## Error Handling

Task failures are caught and logged:
- Failed tasks don't stop the heartbeat
- Errors are logged with task name
- Task continues to run on next interval

## Best Practices

1. **Keep tasks short** - Long-running tasks can delay subsequent beats
2. **Use async for I/O** - Database operations, file reads, etc.
3. **Handle errors gracefully** - Wrap sensitive operations in try/catch
4. **Use intervals wisely** - Don't schedule too many frequent tasks
5. **Clean up** - Unschedule tasks when no longer needed

## Debugging

Enable verbose logging:
```typescript
// In daemon/heartbeat.ts, set log level
console.log('[Heartbeat] Beat #${beatCount}');
```

View task status:
```bash
0xkobold daemon status
# Shows: Heartbeat status, active tasks, last beat time
```
