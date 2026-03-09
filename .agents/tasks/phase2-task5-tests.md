> **Agent:** Worker ⚒️> **Task ID:** phase2-task5-tests
> **Priority:** Medium> **Depends on:** All previous tasks
# Task 5: Tests & Integration

## Objective
Write comprehensive tests for all Phase 2 features and ensure everything integrates properly.

## Deliverables

1. **test/unit/heartbeat/scheduler.test.ts**
   - Cron parsing tests
   - Schedule execution tests
   - Timezone handling

2. **test/unit/heartbeat/checkin.test.ts**
   - Check-in type detection
   - Prompt generation
   - Idle detection

3. **test/unit/heartbeat/notifications.test.ts**
   - Quiet hours
   - Rate limiting
   - Notification timing

4. **test/unit/mode/auto-detector.test.ts**
   - Detection accuracy
   - Confidence scoring
   - Edge cases

5. **test/unit/mode/natural-switcher.test.ts**
   - Switch logic
   - User suggestions
   - Autonomous mode

## Integration Tests
- Full heartbeat workflow
- Mode switching with real prompts
- HEARTBEAT.md parsing

## Test Coverage
- Minimum 80% coverage
- All edge cases handled
- Error scenarios tested

## Done When
- [ ] All test files created
- [ ] 230+ total tests passing
- [ ] Build succeeds
- [ ] No regressions

## Status
Write to: .agents/status/phase2-task5-done
Write final summary to: .agents/results/phase2-complete.md
