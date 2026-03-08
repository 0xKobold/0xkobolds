# Changelog

All notable changes to 0xKobold will be documented in this file.

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
