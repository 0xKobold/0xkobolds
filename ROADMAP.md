# 0xKobold Release Assessment & Roadmap

## 🏗️ Architectural Vision: Multi-Agent Workspace System

**Target: 0.0.7+** | See `docs/MULTI-AGENT-WORKSPACE.md`

Single gateway serves multiple persistent "main agents", each with isolated workspaces.
Agents activate via selection, cron, or heartbeat. Each can spawn ephemeral sub-agents.

```
┌──────────────┐
│   Gateway    │ ◄── Single WebSocket server (port: 18789)
└──────┬───────┘
       │
   ┌───┴───┐
   │       │
┌──▼───┐ ┌▼─────┐ ┌────────┐
│ Dev  │ │ Ops  │ │ Docs   │ ◄── Main Agents (persistent, isolated workspaces)
│Agent │ │Agent │ │Agent   │     Activate: manual, cron, heartbeat
└──┬───┘ └┬─────┘ └───┬────┘
   │      │           │
┌──▼──┐ ┌▼────┐   ┌──▼───┐
│Sub  │ │Sub  │   │Sub   │ ◄── Subagents (ephemeral, using existing system)
└─────┘ └─────┘   └──────┘
```

### Key Features
- **1 Gateway**: Shared WebSocket server for all agents
- **N Main Agents**: Persistent with isolated workspaces (`~/.0xkobold/agents/*/workspace/`)
- **Activation**: Manual selection, cron schedules, heartbeat triggers
- **Subagent Spawning**: Each main agent can use existing `agent_spawn` tool
- **State Persistence**: Agent state survives restarts

---

## 📊 Current: 0.0.5 (Released) ✅

### 🤖 Subagent System
Spawn ephemeral sub-agents with isolated context:

- [x] **Core Infrastructure**
  - `agent_spawn` tool with three modes
  - Agent discovery (built-in + `~/.0xkobold/agents/`)
  - 5-minute timeout protection

- [x] **Parallel Execution**
  - 4 concurrent agents, 8 max total
  - Progress notifications, result aggregation

- [x] **Chained Workflows**
  - Sequential execution with `{previous}` placeholder

- [x] **Default Agents**: scout, planner, worker, reviewer

- [x] **Commands**: `/implement`, `/scout-and-plan`, `/parallel`, `/agents`

- [ ] **Future Enhancements**
  - [x] Subagent stream handling in TUI (completed in 0.0.6)
  - [x] Custom user agents (`~/.0xkobold/agents/`) (completed in 0.0.6)
  - [x] Project-specific agents (`.0xkobold/agents/`) (completed in 0.0.6)

---

## 🗺️ Roadmap for 0.0.6 (Polish & Refinement) - IN PROGRESS 🔄

### ✅ Completed in 0.0.6

- [x] **Real-time Streaming** - TUI output streaming with live updates
- [x] **Error Classification** - Structured errors with suggestions  
- [x] **Result Merging** - concatenate, summary, structured strategies
- [x] **Custom Agent Loading** - User and project agent support
- [x] **Agent Creation** - `/agent-create` command with templates

### Still To Do
- [ ] Agent result persistence
- [ ] Better agent debugging output  
- [ ] Workspace-specific memory

---

## 🗺️ Roadmap for 0.0.7+ (Multi-Agent Workspace System) - ARCHITECTURAL

**See: `docs/MULTI-AGENT-WORKSPACE.md`**

### Phase 1: Foundation (0.0.7)
- [ ] `agent-workspace-extension.ts`
- [ ] Workspace directory structure (`~/.0xkobold/agents/*/workspace/`)
- [ ] Agent configuration system
- [ ] Manual agent selection TUI
- [ ] Basic agent lifecycle (start/stop)

### Phase 2: Gateway Integration (0.0.8)
- [ ] Gateway runs standalone/always-on
- [ ] Agents connect as WebSocket clients
- [ ] Message routing between agents
- [ ] Broadcasting system

### Phase 3: Scheduling (0.0.9)
- [ ] Cron scheduling (node-cron)
- [ ] Heartbeat triggers
- [ ] Event-driven activation (file changes, git)
- [ ] Task queue management

### Phase 4: Advanced (0.1.0)
- [ ] Agent-to-agent communication
- [ ] Shared memory between agents
- [ ] Workspace templates
- [ ] Agent snapshots

### Commands to Add
```bash
0xkobold agents list                    # List main agents
0xkobold agents create <name>         # Create new agent
0xkobold agents start <name>          # Start main agent
0xkobold agents stop <name>           # Stop main agent
0xkobold agents logs <name>           # View agent logs
0xkobold agents task <name> <task>    # Send task to agent
```

---

### ✅ PASSED (Ready for Release)

