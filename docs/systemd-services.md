# 0xKobold Systemd Services Specification

## Overview

Systemd service units for auto-starting 0xKobold Gateway and Mission Control on boot.

## Design Principles

1. **Independent services** - Each runs as its own process
2. **Soft dependencies** - `Wants=` not `Requires=`, graceful degradation
3. **Restart on failure** - `Restart=always` with backoff
4. **User isolation** - Run as `moikapy` user, not root
5. **Log management** - Journalctl integration
6. **Health checks** - Built-in to services

## Services

### 0xkobold-gateway.service

**Purpose:** Core gateway server - handles agents, WebSocket connections, cron

**Start command:** `gateway start`
**Port:** 7777
**Health check:** HTTP `localhost:7777/health`

**Dependencies:**
- Network target
- Wants= network-online.target (soft)

**Restart policy:** On failure, 5s backoff, max 10 retries

---

### 0xkobold-mc.service

**Purpose:** Mission Control dashboard - web UI for monitoring

**Start command:** `next start` (Next.js production mode)
**Port:** 5173
**Health check:** HTTP `localhost:3000`

**Dependencies:**
- Network target
- Wants= 0xkobold-gateway.service (soft - MC works without gateway)

**Restart policy:** On failure, 10s backoff, max 5 retries

---

### 0xkobold.target

**Purpose:** Group unit to start/stop all 0xKobold services together

**Members:** gateway, mc

**Commands:**
```bash
systemctl start 0xkobold.target   # Start all
systemctl stop 0xkobold.target    # Stop all
systemctl restart 0xkobold.target # Restart all
```

## File Locations

```
~/.config/systemd/user/           # User-level services (recommended)
# OR
/etc/systemd/system/              # System-level (requires root)
```

## Installation

```bash
# Copy service files
cp docs/0xkobold-gateway.service ~/.config/systemd/user/
cp docs/0xkobold-mc.service ~/.config/systemd/user/
cp docs/0xkobold.target ~/.config/systemd/user/

# Reload systemd
systemctl --user daemon-reload

# Enable on boot
loginctl enable-linger moikapy  # Allow user services without login
systemctl --user enable 0xkobold.target

# Start now
systemctl --user start 0xkobold.target

# Check status
systemctl --user status 0xkobold-gateway
systemctl --user status 0xkobold-mc
```

## Management Commands

```bash
# All services
systemctl --user start 0xkobold.target
systemctl --user stop 0xkobold.target
systemctl --user restart 0xkobold.target

# Individual
systemctl --user restart 0xkobold-gateway
systemctl --user restart 0xkobold-mc

# Logs
journalctl --user -u 0xkobold-gateway -f
journalctl --user -u 0xkobold-mc -f
journalctl --user -u 0xkobold.target -f

# Status
systemctl --user list-units --type=service
```

## Future Enhancements

- [ ] Health check script with auto-restart
- [ ] Prometheus metrics endpoint
- [ ] Automatic backup on service stop
- [ ] Watchtower for container updates (if Docker)
