# Hybrid Embedded Mode Architecture

## Overview

Combine the best of both worlds:
- **Pi TUI** for interactive terminal UI (keep what you like)
- **Extension system** for tools and commands
- **Embedded runner** for system prompt injection and core lifecycle

## Architecture

```
┌─────────────────────────────────────────────┐
│              Pi TUI (keep)                  │
│  Interactive terminal experience            │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│         Embedded Runner Layer               │
│  src/agent/embedded-runner.ts             │
├─────────────────────────────────────────────┤
│  • Custom system prompt builder            │
│  • Bootstrap file injection (SOUL.md)     │
│  • Session lifecycle control                │
│  • Extension loading coordinator            │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│         Extensions (existing)               │
├─────────────────────────────────────────────┤
│  • Tools (agent_orchestrate, web_fetch)    │
│  • Commands (/agent, /autonomous)          │
│  • Event handlers                          │
└─────────────────────────────────────────────┘

## Flow

User Input → Pi TUI → Embedded Runner
                              │
              ┌───────────────┼───────────────┐
              │               │               │
         System Prompt    Extensions      Session
         Injection        (tools)         API
              │               │               │
              └───────────────┴───────────────┘
                              │
                         Response
```

## Key Components

### 1. Embedded Runner (`src/agent/embedded-runner.ts`)

Wraps `createAgentSession` with custom system prompt:

```typescript
export async function runEmbeddedKobold(params: {
  prompt: string;
  cwd: string;
  workspaceDir: string;
  extensions: ExtensionAPI[];
  onUpdate?: (update: any) => void;
}) {
  // 1. Load bootstrap files
  const bootstrapContent = await loadBootstrapFiles(params.workspaceDir);
  
  // 2. Build custom system prompt with injection
  const systemPrompt = buildKoboldSystemPrompt({
    basePrompt: DEFAULT_SYSTEM_PROMPT,
    bootstrapFiles: bootstrapContent, // SOUL.md, IDENTITY.md injected here
    tools: params.extensions.flatMap(e => e.tools),
  });
  
  // 3. Create session
  const { session } = await createAgentSession({
    cwd: params.cwd,
    tools: params.extensions.flatMap(e => e.tools),
    // ... other config
  });
  
  // 4. Apply custom system prompt
  applySystemPromptOverride(session, systemPrompt);
  
  // 5. Run with user prompt
  return session.prompt(params.prompt);
}
```

### 2. System Prompt Builder (`src/agent/system-prompt.ts`)

Constructs prompt with bootstrap injection:

```typescript
export function buildKoboldSystemPrompt(config: SystemPromptConfig) {
  return [
    config.basePrompt,
    "",
    "<!-- Bootstrap Context -->",
    ...config.bootstrapFiles.map(f => 
      `<!-- ${f.name} -->\n${f.content}`
    ),
    "",
    "<!-- Tools -->",
    generateToolDescriptions(config.tools),
  ].join("\n\n");
}
```

### 3. Extension Coordinator

Extensions export a `onSystemPrompt` hook:

```typescript
// In each extension
export async function onSystemPrompt(context: SystemPromptContext) {
  // Extensions can contribute to system prompt
  context.addSection("My Extension Context", "...");
}
```

## Migration Path

### Phase 1: Foundation (v0.2.0)
- [ ] Create embedded runner
- [ ] System prompt builder with bootstrap injection
- [ ] SOUL.md/IDENTITY.md automatic loading
- [ ] Keep all existing extensions working

### Phase 2: Features (v0.2.x)
- [ ] Move persona loading to embedded
- [ ] Heartbeat system via embedded hooks
- [ ] Skills system in embedded

### Phase 3: Optimization (v0.3.0)
- [ ] Evaluate which extensions to keep vs inline
- [ ] Performance: inline hot paths

## Benefits

| Aspect | Before (Extension-only) | After (Hybrid) | OpenClaw (Full) |
|--------|------------------------|--------------|-----------------|
| Pi TUI | ✅ Yes | ✅ Yes | ❌ Custom |
| System Prompt | ❌ No control | ✅ Custom | ✅ Custom |
| Extensions | ✅ Full | ✅ Full | ✅ + More |
| Complexity | ✅ Low | 🟡 Medium | 🔴 High |
| Migration Cost | - | 🟡 Medium | 🔴 High |

## Implementation Steps

1. **Create `src/agent/` directory**
   - `embedded-runner.ts` - Main entry
   - `system-prompt.ts` - Prompt builder
   - `bootstrap-loader.ts` - File loading

2. **Hook into existing flow**
   - Add `--embedded` flag to CLI
   - When embedded: use custom runner
   - When not: use standard pi TUI

3. **Gradual migration**
   - Keep extensions as-is
   - Move bootstrap loading to embedded
   - Extensions can still contribute via hooks

## Usage

```bash
# Standard mode (current)
0xkobold

# Embedded mode (new, with system prompt injection)
0xkobold --embedded

# With workspace
0xkobold --embedded --workspace ./my-project
```

## Decision Matrix

Feature | Extension | Embedded | Notes
--------|-----------|----------|------
Tools | ✅ | ✅ | Both work
Commands | ✅ | ✅ | Both work
System Prompt | ❌ | ✅ | Needs embedded
Event Hooks | ✅ | ✅ | Both work
Session Lifecycle | ❌ | ✅ | Needs embedded
UI | Pi TUI | Pi TUI | Same

## Conclusion

Hybrid mode gives us:
- **Familiar Pi TUI** (keep what you like)
- **Custom system prompts** (bootstrap injection)
- **Incremental migration** (no big bang)
- **Best of both worlds** (extensions + embedded)
