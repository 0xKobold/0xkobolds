# 0.0.4 VPS Deployment Plan

## Research Summary

Based on investigation of koclaw/OpenClaw and Tailscale documentation, here's how 0xKobold should handle VPS deployment.

---

## 🎯 Key Insights from OpenClaw

### 1. Multi-Stage Docker Build

OpenClaw uses a sophisticated multi-stage Dockerfile:

```
Stage 1: ext-deps      → Copy extension package.json files
Stage 2: build         → Install dependencies, build application
Stage 3: runtime       → Minimal image with only runtime deps
```

**Security features:**
- SHA256 digest pinning for reproducible builds
- Non-root user (`node`)
- Optional security packages (curl, git, openssl)
- Health checks (`/healthz`)
- Security hardening (permissions normalization)

### 2. Two-Container Architecture

OpenClaw separates concerns:

```yaml
services:
  openclaw-gateway:    # Gateway server (daemon)
    ports:
      - "18789:18789"    # Gateway port
    restart: unless-stopped
    healthcheck: {...}
  
  openclaw-cli:          # Interactive CLI
    network_mode: "service:openclaw-gateway"  # Shares network
    stdin_open: true
    tty: true
    depends_on: [gateway]
```

### 3. Tailscale Integration (Game Changer!)

OpenClaw uses **Tailscale** instead of traditional nginx/SSL:

```bash
# Private access (Tailscale network only)
tailscale serve --bg --https 8443 http://127.0.0.1:18789

# Public access (Funnel exposes to internet)
tailscale funnel --bg --set-path /webhook http://127.0.0.1:18789/webhook
```

**Advantages over nginx/SSL:**
- ✅ No certificate management (Tailscale handles it)
- ✅ Built-in authentication (Tailscale identity)
- ✅ Works across NAT/firewalls
- ✅ Zero-config HTTPS
- ✅ Granular access control (ACLs)
- ✅ No public IP required

### 4. Configuration via Environment

OpenClaw uses environment variables extensively:

```bash
OPENCLAW_GATEWAY_TOKEN=secret          # Auth token
OPENCLAW_GATEWAY_BIND=lan              # 0.0.0.0 for VPS
OPENCLAW_CONFIG_DIR=/path/to/config    # Config volume
OPENCLAW_WORKSPACE_DIR=/path/to/ws     # Workspace volume
```

---

## 📋 0.0.4 Implementation Plan

### Phase 1: Production-Ready Container (2-3 days)

#### 1.1 Multi-Stage Dockerfile

```dockerfile
# Stage 1: Build
FROM oven/bun:latest AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Stage 2: Runtime
FROM oven/bun:slim AS runtime
RUN apt-get update && apt-get install -y git curl
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json .
RUN chown -R bun:bun /app  # Non-root user
USER bun
EXPOSE 18789
HEALTHCHECK --interval=30s --timeout=10s \
  CMD curl -f http://localhost:18789/healthz || exit 1
CMD ["bun", "run", "dist/src/cli/index.js", "gateway", "run", "--bind", "0.0.0.0"]
```

#### 1.2 Docker Compose

```yaml
version: '3.8'
services:
  kobold-gateway:
    build: .
    container_name: 0xkobold
    restart: unless-stopped
    environment:
      - KOBOLD_GATEWAY_BIND=0.0.0.0
      - KOBOLD_GATEWAY_TOKEN=${KOBOLD_TOKEN}
      - OLLAMA_API_KEY=${OLLAMA_API_KEY}
    volumes:
      - kobold-data:/home/bun/.0xkobold
    ports:
      - "127.0.0.1:18789:18789"  # Local only by default
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:18789/health"]
      interval: 30s

  # Optional: Tailscale sidecar
  tailscale:
    image: tailscale/tailscale:latest
    container_name: 0xkobold-tailscale
    restart: unless-stopped
    network_mode: "service:kobold-gateway"  # Share network
    volumes:
      - tailscale-data:/var/lib/tailscale
    environment:
      - TS_AUTH_KEY=${TAILSCALE_AUTH_KEY}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_SERVE_PORT=18789
    cap_add:
      - NET_ADMIN
      - NET_RAW

volumes:
  kobold-data:
  tailscale-data:
```

#### 1.3 Health Check Endpoint

Add to `heartbeat-extension.ts`:

