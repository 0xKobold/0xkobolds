# Changelog

All notable changes to 0xKobold will be documented in this file.

## [Unreleased] - 0.0.6

### Subagent System v0.0.6 - Polish & Refinement 🎨
- **New**: Real-time streaming support in TUI mode
  - Stream agent output as it generates
  - Live progress updates for long-running tasks
  - Configurable with `stream: true` parameter
- **New**: Better error classification and handling
  - Categorized errors: timeout, not_found, execution
  - Detailed error messages with suggestions
  - Structured error details in results
- **New**: Result merging strategies for parallel execution
  - `concatenate` - Simple concatenation with headers
  - `summary` - Summarized with success/failure counts
  - `structured` - JSON-structured output
- **New**: Custom agent loading
  - User agents: `~/.0xkobold/agents/*.md` (auto-loaded)
  - Project agents: `.0xkobold/agents/*.md` (prefix: `project:`)
  - Scope indicators: 🔧 built-in, 👤 user, 📁 project
- **New**: `/agent-create <name>` command
  - Interactive template generation
  - Creates YAML frontmatter agent definition
- **Enhanced**:
  - `/agents` - Now shows agent scope (built-in/user/project)
  - `/parallel` - Supports `--merge=strategy` flag
  - `/implement` - Now streams output in real-time
  - `/scout-and-plan` - Now streams output in real-time
- **Tool Enhancements**:
  - `agent_spawn` - Added `stream` and `mergeStrategy` parameters
  - Better unknown agent error messages
  - Lists available agents when agent not found
- **Documentation**: Updated `docs/SUBAGENT-IMPLEMENTATION.md`

## [0.0.5] - 2026-03-08

### Subagent System 🤖
- **New**: Spawn parallel sub-agents with isolated context windows
  - Three execution modes: single, parallel, chain
  - Concurrency limiting: 4 concurrent, 8 max
  - Built-in agent types: scout, planner, worker, reviewer
  - Agent definitions in markdown with YAML frontmatter
  - Timeout protection (5 min per agent)
- **Commands**:
  - `/agents` - List available agents
  - `/implement <feature>` - Workflow: scout → planner → worker
  - `/scout-and-plan <feature>` - Scout → planner (no implementation)
  - `/parallel "task1" "task2"` - Run multiple scouts in parallel
- **Tool**:
  - `agent_spawn` - Single, parallel, or chained subagents
    - `agent + task` - Single mode
    - `tasks[]` - Parallel mode (up to 8)
    - `chain[]` - Sequential mode with {previous} placeholder
- **Agent Definitions**:
  - `scout` - Fast codebase reconnaissance (read-only)
  - `planner` - Create implementation plans
  - `worker` - Full implementation with write access
  - `reviewer` - Code review specialist
- **Security**:
  - User agents: `~/.0xkobold/agents/` (trusted)
  - Project agents: `.0xkobold/agents/` (prompts for confirmation)
- **Documentation**: `docs/SUBAGENT-IMPLEMENTATION.md`

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
