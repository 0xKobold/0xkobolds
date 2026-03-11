# OpenClaw Embedded Runner Research

## Architecture Comparison: OpenClaw vs 0xKobold

### OpenClaw's `pi-embedded-runner` Directory Structure

```
koclaw/src/agents/pi-embedded-runner/
├── abort.ts                          # Abort handling
├── anthropic-stream-wrappers.ts      # Provider-specific streaming
├── cache-ttl.ts                      # Cache TTL management
├── compaction-safety-timeout.ts        # Compaction timeouts
├── compact.runtime.ts                # Compaction runtime state
├── compact.ts                        # Main compaction logic (37KB!)
├── extensions.ts                     # Extension factory builder
├── extra-params.ts                   # Extra API params (16KB)
├── google.ts                         # Google provider integration
├── history.ts                        # Session history management
├── lanes.ts                          # Command queue lanes
├── logger.ts                         # Logging
├── model.ts                          # Model resolution
├── model.provider-normalization.ts   # Provider normalization
├── runs.ts                           # Active run registry (queue management)
├── run.ts                            # Main run orchestration (1397 lines!)
├── run/
│   ├── attempt.ts                    # Single attempt runner
│   ├── failover-observation.ts       # Failover logging
│   ├── overflow-compaction.fixture.ts
│   ├── overflow-compaction.mocks.shared.ts
│   ├── overflow-compaction.shared-test.ts
│   ├── params.ts                     # Run parameters
│   └── payloads.ts                   # Payload building
├── sandbox-info.ts                   # Sandbox metadata
├── session-manager-cache.ts          # Session cache
├── session-manager-init.ts           # Session initialization
├── skills-runtime.ts                 # Skills runtime
├── system-prompt.ts                  # System prompt builder
├── thinking.ts                       # Thinking level management
├── tool-name-allowlist.ts            # Tool filtering
├── tool-result-char-estimator.ts     # Result size estimation
│   └── context-guard.ts              # Context limits
├── tool-result-truncation.ts         # Result truncation
├── tool-split.ts                     # Tool call splitting
├── types.ts                          # Type definitions
├── utils.ts                          # Utilities
└── wait-for-idle-before-flush.ts     # Flush coordination
```

### Key Files Analysis

#### 1. `extensions.ts` - Extension Factory Builder

**Pattern: Factory-based Extension Loading**

```typescript
// OpenClaw dynamically builds extensions based on config
export function buildEmbeddedExtensionFactories(params: {
  cfg: OpenClawConfig;
  sessionManager: SessionManager;
  provider: string;
  modelId: string;
  model: Model | undefined;
}): ExtensionFactory[] {
  const factories: ExtensionFactory[] = [];
  
  // Conditional loading based on config
  if (resolveCompactionMode(params.cfg) === "safeguard") {
    setCompactionSafeguardRuntime(params.sessionManager, {
      maxHistoryShare: compactionCfg?.maxHistoryShare,
      contextWindowTokens: contextWindowInfo.tokens,
      // ... runtime config
    });
    factories.push(compactionSafeguardExtension);
  }
  
  const pruningFactory = buildContextPruningFactory(params);
  if (pruningFactory) {
    factories.push(pruningFactory);
  }
  
  return factories;
}
```

**Key Differences from 0xKobold:**
- OpenClaw: **Dynamic factory building** based on runtime config
- 0xKobold: **Static list** in `pi-config.ts` (all extensions loaded always)

#### 2. `run.ts` - Main Run Orchestration (1397 lines)

**Architecture: Sophisticated Retry + Failover System**

```typescript
// OpenClaw's run loop features:
- Profile-based auth failover (multiple API keys)
- Context overflow detection + compaction
- Rate limiting with backoff
- Session state management
- Usage accumulation
- Billing/auth error classification
- Image size validation
- Refusal handling (Anthropic)
```

**0xKobold's Current Approach:**
```typescript
// Simpler - relies on pi-coding-agent built-in
import { main as piMain } from '@mariozechner/pi-coding-agent';
// Extensions loaded via CLI args
piMain(extensionArgs);
```

#### 3. `runs.ts` - Active Run Registry

**Pattern: Global Run Queue Management**

