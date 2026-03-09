# 0xKobold 0.0.3 Implementation Plan

## 🎯 Goal
Add Ollama Cloud support for users without local Ollama installation.

## 📋 Current State Analysis
- ✅ Local Ollama works via `localhost:11434`
- ✅ Can pull `:cloud` tagged models (e.g., `kimi-k2.5:cloud`)
- ❌ No direct `ollama.com` API support for users without local install
- ❌ No secure API key storage/login flow

## 🏗️ Architecture

### Provider System
```
┌─────────────────────────────────────────────────────────────┐
│                    Ollama Provider                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐         ┌──────────────┐                 │
│  │   Local Mode │         │  Cloud Mode  │                 │
│  │  localhost   │         │ ollama.com   │                 │
│  │  :11434      │         │ /api         │                 │
│  │              │         │ + API Key    │                 │
│  └──────────────┘         └──────────────┘                 │
│         │                        │                          │
│         └──────────┬─────────────┘                          │
│                    │                                        │
│              ┌─────▼──────┐                                 │
│              │  Router    │                                 │
│              │ (local vs  │                                 │
│              │  cloud)    │                                 │
│              └─────┬──────┘                                 │
│                    │                                        │
│         ┌──────────┴──────────┐                             │
│         │                     │                             │
│    ┌────▼────┐           ┌────▼────┐                        │
│    │ /login  │           │ /logout │                        │
│    │ command │           │ command │                        │
│    └────┬────┘           └────┬────┘                        │
│         │                     │                             │
│    ┌────▼────────────────▼────┐                             │
│    │   ~/.0xkobold/auth.json  │                             │
│    │   (secure storage)       │                             │
│    └──────────────────────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Files to Modify/Create

### New Extensions
```
src/extensions/core/
├── ollama-cloud-extension.ts      # Main cloud provider
├── ollama-login-extension.ts      # /login command
└── ollama-router-extension.ts     # Route between local/cloud
```

### Modified Files
```
src/extensions/core/
├── ollama-provider-extension.ts   # Update to use router
└── websearch-extension.ts           # Fix already done ✅

src/config/
├── loader.ts                      # Add cloud config support
└── types.ts                       # Add cloud config types
```

## 🔧 Implementation Steps

### Phase 1: Auth Storage (Day 1)
- [ ] Create `ollama-login-extension.ts` with OAuth provider
- [ ] Implement `/login` command for Ollama Cloud
- [ ] Test credential storage in `~/.0xkobold/auth.json`
- [ ] Implement `/logout` command

### Phase 2: Cloud Provider (Day 2-3)
- [ ] Create `ollama-cloud-extension.ts` with provider config
- [ ] Add cloud models (gpt-oss:120b-cloud, kimi-k2.5:cloud, etc.)
- [ ] Configure `https://ollama.com/api` endpoint
- [ ] Test direct API calls with Bearer auth

### Phase 3: Router (Day 4)
- [ ] Create routing logic between local/cloud
- [ ] Update `ollama-provider-extension.ts` to use router
- [ ] Add config option: `connection: "local" | "cloud" | "auto"`
- [ ] Test switching between connections

### Phase 4: UX & Polish (Day 5-6)
- [ ] Add status indicator in footer
- [ ] Create `/ollama status` command
- [ ] Add error messages for auth failures
- [ ] Document the feature

### Phase 5: Testing & Release (Day 7)
- [ ] Write tests for cloud provider
- [ ] Test with real Ollama Cloud account
- [ ] Create migration guide
- [ ] Publish 0.0.3

## 📝 Configuration Schema

```typescript
// New config section
interface OllamaConfig {
  enabled: boolean;
  connection: "local" | "cloud" | "auto";
  local?: {
    host: string;        // default: "http://localhost:11434"
  };
  cloud?: {
    host: string;        // default: "https://ollama.com"
    // API key comes from auth.json via /login, not config
  };
}
```

## 🎨 UX Flow

### Login Flow
```
User types: /login
TUI shows:  ? Select provider: [Ollama Cloud]
TUI shows:  ? Enter Ollama API Key: [••••••••]
TUI shows:  ✓ Connecting to Ollama Cloud...
TUI shows:  ✓ Connected! Available models: 15
Footer:     🔐 Ollama Cloud (via API)
```

### Using Cloud
```
User types: /model ollama-cloud/gpt-oss:120b-cloud
TUI shows:  Switched to gpt-oss:120b-cloud (Cloud)
User types: hello
TUI shows:  [Response comes from ollama.com API]
```

### Status Command
```
User types: /ollama status
TUI shows:  Ollama Provider Status
            ───────────────────────
            Connection: Cloud (ollama.com)
            API Key: Configured
            Models Available: 15
            Last Used: gpt-oss:120b-cloud
```

## 🐛 Error Handling

| Error | Message |
|-------|---------|
| No API key | "Run /login to authenticate with Ollama Cloud" |
| Invalid key | "Invalid API key. Check your key at ollama.com/settings/keys" |
| Connection fail | "Cannot connect to Ollama Cloud. Check your connection." |
| Model not found | "Model 'xyz' not available. Run /models to see available models." |

## 📊 Testing Checklist

- [ ] `/login` prompts for API key
- [ ] Key stored in `~/.0xkobold/auth.json`
- [ ] `/logout` clears key
- [ ] Cloud provider registered
- [ ] Cloud models listed in `/models`
- [ ] Can chat with cloud model
- [ ] Switching from local to cloud works
- [ ] Error handling works
- [ ] Footer shows correct status

## 🚀 Release Checklist

- [ ] Version bumped to 0.0.3
- [ ] README updated
- [ ] CHANGELOG.md added
- [ ] Tests passing
- [ ] Build successful
- [ ] Published to npm
- [ ] Tag created

---

**Estimated Timeline**: 7 days
**Target Date**: Week of March 17, 2026
