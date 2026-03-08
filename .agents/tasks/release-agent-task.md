# Release Coordination Task

**Agent:** @release-coordinator  
**Status:** Waiting for other agents  
Dependencies: diagnostics, memory-synthesis, tests, docs

## Objective
Finalize 0.0.4 release

## Tasks
1. **Version Bump**
   - Update package.json version to 0.0.4
   - Update src/index.ts version constant
   - Update CHANGELOG date

2. **Integration Check**
   - Verify all extensions load
   - Run full test suite
   - Build passes (no TS errors)

3. **Feature Checklist**
   - [ ] VPS deployment works
   - [ ] Perennial memory works (/remember, /recall)
   - [ ] Diagnostics work (/diagnostics)
   - [ ] Memory synthesis works (/memory-synthesize)
   - [ ] Git workflow blocks master push

4. **Create Release**
   - Git tag v0.0.4
   - Push to origin
   - Create PR to master (per git workflow)

5. **Clean Up**
   - Remove agent task files
   - Final commit

## Deliverables
- [ ] package.json: 0.0.4
- [ ] All tests pass (233+)
- [ ] Build successful
- [ ] Git tag v0.0.4
- [ ] PR to master

Start: When deps complete  
Due: 10 minutes (total 1 hour)
