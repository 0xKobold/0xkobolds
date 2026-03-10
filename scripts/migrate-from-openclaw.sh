#!/bin/bash
#
# OpenClaw → 0xKobold Migration Script
# Version: 0.4.5
# Usage: ./migrate-from-openclaw.sh [--live]
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SOURCE="${SOURCE:-$HOME/.openclaw}"
TARGET="${TARGET:-$HOME/.0xkobold}"
MODE="${1:---dry-run}"

# Counters
MIGRATED=0
WARNINGS=0
ERRORS=0

log() {
    echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
    ((MIGRATED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

dry_run_notice() {
    if [[ "$MODE" == "--dry-run" ]]; then
        echo -e "\n${YELLOW}💡 This is a DRY RUN. Use --live to apply changes.${NC}\n"
    fi
}

# ============== PRE-FLIGHT CHECKS ==============

check_prerequisites() {
    log "Checking prerequisites..."
    
    if [[ ! -d "$SOURCE" ]]; then
        error "OpenClaw not found at $SOURCE"
        exit 1
    fi
    success "OpenClaw found at $SOURCE"
    
    if ! command -v python3 &>/dev/null; then
        error "python3 is required but not installed"
        exit 1
    fi
    success "python3 available"
    
    if ! command -v 0xkobold &>/dev/null; then
        error "0xkobold not installed. Run: bun install -g 0xkobold"
        exit 1
    fi
    success "0xkobold CLI found"
    
    # Check OpenClaw has required files
    if [[ ! -f "$SOURCE/openclaw.json" ]]; then
        error "openclaw.json not found. Is this a valid OpenClaw installation?"
        exit 1
    fi
    success "OpenClaw config validated"
}

# ============== STEP 1: BACKUP ==============

create_backup() {
    log "Creating backup..."
    
    if [[ ! -d "$TARGET" ]]; then
        log "Target doesn't exist yet, no backup needed"
        return
    fi
    
    local backup_dir="${TARGET}.backup.$(date +%Y%m%d-%H%M%S)"
    
    if [[ "$MODE" == "--live" ]]; then
        cp -r "$TARGET" "$backup_dir"
        success "Backup created: $backup_dir"
    else
        log "Would create backup: $backup_dir"
    fi
}

# ============== STEP 2: CONFIG MIGRATION ==============

migrate_config() {
    log "Migrating configuration..."
    
    if [[ "$MODE" == "--live" ]]; then
        mkdir -p "$TARGET"
    fi
    
    python3 << PYTHON_EOF
import json
import os
import sys

source = "$SOURCE"
target = "$TARGET"
mode = "$MODE"

# Load OpenClaw config
try:
    with open(f"{source}/openclaw.json") as f:
        old_config = json.load(f)
except Exception as e:
    print(f"ERROR: Could not parse openclaw.json: {e}", file=sys.stderr)
    sys.exit(1)

# Build new config
new_config = {
    "version": "0.4.4",
    "migratedFrom": "openclaw",
    "migratedAt": os.popen("date -Iseconds").read().strip(),
    
    # Identity
    "identity": {
        "default": "shalom"
    },
    
    # Extensions
    "extensions": [
        "core/mcp",
        "core/heartbeat",
        "core/cron",
        "core/discord-channel",
        "core/memory",
        "core/persona-loader"
    ],
    
    # Channels
    "channels": {
        "discord": {
            "enabled": old_config.get("channels", {}).get("discord", {}).get("enabled", False)
        }
    },
    
    # LLM
    "llm": {
        "provider": "ollama",
        "model": "qwen2.5-coder:14b"
    },
    
    # Cron
    "cron": {
        "enabled": False,
        "database": "cron.db"
    },
    
    # Auto-update
    "autoUpdate": {
        "enabled": True,
        "checkInterval": "0 2 * * *",
        "autoInstall": False,
        "notifyOnUpdate": True
    }
}

# Add any extra keys from OpenClaw
if "gateway" in old_config:
    new_config["gateway"] = {
        "port": old_config["gateway"].get("port", 3000),
        "enabled": True
    }

# Write config
config_path = f"{target}/config.json"
if mode == "--live":
    with open(config_path, "w") as f:
        json.dump(new_config, f, indent=2)
    print(f"CONFIG_WRITTEN: {config_path}")
else:
    print(f"WOULD_WRITE: {config_path}")
    print(json.dumps(new_config, indent=2))
PYTHON_EOF
    
    if [[ $? -eq 0 ]]; then
        success "Configuration migrated"
    else
        error "Configuration migration failed"
        return 1
    fi
}

# ============== STEP 3: API KEYS ==============

migrate_keys() {
    log "Extracting API keys..."
    
    python3 << PYTHON_EOF
import json
import os
import sys

source = "$SOURCE"
target = "$TARGET"
mode = "$MODE"

found_keys = []

# Load OpenClaw config
with open(f"{source}/openclaw.json") as f:
    config = json.load(f)

# Extract Discord token
discord = config.get("channels", {}).get("discord", {})
if discord.get("token"):
    found_keys.append(("DISCORD_BOT_TOKEN", discord["token"], "openclaw.json"))

# Extract provider keys  
auth = config.get("auth", {}).get("profiles", {})
for provider, data in auth.items():
    if isinstance(data, dict) and data.get("token"):
        key_name = f"{provider.upper()}_API_KEY"
        found_keys.append((key_name, data["token"], f"auth.profiles.{provider}"))

# Check credentials folder
creds_dir = f"{source}/credentials"
if os.path.exists(creds_dir):
    for filename in os.listdir(creds_dir):
        filepath = os.path.join(creds_dir, filename)
        if os.path.isfile(filepath):
            try:
                with open(filepath) as f:
                    value = f.read().strip()
                if value:
                    key_name = filename.upper().replace("-", "_") + "_API_KEY"
                    found_keys.append((key_name, value, f"credentials/{filename}"))
            except:
                pass

print(f"KEYS_FOUND: {len(found_keys)}")
for name, value, source_file in found_keys:
    masked = value[:4] + "****" + value[-4:] if len(value) > 8 else "****"
    print(f"  {name} from {source_file}: {masked}")

# Write .env file
if mode == "--live" and found_keys:
    env_content = "# 0xKobold Environment Variables\\n"
    env_content += "# Migrated from OpenClaw\\n"
    env_content += f"# Generated: {os.popen('date -Iseconds').read().strip()}\\n\\n"
    
    for name, value, _ in found_keys:
        env_content += f"export {name}='{value}'\\n"
    
    env_path = f"{target}/.env"
    with open(env_path, "w") as f:
        f.write(env_content)
    os.chmod(env_path, 0o600)
    print(f"ENV_WRITTEN: {env_path}")
elif found_keys:
    print("WOULD_WRITE .env with:")
    for name, value, _ in found_keys:
        print(f"  export {name}='***'")
else:
    print("NO_KEYS_FOUND")
PYTHON_EOF
    
    local result=$?
    if [[ $result -eq 0 ]]; then
        success "API keys extracted"
    else
        warn "Some API keys may not have been extracted"
    fi
}

# ============== STEP 4: FOLDERS ==============

migrate_folders() {
    log "Migrating folders..."
    
    local folders=("agents" "identity" "skills" "cron" "workspace")
    
    for folder in "${folders[@]}"; do
        if [[ -d "$SOURCE/$folder" ]]; then
            if [[ "$MODE" == "--live" ]]; then
                cp -r "$SOURCE/$folder" "$TARGET/"
                success "Migrated: $folder"
            else
                log "Would migrate: $folder ($(find "$SOURCE/$folder" -type f | wc -l) files)"
            fi
        fi
    done
}

# ============== STEP 5: SYSTEMD ==============

install_systemd() {
    log "Installing systemd service..."
    
    local service_file="/etc/systemd/system/0xkobold.service"
    
    if [[ -f "$service_file" ]]; then
        warn "Service already exists at $service_file"
        return
    fi
    
    local service_content="[Unit]
Description=0xKobold Gateway
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$TARGET
Environment=\"HOME=$HOME\"
EnvironmentFile=$TARGET/.env
ExecStart=$HOME/.bun/bin/bun $HOME/.bun/install/global/node_modules/0xkobold/dist/src/cli/index.js start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target"
    
    if [[ "$MODE" == "--live" ]]; then
        echo "$service_content" | sudo tee "$service_file" > /dev/null
        sudo systemctl daemon-reload
        sudo systemctl enable 0xkobold
        success "Systemd service installed"
    else
        log "Would create service file:"
        echo "$service_content"
    fi
}

# ============== STEP 6: SHALOM IDENTITY ==============

create_identity() {
    log "Creating shalom identity..."
    
    local identity_dir="$TARGET/identity/shalom"
    
    if [[ "$MODE" == "--live" ]]; then
        mkdir -p "$identity_dir"
        
        cat > "$identity_dir/SOUL.md" << 'EOF'
# Shalom

**Name:** Shalom  
**Version:** 0.4.4  
**Role:** Multi-agent orchestration specialist

## Identity

Peaceful, helpful orchestrator. Evolved from OpenClaw to 0xKobold.

Values:
- Reliability and consistency
- Clear communication  
- Peaceful coexistence of systems
- Continuous improvement

## Capabilities

- Agent coordination and scheduling
- Cron job management
- CLI automation and tooling
- Migration support

## Tone

Friendly, helpful, slightly formal
EOF
        
        cat > "$identity_dir/IDENTITY.md" << 'EOF'
# Shalom

I am Shalom, the orchestration specialist for 0xKobold.

Migrated from OpenClaw to continue serving as a reliable,
peaceful coordinator of multi-agent workflows.
EOF
        
        success "Shalom identity created"
    else
        log "Would create identity at: $identity_dir"
    fi
}

# ============== STEP 7: START SERVICE ==============

start_service() {
    log "Starting service..."
    
    if [[ "$MODE" == "--live" ]]; then
        sudo systemctl start 0xkobold || true
        sleep 2
        
        if systemctl is-active --quiet 0xkobold 2>/dev/null; then
            success "Service started successfully"
        else
            warn "Service may not have started. Check: sudo systemctl status 0xkobold"
        fi
    else
        log "Would start service: sudo systemctl start 0xkobold"
    fi
}

# ============== MAIN ==============

main() {
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║     OpenClaw → 0xKobold Migration Script v0.4.5      ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo "Source: $SOURCE"
    echo "Target: $TARGET"
    echo "Mode:  $MODE"
    echo ""
    
    if [[ "$MODE" != "--live" && "$MODE" != "--dry-run" ]]; then
        echo "Usage: $0 [--live | --dry-run]"
        echo ""
        echo "  --dry-run  Preview changes (default)"
        echo "  --live     Apply changes"
        exit 1
    fi
    
    check_prerequisites
    dry_run_notice
    
    echo "Step 1/7..."
    create_backup
    
    echo ""
    echo "Step 2/7..."
    migrate_config
    
    echo ""
    echo "Step 3/7..."
    migrate_keys
    
    echo ""
    echo "Step 4/7..."
    migrate_folders
    
    echo ""
    echo "Step 5/7..."
    install_systemd
    
    echo ""
    echo "Step 6/7..."
    create_identity
    
    echo ""
    echo "Step 7/7..."
    start_service
    
    # Summary
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
    echo "Migration Summary:"
    echo -e "  ${GREEN}$MIGRATED succeeded${NC}"
    echo -e "  ${YELLOW}$WARNINGS warnings${NC}"
    echo -e "  ${RED}$ERRORS errors${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
    
    if [[ "$MODE" == "--dry-run" ]]; then
        echo ""
        echo -e "${YELLOW}💡 This was a dry run. To apply changes:${NC}"
        echo "   $0 --live"
    else
        echo ""
        echo "Next steps:"
        echo "  1. Check status: sudo systemctl status 0xkobold"
        echo "  2. View logs:   sudo journalctl -u 0xkobold -f"
        echo "  3. Run TUI:     0xkobold"
    fi
    
    echo ""
    
    if [[ $ERRORS -gt 0 ]]; then
        exit 1
    fi
}

main "$@"