| Category | Status | Notes |
|----------|--------|-------|
| **Build** | ✅ PASS | TypeScript compiles without errors |
| **Tests** | ✅ PASS | 111 tests passing, 7 skipped, 0 failed |
| **Ollama Cloud** | ✅ DONE | Full OAuth, routing, models |
| **Documentation** | ✅ UPDATED | CHANGELOG, README with cloud setup |

## 🗺️ Roadmap for 0.0.4 (koclaw-inspired + VPS Deployment)

### ✅ VPS Deployment (DigitalOcean Ready) - COMPLETED
Production-ready VPS service with Tailscale:

- [x] **Docker Containerization**
  - `Dockerfile` with Bun + Node multi-stage build
  - `docker-compose.yml` with volumes for persistence
  - Health check endpoint in container (`/health`, `/healthz`)
  - Non-root user (kobold:bun) for security

- [x] **Systemd Service**
  - `scripts/systemd/0xkobold.service` for auto-start on boot
  - Process restart on failure (Restart=always)
  - Proper logging to journald
  - Environment file support

- [x] **Production Gateway Configuration**
  - Bind to `0.0.0.0` for external connections
  - Configurable host/port via env vars
  - Gateway authentication (API key)
  - Tailscale sidecar for secure networking

- [x] **Tailscale Networking** ⭐
  - Tailscale sidecar container
  - Automatic HTTPS via Tailscale Serve
  - Zero-config certificates (no Certbot needed)
  - Secure private networking
  - `docker-compose.yml` with Tailscale integration

- [x] **Health & Monitoring**
  - `/healthz` endpoint (HTTP 200 = OK) - in heartbeat-extension.ts
  - `/health` endpoint alias
  - Uptime monitoring
  - Gateway connection status

- [x] **Deployment Automation**
  - `scripts/deploy-vps.sh` - One-command deploy script
  - `scripts/cloud-init.yaml` - DigitalOcean cloud-init
  - Auto-setup with Tailscale

- [x] **Security Hardening**
  - Non-root process execution (user: 1000:1000)
  - Container security (no new privileges)
  - Secret management (env files)
  - (Optional) Firewall rules template

- [x] **Documentation**
  - `docs/VPS-DEPLOYMENT.md` - Complete VPS setup guide
  - `docs/VPS-0.0.4-PLAN.md` - Implementation plan
  - DigitalOcean droplet tutorial
  - Tailscale networking guide

### 🧠 Memory System (koclaw: memory-core)
Based on OpenClaw's memory system with file-backed storage:

- [ ] **Long-term Memory**
  - `memory_search` tool for semantic search
  - `memory_get` tool for retrieval by key
  - JSONL-based storage in `~/.0xkobold/memory/`
  - Session-to-session persistence
  
- [ ] **Memory Commands**
  - `/memory-save <name>` - Save conversation snapshot
  - `/memory-search <query>` - Search saved memories
  - `/memory-list` - Browse saved memories
  - `/memory-forget <name>` - Delete memory

- [ ] **Auto-Memory**
  - Automatic extraction of key decisions
  - Important context auto-saved
  - Configurable memory triggers

### 📝 LLM Task Execution (koclaw: llm-task)
Structured JSON-only tasks for workflows:

- [ ] **Task Tool**
  - `llm_task` tool for structured JSON responses
  - JSON Schema validation
  - Retry logic for failed tasks
  - Timeout configuration

- [ ] **Use Cases**
  - Classifying user intent
  - Summarizing long conversations
  - Drafting structured content
  - Multi-step workflows

- [ ] **Workflow Integration**
  - Chain tasks together
  - Conditional branching
  - Result caching

### 📊 Diagnostics & Telemetry (koclaw: diagnostics-otel)
OpenTelemetry-based observability:

- [ ] **Usage Analytics**
  - Token usage tracking per session
  - Cost estimation by provider
  - Model performance metrics
  - Request latency tracking

- [ ] **Health Monitoring**
  - Provider availability monitoring
  - Response time alerting
  - Error rate tracking
  - Dashboard view with `/diagnostics`

- [ ] **Export Options**
  - Prometheus metrics export
  - JSON/CSV export
  - Integration with external dashboards

### 🧵 Thread Management (koclaw: thread-ownership)
Better conversation threading:

- [ ] **Thread Commands**
  - `/thread-new` - Start a new topic thread
  - `/thread-switch <id>` - Switch between threads
  - `/thread-list` - View active threads
  - `/thread-close` - Archive a thread

- [ ] **Thread Persistence**
  - Save thread state to disk
  - Resume threads across restarts
  - Thread-level memory isolation

### 🔧 More Skills & Integrations

