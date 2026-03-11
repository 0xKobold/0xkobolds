# 📋 Extension Architecture Audit

## 🔍 Current State Analysis

### Already Unified ✅

| Extension | Status | Notes |
|-----------|--------|-------|
| `gateway-extension.ts` + `agent-orchestrator-extension.ts` | ✅ **Unified** | Gateway delegates spawning to orchestrator via events |
| `UnifiedSessionBridge.ts` | ✅ **Unified** | Replaced: session-bridge, session-manager, context-aware |
| `config-extension.ts` | ✅ **Clean** | Single config source |

### Extension Inventory (34 total)

#### Infrastructure (Load First) - 5 extensions
```
✅ unified-config.ts              # Types only, harmless
✅ config-extension.ts            # /config commands - KEEP
✅ ollama-extension.ts            # Ollama provider - KEEP
✅ UnifiedSessionBridge.ts        # Session management - KEEP
✅ compaction-safeguard-v2.ts     # Event-based compaction - KEEP (but not used yet)
```

#### Core Features - 10 extensions
```
✅ persona-loader-extension.ts    # Identity files - KEEP
✅ onboarding-extension.ts        # First-run - KEEP
✅ questionnaire-extension.ts     # Questions - KEEP? (rarely used)
🤔 task-manager-extension.ts     # Task board - KEEP but review
✅ heartbeat-extension.ts        # Health monitoring - KEEP
✅ pi-notify-extension.ts        # Desktop notifications - KEEP
⚠️ protected-paths.ts             # Safety guard - MERGE into draconic-safety
⚠️ confirm-destructive.ts        # Confirmation - MERGE into draconic-safety
⚠️ dirty-repo-guard.ts           # Git guard - MERGE into draconic-safety
⚠️ git-checkpoint.ts             # Git stash - MERGE into draconic-safety
```

#### Multi-Channel - 3 extensions
```
✅ multi-channel-extension.ts     # Channel management - KEEP
✅ discord-extension.ts          # Bot - KEEP
✅ discord-channel-extension.ts  # Discord channels - KEEP (but merge?)
```

#### Integrations - 10 extensions
```
✅ mcp-extension.ts              # Model Context Protocol - KEEP
✅ gateway-extension.ts         # WebSocket - KEEP (already unified with orchestrator)
✅ agent-registry-extension.ts    # Multi-agent registry - MERGE with orchestrator
🤔 agent-worker.ts               # Worker agent - DELETE? (replaced by Draconic)
🤔 agent-workspace-extension.ts  # Agent workspaces - MERGE into DraconicLair
⚠️ agent-orchestrator-extension.ts # Spawning - REPLACE with DraconicOrchestrator
✅ websearch-extension.ts        # Web search - KEEP
✅ update-extension.ts           # Framework update - KEEP
✅ self-update-extension.ts      # Self update - KEEP
✅ perennial-memory-extension.ts  # Long-term memory - KEEP
```

#### Utilities - 6 extensions
```
✅ fileops-extension.ts          # File operations - KEEP
✅ git-commit-extension.ts       # Git commits - KEEP
✅ diagnostics-extension.ts      # Diagnostics - KEEP
🤔 extension-scaffold-extension.ts # Scaffold generator - KEEP but optional
```

### 🔧 Proposed Consolidation

## Option A: Maximum Consolidation (Recommended)

Create **ONE** unified extension that replaces multiple:

### 1. `draconic-core-extension.ts` (Replaces 10+ extensions)

**Includes:**
- DraconicRunRegistry (agent tracking)
- DraconicCapabilityRouter (task routing)
- DraconicErrorClassifier (error handling)
- Agent spawning (replaces agent-orchestrator + registry)
- Safety guards (replaces protected-paths, confirm-destructive, dirty-repo-guard, git-checkpoint)
- DraconicLairSystem (replaces agent-workspace-extension)

**Commands:**
```
/agent spawn <type> "task"      # Replaces /agent-spawn
/agent tree                     # Replaces /agent-tree
/agent status                   # Replaces /agent-status
/lair                          # New: project management
/treasure                      # New: code snippets
/error config                  # New: error handling config
```

