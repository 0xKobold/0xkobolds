# 🐉 Draconic TUI Conquest Plan

**Mission:** Take OpenClaw's basic TUI and forge it into Draconic Superiority

**Current State:** OpenClaw has:
- ✅ Basic agent switching (`/agent`, `/agents`)
- ✅ Session management (`/session`)
- ✅ Status display
- ❌ NO subagent spawning
- ❌ NO hierarchy visualization
- ❌ NO result persistence
- ❌ NO intelligent routing

**Our Draconic Arsenal:**
- ✅ DraconicRunRegistry (hierarchical tracking)
- ✅ DraconicCapabilityRouter (ML routing)
- ✅ DraconicTokenPredictor (pre-spawn estimation)
- ✅ DraconicErrorClassifier (predictive handling)
- ✅ Event Bus (decoupled notifications)

---

## 🐉 The Conquest: Feature by Feature

### Round 1: Agent Commands (OpenClaw → Draconic)

| OpenClaw | Draconic Superior | Systems Used |
|----------|-------------------|--------------|
| `/agents` - simple list | `/agents` - **interactive tree** with live status | DraconicRunRegistry + TUI Overlays |
| `/agent <id>` - switch | `/agent <id>` - switch + **show hierarchy** | Registry.getTree() |
| `/status` - basic | `/status` - **full orchestrator dashboard** | All Draconic systems |

**Draconic Enhancement:**
```typescript
// OpenClaw: Flat list
agents: [{ id: "a1", name: "main" }, { id: "a2", name: "helper" }]

// Draconic: Hierarchical tree
🐉 Agent Hierarchy:
├── 🟢 main (coordinator) - 2 children
│   ├── 🟡 researcher-1 (researcher) - analyzing...
│   └── 🟢 specialist-2 (specialist) - 3m ago
└── 🟢 planner-3 (planner) - idle
```

---

### Round 2: The BIG One - Subagent Spawning

**OpenClaw: ❌ DOESN'T EXIST**

**Draconic Superior:**

```typescript
// Command: /agent-spawn <type> <task>
// Example: /agent-spawn researcher "analyze codebase"

interface DraconicSpawnCommand {
  name: "/agent-spawn";
  args: {
    type: AgentType;        // coordinator | specialist | researcher | planner | reviewer
    task: string;           // The actual task
    strategy?: "fast" | "thorough" | "auto";  // Draconic routing strategy
    inherit?: boolean;      // Inherit parent context (default: true)
    notify?: boolean;       // Notify on completion (default: true)
  }
}

// Pre-spawn Draconic Analysis:
💡 Routing Analysis:
   Task: "analyze codebase"
   → Detected: Code research + architecture review
   → Selected: researcher (90% confidence)
   → Suggested: kimi-k2.5:cloud (fast+cheap)
   → Alternative: claude-3-opus (thorough)
   → Estimated: 2,400 tokens, ~45s
   
Proceed? [Y/n/switch to specialist]

// Spawn with Draconic tracking:
✅ Spawned researcher-1774567890
   Parent: main (depth 1)
   Task: "analyze codebase"
   Estimated: 2.4k tokens
   
[🐉 Researcher running...]  ← TUI status bar
```

**Systems:**
- DraconicCapabilityRouter.analyze(task) → agent type
- DraconicTokenPredictor.estimate(task) → tokens/duration
- DraconicRunRegistry.spawn(parentId) → hierarchical tracking
- EventBus.emit('subagent.spawned') → TUI notification

---

### Round 3: Result Retrieval (The Black Hole Fix)

**OpenClaw: ❌ NO SUBAGENTS = NO RESULTS TO LOSE**

**Draconic Superior:**

```typescript
// Automatic artifact persistence:
interface DraconicArtifact {
  runId: string;
  parentId: string;
  type: 'analysis' | 'code' | 'plan' | 'review';
  content: string;
  tokens: number;
  duration: number;
  citations?: string[];
  files?: string[];  // Referenced files
}

// Three ways to retrieve:

// 1. Auto-notification on completion
[🐉 Researcher complete] Analysis: codebase architecture
   Summary: 12 files analyzed, 3 potential issues
   [View Full] [Save to File] [Dismiss]

// 2. Command: /agent-result <runId>
/agent-result researcher-1774567890
🐉 Researcher-1774567890 Results:
   Duration: 45.2s | Tokens: 2,847
   
   ## Analysis Summary
   - **Files analyzed:** 12
   - **Architecture:** Clean microservices pattern
   - **Issues found:** 3 (2 low, 1 medium)
   
   [Full report: ~/.0xkobold/agents/outputs/researcher-1774567890.md]

// 3. Browse all results: /agent-results
/agent-results [--filter researcher] [--since 1h]
🐉 Recent Subagent Results:
1. researcher-1774567890 (2m ago) - "analyze codebase" - ✅ complete
2. specialist-1774567891 (5m ago) - "refactor auth" - ✅ complete (3 files changed)
3. planner-1774567892 (10m ago) - "design schema" - ⚠️ error (timeout)
```

**Systems:**
```typescript
// In spawnDraconicSubagent():
const artifact = {
  runId: result.runId,
  parentId: ctx.parentId,
  content: result.output,
  tokens: result.metrics.tokens,
  // Auto-save to file
  path: `~/.0xkobold/agents/outputs/${runId}.md`
};
await fs.writeFile(artifact.path, artifact.content);
draconicRegistry.addArtifact(runId, artifact);
eventBus.emit('subagent.completed', { runId, artifact });
```

---

### Round 4: Context Inheritance (Draconic Magic)

