# Diagnostics Extension Task

**Agent:** @diagnostics-expert
**Status:** Ready to start
**File:** src/extensions/core/diagnostics-extension.ts

## Objective
Create telemetry and diagnostics for 0.0.4 VPS deployment

## Requirements
1. Track token usage per provider (Ollama local, Ollama Cloud)
2. Estimate costs (based on cloud usage)
3. Prometheus /metrics endpoint
4. Health check aggregation
5. /diagnostics dashboard command

## Implementation Plan
1. Create SQLite table: `metrics` (timestamp, provider, tokens_sent, tokens_recv, cost)
2. Hook into session events to capture token usage
3. Create Prometheus-compatible metrics
4. Add /diagnostics command
5. Export to JSON/CSV

## Key Code Pattern
```typescript
// Track on turn_end or provider_request events
pi.on("turn_end", async (event, ctx) => {
  const usage = event.tokenUsage;
  await saveMetrics({provider: 'ollama-cloud', ...usage});
});
```

## Deliverables
- [ ] diagnostics-extension.ts
- [ ] Unit tests
- [ ] /diagnostics command working
- [ ] Prometheus endpoint at :18789/metrics

## Dependencies
- SQLite (bun:sqlite)
- No external npm packages

Start: Now
Due: 20 minutes
