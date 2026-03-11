# 🧪 Draconic Systems Testing Guide

Complete testing instructions for all Draconic superiority systems.

---

## 📋 Quick Start

```bash
# Run all tests
bun test test/draconic-systems.test.ts

# Run with coverage (if available)
bun test --coverage test/draconic-systems.test.ts

# Run specific phase
bun test -t "Phase 1"
bun test -t "Phase 2"

# Watch mode
bun test --watch test/draconic-systems.test.ts
```

---

## 🎯 Test Categories

### 1. Unit Tests (Automated)

Already implemented in `test/draconic-systems.test.ts`:

```bash
cd ~/Documents/code/0xKobolds
bun test test/draconic-systems.test.ts
```

**Expected Output:**
```
🐉 Draconic Superiority Systems
  Phase 1: Foundation
    ✓ creates runs with hierarchical depth
    ✓ gets agent tree
    ✓ queues messages
    ✓ aborts cascade
    ✓ gets statistics
    ...

31 pass
0 fail
```

---

### 2. Build Verification

```bash
# Test all modules compile
echo "=== Phase 1: Foundation ==="
bun build src/agent/DraconicRunRegistry.ts --target=bun --outfile=/tmp/run.js
bun build src/agent/DraconicErrorClassifier.ts --target=bun --outfile=/tmp/error.js

echo "=== Phase 2: Performance ==="
bun build src/infra/DraconicConnectionPool.ts --target=bun --outfile=/tmp/pool.js
bun build src/agent/DraconicTokenPredictor.ts --target=bun --outfile=/tmp/predictor.js

echo "=== Phase 3: Intelligence ==="
bun build src/agent/DraconicCapabilityRouter.ts --target=bun --outfile=/tmp/router.js

echo "=== Phase 4: Kobold Special ==="
bun build src/lair/DraconicLairSystem.ts --target=bun --outfile=/tmp/lair.js
bun build src/hoard/DraconicHoardSystem.ts --target=bun --outfile=/tmp/hoard.js

echo "✅ All builds successful!"
```

---

### 3. Manual Testing Scripts

Create `scripts/test-draconic.ts`:

```typescript
#!/usr/bin/env bun
/**
 * Manual testing script for Draconic systems
 */

import { getDraconicRunRegistry } from "../src/agent/DraconicRunRegistry";
import { getDraconicErrorClassifier, DraconicErrorClass } from "../src/agent/DraconicErrorClassifier";
import { getDraconicTokenPredictor } from "../src/agent/DraconicTokenPredictor";
import { getDraconicCapabilityRouter } from "../src/agent/DraconicCapabilityRouter";
import { getDraconicLairSystem } from "../src/lair/DraconicLairSystem";
import { getDraconicHoardSystem } from "../src/hoard/DraconicHoardSystem";

console.log("🐉 Draconic Systems Manual Test\n");

// Test 1: Run Registry
console.log("1️⃣ Testing Run Registry...");
const registry = getDraconicRunRegistry();
const run = registry.create({
  sessionKey: "manual-test",
  name: "Test Coordinator",
  type: "coordinator",
  task: "Test task",
  workspace: "~/test",
  capabilities: { primary: ["testing"], secondary: [] },
});
console.log(`   ✅ Created run: ${run.name} (depth: ${run.depth})`);

// Test 2: Error Classifier
console.log("\n2️⃣ Testing Error Classifier...");
const classifier = getDraconicErrorClassifier();
const strategy = classifier.classify(
  new Error("Rate limit exceeded"),
  { retryCount: 0 }
);
console.log(`   ✅ Classified as: ${strategy.class}`);
console.log(`   📋 Action: ${strategy.action}`);

// Test 3: Token Predictor
console.log("\n3️⃣ Testing Token Predictor...");
const predictor = getDraconicTokenPredictor();
const estimate = predictor.estimate({
  systemPrompt: "You are helpful",
  history: [{ role: "user", content: "Hello" }],
  currentPrompt: "Test prompt",
  contextWindow: 128000,
  model: "claude-3-opus",
});
console.log(`   ✅ Estimated tokens: ${estimate.input.total}`);
console.log(`   📊 Context usage: ${estimate.contextWindow.percent.toFixed(1)}%`);

// Test 4: Capability Router
console.log("\n4️⃣ Testing Capability Router...");
const router = getDraconicCapabilityRouter();
const match = router.analyze("Implement a login system");
console.log(`   ✅ Agent: ${match.agentType} (${(match.confidence * 100).toFixed(0)}% confidence)`);
console.log(`   💡 Reason: ${match.reason}`);

// Test 5: Lair System
console.log("\n5️⃣ Testing Lair System...");
const lairs = getDraconicLairSystem();
const lair = lairs.getLair("/tmp/test-project");
console.log(`   ✅ Created lair: ${lair.name} (${lair.type})`);
console.log(`   🔧 Framework: ${lair.framework}`);

// Test 6: Hoard System
console.log("\n6️⃣ Testing Hoard System...");
const hoard = getDraconicHoardSystem();
const treasureId = hoard.treasure({
  name: "Test Pattern",
  description: "A test pattern",
  code: "const x = 1;",
  language: "typescript",
  tags: ["test"],
});
console.log(`   ✅ Created treasure: ${treasureId.slice(0, 8)}...`);
console.log(`   📦 Total treasures: ${hoard.getStats().totalTreasures}`);

// Summary
console.log("\n✅ All manual tests passed!");
console.log("\n📊 Summary:");
console.log(`   - Run Registry: ${registry.getStats().totalRuns} runs`);
console.log(`   - Error Classes: ${Object.keys(DraconicErrorClass).length} types`);
console.log(`   - Lairs: ${lairs.getStats().totalLairs} total`);
console.log(`   - Treasures: ${hoard.getStats().totalTreasures} hoarded`);
```

