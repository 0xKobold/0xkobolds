# Router Data Collection Mode

## Overview

The Router learns model scores from **real user data** instead of arbitrary weights.

## How It Works

### Exploration Phase (under 10 tests)
```
┌─────────────────────────────────────────────────────────────┐
│  Model has < 10 tests → ROTATE through models              │
│  Goal: Collect diverse data across all models               │
│                                                             │
│  Request 1: Try minimax-m2.7:cloud                         │
│  Request 2: Try kimi-k2.5:cloud                            │
│  Request 3: Try qwen3.5:cloud                              │
│  ...                                                        │
│  Collects: latency, success/fail, user rating (optional)    │
└─────────────────────────────────────────────────────────────┘
```

### Learning Phase (10-50 tests)
```
┌─────────────────────────────────────────────────────────────┐
│  Model has 10-50 tests → BUILD SCORE from real data        │
│                                                             │
│  RealScore = {                                              │
│    quality: avg(userRatings) * 0.4,                        │
│    speed: normalize(latencyRank) * 0.2,                    │
│    reliability: successRate * 0.2,                         │
│    community: nostrCommunityScore * 0.2                    │
│  }                                                          │
│                                                             │
│  Start preferring better-performing models                  │
└─────────────────────────────────────────────────────────────┘
```

### Confident Phase (50+ tests)
```
┌─────────────────────────────────────────────────────────────┐
│  Model has 50+ tests → USE REAL SCORES for routing         │
│                                                             │
│  Score is now reliable and accurate                         │
│  Minimal exploration, mostly exploitation                   │
│  Share scores to Nostr for community aggregation            │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

```typescript
// In config.json
{
  "llm": {
    "dataCollectionMode": true,  // Enable data collection
    "minTestsThreshold": 10,     // Minimum tests before trusting scores
    "confidentThreshold": 50,    // Tests needed for confident scoring
    "explorationRate": 0.2,     // 20% of requests explore new models
    "shareToNostr": true,        // Share scores to community
    "models": {
      "minimax-m2.7:cloud": { "priority": "primary" },
      "kimi-k2.5:cloud": { "priority": "secondary" }
    }
  }
}
```

## Database Schema

```sql
CREATE TABLE model_real_scores (
  model_name TEXT PRIMARY KEY,
  
  -- Real metrics (collected from actual usage)
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  
  -- Latency tracking
  avg_latency_ms REAL DEFAULT 0,
  p50_latency_ms REAL DEFAULT 0,
  p95_latency_ms REAL DEFAULT 0,
  
  -- User ratings (optional)
  total_rating REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  avg_rating REAL DEFAULT 0,
  
  -- Computed score
  real_score REAL DEFAULT 0,
  confidence_level TEXT DEFAULT 'exploration', -- exploration/learning/confident
  
  -- Community sync
  nostr_shared INTEGER DEFAULT 0,
  community_score REAL DEFAULT 0,
  
  last_used INTEGER,
  last_updated INTEGER
);
```

## Score Calculation

```typescript
function calculateRealScore(model: ModelData): number {
  if (model.usageCount < MIN_TESTS) {
    return 0; // Unknown - in exploration mode
  }
  
  const qualityScore = model.avgRating * 20; // 1-5 → 0-100
  const speedScore = normalizeLatency(model.avgLatency);

// Community weight
  const communityScore = model.communityScore * 0.2;

  return qualityScore + speedScore + reliabilityScore + communityScore;
}
```

## User Feedback Collection

Optional: After each response, ask for rating:

```
[Rate this response?] [👍 Good] [👎 Bad] [⏭️ Skip]

# Or use implicit signals:
# - Response accepted without steering → good
# - User steered/corrected → negative signal
# - Tool call succeeded → positive signal
```

## Nostr Community Sharing

Share anonymized model scores to Nostr:

```json
{
  "kind": 31990,
  "content": {
    "model": "minimax-m2.7:cloud",
    "avgLatency": 2400,
    "successRate": 0.95,
    "avgRating": 4.2,
    "usageCount": 47,
    "timestamp": 1710844800
  }
}
```

Aggregate from other users to improve scores.

## Implementation Files

1. `src/llm/router-core.ts` - Add data collection mode
2. `src/llm/model-scoring-db.ts` - Add real scores table
3. `src/llm/model-popularity.ts` - Add Nostr sharing
4. `src/extensions/core/routed-ollama-extension.ts` - Collect metrics after response