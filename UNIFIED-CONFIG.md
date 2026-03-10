# Unified Configuration System

## Overview

All 0xKobold extensions now use a single configuration file:

```bash
~/.0xkobold/0xkobold.json
```

Following the OpenClaw convention (`~/.openclaw/openclaw.json`).

**Benefits:**
- One file instead of scattered configs
- Extensions share config system
- Type-safe configuration
- Easy to backup and version control
- Follows OpenClaw naming convention

---

## Configuration Structure

```json
{
  "version": "1.0.0",
  "updatedAt": 1234567890,
  
  "ollama": {
    "apiKey": "sk-ollama-...",
    "baseUrl": "http://localhost:11434",
    "cloudUrl": "https://ollama.com/api",
    "customModels": []
  },
  
  "gateway": {
    "port": 18789,
    "host": "127.0.0.1",
    "autoStart": true,
    "persistAgents": true
  },
  
  "discord": {
    "enabled": false,
    "token": "...",
    "autoReply": true
  }
}
```

---

## Commands

### Global Config
```bash
/config          # Show config overview
/config-show     # View raw JSON
/config-reset    # Reset to defaults
```

### Section Configs
```bash
/config-ollama    # Ollama settings
/config-gateway   # Gateway settings
/config-discord  # Discord settings
```

### Ollama Specific
```bash
/ollama-config   # Ollama config helper
/ollama-status   # Show models
/ollama-pull     # Download model
```

---

## Setup Examples

### Ollama with API Key
```bash
# Edit config file
cat > ~/.0xkobold/0xkobold.json << 'EOF'
{
  "ollama": {
    "apiKey": "sk-ollama-your-key-here"
  }
}
EOF

# Or use environment (higher priority)
export OLLAMA_API_KEY=sk-ollama-your-key
```

### Gateway Custom Port
```json
{
  "gateway": {
    "port": 8080,
    "host": "0.0.0.0"
  }
}
```

### Discord Bot
```json
{
  "discord": {
    "enabled": true,
    "token": "YOUR_DISCORD_TOKEN"
  }
}
```

---

## Migration from Old Configs

**Before (scattered):**
```
~/.0xkobold/ollama-config.json
~/.0xkobold/gateway.json
~/.0xkobold/agents.db
```

**After (unified):**
```
~/.0xkobold/0xkobold.json         # ← All settings
~/.0xkobold/sessions.db           # Session data
~/.0xkobold/agents-runtime.db     # Agent persistence
```

---

## For Extension Developers

### Read Config
```typescript
import { config } from "../../config/unified-config.js";

// Get section
const ollama = config.get("ollama");
console.log(ollama.apiKey);

// Get specific path
const apiKey = config.getPath("ollama.apiKey");
```

### Write Config
```typescript
import { config } from "../../config/unified-config.js";

// Update section
config.set("ollama", { apiKey: "new-key" });

// Update specific path
config.setPath("ollama.apiKey", "new-key");
```

### Define Types
```typescript
// In unified-config.ts
export interface MyExtensionConfig {
  enabled?: boolean;
  setting?: string;
}

// Add to UnifiedConfig
export interface UnifiedConfig {
  myExtension?: MyExtensionConfig;
}
```

---

## Priority (Overrides)

Config values are loaded in this priority (highest first):

1. **Environment variables** - `OLLAMA_API_KEY=xxx`
2. **Config file** - `~/.0xkobold/0xkobold.json`
3. **Defaults** - Built-in fallback values

Example:
```bash
# 0xkobold.json
{ "ollama": { "apiKey": "from-file" } }

# Environment
export OLLAMA_API_KEY="from-env"

# Result: Uses "from-env" (environment wins)
```

---

## Files Changed

| Old | New | Status |
|-----|-----|--------|
| `~/.0xkobold/ollama-config.json` | `~/.0xkobold/0xkobold.json` | Migrated |
| `OLLAMA_API_KEY` env | Still supported | Compatible |
| Extension-specific configs | Unified config | Consolidated |

**Naming:** Follows OpenClaw convention (`~/.openclaw/openclaw.json`)

---

## Benefits Summary

✅ **Single source of truth**  
✅ **Type-safe** TypeScript interfaces  
✅ **Easy backup** One JSON file  
✅ **Git-friendly** Can version control  
✅ **Extensible** Add new sections easily  
✅ **Priority system** Env vars override file  
