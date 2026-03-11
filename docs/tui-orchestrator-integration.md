# TUI-Orchestrator Integration Proposal

## Current Gap Analysis

### Problem: Subagent Result Retrieval
When `agent_orchestrate` spawns a subagent, the output is lost:
- Returns: `✅ researcher complete (505ms)`
- Missing: The actual analysis content
- Registry: Tracks run metadata but not artifacts

### Problem: Async Notification Gap
Subagent completes but parent isn't notified:
- Must poll `agent_orchestrate({ operation: "list" })`
- No event-driven completion

---

## Proposed Integration

### Phase 1: Result Persistence (DraconicRegistry Enhancement)

Add artifact storage to registry:

```typescript
// DraconicRunRegistry.ts
interface DraconicAgentRun {
  // ... existing fields
  artifacts?: Array<{
    type: 'file' | 'text' | 'json',
    path?: string,        // For files
    content?: string,     // For inline text
    key: string,          // retrieval key
    createdAt: number
  }>
}

// New operations
agent_orchestrate({
  operation: 'get_artifact',
  runId: 'researcher-1773175493090',
  artifactKey: 'analysis-report'
})
```

### Phase 2: Event Bus Integration

Bridge subagent completion to TUI:

```typescript
// In gateway-extension or agent-orchestrator-extension
eventBus.emit('subagent.completed', {
  runId: string,
  parentId?: string,
  success: boolean,
  artifacts: Artifact[]
});

// In TUI
eventBus.on('subagent.completed', (payload) => {
  chatLog.addSystem(`✅ ${payload.runId} completed`);
  if (payload.parentId === currentAgentId) {
    showArtifactPreview(payload.artifacts[0]);
  }
});
```

### Phase 3: TUI Command Handlers

Port koclaw's command handler pattern:

```typescript
// src/tui/commands/orchestration-commands.ts
import { createCommandHandlers } from '@mariozechner/pi-tui';

export function createOrchestrationCommands(ctx: CommandContext) {
  return {
    '/agents': async () => {
      const tree = await agent_orchestrate({ operation: 'agent_tree' });
      ctx.openOverlay(createAgentTreeOverlay(tree));
    },
    
    '/agent-spawn': async (args: string) => {
      // Parse: /agent-spawn specialist "implement auth"
      const [type, ...taskParts] = args.split(' ');
      const task = taskParts.join(' ');
      
      // Show estimate first
      const estimate = await predictTokens(task);
      if (estimate > TOKEN_THRESHOLD) {
        const proceed = await ctx.confirm(`Estimated ${estimate} tokens. Proceed?`);
        if (!proceed) return;
      }
      
      // Spawn with parent context
      const result = await agent_orchestrate({
        operation: 'spawn_subagent',
        subagent: type,
        task,
        parentId: ctx.currentAgentId,  // Implicit from TUI session
        inheritContext: ['files', 'cwd'] // New: context propagation
      });
      
      // Auto-display first artifact
      if (result.artifacts?.[0]) {
        ctx.chatLog.addSystem(result.artifacts[0].content);
      }
    },
    
    '/agent-result': async (runId: string) => {
      const artifacts = await agent_orchestrate({
        operation: 'get_artifact',
        runId
      });
      ctx.chatLog.addSystem(artifacts.map(a => a.content).join('\n'));
    }
  };
}
```

### Phase 4: Real-time Status Bar

Inspired by koclaw's status bar (tui.ts:452):

```typescript
// src/tui/components/status-bar.ts
export function createOrchestratorStatus(registry: DraconicRunRegistry) {
  return {
    getText() {
      const stats = registry.getStats();
      if (stats.activeRuns === 0) return '🐉 idle';
      
      const current = registry.query({ status: 'running' }).runs[0];
      return `🐉 ${current.name} (${current.progress}%) | ${stats.activeRuns} active`;
    }
  };
}

// In TUI main loop
statusLoader.setMessage(`${activityStatus} • ${orchestratorStatus.getText()}`);
```

---

## Alternative: Agent Workspace Pattern

Instead of fixing orchestration, leverage the existing `AgentWorkspace` extension:

```typescript
// Use workspace tools for result sharing
// AgentWorkspace provides: write_note, read_note, search_notes

// Subagent writes:
write_note({
  title: `Analysis: ${task}`,
  content: analysisResult,
  tags: ['subagent-result', parentId]
});

// Parent reads:
const results = search_notes({ 
  tags: ['subagent-result'],
  since: spawnTime 
});
```

---

## Quick Win Implementation

Add to `agent-orchestrator-extension.ts`:

```typescript
// After spawn completes, auto-save to file
async function spawnDraconicSubagent(...) {
  // ... existing code ...
  
  // Auto-save output
  const outputPath = path.join(AGENTS_DIR, 'outputs', `${runId}.md`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, result.output);
  
  // Store in registry
  draconicRegistry.addArtifact(runId, {
    type: 'file',
    path: outputPath,
    key: 'output'
  });
  
  return {
    ...result,
    artifactPath: outputPath  // Include in response
  };
}
```

Then TUI can read: `cat ~/.0xkobold/agents/outputs/researcher-*.md`

---

## Summary

| Issue | Quick Fix | Proper Fix |
|-------|-----------|------------|
| Lost results | Write to `~/.0xkobold/agents/outputs/` | Artifact persistence in registry |
| No notification | File watcher on output dir | Event bus integration |
| Context isolation | Pass `cwd` and `recentFiles` explicitly | Context inheritance in spawn |
| No TUI visibility | `tail -f` the output file | Real-time status bar overlay |
