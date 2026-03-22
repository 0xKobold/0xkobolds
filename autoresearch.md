# Autoresearch: Build Performance

## Objective
Optimize TypeScript compilation time for the 0xKobold codebase.

## Metrics
- **Primary**: build_seconds (seconds, lower is better) — `bun run build` wall-clock time
- **Secondary**: incremental_seconds, fresh_seconds, bundle_kb

## How to Run
```bash
./autoresearch.sh
```
Outputs: `METRIC build_seconds=X incremental_seconds=Y`

## Files in Scope
- `tsconfig.json` — Base TypeScript configuration
- `tsconfig.build.json` — Build-optimized configuration
- `package.json` — Build scripts

## Off Limits
- Don't change TypeScript strictness settings
- Don't remove type safety features
- Tests must still pass

## Constraints
- `bun test` must pass
- Type safety must be maintained

## What's Been Tried

### ✅ INCREMENTAL BUILDS (2026-03-22)
- **Approach**: Create `tsconfig.build.json` with `incremental: true` and `sourceMap: false`
- **Results**:
  - Fresh build: 20s (baseline ~22s)
  - Incremental: **7.6s (65% faster!)**
  - Savings: ~14s per incremental build
- **Status**: KEEP - significant improvement for dev workflow

### ❌ SOURCE MAPS ONLY
- Removed sourceMap: true → false
- Savings: ~3s (14.5%)
- But loses debug info - not worth it

### ❌ TSC --NOEMIT
- Type-check only (no emit): ~18s
- Still not faster than incremental full build

### ❌ BUN BUILD
- Fast: ~0.8s
- But doesn't preserve file structure
- Bundle is 10MB+ single file
- Doesn't work for library with multiple entry points

## Ideas
- [ ] Parallel type-checking with `--build` mode and project references
- [ ] Split into packages with separate tsconfigs
- [ ] Watch mode for even faster iteration
- [ ] esbuild for transpile + tsc --noEmit for type check