```typescript
pi.registerCommand("healthz", {
  description: "Health check endpoint",
  handler: async (_args, ctx) => {
    return {
      status: "healthy",
      timestamp: Date.now(),
      version: process.env.npm_package_version,
      uptime: process.uptime(),
    };
  },
});
```

### Phase 2: Tailscale Integration (2-3 days)

#### 2.1 Tailscale Sidecar Pattern

Deploy Tailscale as a sidecar container that shares network namespace:

```yaml
services:
  kobold:
    image: 0xkobold:latest
    network_mode: "container:tailscale"  # Shares with Tailscale
  
  tailscale:
    image: tailscale/tailscale:latest
    container_name: 0xkobold-tailscale
    cap_add:
      - NET_ADMIN
      - NET_RAW
    environment:
      - TS_AUTH_KEY=${TS_AUTH_KEY}
      - TS_STATE_DIR=/var/lib/tailscale
```

#### 2.2 Tailscale Funnel Command

Add command to 0xKobold: `/tailscale-funnel`

```typescript
pi.registerCommand("tailscale-funnel", {
  description: "Expose gateway via Tailscale Funnel",
  handler: async (_args, ctx) => {
    // Execute: tailscale funnel --bg 18789
    const result = await $`tailscale funnel --bg http://127.0.0.1:18789`;
    ctx.ui.notify("✅ Gateway exposed via Tailscale Funnel", "success");
    ctx.ui.notify("Access via: https://your-machine.your-tailnet.ts.net", "info");
  },
});
```

#### 2.3 Tailscale Authentication

```typescript
// Verify request comes from Tailscale
const isTailscaleIP = (ip: string) => {
  return ip.startsWith("100.") || ip.startsWith("fd7a:115c:a1e0:");
};

pi.on("session_start", async (event, ctx) => {
  const clientIP = ctx.sessionManager.getClientIP?.();
  if (!isTailscaleIP(clientIP) && process.env.REQUIRE_TAILSCALE) {
    throw new Error("Access denied: Must connect via Tailscale");
  }
});
```

### Phase 3: One-Command Deploy Script (2-3 days)

#### 3.1 VPS Deploy Script (`scripts/deploy-vps.sh`)

```bash
#!/bin/bash
# One-command VPS deployment

set -e
DOMAIN="${1:-$KOBOLD_DOMAIN}"
TS_AUTH_KEY="${2:-$TAILSCALE_AUTH_KEY}"

if [ -z "$TS_AUTH_KEY" ]; then
  echo "Usage: ./deploy-vps.sh <domain> <tailscale-auth-key>"
  exit 1
fi

echo "🚀 Deploying 0xKobold to VPS..."

# Update packages
sudo apt-get update

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --auth-key "$TS_AUTH_KEY"

# Clone and build
git clone https://github.com/kobolds/0xKobolds.git
cd 0xKobolds
bun install
bun run build

# Create systemd service
sudo tee /etc/systemd/system/0xkobold.service <<EOF
[Unit]
Description=0xKobold Gateway
After=network.target tailscaled.service

[Service]
Type=simple
User=kobold
WorkingDirectory=/opt/0xkobold
ExecStart=/home/kobold/.bun/bin/bun run dist/src/cli/index.js gateway run --bind 0.0.0.0
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable 0xkobold
sudo systemctl start 0xkobold

# Setup Tailscale Funnel
tailscale funnel --bg http://127.0.0.1:18789

echo "✅ Deployment complete!"
echo "🔗 Access via: https://$(tailscale status --json | jq -r '.Self.DNSName | rtrimstr(".")')"
```

#### 3.2 Cloud Init Script

For DigitalOcean droplet creation:

```yaml
# cloud-config.yaml
runcmd:
  - apt-get update
  - apt-get install -y curl git
  # Install Bun
  - curl -fsSL https://bun.sh/install | bash
  # Install Tailscale
  - curl -fsSL https://tailscale.com/install.sh | sh
  - tailscale up --auth-key ${ts_auth_key}
  # Clone 0xKobold
  - git clone https://github.com/kobolds/0xKobolds.git /opt/0xkobold
  - cd /opt/0xkobold && ~/.bun/bin/bun install && ~/.bun/bin/bun run build
  # Start with Tailscale Funnel
  - tailscale funnel --bg http://127.0.0.1:18789
