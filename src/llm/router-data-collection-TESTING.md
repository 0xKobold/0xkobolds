# Data Collection Mode - Accuracy Testing Plan

## Overview
Test and validate that the Router's data collection mode produces **accurate, reliable model rankings** based on real user data.

## Success Criteria
1. ✅ **Accuracy**: Rankings match real-world performance
2. ✅ **Convergence**: Scores stabilize after ~50 uses
3. ✅ **No Bias**: All models get fair exploration
4. ✅ **User Feedback Correlation**: High-rated models score higher

## Test Methodology

### Phase 1: Baseline (0-50 uses per model)
```
Goal: Collect uniform data across all models
Method: Router rotates through models (20% exploration rate)
Metrics to collect:
  - Latency (ms) per model
  - Success/failure rate
  - User ratings (via /rate)
  - Context window utilization
```

### Phase 2: Convergence (50-200 uses per model)
```
Goal: Verify scores stabilize and correlate with reality
Method: Normal routing with real scores weighted
Validate:
  - Score variance decreases over time
  - Fast/reliable models score higher
  - User ratings correlate with scores
```

### Phase 3: Accuracy Validation (200+ uses)
```
Goal: Compare Router scores to independent benchmarks
Method: Run standardized tests, compare to Router rankings
Metrics:
  - Correlation coefficient between Router score and benchmark
  - Precision at k (top-3 models match reality?)
  - Mean absolute error in score predictions
```

## Test Cases

### TC-01: Exploration Rotation
```
Input: Fresh DB with all models at 0 uses
Expected: Router selects each model roughly equally
Acceptance: No model exceeds 30% selection rate in first 20 requests
```

### TC-02: Latency Score Accuracy
```
Input: Models with known latency (from benchmark)
  - kimi-k2.5:cloud ~3.5s (fast)
  - minimax-m2.7:cloud ~12s (slow)
  - glm-5:cloud ~8s (medium)
Expected: Faster models get higher speed scores
Acceptance: Speed score inversely correlates with avg latency
```

### TC-03: Quality Score from User Ratings
```
Input: User rates 5 responses as 5/5, 5 as 1/5
Expected: Model with all 5/5 ratings scores higher
Acceptance: High-rated model score > low-rated model score
```

### TC-04: Convergence Over Time
```
Input: 100 uses per model
Expected: Score variance decreases
Acceptance: Score std dev < 5 after 100 uses
```

### TC-05: Real-World Ranking Matches Scores
```
Input: User subjective assessment of model quality
Expected: Highest-scoring model is user's preferred model
Acceptance: User confirms best-performing model ranks #1
```

## Tracking Report

Generated: 2026-03-19
Models under test: minimax-m2.7:cloud, kimi-k2.5:cloud, glm-5:cloud

### Current State (Day 1)

| Model | Uses | Quality | Latency | Success | Score | Confidence |
|-------|------|---------|---------|---------|-------|------------|
| minimax-m2.7:cloud | 0 | - | - | - | - | EXPLORATION |
| kimi-k2.5:cloud | 0 | - | - | - | - | EXPLORATION |
| glm-5:cloud | 0 | - | - | - | - | EXPLORATION |

### Checkpoints
- [ ] Day 1: All models reach 10 uses (Learning phase)
- [ ] Day 3: All models reach 50 uses (Confident phase)
- [ ] Day 7: Verify scores correlate with user preferences
- [ ] Day 14: Run independent benchmark, compare to Router rankings

## Commands for Testing

```bash
# Check current rankings
sqlite3 ~/.0xkobold/model-scoring.db "
SELECT model_name, usage_count, avg_quality, avg_latency, success_rate, score
FROM model_scores WHERE model_name LIKE '%cloud'
ORDER BY score DESC;
"

# Check exploration progress
sqlite3 ~/.0xkobold/model-scoring.db "
SELECT 
  model_name,
  usage_count,
  CASE 
    WHEN usage_count < 10 THEN 'EXPLORATION'
    WHEN usage_count < 50 THEN 'LEARNING' 
    ELSE 'CONFIDENT'
  END as phase
FROM model_scores WHERE model_name LIKE '%cloud';
"

# View recent performance history
sqlite3 ~/.0xkobold/model-scoring.db "
SELECT model_name, latency_ms, user_rating, success, timestamp
FROM model_performance
WHERE timestamp > strftime('%s','now') - 86400
ORDER BY timestamp DESC
LIMIT 20;
"
```

## Accuracy Metrics to Track

### Primary Metrics
1. **Latency Accuracy**: Does avg_latency match actual response times?
2. **Success Rate Accuracy**: Does success_rate reflect actual failures?
3. **Quality Score Accuracy**: Does avg_quality correlate with /rate votes?

### Secondary Metrics
1. **Score Stability**: How much does score fluctuate day-to-day?
2. **Ranking Consistency**: Does top model stay consistent?
3. **Exploration Fairness**: Is each model getting equal exploration?

## Known Issues to Watch

1. **Cold Start Bias**: Early random selection might skew data
2. **Task Complexity Varience**: Easy vs hard tasks affect scores
3. **User Rating Fatigue**: Users might not rate consistently

## Next Steps
1. ☐ Restart TUI to activate data collection mode
2. ☐ Use system for 1 week, rate responses with /rate
3. ☐ Review rankings after 50+ uses per model
4. ☐ Compare to independent benchmark results
5. ☐ Document accuracy correlation coefficient