Run it:
```bash
cd ~/Documents/code/0xKobolds
chmod +x scripts/test-draconic.ts
bun run scripts/test-draconic.ts
```

---

## 🔬 Integration Testing

### 1. End-to-End Flow Test

```typescript
// scripts/integration-test.ts
import { getDraconicRunRegistry } from "../src/agent/DraconicRunRegistry";
import { getDraconicCapabilityRouter } from "../src/agent/DraconicCapabilityRouter";
import { getDraconicLairSystem } from "../src/lair/DraconicLairSystem";

console.log("🔬 Integration Test: Full Agent Flow\n");

// Step 1: User submits task
const userTask = "Implement user authentication with JWT tokens";
console.log(`📝 Task: "${userTask}"`);

// Step 2: Router analyzes
const router = getDraconicCapabilityRouter();
const match = router.analyze(userTask);
console.log(`🎯 Routed to: ${match.agentType} (${match.suggestedModel})`);

// Step 3: Create run
const registry = getDraconicRunRegistry();
const run = registry.create({
  sessionKey: "integration-test",
  name: "Auth Implementation",
  type: match.agentType,
  task: userTask,
  workspace: "~/auth-project",
  capabilities: {
    primary: match.suggestedCapabilities.slice(0, 3),
    secondary: [],
  },
  model: match.suggestedModel,
});
console.log(`🏃 Created run: ${run.id}`);

// Step 4: Get/create lair
const lairs = getDraconicLairSystem();
const lair = lairs.getLair(run.workspace);
lairs.addAgent(lair.id, run.id);
console.log(`🏰 Lair: ${lair.name} (${lair.framework})`);

// Step 5: Simulate work
registry.updateMetrics(run.id, {
  tokens: { input: 500, output: 800, cacheRead: 0, cacheWrite: 0, total: 1300 },
  apiCalls: 1,
});

// Step 6: Complete
registry.updateStatus(run.id, "completed");
console.log(`✅ Run completed`);

// Step 7: Record outcome
router.recordOutcome(userTask, match.agentType, match.suggestedCapabilities, Date.now() - run.metrics.startedAt, 1300, true);
lairs.recordFileOperation(lair.id, "src/auth.ts", run.id, "write", "Implemented JWT auth");

console.log("\n🎉 Integration test successful!");
```

---

## 🎮 Interactive Testing

### REPL Session

```bash
# Start Bun REPL with Draconic systems
bun --eval "
const { getDraconicRunRegistry } = await import('./src/agent/DraconicRunRegistry');
const { getDraconicCapabilityRouter } = await import('./src/agent/DraconicCapabilityRouter');
globalThis.registry = getDraconicRunRegistry();
globalThis.router = getDraconicCapabilityRouter();
console.log('Try: registry.create({...}) or router.analyze(\"...\")');
"
```

### Quick Commands

```typescript
// Test run creation
const run = registry.create({
  sessionKey: "test",
  name: "Test",
  type: "specialist",
  task: "Test task",
  workspace: "~/test",
  capabilities: { primary: ["coding"], secondary: [] }
});

// Test tree
tree = registry.getTree();

// Test error classification
classifier.classify(new Error("rate limit"), { retryCount: 0 });

// Test routing
router.analyze("Fix bug in React component");
```

---

## 📊 Performance Testing

### Benchmark Script

```typescript
// scripts/benchmark.ts
import { getDraconicRunRegistry } from "../src/agent/DraconicRunRegistry";
import { getDraconicHoardSystem } from "../src/hoard/DraconicHoardSystem";

console.log("⚡ Draconic Systems Performance Benchmark\n");

// Benchmark 1: Run creation
console.log("Benchmarking Run Registry...");
const registry = getDraconicRunRegistry();
const start1 = performance.now();
for (let i = 0; i < 1000; i++) {
  registry.create({
    sessionKey: `bench-${i}`,
    name: `Bench ${i}`,
    type: "worker",
    task: "Benchmark",
    workspace: "~/bench",
    capabilities: { primary: [], secondary: [] },
  });
}
const duration1 = performance.now() - start1;
console.log(`   Created 1000 runs in ${duration1.toFixed(2)}ms (${(1000/duration1*1000).toFixed(0)} runs/sec)`);

// Benchmark 2: Hoard search
console.log("\nBenchmarking Hoard System...");
const hoard = getDraconicHoardSystem();
// Add treasures
for (let i = 0; i < 100; i++) {
  hoard.treasure({
    name: `Treasure ${i}`,
    description: `Description ${i}`,
    code: `const x = ${i};`,
    language: "typescript",
    tags: [`tag${i % 10}`],
  });
}
const start2 = performance.now();
for (let i = 0; i < 1000; i++) {
  hoard.search(`tag${i % 10}`);
}
const duration2 = performance.now() - start2;
console.log(`   1000 searches in ${duration2.toFixed(2)}ms (${(1000/duration2*1000).toFixed(0)} searches/sec)`);

console.log("\n✅ Benchmark complete!");
```

