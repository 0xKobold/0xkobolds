# 0xKobold Model Scoring System - Implementation Summary

## Overview
Implemented a comprehensive model scoring and ranking system for 0xKobold that tracks model performance, stores history persistently, and generates AI-driven tier lists.

## Key Components Added

### 1. Model Scoring Database (`src/llm/model-scoring-db.ts`)
- Persistent SQLite database at `~/.0xkobold/model-scoring.db`
- Tables: `performance_history`, `model_scores`, `task_performance`, `user_feedback`, `tier_lists`
- Tracks: latency, quality ratings, success rate, usage count
- Generates: tier lists (S/A/B/C/D) based on performance

### 2. Model Popularity Service (`src/llm/model-popularity.ts`)
- Scrapes Ollama library for pull counts (community popularity) 
- Local usage tracking
- Nostr integration framework for community-shared ratings
- Calculates weighted popularity scores

### 3. Enhanced Router Core (`src/llm/router-core.ts`)
- Integrated scoring database for persistence
- Added popularity weights to scoring algorithm (7% weight)
- Added community score weighting (5% weight)
- Methods for tier list generation, performance history, etc.

### 4. Extended Router Commands (`src/llm/router-commands.ts`)
- `/model-rankings [day|week|month|all]` - Show leaderboard
- `/tier-list [day|week|month|all]` - AI-generated tier list
- `/popularity [--refresh]` - Show Ollama pull counts
- `/rate <1-5>` - Rate last response (now persisted)
- `/router stats <model>` - Per-model statistics
- `/router history` - Recent performance history

### 5. Extension Integration (`src/extensions/core/routed-ollama-extension.ts`)
- Tracks model performance on `turn_end` events
- Records latency, tokens, usage counts
- Updates local usage counts in popularity service
- Registers all new scoring commands

### 6. Configuration & Logging Controls
- Added logging configuration to unified config
- Added `KOBOLD_EXTENSION_LOGS=false` env var to reduce extension logs
- Databases initialized during `0xkobold init` and `0xkobold setup`

## Privacy & Security

✅ **Local-only storage** - All data stays in `~/.0xkobold/`
✅ **No prompts/responses stored** - Only metrics and metadata  
✅ **No user identity tracked** - Anonymous session IDs only
✅ **Nostr sharing requires opt-in** - Not enabled by default
✅ **No automatic external transmission** - Zero telemetry

## Commands Available

```
/router auto              - Enable adaptive routing
/router manual            - Use static model  
/router info              - Show current model
/rate <1-5>              # Rate last response
/model-rankings          # Show performance ranking
/tier-list               # Show AI-generated tier list  
/popularity              # Show Ollama popularity
/router stats <model>    # Detailed model stats
/router history          # Recent usage
```

## Scoring Algorithm

```
Final Score = 
  (Quality × 40%) + 
  (Success Rate × 30%) + 
  (Latency × 20%) + 
  (Popularity × 10%)

Where:
- Quality: User ratings (1-5) normalized to 0-1
- Success Rate: Percentage of successful responses  
- Latency: Inverse response time normalized
- Popularity: Weighted combo of Ollama pulls + local usage + community ratings
```

## Tier List Generation

Models scored and assigned tiers:
- 🥇 **S Tier** (≥0.85): Excellent - Top performers
- 🥈 **A Tier** (≥0.70): Great - Reliable choices  
- 🥉 **B Tier** (≥0.55): Good - Solid performers
- ⭐ **C Tier** (≥0.40): Fair - Acceptable
- · **D Tier** (<0.40): Needs improvement

## Testing

- ✅ 12/12 unit tests passing
- ✅ Integration tests verified
- ✅ Privacy verified (no prompts/responses stored)
- ✅ Build succeeds
- ✅ Extension loads correctly

## Files Modified/Added

```
Added:
- src/llm/model-scoring-db.ts
- src/llm/model-popularity.ts
- tests/model-scoring.test.ts

Modified:
- src/llm/router-core.ts          - Scoring integration
- src/llm/router-commands.ts      - New commands
- src/llm/index.ts               - Updated exports
- src/extensions/core/routed-ollama-extension.ts - Tracking
- src/cli/commands/init.ts        - DB creation on init
- src/cli/commands/setup.ts       - DB creation on setup
- src/config/unified-config.ts    - Logging config
- src/extensions/loader.ts        - Conditional extension logs
- README.md                      - Feature documentation
- IMPLEMENTATION-SUMMARY.md      - This summary

Documentation:
- ~/.0xkobold/obsidian_vault/Research/Model-Scoring-System.md
- ~/.0xkobold/obsidian_vault/Research/Model-Scoring-Security-Analysis.md  
- ~/.0xkobold/obsidian_vault/Research/Model-Scoring-Implementation-Complete.md
```

## Environment Variables

```
KOBOLD_EXTENSION_LOGS=false  # Reduce extension loading logs
```

## Quick Verification

After installation:
```bash
# Initialize (creates databases)
0xkobold init

# Start with reduced logs  
KOBOLD_EXTENSION_LOGS=false 0xkobold start

# In TUI:
/rate 4                     # Rate last response  
/model-rankings             # View leaderboard
/tier-list                  # View tier list
/popularity                 # View Ollama popularity
```