**OpenClaw: ❌ NO CONTEXT SHARING**

**Draconic Superior:**

```typescript
// When spawning, automatically inherit:
interface InheritedContext {
  cwd: string;                    // Working directory
  files: string[];               // Recently mentioned files
  sessionKey: string;            // Current session
  parentRunId: string;           // For hierarchy
  preferences: UserPreferences;  // Model prefs, etc.
}

// Spawn happens automatically:
/agent-spawn researcher "analyze the file I just mentioned"
→ Inherits: { files: ['/home/user/project/src/auth.ts'], cwd: '/home/user/project' }
→ Researcher receives context: "Analyze auth.ts in /home/user/project"

// No need to repeat yourself!
```

**Systems:**
```typescript
// In DraconicRunRegistry:
getInheritedContext(parentId: string): InheritedContext {
  const parent = this.get(parentId);
  return {
    cwd: parent.context.cwd,
    files: parent.context.recentFiles,
    sessionKey: parent.sessionKey,
    parentRunId: parent.id,
  };
}

// Auto-injected into subagent spawn:
const child = await spawnSubagent({
  ...params,
  context: this.getInheritedContext(parentId)  // 🐉 Magic
});
```

---

### Round 5: Real-time Dashboard

**OpenClaw: ❌ STATIC STATUS**

**Draconic Superior:**

```typescript
// TUI Status Bar (updated every 500ms):
┌─────────────────────────────────────────────────────────────┐
│ 🐉 3 agents | researcher-1 running (34%) | 2.4k tokens      │
└─────────────────────────────────────────────────────────────┘

// /tree command - Interactive visualization:
/agent-tree
🐉 Active Agent Tree:

main [coordinator] 🟢 idle
├── researcher-1 [researcher] 🟡 running (34%)
│   └── Started 12s ago
│   └── Task: "Analyze authentication flow"
│   └── Est: 45s remaining
│
├── specialist-2 [specialist] 🟢 complete (3m ago)
│   └── Result: 3 files refactored
│   └── [View] [Apply Changes] [Discard]
│
└── planner-3 [planner] 🟢 idle
    └── Last task: design database schema
    └── Result cached

// Interactive controls:
[k] kill selected  [r] restart  [v] view result  [q] quit
```

**Systems:**
- TUI: Status bar component with live refresh
- DraconicRunRegistry: Real-time run status
- DraconicTokenPredictor: Progress estimation (% complete)

---

### Round 6: Intelligent Delegation (The Crown Jewel)

**OpenClaw: ❌ MANUAL EVERYTHING**

**Draconic Superior:**

```typescript
// Auto-detect when to spawn subagents:
User: "Build a user authentication system with JWT and OAuth"

[Main Agent thinks...]
🐉 Draconic Analysis:
   Complexity: HIGH (3+ domains)
   → Recommendation: Spawn coordinator subagent
   
[Auto-spawning coordinator...]
🐉 Coordinator spawned (coordinator-1)
   Task: "Plan authentication system architecture"
   
// Coordinator runs, then spawns children:
Coordinator: "Breaking down into tasks..."
  → Spawns: planner-2 "Design JWT structure"
  → Spawns: specialist-3 "Implement OAuth handlers" 
  → Spawns: reviewer-4 "Security review"

// User sees:
[🐉 Auto-delegation active]
  Task too complex for single agent
  Spawned: coordinator → 3 subtasks → 4 agents total
  
/agent-tree
main
└── coordinator-1 [coordinator]
    ├── planner-2 [planner] 🟢 complete
    ├── specialist-3 [specialist] 🟡 running 45%
    └── reviewer-4 [reviewer] ⏳ waiting
```

**Systems:**
- DraconicCapabilityRouter: Detects task complexity
- DraconicTokenPredictor: Estimates single vs multi-agent efficiency
- Autonomy mode: "off" | "simple" | "medium" | "complex" | "always"

---

## 🐉 Implementation Priority

### Phase 1: The Foundation (Registry + Artifacts)
1. Add artifact persistence to DraconicRunRegistry
2. Auto-save subagent outputs to `~/.0xkobold/agents/outputs/`
3. Emit events on subagent completion

### Phase 2: TUI Commands
1. `/agent-spawn` with Draconic routing
2. `/agent-result` with artifact retrieval
3. `/agent-tree` with hierarchical display

### Phase 3: The Dashboard
1. Real-time status bar showing active agents
2. Interactive tree overlay (selectable, killable)
3. Notification system for completed subagents

### Phase 4: The Intelligence
1. Auto-delegation detection
2. Context inheritance
3. Smart result aggregation

---

## 🐉 Why This Is Superior

| Feature | OpenClaw | 0xKobold Draconic |
|---------|----------|-------------------|
| Subagent spawning | ❌ NONE | ✅ Hierarchical with tree view |
| Result persistence | ❌ N/A | ✅ Auto-saved + browsable |
| Token prediction | ❌ N/A | ✅ Pre-spawn estimation |
| Intelligent routing | ❌ Manual | ✅ ML-based agent selection |
| Context sharing | ❌ N/A | ✅ Automatic inheritance |
| Real-time status | ❌ Static | ✅ Live progress + dashboard |
| Auto-delegation | ❌ NONE | ✅ Self-spawning for complex tasks |
| Error prediction | ❌ Reactive | ✅ Proactive with suggestions |

**The Draconic Difference:**
- OpenClaw: "Here are some agents, pick one"
- Draconic: "I see you need research + coding. Spawning researcher (90% confidence), estimated 2.4k tokens. Want me to also spawn a specialist for implementation?"