- [ ] **GitHub Integration** (koclaw pattern)
  - Create PRs from changes
  - Comment on issues
  - Review PR diffs
  - GitHub Actions triggers

- [ ] **Notion/Obsidian Export**
  - Export conversations to notes
  - Link to external knowledge base
  - Bidirectional sync

- [ ] **Web Dashboard**
  - Browser-based TUI alternative
  - Session replay
  - Statistics visualization
  - Settings management UI

### 🚀 Performance Improvements

- [ ] **Context Compression**
  - Automatic message summarization
  - Smart token budget management
  - Configurable compression strategy

- [ ] **Parallel Subagent Execution**
  - Run multiple subagents concurrently
  - Result aggregation
  - Better load balancing

---

**Below: Previous versions roadmap**

## 📊 0.0.1 Readiness Assessment

### ✅ PASSED (Ready for Release)

| Category | Status | Notes |
|----------|--------|-------|
| **Build** | ✅ PASS | TypeScript compiles without errors |
| **Tests** | ✅ PASS | 111 tests passing, 7 skipped, 0 failed |
| **Package.json** | ✅ PASS | Properly configured with bin, files, exports |
| **CLI Entry** | ✅ PASS | `dist/src/cli/index.js` exists with shebang |
| **Extensions** | ✅ PASS | 31 core extensions loading correctly |
| **README** | ✅ PASS | ASCII art, description, architecture docs |
| **Version** | ✅ PASS | Set to 0.0.1 |

### ⚠️ MINOR ISSUES (Non-blocking)

1. **`tsconfig.json` - strict: false**
   - Not blocking for 0.0.1
   - Recommend enabling for 0.0.2

2. **Skills Documentation**
   - No bundled skills documentation in README
   - Users may not know how to use skills system

3. **Persona Loader Tests Skipped**
   - 7 tests skipped (not failing)
   - Functionality works but tests incomplete

### 🔴 BLOCKING ISSUES (None!)

**No blocking issues found.** All core functionality works:
- ✅ Extension system loads 31 extensions
- ✅ Mode manager switches between Plan/Build
- ✅ Skills system loads from multiple sources
- ✅ Web search tools (web_search, web_fetch, web_qa) working
- ✅ Self-update extension checks for updates (dev mode only)
- ✅ CLI commands registered (tui, cli, init, local)
- ✅ Local mode works for per-project configs

---

## 🎯 0.0.1 Grade: **A- (Release Ready)**

| Criteria | Score | Notes |
|----------|-------|-------|
| Stability | A | No crashes, all tests pass |
| Features | A | 31 extensions, skills, modes, multi-channel |
| Documentation | B+ | Good README, needs more usage examples |
| Testing | A- | 94% pass rate (111/118 tests) |
| DX | A | Local mode, hot-reload, helpful errors |

**Recommendation: RELEASE 0.0.1 NOW** 🚀

---

## 🗺️ Roadmap for 0.0.2

### 🎯 Core Features

- [ ] **Persona System Completion**
  - Unskip and fix the 7 skipped persona tests
  - Full persona injection into system prompts
  - Profile management commands

- [ ] **Enhanced Onboarding**
  - Wizard-style setup (similar to koclaw)
  - Skill picker during onboarding
  - Provider configuration helper

- [ ] **Extension Configuration**
  - Config file support for extension settings
  - Toggle extensions on/off
  - Extension-specific settings

### 🛠️ Developer Experience

- [ ] **Strict TypeScript**
  - Enable `strict: true` in tsconfig.json
  - Fix all type errors
  - Add stricter linting

- [ ] **Better Error Handling**
  - Centralized error reporting
  - User-friendly error messages
  - Auto-retry for transient failures

- [ ] **Logging System**
  - Structured logging with levels
  - Log rotation
  - Debug mode improvements

### 🔧 Skills & Tools

- [ ] **More Bundled Skills**
  - Copy popular skills from koclaw
  - GitHub integration skill
  - Notion/Obsidian skills
  - Discord/Slack skills

- [ ] **Skill Discovery**
  - `skills search` command
  - Skill validation
  - Skill marketplace integration

- [ ] **Custom Tools**
  - User-defined tool registry
  - Tool composition
  - Tool validation

### 🌐 Integrations