```

### Phase 4: Security Hardening (1-2 days)

#### 4.1 Security Checklist

- [ ] Non-root user (`bun:bun`)
- [ ] Health checks
- [ ] Rate limiting
- [ ] Tailscale IP allowlisting
- [ ] Environment secrets only (no hardcoded tokens)
- [ ] Fail2ban for SSH
- [ ] UFW firewall rules

#### 4.2 UFW Firewall Rules

```bash
#!/bin/bash
# scripts/setup-firewall.sh

# Allow SSH
ufw allow 22/tcp

# Allow Tailscale (UDP 41641)
ufw allow 41641/udp

# Deny all other incoming
ufw default deny incoming

# Enable firewall
ufw --force enable
```

---

## 🔄 Comparison: Traditional VPS vs Tailscale Approach

| Feature | Traditional (nginx/SSL) | Tailscale Approach |
|---------|------------------------|-------------------|
| **SSL Certs** | Let's Encrypt (complex) | ✅ Automatic |
| **Public IP** | Required | Optional |
| **Firewall** | Complex rules | Simple (Tailscale only) |
| **Access Control** | nginx configs | Tailscale ACLs |
| **Zero Config** | ❌ No | ✅ Yes |
| **Cross-NAT** | Port forwarding | ✅ Just works |
| **Audit Logging** | Separate setup | Built-in |

**Winner: Tailscale for 0xKobold**

---

## 📁 New Files Needed

```
0xKobolds/
├── Dockerfile                    # Multi-stage production build
├── docker-compose.yml            # With Tailscale sidecar
├── docker-compose.tailscale.yml   # Tailscale-specific config
├── scripts/
│   ├── deploy-vps.sh            # One-command deploy
│   ├── setup-tailscale.sh       # Tailscale setup
│   └── cloud-init.yaml          # DigitalOcean cloud-init
├── systemd/
│   └── 0xkobold.service          # systemd service
└── docs/
    ├── VPS-DEPLOYMENT.md         # Full guide
    └── TAILSCALE.md              # Tailscale-specific docs
```

---

## 🚀 Deployment Options

### Option 1: Quick Start (Recommended for Testing)

```bash
# 1. Get Tailscale auth key from https://login.tailscale.com/admin/settings/keys
# 2. Run deploy script
curl -fsSL https://kobolds.run/deploy.sh | bash -s -- YOUR_TS_AUTH_KEY
```

### Option 2: Docker Compose

```bash
# Clone
git clone https://github.com/kobolds/0xKobolds.git
cd 0xKobolds

# Create .env file
cat > .env <<EOF
TAILSCALE_AUTH_KEY=tskey-auth-...
KOBOLD_GATEWAY_TOKEN=your-secret
EOF

# Deploy
docker-compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d
```

### Option 3: DigitalOcean One-Click

```bash
# Use cloud-init script when creating droplet
curl -fsSL https://raw.githubusercontent.com/kobolds/0xKobolds/main/scripts/cloud-init.yaml \
  | sed "s/TS_AUTH_KEY_PLACEHOLDER/$YOUR_KEY/" \
  | tee cloud-init.yaml

doctl compute droplet create 0xkobold \
  --region nyc3 \
  --size s-1vcpu-2gb \
  --image ubuntu-22-04-x64 \
  --user-data-file cloud-init.yaml
```

---

## 💡 Why This Architecture?

1. **Simplicity**: Tailscale eliminates SSL/certificate complexity
2. **Security**: Zero-trust network, no public exposure required  
3. **Portability**: Works on any VPS provider
4. **Scalability**: Easy to add multiple agents
5. **Maintainability**: Fewer moving parts than nginx/certbot

---

## 📊 Estimated Timeline

| Phase | Effort | Time |
|-------|--------|------|
| Multi-stage Dockerfile | Low | 1 day |
| Docker Compose + Tailscale | Medium | 2 days |
| Deploy scripts | Medium | 2 days |
| Health endpoints | Low | 0.5 days |
| Security hardening | Medium | 1 day |
| Documentation | Medium | 1 day |
| Testing | High | 2 days |
| **Total** | **Medium** | **~9-10 days** |

---

## Next Steps

1. **Approve strategy** (use Tailscale vs traditional nginx)
2. **Create Dockerfile** with multi-stage build
3. **Add Tailscale sidecar** to docker-compose
4. **Build deploy script** for DigitalOcean
5. **Test end-to-end** deployment
6. **Document** full VPS setup process

**Ready to proceed with implementation?** 🐉