---

## 🐛 Debug Mode

### Enable Debug Logging

```typescript
// scripts/debug-test.ts
import { getDraconicRunRegistry } from "../src/agent/DraconicRunRegistry";

const registry = getDraconicRunRegistry();

// Listen to events
registry.on("run.created", (e) => console.log("[EVENT] Run created:", e.run.id));
registry.on("run.statusChanged", (e) => console.log("[EVENT] Status:", e.status));
registry.on("run.aborted", (e) => console.log("[EVENT] Aborted:", e.reason));

// Create and manipulate runs
const run = registry.create({
  sessionKey: "debug",
  name: "Debug Run",
  type: "worker",
  task: "Debug task",
  workspace: "~/debug",
  capabilities: { primary: [], secondary: [] },
});

console.log("Run ID:", run.id);
console.log("Stats:", registry.getStats());
```

---

## 🧪 Edge Case Testing

### Test File: `scripts/edge-cases.ts`

```typescript
import { getDraconicRunRegistry } from "../src/agent/DraconicRunRegistry";

const registry = getDraconicRunRegistry();

// Edge case 1: Very deep hierarchy
console.log("Testing deep hierarchy...");
let current = registry.create({
  sessionKey: "deep",
  name: "Root",
  type: "coordinator",
  task: "Root",
  workspace: "~/deep",
  capabilities: { primary: [], secondary: [] },
});

for (let i = 0; i < 100; i++) {
  current = registry.create({
    sessionKey: "deep",
    name: `Level ${i}`,
    type: "specialist",
    task: `Task ${i}`,
    workspace: "~/deep",
    capabilities: { primary: [], secondary: [] },
    parentId: current.id,
  });
}
console.log(`✅ Created 100-level deep tree`);
console.log(`   Deepest node depth: ${current.depth}`);

// Edge case 2: Many children
console.log("\nTesting many children...");
const parent = registry.create({
  sessionKey: "wide",
  name: "Parent",
  type: "coordinator",
  task: "Parent",
  workspace: "~/wide",
  capabilities: { primary: [], secondary: [] },
});

for (let i = 0; i < 100; i++) {
  registry.create({
    sessionKey: "wide",
    name: `Child ${i}`,
    type: "worker",
    task: `Task ${i}`,
    workspace: "~/wide",
    capabilities: { primary: [], secondary: [] },
    parentId: parent.id,
  });
}
const children = registry.getChildren(parent.id);
console.log(`✅ Created parent with ${children.length} children`);

// Edge case 3: Abort cascading
console.log("\nTesting abort cascade...");
const root = registry.create({
  sessionKey: "abort",
  name: "Root",
  type: "coordinator",
  task: "Root",
  workspace: "~/abort",
  capabilities: { primary: [], secondary: [] },
});

const child1 = registry.create({
  sessionKey: "abort",
  name: "Child1",
  type: "specialist",
  task: "Child1",
  workspace: "~/abort",
  capabilities: { primary: [], secondary: [] },
  parentId: root.id,
});

registry.updateStatus(root.id, "running");
registry.updateStatus(child1.id, "running");

await registry.abortSession("abort", "Test abort");
console.log(`✅ Aborted session`);
console.log(`   Root status: ${registry.get(root.id)?.status}`);
console.log(`   Child status: ${registry.get(child1.id)?.status}`);

console.log("\n✅ All edge cases passed!");
```

---

## 📈 Continuous Testing

### GitHub Actions Workflow (`.github/workflows/test.yml`)

```yaml
name: Draconic Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test test/draconic-systems.test.ts
      - run: bun run scripts/test-draconic.ts
```

---

## 🎯 Test Checklist

Before releasing:

- [ ] Run `bun test test/draconic-systems.test.ts` (all pass)
- [ ] Run `scripts/test-draconic.ts` (manual tests)
- [ ] Run `scripts/integration-test.ts` (end-to-end)
- [ ] Run `scripts/edge-cases.ts` (borders)
- [ ] Run `scripts/benchmark.ts` (performance)
- [ ] Verify all modules build
- [ ] Test with real projects (lair detection)
- [ ] Test token prediction accuracy
- [ ] Test error classification

---

## 🆘 Troubleshooting

### "Module not found" errors
```bash
# Rebuild from scratch
rm -rf node_modules bun.lockb
bun install
bun test
```

### Type errors
```bash
# Check TypeScript
bun tsc --noEmit
```

### Slow tests
```bash
# Run in parallel
bun test --parallel test/draconic-systems.test.ts
```

---

**Run `bun test test/draconic-systems.test.ts` to begin!** 🧪