### 2. `draconic-performance-extension.ts` (Replaces gateway partially)

**Includes:**
- DraconicConnectionPool (replaces basic WS connections)
- DraconicTokenPredictor
- Metrics and performance monitoring

### 3. Existing extensions to DELETE:
```
❌ agent-orchestrator-extension.ts      → Merged into draconic-core
❌ agent-registry-extension.ts          → Merged into draconic-core  
❌ agent-worker.ts                      → Replaced by Draconic systems
❌ agent-workspace-extension.ts        → Replaced by DraconicLair
❌ protected-paths.ts                  → Merged into draconic-core
❌ confirm-destructive.ts              → Merged into draconic-core
❌ dirty-repo-guard.ts                 → Merged into draconic-core
❌ git-checkpoint.ts                   → Merged into draconic-core
```

### 4. Keep separate (high independence):
```
✅ ollama-extension.ts
✅ discord-extension.ts
✅ mcp-extension.ts
✅ fileops-extension.ts
✅ git-commit-extension.ts
✅ task-manager-extension.ts
✅ heartbeat-extension.ts
✅ perennial-memory-extension.ts
✅ websearch-extension.ts
✅ update/self-update extensions
✅ config-extension.ts
✅ onboarding-extension.ts
✅ persona-loader-extension.ts
```

## Option B: Gradual Integration (Conservative)

Keep existing structure, just swap implementations:

1. **agent-orchestrator-extension.ts** - Replace internals with DraconicRunRegistry
2. **gateway-extension.ts** - Add DraconicConnectionPool for HTTP/2
3. **NEW: draconic-lair-extension.ts** - Add Lair commands
4. **NEW: draconic-hoard-extension.ts** - Add Hoard commands

### Comparison

| Aspect | Option A (Full) | Option B (Gradual) |
|--------|-----------------|-------------------|
| Extensions Deleted | 8 | 0 |
| Extensions Modified | 2 | 2 |
| Extensions Created | 2 | 4 |
| Testing Risk | Higher | Lower |
| Maintenance | Easier (1 core) | Harder (more files) |
| Learning Curve | Steep | Gradual |

## 🎯 Recommendation

**Start with Option B** - it's safer and lets us:

1. Verify Draconic systems work
2. Replace internals without changing interface
3. Gradually consolidate later

Then **migrate to Option A** once stable.

## 📁 New Extension Structure

```
src/extensions/core/
  # Keep (high value, independent)
  ✓ ollama-extension.ts
  ✓ discord-extension.ts
  ✓ mcp-extension.ts
  ✓ fileops-extension.ts
  ✓ heartbeat-extension.ts
  ✓ perennial-memory-extension.ts
  
  # Modify (swap internals)
  ~ agent-orchestrator-extension.ts  # Use DraconicRunRegistry
  ~ gateway-extension.ts           # Use DraconicConnectionPool
  
  # New (add functionality)
  + draconic-lair-extension.ts     # Project workspaces
  + draconic-hoard-extension.ts    # Code snippets
  
  # Delete (merge into draconic-core later)
  ✗ agent-registry-extension.ts
  ✗ agent-worker.ts
  ✗ agent-workspace-extension.ts
  ✗ protected-paths.ts
  ✗ confirm-destructive.ts
  ✗ dirty-repo-guard.ts
  ✗ git-checkpoint.ts
```

## 🚀 Implementation Plan

### Phase 1: Safe Integration (Option B)
1. Modify `agent-orchestrator-extension.ts` to use `DraconicRunRegistry`
2. Add `draconic-lair-extension.ts` for project management
3. Keep all existing commands working
4. Test thoroughly

### Phase 2: Performance Layer
1. Modify `gateway-extension.ts` for `DraconicConnectionPool`
2. Add `DraconicTokenPredictor` to LLM calls
3. Add `DraconicCapabilityRouter` for spawn routing

### Phase 3: Consolidation (Option A)
1. Create `draconic-core-extension.ts` that merges
2. Migrate safety guards (protected-paths, etc.)
3. Test migration path
4. Delete old extensions

Which option do you prefer?
