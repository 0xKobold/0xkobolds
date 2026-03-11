# 🗣️ Natural Language Commands

## Overview

You can now spawn and control agents using **natural language** instead of slash commands!

## Natural Language Patterns

### Spawn Agents

| Say This... | Equivalent To... |
|-------------|------------------|
| `spawn a researcher to analyze the codebase` | `/agent-spawn researcher "analyze the codebase"` |
| `get a specialist to fix this bug` | `/agent-spawn specialist "fix this bug"` |
| `I need a planner to design the API` | `/agent-spawn planner "design the API"` |
| `analyze the authentication flow` | `/agent-spawn researcher "analyze the authentication flow"` |
| `implement user registration` | `/agent-spawn specialist "implement user registration"` |
| `plan how to migrate to TypeScript` | `/agent-spawn planner "how to migrate to TypeScript"` |
| `review this code` | `/agent-spawn reviewer "review this code"` |
| `find all files that handle caching` | `/agent-spawn scout "find all files that handle caching"` |

### Agent Control

| Say This... | Equivalent To... |
|-------------|------------------|
| `stop agent #abc123` | `/agent-stop abc123` |
| `pause the last agent` | `/agent-stop last` |
| `resume agent #def456` | `/agent-resume def456` |
| `kill running agent` | `/agent-kill last` |

### Query Status

| Say This... | Equivalent To... |
|-------------|------------------|
| `show all running agents` | `/agents` |
| `display agent tree` | `/agent-tree` |
| `list artifacts` | `/artifacts` |

## Smart Type Detection

The system automatically detects agent type based on keywords:

| Keywords | Agent Type |
|----------|------------|
| `analyze`, `research`, `investigate`, `explore`, `study` | **researcher** |
| `implement`, `fix`, `refactor`, `build`, `create`, `write`, `code` | **specialist** |
| `plan`, `design`, `architect`, `structure`, `organize` | **planner** |
| `review`, `check`, `audit`, `validate`, `inspect` | **reviewer** |
| `find`, `discover`, `locate`, `search`, `scout` | **scout** |

## Complex Examples

### Multi-step delegations

```
User: analyze the codebase structure and then implement caching

→ System: This needs multiple agents!
  1. Spawn scout to find caching opportunities
  2. Spawn planner to design approach
  3. Spawn specialist to implement
```

### Help with...

```
User: help me with authentication

→ System analyzes context:
  - Contains "help" → needs delegation
  - Context suggests implementation
  → Spawn specialist
```

## How It Works

1. **Input intercepted** before normal processing
2. **Pattern matching** against natural language regexes
3. **Transform** to slash command format
4. **Execute** as normal tool call

## Implementation

See:
- Parser: `src/tui/commands/natural-language-commands.ts`
- Integration: `src/extensions/core/tui-integration-extension.ts` (input event handler)

## Future Enhancements

- Context-aware suggestions ("You might also want...")
- Multi-step task decomposition
- Conversation history references ("like we did before")
