# Phase 2 Completion - Task Breakdown

## Overview
Complete Phase 2: Natural Interaction using parallel sub-agents

## Tasks

### Task 1: Heartbeat System Core
**Agent:** Worker (⚒️)
**Files:**
- src/heartbeat/scheduler.ts - Cron-based scheduling
- src/heartbeat/checkin.ts - Check-in logic
- src/heartbeat/notifications.ts - Proactive notifications
**Dependencies:** None
**Expected Output:** Working heartbeat system with scheduled check-ins

### Task 2: HEARTBEAT.md Integration  
**Agent:** Worker (⚒️)
**Files:**
- src/agent/heartbeat-loader.ts - Load HEARTBEAT.md config
- Update src/agent/bootstrap-loader.ts - Include HEARTBEAT.md
**Dependencies:** Task 1
**Expected Output:** HEARTBEAT.md parsed and integrated

### Task 3: Mode Auto-Detection
**Agent:** Specialist (🧠)
**Files:**
- src/mode/auto-detector.ts - Detect when to switch modes
- src/mode/context-analyzer.ts - Analyze context for mode hints
**Dependencies:** None
**Expected Output:** Smart mode switching based on context

### Task 4: Natural Mode Switching
**Agent:** Worker (⚒️)
**Files:**
- src/mode/natural-switcher.ts - Seamless mode transitions
- Update src/extensions/core/mode-manager-extension.ts
**Dependencies:** Task 3
**Expected Output:** Automatic mode switching without explicit commands

### Task 5: Tests & Integration
**Agent:** Worker (⚒️)
**Files:**
- test/unit/heartbeat/*.test.ts
- test/unit/mode/auto-detector.test.ts
**Dependencies:** Tasks 1-4
**Expected Output:** All tests passing

## Coordination

Phase 1 and 3 can run in parallel.
Phase 2 depends on Phase 1.
Phase 4 depends on Phase 3.
Phase 5 depends on all.

## Success Criteria
- [ ] Heartbeat system with scheduled check-ins
- [ ] HEARTBEAT.md configuration
- [ ] Proactive notifications
- [ ] Idle detection
- [ ] Natural mode switching
- [ ] Auto-detection of mode needs
- [ ] 230+ tests passing
