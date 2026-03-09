# Pre-commit Hook Setup

This document explains the pre-commit and pre-push hooks configured for the 0xKobold project.

## Overview

Git hooks are scripts that run automatically at certain points in the Git workflow. We've configured:

- **pre-commit**: Runs before each commit
- **pre-push**: Runs before each push to remote

## What the Hooks Do

### Pre-commit Hook

Runs automatically when you run `git commit`:

1. ✅ Stashes unstaged changes (to only check what's being committed)
2. 🔍 Runs `bun run build` (TypeScript compilation)
3. 🧹 Runs linter if configured (optional)
4. ✅ If all checks pass, allows the commit
5. ❌ If checks fail, blocks the commit with error details

### Pre-push Hook

Runs automatically when you run `git push`:

1. 🔍 Runs `bun run build` (TypeScript compilation)
2. 🧪 Runs `bun test` (test suite)
3. ✅ If all checks pass, allows the push
4. ❌ If checks fail, blocks the push with error details

## Installation

The hooks are automatically installed when you run `bun install` due to the `"prepare"` script in `package.json`.

To manually install or reinstall:

```bash
bun run setup-hooks
# or
bash scripts/install-hooks.sh
```

## Bypassing Hooks (Emergency)

If you need to bypass hooks in an emergency:

```bash
# Skip pre-commit checks
git commit --no-verify -m "Your message"

# Skip pre-push checks
git push --no-verify
```

⚠️ **Warning**: Only use `--no-verify` when absolutely necessary. The hooks exist to ensure code quality.

## CI/CD Integration

The same checks run in GitHub Actions on every push and pull request:

- File: `.github/workflows/ci.yml`
- Runs: Build + Tests
- See: [Actions tab](../../actions)

## Troubleshooting

### "bun is not installed"

Install Bun: https://bun.sh/docs/installation

```bash
curl -fsSL https://bun.sh/install | bash
```

### Build fails but code works

The TypeScript build may be stricter than runtime. Check:

1. Type annotations on function parameters
2. Return type declarations
3. Missing imports
4. Strict null checks

Run `bun run build` locally to see full errors.

### Hook not running

1. Check hooks are executable:
   ```bash
   ls -la .git/hooks/pre-commit .git/hooks/pre-push
   ```

2. Reinstall hooks:
   ```bash
   bun run setup-hooks
   ```

3. Check Git is configured to use hooks:
   ```bash
   git config core.hooksPath .git/hooks
   ```

## Hook File Locations

- `.git/hooks/pre-commit` - Runs on commit
- `.git/hooks/pre-push` - Runs on push
- `scripts/install-hooks.sh` - Installation script

## Customization

To modify hook behavior, edit the files directly:

```bash
# Edit pre-commit hook
nano .git/hooks/pre-commit

# Edit pre-push hook  
nano .git/hooks/pre-push
```

Then make them executable:

```bash
chmod +x .git/hooks/pre-commit .git/hooks/pre-push
```

## Adding More Checks

To add additional checks (e.g., formatting, security scanning):

1. Edit `.git/hooks/pre-commit`
2. Add your check after the build step
3. Return exit code 1 on failure

Example adding Prettier:

```bash
# Add to pre-commit hook after build
echo "💅 Running Prettier..."
if ! bunx prettier --check src/; then
    echo "❌ Prettier check failed!"
    echo "Run: bunx prettier --write src/"
    exit 1
fi
```