- [ ] **Ollama Cloud Support** (https://docs.ollama.com/cloud)
  - Connect to ollama.com hosted models
  - OLLAMA_API_KEY authentication support
  - Cloud model access (gpt-oss:120b-cloud, etc.)
  - Hybrid local/cloud mode (local for fast, cloud for powerful)
  - Model streaming from cloud API
  - Automatic fallback: local → cloud

- [ ] **Multi-Provider LLM Support**
  - OpenRouter integration
  - Anthropic cloud models
  - Provider routing based on model availability
  - Cost optimization across providers

- [ ] **Gateway Improvements**
  - WebSocket reconnection logic
  - Gateway authentication
  - Multi-client support

- [ ] **MCP Server Stability**
  - Better MCP error handling
  - Auto-restart on disconnect
  - MCP config validation

- [ ] **Discord Bot Polish**
  - Slash commands
  - Message threading
  - Rich embeds

### 📈 Performance & Scale

- [ ] **Session Management**
  - Session pruning (auto-cleanup)
  - Session export/import
  - Session templates

- [ ] **Memory Optimization**
  - Context compression
  - Token usage tracking
  - Smart compaction

- [ ] **Multi-Token Support**
  - Per-provider token budgets
  - Token usage alerts
  - Cost estimation

### 🛡️ Security & Safety

- [ ] **Sandbox Improvements**
  - File sandbox restrictions
  - Network access controls
  - Dangerous command detection

- [ ] **Audit Logging**
  - Full action audit trail
  - Compliance reporting
  - Security alerts

- [ ] **Secret Management**
  - Vault integration
  - Secret rotation
  - Ref-based secrets

### 📝 Documentation

- [ ] **API Documentation**
  - Generated TypeScript docs
  - Extension API guide
  - Hook documentation

- [ ] **Tutorial Series**
  - Getting started guide
  - Extension development
  - Skill creation
  - Multi-agent workflows

- [ ] **Video Content**
  - Demo recordings
  - Tutorial videos
  - Extension showcase

---

## 🚀 Release 0.0.1 Checklist

- [x] All tests pass
- [x] Build succeeds
- [x] Package.json configured
- [x] README updated
- [x] Version set to 0.0.1
- [ ] Tag release on GitHub
- [ ] Publish to npm
- [ ] Announcement post

## 📅 Timeline Estimate

| Milestone | Target Date |
|-----------|-------------|
| 0.0.1 Release | **Now** |
| 0.0.2 Scope Defined | Week 1 |
| 0.0.2 Development | Weeks 2-6 |
| 0.0.2 Beta | Week 6 |
| 0.0.2 Release | Week 8 |
| 0.0.3 Scope (Ollama Cloud) | Week 9 |
| 0.0.3 Development | Weeks 10-14 |
| 0.0.3 Release | Week 16 |

---

## 🌩️ Ollama Cloud Integration (0.0.3 Focus)

Based on https://docs.ollama.com/cloud, we should add support for users who don't have Ollama installed locally.

### Current State
- ✅ Local Ollama works (connects to `localhost:11434`)
- ✅ Can pull `:cloud` tagged models like `kimi-k2.5:cloud` locally
- ❌ No support for direct cloud API connection without local Ollama

### Goal
Allow users to connect **directly** to `ollama.com` cloud API when they don't have Ollama installed locally.

### Core Features
- [ ] **Direct Cloud API Connection**
  - Support `OLLAMA_API_KEY` environment variable
  - Connect to `https://ollama.com/api` (not through local `localhost`)
  - Automatic `Authorization: Bearer $OLLAMA_API_KEY` headers
  - Alternative to local Ollama, not a fallback

- [ ] **Provider Selection**
  - `local` - Use local Ollama (current behavior)
  - `cloud` - Connect directly to ollama.com API
  - Configurable per provider in settings

- [ ] **Cloud Model Access**
  - Access cloud-only models via ollama.com
  - List available cloud models via `/api/tags`
  - Model availability checking

- [ ] **Streaming Support**
  - Implement streaming from Ollama Cloud API
  - Token-by-token display
  - Same UX as local Ollama

### Use Cases
| Scenario | Current | After 0.0.3 |
|----------|---------|-------------|
| User has Ollama installed | ✅ Works via localhost | ✅ Same |
| User has no Ollama, has API key | ❌ Fails | ✅ Connects to cloud |
| User wants cloud-only model | ❌ Must install Ollama | ✅ Direct cloud access |

### Configuration Example
```json
{
  "providers": {
    "ollama": {
      "enabled": true,
      "connection": "cloud",
      "cloud": {
        "host": "https://ollama.com",
        "apiKey": "$OLLAMA_API_KEY"
      }
    }
  }
}
```

### API Endpoints
- Cloud: `https://ollama.com/api/chat` (with auth header)
- Local: `http://localhost:11434/api/chat` (no auth)

---

## 💬 Summary

**0xKobold 0.0.1 is ready for release.** It's a solid, working product with:
- 31 extensions providing rich functionality
- 111 passing tests (94% pass rate)
- Clean build with zero errors
- Proper packaging for npm distribution

The foundation is strong. 0.0.2 should focus on polish, documentation, and advanced features.

🐉 **Release the dragon!**
