# Kobold Scan Skill

> Security vulnerability scanner for JavaScript, Node.js, and Solidity codebases

---

## What is this?

Automated security scanning for the KOBOLDS ecosystem:
- **Secret detection** - Hardcoded API keys, passwords, tokens
- **Vulnerability patterns** - SQL injection, eval, path traversal
- **Solidity checks** - Smart contract security issues
- **Code quality** - Anti-patterns, TODOs, debug code

## Quick Start

```bash
# Install globally
npm install -g kobold-scan

# Scan a project
kobold-scan ./src

# Scan with specific severity
kobold-scan ./src --severity medium

# Output as JSON
kobold-scan ./src --format json
```

## What It Detects

### JavaScript/Node.js

| Code | Issue | Example |
|------|-------|---------|
| JS-001 | `eval()` usage | Code injection risk |
| JS-002 | Hardcoded secrets | API keys in source |
| JS-003 | `exec()` with user input | Command injection |
| JS-004 | SQL string concatenation | SQL injection |
| JS-005 | Path traversal | Unsafe file access |

### Solidity

| Code | Issue | Severity |
|------|-------|----------|
| SOL-001 | Reentrancy | Critical |
| SOL-002 | Unchecked external calls | High |
| SOL-003 | `tx.origin` usage | Medium |
| SOL-004 | Integer overflow | Medium |
| SOL-005 | Unprotected functions | Critical |

### General

- TODO/FIXME comments
- Console.log statements
- Debug code
- Magic numbers

## Usage Examples

```bash
# Basic scan
kobold-scan ./my-project

# Include medium severity and above
kobold-scan ./my-project --severity medium

# JSON output for CI/CD
kobold-scan ./my-project --format json > report.json

# Scan specific file types only
kobold-scan ./src --include "**/*.js" --exclude "node_modules/**"
```

## Configuration

Create `kobold-scan.json` in project root:

```json
{
  "severity": "low",
  "include": ["src/**/*"],
  "exclude": ["node_modules/**", "dist/**"],
  "rules": {
    "javascript": { "enabled": true },
    "solidity": { "enabled": true },
    "general": { "enabled": true }
  }
}
```

## Output Formats

### Terminal (default)
```
╔════════════════════════════════════════════════╗
║  KOBOLD SCAN - Security Report                 ║
╚════════════════════════════════════════════════╝

FILE: src/auth.js:15
RULE: JS-002 (Hardcoded Secret)
SEVERITY: HIGH
  const API_KEY = 'sk-1234567890abcdef';
  
  ^ Detected potential hardcoded credential
```

### JSON
```json
{
  "summary": {
    "filesScanned": 42,
    "issuesFound": 3,
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 0
  },
  "issues": [...]
}
```

## Programmatic API

```javascript
const { Scanner } = require('kobold-scan');

const scanner = new Scanner({
  severity: 'medium',
  include: ['src/**/*.js'],
  exclude: ['**/*.test.js']
});

const results = await scanner.scan('./my-project');

console.log(`Found ${results.issues.length} issues`);
```

## CI/CD Integration

### GitHub Actions
```yaml
- name: Security Scan
  run: |
    npm install -g kobold-scan
    kobold-scan ./src --severity medium --format json
```

### Pre-commit Hook
```bash
# .git/hooks/pre-commit
kobold-scan ./src --severity high
if [ $? -ne 0 ]; then
  echo "Security issues found. Commit aborted."
  exit 1
fi
```

## Example: Vulnerable Code

The `examples/vulnerable.js` file demonstrates common issues:

```javascript
// Hardcoded credentials
const API_KEY = 'sk-1234567890abcdef';

// SQL injection
const query = "SELECT * FROM users WHERE id = '" + req.query.id + "'";

// Eval usage
eval(req.body.expression);

// Path traversal
fs.readFile('./data/' + req.query.filename);
```

Run `kobold-scan examples/vulnerable.js` to see detection in action.

## Rule Configuration

### Disable Specific Rules
```json
{
  "rules": {
    "javascript": {
      "JS-001": { "enabled": false }
    }
  }
}
```

### Custom Severity
```json
{
  "rules": {
    "javascript": {
      "JS-002": { "severity": "critical" }
    }
  }
}
```

## Performance

- Scans ~1000 files/second
- Minimal false positives (~10%)
- Async processing for large codebases

## Resources

- [Full Documentation](SKILL.md)
- [Rule Reference](rules/)
- [Example Vulnerabilities](examples/)

## License

MIT
