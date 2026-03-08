# Git Workflow for 0xKobold

> Based on [Conventional Commits](https://www.conventionalcommits.org/) and [GitHub Flow](https://docs.github.com/en/get-started/quickstart/github-flow)

## Branch Strategy

### Protected Branches
- **`master`** - Production-ready code (protected, no direct pushes)
- **`main`** - Mirror of master (for compatibility)

### Feature Branches
Create branches from `master` using these naming conventions:

```
feature/description     - New features (e.g., feature/ollama-cloud)
bugfix/description      - Bug fixes (e.g., bugfix/gateway-reconnect)
hotfix/description      - Urgent production fixes (e.g., hotfix/critical-memory-leak)
refactor/description    - Code refactoring (e.g., refactor/llm-provider-interface)
docs/description       - Documentation updates (e.g., docs/vps-deployment)
test/description       - Test additions/improvements (e.g., test/gateway-unit-tests)
chore/description      - Maintenance tasks (e.g., chore/update-dependencies)
```

## Workflow

### 1. Start New Work

```bash
# Update master
git checkout master
git pull origin master

# Create feature branch
git checkout -b feature/my-new-feature

# Or create from specific commit
git checkout -b feature/my-new-feature <commit-hash>
```

### 2. Make Changes

```bash
# Stage specific files
git add src/file.ts

# Stage all changes
git add .

# Check status
git status
git diff
```

### 3. Commit Changes

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git commit -m "feat(scope): subject

Detailed description of what changed and why.
- Change 1
- Change 2

Fixes #123
Closes #456"
```

**Commit Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Code style (formatting, no logic change)
- `refactor` - Code refactoring
- `test` - Adding/updating tests
- `chore` - Build/process/tooling changes

**Examples:**
```bash
# Feature with scope
git commit -m "feat(gateway): add health check endpoint

- Add /healthz endpoint for container monitoring
- Add /health alias command
- Returns JSON with status, uptime, memory

Closes #42"

# Bug fix
git commit -m "fix(ollama): handle cloud timeout error

Add 30s timeout for cloud requests with retry logic.

Fixes #38"

# Documentation
git commit -m "docs(vps): add DigitalOcean deployment guide

Complete guide for deploying to VPS with Tailscale.

Closes #45"
```

### 4. Keep Branch Updated

```bash
# Fetch latest
git fetch origin

# Rebase onto master (clean history)
git rebase origin/master

# Or merge (if you prefer)
git merge origin/master
```

### 5. Push to Remote

```bash
# Push feature branch
git push -u origin feature/my-new-feature

# Force push after rebase (use with caution!)
git push --force-with-lease origin feature/my-new-feature
```

### 6. Create Pull Request

1. Go to GitHub/GitLab
2. Create PR from `feature/my-new-feature` to `master`
3. Fill in PR template
4. Request review from maintainers
5. Address feedback
6. Merge when approved

### 7. Cleanup After Merge

```bash
# Switch to master
git checkout master
git pull origin master

# Delete local branch
git branch -d feature/my-new-feature

# Delete remote branch
git push origin --delete feature/my-new-feature
```

## Protected Branch Rules

The following are blocked by hooks:

❌ **Direct push to `master`**
```
❌ ERROR: Direct push to master is not allowed!
   Please create a feature branch and open a Pull Request.
```

❌ **Commit without running build**
```
❌ ERROR: Build failed!
   Fix TypeScript errors before committing.
```

❌ **Push without passing tests**
```
❌ ERROR: Tests failed!
   Fix failing tests before pushing.
```

## Working with Stashes

```bash
# Stash current work
git stash push -m "WIP: implementing auth"

# List stashes
git stash list

# Apply stash
git stash apply stash@{0}

# Apply and remove
git stash pop

# Drop stash
git stash drop stash@{0}

# Clear all
git stash clear
```

## Hotfix Process

For urgent production fixes:

```bash
# Create hotfix from master
git checkout master
git checkout -b hotfix/critical-bug

# Fix the issue
git add .
git commit -m "hotfix: resolve critical issue

Detailed description of the fix.

Fixes #URGENT"

# Push and create PR (fast-tracked review)
git push -u origin hotfix/critical-bug

# After approval, merge to master
# Then merge master back to development branches
```

## Emergency Bypass

In emergencies, you can bypass hooks:

```bash
# Skip pre-commit checks
git commit --no-verify -m "..."

# Skip pre-push checks  
git push --no-verify
```

⚠️ **Warning:** Only use in true emergencies. May break the build.

## Setup

Install hooks to enforce workflow:

```bash
# Install hooks
bun run setup-hooks

# Or manually
bash scripts/install-hooks.sh
```

## Commands Summary

```bash
# Start work
git checkout master
git pull origin master
git checkout -b feature/name

# Make commits
git add .
git commit -m "type(scope): description"

# Update branch
git fetch origin
git rebase origin/master

# Push
git push -u origin feature/name

# Create PR on GitHub

# Cleanup after merge
git checkout master
git pull origin master
git branch -d feature/name
```

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Flow](https://docs.github.com/en/get-started/quickstart/github-flow)
- [Git Workflow](https://skills.sh/supercent-io/skills-template/git-workflow)
