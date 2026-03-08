# VPS Deployment Guide

Complete guide for deploying 0xKobold to a VPS with Tailscale secure networking.

## Quick Start (5 minutes)

```bash
# 1. Get Tailscale auth key
# Visit: https://login.tailscale.com/admin/settings/keys

# 2. Deploy to DigitalOcean
curl -fsSL https://raw.githubusercontent.com/kobolds/0xKobolds/main/scripts/deploy-vps.sh | bash -s -- YOUR_TS_AUTH_KEY
```

## Why Tailscale?

**Traditional VPS Deployment:**
```
Internet → Nginx → SSL Certificates → App
                    ↑
         Let's Encrypt (manual renewal)
```

**Tailscale Deployment:**
```
Your Device ↔ Tailscale ↔ VPS (no public IP needed!)
                     ↓
          Automatic HTTPS, Zero Config
```

**Advantages:**
- ✅ No certificate management (Tailscale handles it)
- ✅ Works on any VPS provider
- ✅ No public IP required
- ✅ Built-in authentication
- ✅ Simple configuration
- ✅ Works through firewalls/NAT

## Deployment Options

### Option 1: Docker Compose (Recommended)

```bash
# Clone repository
git clone https://github.com/kobolds/0xKobolds.git
cd 0xKobolds

# Create environment file
cat > .env << EOF
TS_AUTH_KEY=tskey-auth-xxxxx  # Your Tailscale key
NODE_ENV=production
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=18789
EOF

# Build and run
docker-compose up -d

# Check status
docker-compose ps
```

### Option 2: DigitalOcean Cloud-Init

1. Go to [DigitalOcean Console](https://cloud.digitalocean.com/droplets)
2. Create a droplet (Ubuntu 22.04, 2GB RAM minimum)
3. Under "User data", paste contents of `scripts/cloud-init.yaml`
4. Replace `TS_AUTH_KEY_PLACEHOLDER` with your key
5. Create droplet
6. Wait 5-10 minutes for deployment

### Option 3: Manual VPS Setup

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --auth-key YOUR_KEY

# Clone and run 0xKobold
git clone https://github.com/kobolds/0xKobolds.git /opt/0xkobold
cd /opt/0xkobold
docker-compose up -d

# Enable Tailscale Serve
tailscale serve --bg https / http://127.0.0.1:18789
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Your Device                        │
│  (laptop, phone, control UI)                         │
└──────────────┬──────────────────────────────────────┘
               │
               │ Tailnet (encrypted WireGuard tunnel)
               │
               ▼
┌─────────────────────────────────────────────────────┐
│                   DigitalOcean VPS                    │
│                                                      │
│  ┌──────────────────┐    ┌──────────────────┐      │
│  │ Tailscale        │    │ 0xKobold         │      │
│  │    └───► ┌───────┘    │   Gateway        │      │
│  │  (net    │ Bridge  ◄──┴───┤                │      │
│  │   admin) │ Network       │  Health: ✓     │      │
│  └──────────┴────────┬───┼────────────────┘      │
│                      │   │                       │
│  ┌───────────────────┘   │                       │
│  │ Docker Network         │                       │
│  └────────────────────────┘                       │
└─────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TS_AUTH_KEY` | *required* | Tailscale auth key (tskey-auth-...) |
| `NODE_ENV` | production | Node environment |
| `GATEWAY_HOST` | 127.0.0.1 | Bind address (localhost for security) |
| `GATEWAY_PORT` | 18789 | Gateway port |
| `OLLAMA_API_KEY` | — | Ollama API key (optional) |

### Tailscale Auth Key Types

**Ephemeral Key (Recommended for containers):**  
- Auto-cleanup when container stops
- No manual cleanup required
- Get from: Auth Keys → Generate → Set "Reusable: Yes", "Ephemeral: Yes"

**Reusable Key:**
- Can be used multiple times
- Manual revocation required

## Monitoring & Logs

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f kobold
docker-compose logs -f tailscale

# Health check
docker-compose exec kobold bun run dist/src/cli/index.js healthz

# Check Tailscale status
tailscale status
tailscale serve status
```

## Troubleshooting

### Tailscale not connecting

```bash
# Check logs
docker-compose logs tailscale

# Re-authenticate
docker-compose exec tailscale tailscale up --force-reauth
```

### 0xKobold not starting

```bash
# Check build
bun run build

# Check dependencies
bun install

# View logs
docker-compose logs kobold
```

### Cannot access via browser

```bash
# Verify Tailscale is serving
tailscale serve status

# Test locally
curl http://127.0.0.1:18789/healthz
```

## Security

### Default Security Posture

- ✅ Containerized deployment (isolation)
- ✅ Non-root user inside container
- ✅ Tailscale encrypted tunnel
- ✅ No public port exposure required
- ✅ Built-in health checks

### Additional Hardening

```bash
# Enable UFW firewall
sudo ufw default deny incoming
sudo ufw allow 22/tcp       # SSH
sudo ufw allow 41641/udp   # Tailscale WireGuard
sudo ufw enable

# Fail2ban for SSH
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

## Backups

### Workspace Backup

```bash
# Backup kobold data
docker run --rm -v 0xkobold_kobold-data:/data -v $(pwd):/backup alpine tar czf /backup/0xkobold-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore

```bash
# Restore from backup
docker run --rm -v 0xkobold_kobold-data:/data -v $(pwd):/backup alpine tar xzf /backup/0xkobold-backup-YYYYMMDD.tar.gz -C /data
```

## Updates

```bash
# Pull latest
cd /opt/0xkobold
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Cost Estimation

| Provider | Droplet Size | Cost/Month |
|----------|-------------|------------|
| DigitalOcean | 1GB RAM / 1 vCPU | $6 |
| DigitalOcean | 2GB RAM / 1 vCPU | $12 |
| DigitalOcean | 4GB RAM / 2 vCPU | $24 |
| AWS EC2 (t3.micro) | 1GB RAM | ~$9 |
| GCP (e2-micro) | 1GB RAM | ~$7 |
| Hetzner (CX11) | 2GB RAM | €3.29 |

*Minimum 2GB RAM recommended for 0xKobold + Ollama*

## Provider-Specific Notes

### DigitalOcean
- Use cloud-init for one-click deployment
- Enable monitoring for alerts
- Use private networking (optional)

### AWS
- Use Nitro Enclaves for enhanced security
- Consider Spot instances for cost savings
- Use Systems Manager for SSH access (no public IP)

### GCP
- Use Cloud NAT for outbound only
- Enable VPC Flow Logs
- Use OS Login for SSH

## Support

- Issues: https://github.com/kobolds/0xKobolds/issues
- Docs: https://github.com/kobolds/0xKobolds/tree/main/docs
- Tailscale Docs: https://tailscale.com/kb

---

**Built with 🐉 by 0xKobold**
