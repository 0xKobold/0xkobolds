# Autonomous Subagent System

**Goal:** Main agent automatically uses subagents based on task analysis

## Usage

User says: "Implement user authentication system"

Agent automatically:
1. Analyzes complexity: HIGH (multi-file, multiple components)
2. Spawns scout: "Find all auth-related code"
3. Spawns planner: "Create implementation plan"
4. Spawns workers: "Implement each component"
5. Reviews: "Code review all changes"

## Implementation Strategies

### Strategy 1: Task Analysis (Recommended)
Agent analyzes task and decides:
- SIMPLE (1-2 files) → Do itself
- MEDIUM (3-5 files) → Use scout + worker
- COMPLEX (5+ files) → Full workflow (scout → planner → workers → reviewer)

### Strategy 2: Always Parallel (Fast mode)
Every task spawns 3 scouts in parallel:
- Scout 1: Find relevant files
- Scout 2: Check existing patterns
- Scout 3: Identify dependencies
Then aggregates and proceeds

### Strategy 3: User Preference Mode
User can set: `/mode autonomous [simple|medium|complex|always]`

## Prompt Engineering

Add to agent system prompt:

```
You are an autonomous coding agent. When given tasks:

1. Analyze complexity:
   - Simple: Direct implementation, minimal files
   - Medium: Multiple files, clear patterns
   - Complex: Architecture changes, many components

2. For MEDIUM/COMPLEX tasks, delegate to subagents:
   - spawn scout: "Find relevant code"
   - spawn planner: "Create plan based on scout findings"
   - spawn workers: "Implement each component"
   - spawn reviewer: "Review all changes"

3. Use parallel execution when possible

4. Always report what subagents did and why you used them
```

## Tool Enhancement

Add `auto_delegate` parameter to agent_spawn:
```typescript
await agent_spawn({
  task: "Implement auth",
  auto_delegate: true, // Agent decides complexity
  max_agents: 4      // Limit parallel agents
});
```
