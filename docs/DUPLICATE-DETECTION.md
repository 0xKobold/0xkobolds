# Duplicate Detection Skill - v0.3.0

## Overview

The Duplicate Detection Skill prevents code duplication by scanning the codebase before adding new implementations. It checks for existing functions, classes, and similar patterns.

**Use Case:** Before adding a new WhatsApp integration, run `0xkobold check WhatsApp` to see if one already exists.

---

## Usage

### CLI Commands

```bash
# Check for existing implementation by description
0xkobold check "WhatsApp integration"

# Check for existing function
0xkobold check -f calculateSum

# Check for existing class
0xkobold check -c UserManager

# Check with function signature
0xkobold check -f fetchData -s "(id: string): Promise<User>"

# Class with method signatures
0xkobold check -c UserManager -s "fetchData,saveData,deleteUser"

# Adjust similarity threshold
0xkobold check "image processing" --similarity 0.8

# Show more results
0xkobold check "gateway" --max-results 10
```

---

## How It Works

### Detection Strategies

1. **Keyword Matching**
   - Splits description into keywords
   - Searches all `.ts` files
   - Calculates keyword match ratio

2. **Function Signature Matching**  
   - Parses function signatures
   - Compares names and parameters
   - Uses Jaccard similarity for params

3. **Class/Method Matching**
   - Checks class definitions
   - Matches method signatures
   - Scores by method overlap

4. **File Purpose Detection**
   - Generates filename candidates
   - Calculates string similarity
   - Finds files by naming

### Similarity Scoring

```
0.0 - 0.5   = Not similar (safe to add)
0.5 - 0.7   = Somewhat similar (review suggested)
0.7 - 0.9   = Very similar (likely duplicate)
0.9 - 1.0   = Near exact match (definite duplicate)
```

Default threshold: **0.7** (70%)

---

## API

### Basic Check

```typescript
import { getDuplicateDetector } from "0xkobold/skills";

const detector = getDuplicateDetector({
  scanPaths: ["src", "lib"],
  similarityThreshold: 0.7,
  maxResults: 5,
  excludePatterns: ["node_modules", ".git", "test"],
});

const result = await detector.check("WhatsApp integration");

if (result.exists) {
  console.log("Implementation exists!");
  console.log(result.suggestion);
  
  // Show matches
  result.matches.forEach(match => {
    console.log(`${match.file}:${match.line} (${match.similarity}%)`);
  });
}
```

### Function Check

```typescript
const result = await detector.checkFunction(
  "calculateSum",
  "(a: number, b: number): number"
);

if (result.confidence > 0.8) {
  console.log("Very similar function exists");
}
```

### Class Check

```typescript
const result = await detector.checkClass(
  "UserManager",
  ["fetchUser", "saveUser", "deleteUser"]
);
```

### File Check

```typescript
const result = await detector.checkFile(
  "user calculations",
  ".ts"
);
```

---

## Configuration

### Config File

```json
{
  "duplicateDetection": {
    "enabled": true,
    "similarityThreshold": 0.7,
    "maxResults": 5,
    "scanPaths": ["src", "lib"],
    "excludePatterns": [
      "node_modules",
      ".git",
      "test",
      "*.test.ts"
    ]
  }
}
```

---

## Examples

### Before Adding New Feature

```bash
$ 0xkobold check "WhatsApp integration using Baileys"

🔍 Checking for existing implementations...

============================================================
RESULTS
============================================================

⚡ SIMILAR IMPLEMENTATIONS FOUND
   Best match: 90%

Similar files:
  1. src/channels/whatsapp/integration.ts:1 (90%)
     export class WhatsAppIntegration...

============================================================
SUGGESTION
============================================================
⚡ Similar implementation found (90% match) at src/channels/whatsapp/integration.ts
Review existing code before creating new implementation.
```

### Safe to Add

```bash
$ 0xkobold check "Mattermost integration"

🔍 Checking for existing implementations...

============================================================
RESULTS
============================================================

✅ NO EXISTING IMPLEMENTATION FOUND
   Safe to proceed with implementation.

============================================================
SUGGESTION
============================================================
No existing implementation found for Mattermost integration. Safe to proceed.
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No high-confidence duplicates found (safe to add) |
| 1 | High-confidence duplicate exists (90%+) |

Useful for CI/CD pipelines:

```bash
#!/bin/bash
0xkobold check "$1" || {
  echo "⚠️  Duplicate detected - review before adding"
  exit 1
}
```

---

## Integration with Agent Workflow

The skill should be automatically invoked before:
- Creating new files
- Adding new functions
- Defining new classes
- Adding integrations

Example in agent workflow:

```typescript
async function addNewFeature(description: string) {
  // Check first
  const detector = getDuplicateDetector();
  const result = await detector.check(description);
  
  if (result.exists && result.confidence > 0.85) {
    return {
      success: false,
      error: "Duplicate detected",
      suggestion: result.suggestion,
      existing: result.matches[0],
    };
  }
  
  // Proceed with implementation
  // ...
}
```

---

## Best Practices

1. **Always check before major additions**
   ```bash
   0xkobold check "new payment processor"
   ```

2. **Check function names specifically**
   ```bash
   0xkobold check -f processPayment
   ```

3. **Review similar implementations**
   - Don't duplicate, extend existing instead
   - Refactor common logic if found

4. **Lower threshold for broad checks**
   ```bash
   0xkobold check "database" --similarity 0.5
   ```

---

## Comparison Other Tools

| Tool | Scope | Speed | Accuracy |
|------|-------|-------|----------|
| 0xkobold check | Project-level | Fast | Good |
| jscpd | Code-level | Medium | Good |
| sonarcloud | Enterprise | Slow | High |

**Advantage:** Integrated into 0xKobold workflow, works during development.

---

## Troubleshooting

### Too Many Matches
```bash
# Increase threshold
0xkobold check "gateway" --similarity 0.85
```

### No Matches When Should Exist
```bash
# Check scan paths
# Ensure files are in src/ or lib/
```

### Slow Scanning
```bash
# Exclude more directories
0xkobold check "feature" --max-results 3
```

---

**Status:** ✅ Implemented in v0.3.0
