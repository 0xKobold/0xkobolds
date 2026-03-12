# Monorepo + Git Subtree Workflow

This repository uses **git subtree** to maintain packages in the monorepo while keeping separate repositories for npm visibility.

## Repository Structure

```
0xKobolds/
├── packages/
│   ├── pi-wallet/      # CDP + Ethers.js wallet
│   ├── pi-erc8004/     # ERC-8004 identity + reputation
│   └── pi-ollama/      # Ollama integration
├── src/                # Main project
└── .github/workflows/  # CI/CD for syncing
```

## Workflow Overview

### Daily Development

**In monorepo:**
```bash
# Work on packages
packages/pi-wallet/src/
# Commit as normal:
git add packages/pi-wallet/
git commit -m "feat(wallet): add unlock command"
git push
```

### Sync to Separate Repos

**Option 1: Manual Sync**
```bash
# Sync all packages
./scripts/sync-packages.sh all

# Sync specific package
./scripts/sync-packages.sh pi-wallet
```

**Option 2: Automated Sync (CI/CD)**

Pushes happen automatically via GitHub Actions when you push to main/master.

## Setup Instructions

### Step 1: Create Empty Repos on GitHub

1. Go to https://github.com/new
2. Create three empty repos:
   - `pi-wallet`
   - `pi-erc8004`
   - `pi-ollama`

### Step 2: Initialize with Subtree Push

```bash
# Add remotes
git remote add pi-wallet https://github.com/0xKobold/pi-wallet.git
git remote add pi-erc8004 https://github.com/0xKobold/pi-erc8004.git
git remote add pi-ollama https://github.com/0xKobold/pi-ollama.git

# Push packages (first time)
git subtree push --prefix=packages/pi-wallet pi-wallet main
git subtree push --prefix=packages/pi-erc8004 pi-erc8004 main
git subtree push --prefix=packages/pi-ollama pi-ollama main
```

## How Changes Flow

### Monorepo → Individual Repos

Every push to `main` triggers:

```
packages/pi-wallet/      →  github.com/0xKobold/pi-wallet
packages/pi-erc8004/     →  github.com/0xKobold/pi-erc8004
packages/pi-ollama/      →  github.com/0xKobold/pi-ollama
```

### Receiving PRs

**Preferred:** PRs to monorepo
- Atomic commits across packages
- Single source of truth
- Tests run in monorepo

**Alternative:** PRs to individual repos
1. Merge PR to individual repo
2. Pull changes back:
   ```bash
   git subtree pull --prefix=packages/pi-wallet pi-wallet main
   ```

## Commands Cheat Sheet

```bash
# View remotes
git remote -v

# Sync one package
git subtree push --prefix=packages/pi-wallet pi-wallet main

# Sync all (use script)
./scripts/sync-packages.sh all

# Pull changes from subtree repo (if PR merged there)
git subtree pull --prefix=packages/pi-wallet pi-wallet main

# Split history for new package
git subtree split --prefix=packages/NEW-PACKAGE --annotate="NEW-PACKAGE: " HEAD
```

## Benefits

| Aspect | Monorepo | Individual Repos | Subtree |
|--------|----------|------------------|---------|
| Atomic changes | ✅ | ❌ | ✅ |
| Independent versioning | ⚠️ | ✅ | ✅ |
| Clear URLs | ⚠️ | ✅ | ✅ |
| One CI/CD | ✅ | ❌ | ✅ |
| Contributor friendly | ❌ | ✅ | ✅ |
| Easy setup | ✅ | ⚠️ | ✅ |

## When to Use

**Monorepo for development:** Always
**Subtree for syncing:** Before npm publishes
**Individual repos:** What users see on npm

## NPM Publishing

After subtree push, publish from individual repos:

```bash
cd packages/pi-wallet
npm version patch
npm publish --access public
```

Or use the GitHub Action workflow that publishes from monorepo after sync.

## Troubleshooting

### "Repository does not exist"
```bash
# Create repo on GitHub first, then:
./scripts/sync-packages.sh all
```

### "Already exists in origin"
```bash
# Force push (use with caution)
git subtree push --prefix=packages/pi-wallet pi-wallet main --force
```

### Merge conflicts
Pull from subtree first, resolve, then push:
```bash
git subtree pull --prefix=packages/pi-wallet pi-wallet main
# Resolve conflicts
git subtree push --prefix=packages/pi-wallet pi-wallet main
```

## Related Documentation

- [Git Subtree Docs](https://github.com/git/git/blob/master/contrib/subtree/git-subtree.txt)
- [NPM Scoped Packages](https://docs.npmjs.com/cli/v8/using-npm/scope)
- GitHub Actions workflow: `.github/workflows/sync-packages.yml`