# Changelog

All notable changes to 0xKobold will be documented in this file.

## [0.0.4] - 2026-03-08

### Perennial Memory System 🏛️
- **New**: Lifetime memory that remembers forever
  - Local embeddings via Ollama (`nomic-embed-text`)
  - Hybrid search: semantic + text query
  - Temporal decay (older memories fade naturally)
  - JSONL export for eternal portability
  - SQLite backend with automatic migrations
  - Works with or without Ollama (text fallback)
- **Commands**:
  - `/remember "content"` - Save memory forever
  - `/recall "vague description"` - Find by meaning
  - `/memories` - Browse recent entries
  - `/memory-export` - Create backups
- **Tools**:
  - `perennial_save` - Save with embeddings
  - `perennial_search` - Semantic + text search
  - `perennial_export` - Backup to JSONL

### VPS Deployment 🚀
- **One-command deployment to DigitalOcean**
  - `scripts/deploy-vps.sh` - Full automated setup
  - `scripts/cloud-init.yaml` - Cloud-init for droplets
  - Tailscale networking (zero-config HTTPS)
  - Docker Compose with health checks
- **Production-ready**:
  - Multi-stage Dockerfile
  - Systemd service for auto-restart
  - Non-root container execution
  - Health endpoint (`/healthz`)
- **Documentation**: `docs/VPS-DEPLOYMENT.md`

### NPM Setup Experience 📦
- **Interactive setup wizard**: `0xkobold setup`
  - Bun runtime check with install instructions
  - Automatic configuration generation
  - Database initialization
- **Post-install welcome message**
- **Quick start guide**: `docs/QUICKSTART.md`

### Git Workflow 🔀
- **Conventional commits enforcement**
  - Types: feat, fix, docs, style, refactor, test, chore, hotfix
  - Format: `type(scope): description`
- **Protected master branch**
  - No direct pushes (require PRs)
  - Pre-commit hooks: build + lint
  - Pre-push hooks: tests + branch check
- **Documentation**: `WORKFLOW.md`

### Diagnostics & Telemetry 📊
- **Token usage tracking** per provider
- **Cost estimation** for cloud usage
- **Health check dashboard**: `/diagnostics`
- **Prometheus-compatible metrics**

### Memory Synthesis 📝
- **Auto-generation**: `MEMORY.md` from database
- **Human-readable format**: Decisions, facts, tasks
- **Commands**: `/memory-synthesize`, `/memory-read`

### Documentation
- **architecture-extensions.md** - Extension system deep dive
- **PERENNIAL-MEMORY.md** - Memory architecture philosophy
- **VPS-DEPLOYMENT.md** - Complete VPS setup guide
- **QUICKSTART.md** - 5-minute setup guide
- **GIT-WORKFLOW.md** - Branch strategy and conventions

## [0.0.3] - 2025-07-07

### Ollama Cloud Support 🌩️
- **New**: Cloud authentication via `/login` command
  - Secure OAuth provider for ollama.com API keys
  - Credentials stored in `~/.0xkobold/auth.json`
- **New**: Local/Cloud/Auto mode switching
  - `/ollama-mode [local|cloud|auto]` - Switch between modes
  - `/ollama-local` - Quick switch to local
  - `/ollama-cloud` - Quick switch to cloud
  - Auto mode falls back to cloud when local is down
- **New**: Status bar indicator showing current mode (🏠/🌩️)
- **New**: Cloud-specific model registrations
  - GPT-OSS 120B, Qwen 2.5 72B/32B, DeepSeek R1 671B, Llama 3.2
- **New**: `/ollama-status` command to check cloud connection
- **Improved**: Smart routing with automatic fallback
  - Detects if local Ollama is running
  - Seamlessly switches between endpoints
  - Proper auth headers for cloud requests

### Technical Changes
- Added `ollama-cloud-extension.ts` for OAuth provider
- Added `ollama-router-extension.ts` for mode management
- Updated `ollama.ts` provider for dual-endpoint support
- Added cloud model definitions with proper cost/context windows

## [0.0.2] - Previous Releases

See git history for changelog of versions before 0.0.3.
