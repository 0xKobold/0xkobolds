#!/bin/bash
#
# Install Git Hooks for 0xKobold
#
# This script installs the pre-commit and pre-push hooks
# to ensure code quality before commits.
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
git stash push -q --include-untracked --keep-index -m "pre-commit-stash"

# Restore stash on exit
restore_stash() {
    git stash pop -q || true
}
trap restore_stash EXIT

# Run TypeScript build
echo "🔍 Running TypeScript build..."
if bun run build; then
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

# Install pre-push hook
cat > "$HOOKS_DIR/pre-push" << 'HOOK_EOF'
#!/bin/bash
#
# Pre-push hook for 0xKobold
#
# Runs tests before pushing to remote.
# This prevents broken code from being pushed.
#

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

# Check if bun is available
if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ Error: bun is not installed!${NC}"
    exit 1
fi

# Run build first
echo "🔍 Running build..."
if ! bun run build; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful!${NC}"

# Run tests
echo "🧪 Running tests..."
if bun test; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
else
    echo -e "${RED}❌ Tests failed!${NC}"
    echo ""
    echo "Please fix the failing tests before pushing."
    echo "Run 'bun test' locally to see the full test output."
    exit 1
fi

echo -e "${GREEN}✅ All pre-push checks passed!${NC}"
echo "Proceeding with push..."
exit 0
HOOK_EOF

chmod +x "$HOOKS_DIR/pre-push"

echo "✅ Hooks installed successfully!"
echo ""
echo "Installed hooks:"
echo "  - pre-commit: Runs TypeScript build (and lint if configured)"
echo "  - pre-push: Runs build and tests"
echo ""
echo "To bypass hooks in emergencies, use:"
echo "  git commit --no-verify"
echo "  git push --no-verify"
