# 0xKobold Community Stats

Share your anonymized model performance data to help improve model selection for everyone!

## What's Shared

**Only aggregated statistics - NO personal data:**

- Model name (e.g., "llama3.1:8b")
- Average rating (1-5)
- Average latency (ms)
- Success rate (0-1)
- Usage count
- Task types (chat, code, vision, etc.)

**NOT shared:**
- ❌ Your prompts
- ❌ Model responses
- ❌ Your identity or IP
- ❌ Any personal information

## How to Contribute

### Step 1: Enable Community Sharing

```bash
# In 0xKobold TUI or CLI
/community enable
```

### Step 2: Use Models and Rate Them

```bash
# Use your usual models
/rate 4  # Rate last response (1-5)
/rate 5  # Another rating
# ... use more models
```

### Step 3: Export Your Stats

```bash
/community export
```

This creates a file at `~/.0xkobold/community-submission.json`

### Step 4: Submit Your Data

**Option A: GitHub Pull Request**
1. Fork https://github.com/kobolds/0xKobolds
2. Copy your `community-submission.json`
3. Add it to `/community/submissions/user_<your-id>.json`
4. Create a PR

**Option B: GitHub Issue**
1. Go to https://github.com/kobolds/0xKobolds/issues
2. Create a new issue with title "Community Stats Submission"
3. Paste the content of your submission file

**Option C: GitHub Discussion**
1. Go to https://github.com/kobolds/0xKobolds/discussions
2. Post in the "Community Stats" category
3. Include your submission data

## How Community Data Is Used

Your anonymized data is merged with other users' data to create:

1. **Community Tier Lists** - See which models work best across different hardware and use cases
2. **Improved Recommendations** - Better model suggestions based on real user experience
3. **Performance Benchmarks** - Understand how models perform in production

## Privacy Guarantee

- ✅ Anonymous ID generated Locally
- ✅ No IP addresses stored
- ✅ No email or account required
- ✅ Opt-in only (disabled by default)
- ✅ Can disable anytime with `/community disable`
- ✅ All submissions are public (don't submit sensitive info)

## Commands Reference

```bash
/community              # Show help
/community status       # Check sharing status
/community enable       # Enable sharing
/community disable      # Disable sharing
/community export       # Generate submission file
/community fetch        # Fetch community stats
/community merge        # Merge local + community stats
/community tier-list    # Show community tier list
```

## File Format

Your submission will look like:

```json
{
  "userId": "user_1234567890_abc",
  "stats": [
    {
      "modelName": "llama3.1:8b",
      "avgRating": 4.2,
      "avgLatency": 1500,
      "successRate": 0.95,
      "usageCount": 42,
      "taskTypes": ["chat", "code"],
      "lastUpdated": 1710720000000,
      "contributorCount": 1
    }
  ],
  "timestamp": 1710720000000
}
```

## Questions?

- Open an issue: https://github.com/kobolds/0xKobolds/issues
- Discussions: https://github.com/kobolds/0xKobolds/discussions

---

Thank you for helping improve 0xKobold for everyone! 🐉