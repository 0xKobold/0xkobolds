#!/bin/bash

# 0xKobold VPS Deployment Script
# Deploys 0xKobold to a DigitalOcean VPS with Tailscale
#
# Usage:
#   ./scripts/deploy-vps.sh [TAILSCALE_AUTH_KEY]
#
# Prerequisites:
#   - DigitalOcean droplet running Ubuntu 22.04+
#   - SSH access to the droplet
#   - Tailscale account (https://tailscale.com)

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
TS_AUTH_KEY=${1:-$TS_AUTH_KEY}
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_IP="${DROPLET_IP:-}"
KOBOLD_DIR="/opt/0xkobold"
DOCKER_COMPOSE_VERSION="2.23.0"

print_header() {
  echo -e "${BLUE}"
  echo "╔════════════════════════════════════════════════════════╗"
  echo "║        0xKobold VPS Deployment Script                 ║"
  echo "╚═══════════════════════════════════════════════════���═══╝"
  echo -e "${NC}"
}

print_step() {
  echo -e "${YELLOW}[$(date +%H:%M:%S)]${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
check_prerequisites() {
  print_step "Checking prerequisites..."

  if [ -z "$TS_AUTH_KEY" ]; then
    echo "Error: Tailscale auth key required"
    echo "Usage: $0 <tskey-auth-xxxxx>"
    echo ""
    echo "Get your auth key from: https://login.tailscale.com/admin/settings/keys"
    exit 1
  fi

  if ! command -v ssh &> /dev/null; then
    print_error "SSH not installed. Please install OpenSSH."
    exit 1
  fi

  if [ -z "$DROPLET_IP" ]; then
    echo "Enter your DigitalOcean droplet IP address:"
    read -r DROPLET_IP
    if [ -z "$DROPLET_IP" ]; then
      print_error "No IP address provided"
      exit 1
    fi
  fi

  print_success "Prerequisites check complete"
}

# Deploy script that runs on the VPS
generate_remote_script() {
  cat << 'REMOTE_SCRIPT'
#!/bin/bash
set -e

TS_AUTH_KEY="__TS_AUTH_KEY__"
KOBOLD_DIR="/opt/0xkobold"

echo "🚀 Setting up 0xKobold..."

# Update system
echo "📦 Updating system packages..."
apt-get update
apt-get install -y curl ca-certificates git

# Install Docker
if ! command -v docker &> /dev/null; then
  echo "🐳 Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
  echo "📦 Installing Docker Compose..."
  curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

# Create user
echo "👤 Creating kobold user..."
if ! id "kobold" &> /dev/null; then
  useradd --system --create-home --shell /bin/bash kobold
  usermod -aG docker kobold
fi

# Setup directory
mkdir -p $KOBOLD_DIR
chown kobold:kobold $KOBOLD_DIR

# Clone repository
if [ ! -d "$KOBOLD_DIR/.git" ]; then
  echo "⬇️  Downloading 0xKobold..."
  su - kobold -c "git clone https://github.com/kobolds/0xKobolds.git $KOBOLD_DIR"
fi

cd $KOBOLD_DIR

# Create environment file
cat > .env << EOF
TS_AUTH_KEY=$TS_AUTH_KEY
NODE_ENV=production
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=18789
EOF

# Build and start
echo "🏗️  Building 0xKobold..."
docker-compose build

echo "🚀 Starting 0xKobold..."
docker-compose up -d

# Wait for Tailscale
echo "⏳ Waiting for Tailscale to connect..."
sleep 10

# Get Tailscale IP
TS_IP=$(docker-compose exec -T tailscale tailscale ip -4 2>/dev/null || echo "pending")

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ 0xKobold deployed successfully!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Tailscale IP: $TS_IP"
echo ""
echo "Access your 0xKobold via:"
echo "  https://$(tailscale status --json 2>/dev/null | jq -r '.Self.HostName // "your-device"').tailnet-name.ts.net"
echo ""
echo "Or from this machine:"
echo "  ssh $DROPLET_USER@$DROPLET_IP"
echo "  cd $KOBOLD_DIR"
echo "  docker-compose logs -f"
echo "════════════════════════════════════════════════════════"

REMOTE_SCRIPT
}

# Main deployment
deploy() {
  print_header
  check_prerequisites

  print_step "Preparing deployment script..."
  REMOTE_SCRIPT=$(generate_remote_script)
  REMOTE_SCRIPT=$(echo "$REMOTE_SCRIPT" | sed "s/__TS_AUTH_KEY__/$TS_AUTH_KEY/")

  print_step "Connecting to $DROPLET_IP..."
  print_step "This will set up 0xKobold with Tailscale networking"
  print_step "Estimated time: 5-10 minutes"
  echo ""

  # Copy and execute script on remote server
  echo "$REMOTE_SCRIPT" | ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$DROPLET_USER@$DROPLET_IP" "bash -s"

  print_success "Deployment complete!"
  echo ""
  echo -e "${GREEN}Your 0xKobold is now running with Tailscale secure networking!${NC}"
  echo ""
  echo "To check status:"
  echo "  ssh $DROPLET_USER@$DROPLET_IP 'cd /opt/0xkobold && docker-compose ps'"
  echo ""
  echo "To view logs:"
  echo "  ssh $DROPLET_USER@$DROPLET_IP 'cd /opt/0xkobold && docker-compose logs -f'"
}

# Run deployment
deploy "$@"