```typescript
const ACTIVE_EMBEDDED_RUNS = new Map<string, EmbeddedPiQueueHandle>();
const EMBEDDED_RUN_WAITERS = new Map<string, Set<EmbeddedRunWaiter>>();

export function queueEmbeddedPiMessage(sessionId: string, text: string): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) return false;
  if (!handle.isStreaming()) return false;
  if (handle.isCompacting()) return false;
  
  handle.queueMessage(text);
  return true;
}

export function abortEmbeddedPiRun(sessionId: string): boolean;
export function abortEmbeddedPiRun(mode: { mode: "all" | "compacting" }): boolean;
```

**What 0xKobold lacks:**
- Global run state tracking
- Message queuing during runs
- Abort coordination
- Compaction state awareness

#### 4. `compact.ts` - Compaction Logic (37KB!)

**Features:**
- Multi-stage summarization
- Tool failure tracking
- File operation preservation
- Exact identifier extraction
- Quality guard with retries
- History pruning strategies
- Context window calculations

**0xKobold's approach:**
- Uses `compaction-safeguard-v2.ts` (simplified)
- Still relies on pi-coding-agent's built-in compaction

### Architectural Differences

| Aspect | OpenClaw | 0xKobold |
|--------|----------|----------|
| **Extension Loading** | Dynamic factory building | Static config list |
| **Run Management** | Global registry + queues | Per-session via pi-coding-agent |
| **Retry Logic** | Profile-based failover | Not implemented |
| **Context Overflow** | Sophisticated compaction | Basic safeguard |
| **Auth Failover** | Multiple profiles, auto-rotation | Single provider |
| **Message Queuing** | During runs | Not implemented |
| **Abort Handling** | Session-level | Not implemented |
| **Usage Tracking** | Accumulated + per-call | Basic |
| **Billing Errors** | Classified + retry logic | Not handled |

### Key Strengths of OpenClaw's Approach

1. **Resilience:**
   - Multiple auth profiles
   - Automatic failover
   - Context overflow recovery

2. **Observability:**
   - Detailed diagnostics
   - Failover logging
   - Session state tracking

3. **Performance:**
   - Message queuing
   - Compaction coordination
   - Abort handling

4. **Provider Support:**
   - Normalized across providers
   - Provider-specific optimizations
   - Image handling

### What 0xKobold Could Adopt

1. **runs.ts Pattern:**
   ```typescript
   // Global run registry for multi-agent coordination
   const ACTIVE_RUNS = new Map<string, AgentRunHandle>();
   export function queueAgentMessage(agentId: string, text: string): boolean;
   export function abortAgentRun(agentId: string): boolean;
   ```

2. **extensions.ts Pattern:**
   ```typescript
   // Config-based extension loading
   export function build0xKoboldExtensions(config: Config): Extension[] {
     const extensions = [];
     if (config.compaction?.enabled) {
       extensions.push(compactionExtension);
     }
     if (config.channels?.discord?.enabled) {
       extensions.push(discordExtension);
     }
     return extensions;
   }
   ```

3. **Error Classification:**
   ```typescript
   // From OpenClaw's pi-embedded-helpers.ts
   export function isContextOverflowError(error: string): boolean;
   export function isRateLimitError(error: string): boolean;
   export function isBillingError(error: string): boolean;
   export function classifyFailoverReason(error: string): FailoverReason;
   ```

### Recommended Adoptions for 0xKobold

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| High | Run registry (runs.ts) | Medium | Multi-agent coordination |
| High | Error classification | Low | Better retry logic |
| Medium | Config-based extensions | Medium | Performance |
| Medium | Message queuing | Medium | UX improvement |
| Low | Auth failover | High | Reliability |
| Low | Compaction upgrade | High | Context management |

### Summary

OpenClaw's `pi-embedded-runner` is **much more sophisticated** than 0xKobold's current approach. It provides:

- **Resilience:** Multi-layer retry and failover
- **Coordination:** Global state for multi-agent systems
- **Observability:** Detailed logging and diagnostics
- **Optimization:** Queue management and abort handling

0xKobold currently **delegates most of this** to `pi-coding-agent`'s built-in behavior, losing some control but gaining simplicity.

**Trade-off:** Simplicity vs. Control

