#!/bin/bash
#
# Install Git Hooks for 0xKobold
#
# This script installs hooks to enforce code quality and workflow rules:
# - pre-commit: Ensures code builds before committing
# - pre-push: Runs tests before pushing + blocks direct master pushes
# - commit-msg: Validates conventional commit format
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

echo "🔧 Installing 0xKobold git hooks..."

# Check if we're in a git repository
if [ ! -d "$REPO_ROOT/.git" ]; then
    echo "❌ Error: Not a git repository!"
    exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p "$HOOKS_DIR"

# Install pre-commit hook
cat > "$HOOKS_DIR/pre-commit" << 'HOOK_EOF'
#!/bin/bash
#
# Pre-commit hook for 0xKobold
#
# Runs TypeScript compilation to ensure code builds before committing.
# This prevents broken code from being committed.
#
# To bypass: git commit --no-verify

set -e

echo "🔨 Running pre-commit checks..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the root of the repository
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Check if bun is available
if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ Error: bun is not installed!${NC}"
    echo "Please install bun: https://bun.sh/docs/installation"
    exit 1
fi

# Stash any unstaged changes to ensure we only check what's being committed
echo "📦 Stashing unstaged changes..."
git stash push -q --include-untracked --keep-index -m "pre-commit-stash" 2>/dev/null || true

# Restore stash on exit
restore_stash() {
    git stash pop -q 2>/dev/null || true
}
trap restore_stash EXIT

# Run TypeScript build
echo "🔍 Running TypeScript build..."
if bun run build 2>&1; then
    echo -e "${GREEN}✅ Build successful!${NC}"
else
    echo -e "${RED}❌ Build failed!${NC}"
    echo ""
    echo "Please fix the TypeScript errors before committing."
    echo "Run 'bun run build' locally to see the full error output."
    exit 1
fi

# Run lint check if lint script exists
if grep -q '"lint"' package.json 2>/dev/null; then
    echo "🧹 Running linter..."
    if bun run lint; then
        echo -e "${GREEN}✅ Lint passed!${NC}"
    else
        echo -e "${RED}❌ Lint failed!${NC}"
        echo "Please fix the linting errors before committing."
        exit 1
    fi
fi

echo -e "${GREEN}✅ All pre-commit checks passed!${NC}"
echo "Proceeding with commit..."
exit 0
HOOK_EOF

chmod +x "$HOOKS_DIR/pre-commit"

# Install pre-push hook with master protection
cat > "$HOOKS_DIR/pre-push" << 'HOOK_EOF'
#!/bin/bash
#
# Pre-push hook for 0xKobold
#
# 1. Prevents direct pushes to master
# 2. Runs build and tests before pushing
#
# To bypass: git push --no-verify

set -e

echo "🚀 Running pre-push checks..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the root of the repository
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Read local ref and remote ref
read local_ref local_sha remote_ref remote_sha

# Extract branch name
branch="${remote_ref##refs/heads/}"

# ❌ BLOCK DIRECT PUSH TO MASTER
if [ "$branch" = "master" ] || [ "$branch" = "main" ]; then
    echo ""
    echo -e "${RED}❌ ERROR: Direct push to master is not allowed!${NC}"
    echo ""
    echo "   Please create a feature branch and open a Pull Request:"
    echo ""
    echo "   git checkout -b feature/your-feature-name"
    echo "   git commit -m \"feat: your changes\""
    echo "   git push -u origin feature/your-feature-name"
    echo ""
    echo "   Then create a PR on GitHub for code review."
    echo ""
    echo "   To bypass in emergencies: git push --no-verify"
    echo ""
    exit 1
fi

# Check if bun is available
if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ Error: bun is not installed!${NC}"
    exit 1
fi

# Run build first
echo "🔍 Running build..."
if ! bun run build 2>&1; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful!${NC}"

# Run tests
echo "🧪 Running tests..."
if bun test 2>&1; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
else
    echo -e "${RED}❌ Tests failed!${NC}"
    echo ""
    echo "Please fix the failing tests before pushing."
    echo "Run 'bun test' locally to see the full test output."
    exit 1
fi

echo -e "${GREEN}✅ All pre-push checks passed!${NC}"
echo "Pushing to $branch..."
exit 0
HOOK_EOF

chmod +x "$HOOKS_DIR/pre-push"

# Install commit-msg hook for conventional commits
cat > "$HOOKS_DIR/commit-msg" << 'HOOK_EOF'
#!/bin/bash
#
# Commit-msg hook for 0xKobold
#
# Validates commit message follows Conventional Commits format
# https://www.conventionalcommits.org/
#
# Format: type(scope): subject
# Types: feat, fix, docs, style, refactor, test, chore
#
# To bypass: git commit --no-verify

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(head -1 "$COMMIT_MSG_FILE")

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Skip for merge commits, squashes, revert
if echo "$COMMIT_MSG" | grep -qE "^(Merge|Revert|fixup|squash)"; then
    exit 0
fi

# Skip for WIP commits (but warn)
if echo "$COMMIT_MSG" | grep -qE "^WIP"; then
    echo -e "${YELLOW}⚠️  Warning: WIP commit detected. Consider using 'git stash' instead.${NC}"
    exit 0
fi

# Check conventional commit format
if ! echo "$COMMIT_MSG" | grep -qE "^(feat|fix|docs|style|refactor|test|chore|hotfix)(\([a-z-]+\))?: .+"; then
    echo ""
    echo -e "${RED}❌ Invalid commit message format!${NC}"
    echo ""
    echo "Commit message must follow Conventional Commits:"
    echo ""
    echo "  type(scope): subject"
    echo ""
    echo "  Types: feat, fix, docs, style, refactor, test, chore, hotfix"
    echo "  Scope: optional, e.g., (gateway), (ollama), (docs)"
    echo ""
    echo "  Examples:"
    echo '    feat(gateway): add health check endpoint'
    echo '    fix(ollama): handle cloud timeout error'
    echo '    docs: update VPS deployment guide'
    echo ""
    echo "Current message: $COMMIT_MSG"
    echo ""
    echo "To bypass: git commit --no-verify"
    echo ""
    exit 1
fi

exit 0
HOOK_EOF

chmod +x "$HOOKS_DIR/commit-msg"

echo "✅ Hooks installed successfully!"
echo ""
echo "Installed hooks:"
echo "  - pre-commit: Runs TypeScript build before commit"
echo "  - commit-msg: Validates conventional commit format"
echo "  - pre-push:   Runs build & tests + blocks direct master push"
echo ""
echo "📖 See WORKFLOW.md for Git workflow documentation"
echo ""
echo "To bypass hooks in emergencies:"
echo "  git commit --no-verify"
echo "  git push --no-verify"
