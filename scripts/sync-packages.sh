#!/bin/bash
#
# Sync packages from monorepo to individual repos using git subtree
#
# Usage:
#   ./scripts/sync-packages.sh [package-name|all]
#
# Examples:
#   ./scripts/sync-packages.sh all           # Sync all packages
#   ./scripts/sync-packages.sh pi-wallet     # Sync only pi-wallet
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Git Subtree Package Sync Tool${NC}"
echo -e "${GREEN}========================================${NC}"
echo

# Package definitions
declare -A PACKAGES
PACKAGES[pi-wallet]="https://github.com/0xKobold/pi-wallet.git"
PACKAGES[pi-erc8004]="https://github.com/0xKobold/pi-erc8004.git"
PACKAGES[pi-ollama]="https://github.com/0xKobold/pi-ollama.git"

sync_package() {
    local pkg=$1
    local url=${PACKAGES[$pkg]}
    local remote_name="remote-$pkg"
    
    echo -e "\n${YELLOW}Syncing $pkg...${NC}"
    
    # Check if remote exists, add if not
    if ! git remote | grep -q "^${remote_name}$"; then
        echo "  Adding remote: $url"
        git remote add $remote_name $url 2>/dev/null || true
    fi
    
    # Fetch from remote
    echo "  Fetching from $remote_name..."
    git fetch $remote_name main 2>/dev/null || {
        echo -e "${RED}  ✗ Failed to fetch from $url${NC}"
        echo "  Remote repo may not exist yet. Create it on GitHub first:"
        echo "    https://github.com/new?repo_name=$(basename $url .git)"
        return 1
    }
    
    # Push via subtree
    echo "  Pushing packages/$pkg to $remote_name/main..."
    if git subtree push --prefix=packages/$pkg $remote_name main 2>&1; then
        echo -e "${GREEN}  ✓ $pkg synced successfully${NC}"
    else
        echo -e "${YELLOW}  ⓘ No changes to push for $pkg${NC}"
    fi
}

# Check if in git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Get argument
TARGET=${1:-all}

if [ "$TARGET" = "all" ]; then
    echo -e "${GREEN}Syncing all packages...${NC}"
    for pkg in "${!PACKAGES[@]}"; do
        sync_package $pkg || true
    done
else
    if [ -n "${PACKAGES[$TARGET]}" ]; then
        sync_package $TARGET
    else
        echo -e "${RED}Unknown package: $TARGET${NC}"
        echo "Available packages:"
        for pkg in "${!PACKAGES[@]}"; do
            echo "  - $pkg"
        done
        exit 1
    fi
fi

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Sync Complete${NC}"
echo -e "${GREEN}========================================${NC}"