# E2E Testing Task

**Agent:** @testing-expert  
**Status:** Ready to start  
**File:** test/e2e/perennial-memory.e2e.test.ts

## Objective
Write comprehensive E2E tests for perennial memory

## Test Scenarios
1. ✓ Save memory with embedding (Ollama available)
2. ✓ Save memory without Ollama (fallback to text)
3. ✓ Semantic search finds related concepts
4. ✓ Text search as fallback
5. ✓ Export to JSONL
6. ✓ Database migrations (v0 → v1)
7. ✓ Temporal decay calculation
8. ✓ Backup and recovery
9. ✗ Performance with 1000+ memories

## Test Structure
```typescript
describe("Perennial Memory E2E", () => {
  test("saves memory with embedding", async () => {
    const result = await agent.run("/remember 'test content'");
    expect(result).toContain("Remembered");
  });
  
  test("recalls by semantic meaning", async () => {
    await agent.remember("JWT authentication");
    const result = await agent.recall("auth token");
    expect(result).toContain("JWT");
  });
});
```

## Deliverables
- [ ] perennial-memory.e2e.test.ts (8+ test cases)
- [ ] All tests passing
- [ ] Coverage report

Start: Now  
Due: 25 minutes
