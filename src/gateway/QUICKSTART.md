# Quick Start - Koclaw Gateway

## See it working (same terminal)

```bash
# Run the demo
bun run src/gateway/quickstart.ts

# In another terminal window/pane:
curl http://localhost:7777/health
curl http://localhost:7777/protocol
```

## Test it interactively

```bash
# Install wscat if you don't have it
npm install -g wscat

# Connect to gateway
wscat -c ws://localhost:7777/ws

# Then paste these JSON-RPC frames:
# 1. Connect message (sent automatically, but can be explicit):
{ "id": "1", "method": "connect", "params": { "clientName": "test-client" } }

# 2. Run an agent:
{ "id": "2", "method": "agent.run", "params": { "message": "Say hello", "idempotencyKey": "test-1" } }

# 3. Check status:
{ "id": "3", "method": "agent.status", "params": { "runId": "..." } }
```

## Integration with main app

Add to `src/index.ts`:

```typescript
import { startGateway, ensureAuthProfilesFromConfig } from "./gateway/index";

// Start gateway on boot
startGateway({ port: 7777 });

// Ensure auth profiles from config
ensureAuthProfilesFromConfig();
```

## Switch TUI to gateway mode

```typescript
// In your TUI setup:
import { GatewayChatClient } from "./g
```