# Changelog

## [0.8.0] - "The Foundation Stone"

### Added

#### ❤️ Heartbeat System (OpenClaw-Compatible)
- **Config-driven heartbeat** - Per-agent configuration in kobold.json
- **Session isolation** - `isolatedSession` option for fresh runs (saves tokens)
- **Light context mode** - `lightContext` to skip bootstrap files
- **Delivery targets** - `"none"`, `"last"`, or channel ID
- **Active hours** - Timezone-aware scheduling
- **Model override** - Use different model for heartbeat runs
- **Per-agent override** - Agent-specific heartbeat configs

#### 🧠 Dialectic Reasoning (Honcho-style)
- **Representation system** - Store observations, preferences, goals
- **Peer synthesis** - Combine observations into understanding
- **Contradiction detection** - Find conflicts in beliefs
- **Nudge engine** - Trigger reflections on observation thresholds
- **Commands**: `/represent`, `/observe`, `/reason`, `/ask-peer`, `/nudge`

#### 🔄 Adaptive Model Router
- **Performance learning** - Track model performance per task type
- **Community popularity** - Sync with Ollama library stats
- **Model scoring DB** - Local SQLite for rankings
- **Task inference** - Auto-detect code/vision/reasoning/chat
- **Commands**: `/router`, `/models`, `/rate`, `/model-rankings`, `/tier-list`, `/popularity`, `/best-for`

#### 📦 Package Improvements
- **pi-ollama@0.2.0** - Fixed context window detection for GLM-5, Kimi, etc.
- **Context window detection** - Now reads from `model_info.*.context_length`
- **Bun link fix** - Extension loads correctly from global installs

### Fixed

- **TUI status bar** - Context window now shows correct value (e.g., `?/202k` for GLM-5)
- **Router crash** - Handle multimodal messages (arrays) in `.toLowerCase()`
- **Context buffer** - Safety margin and token estimation improvements
- **TieredMemory** - Handle non-array LLM responses in extraction

### Changed

- **Safety extensions** - Consolidated into `draconic-safety-extension`
- **Agent orchestrator** - Unified v0.2.0 with real subagent execution
- **Memory system** - Session events table for consolidation

### Technical

- **Build**: Clean TypeScript compilation
- **Tests**: 694 passing (+425 since v0.7.0)
- **Dependencies**: pi-coding-agent@0.57.1

---

## [0.3.0] - "The Gap Closer"

### Added

#### 📱 Multi-Channel Support
- **WhatsApp Integration** (350+ lines)
  - Baileys library integration
  - QR code pairing
  - Group chat support
  - Media handling (images, audio, video)
  - Auto-reconnect logic
  - CLI: `0xkobold whatsapp start`

- **Telegram Completion** (300+ lines)
  - Polling and webhook modes
  - Group chat support
  - Inline commands
  - Callback queries
  - Rich formatting
  - CLI: `0xkobold telegram start`

- **Slack Integration** (200+ lines)
  - Webhook support
  - Slash commands
  - Rich block formatting
  - Signature verification
  - CLI support

#### 🛡️ Security
- **Device Authentication** (284+ lines)
  - Device identity generation
  - Token-based auth
  - Multi-device support
  - Token expiration (configurable)
  - Token revocation
  - Device management

- **Docker Sandboxing** (280+ lines)
  - Container execution
  - Memory limits
  - CPU limits
  - Network isolation (none by default)
  - Volume mounting
  - Timeout control
  - Auto-cleanup

#### 🖼️ Media Support
- **Vision (Image Analysis)** (200+ lines)
  - Claude Vision integration
  - GPT-4V ready structure
  - Base64 image processing
  - Object detection
  - Text extraction from images
  - URL support

- **Audio Transcription** (190+ lines)
  - OpenAI Whisper integration
  - Voice note support
  - Timestamped segments
  - Format conversion
  - Multi-format output

#### 📄 Documents
- **PDF Support** (300+ lines)
  - Text extraction
  - Metadata parsing
  - Page-based extraction
  - Basic PDF structure parsing

### Technical

- **Build:** Clean TypeScript compilation
- **Tests:** 287 total (269 passing, 20 new)
- **Dependencies:** +3 (node-telegram-bot-api, @whiskeysockets/baileys)
- **Code:** 2,300+ new lines

### Competitive Position

**vs OpenClaw:**
- ✅ Multi-channel: Feature parity (4 channels)
- ✅ Security: Feature parity
- ✅ Media: Feature parity
- ✅ Codebase: 8x simpler (7.3k vs 60k lines)
- ✅ Dependencies: 7x lighter
- ✅ Performance: Bun-native, faster startup

### Migration

```bash
npm install -g 0xkobold@0.3.0
```

All v0.2.0 features remain backward compatible.

---

## [0.2.0] - "Digital Familiar"

### Added
- Real Bun-native WebSocket Gateway
- Discord bot integration
- Heartbeat system with scheduling
- Agent types (5 types)
- Worker skills (4 variants)
- Persona system
- Context pruning
- Task router

---

## [0.1.0] - Initial Release

### Added
- Core CLI interface
- TUI mode
- Basic agent framework
- Extension system
- Memory system

---

*Built by Digital Familiar while you sleep* 🐉
