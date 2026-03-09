# VPS Deployment Investigation

## Current State: NOT Production Ready

0xKobold 0.0.3 is designed for local development but lacks infrastructure for VPS deployment.

## Required for DigitalOcean Deployment

### 1. Infrastructure Files

```
0xKobolds/
├── Dockerfile                    # Container definition
├── docker-compose.yml            # Multi-service orchestration
├── 0xkobold.service             # systemd service file
├── nginx.conf                    # Reverse proxy config
├── scripts/
│   ├── deploy-vps.sh           # One-click deploy
│   ├── setup-ssl.sh            # Let's Encrypt automation
│   └── health-check.sh         # VPS health script
└── docs/
    └── VPS-SETUP.md              # Complete setup guide
```

### 2. Code Changes Needed

#### Gateway Binding (Critical)

**Current:**
```typescript
// src/config/defaults.ts
export const defaultConfig = {
  gateway: {
    port: 18789,
    host: "127.0.0.1",  // ❌ Only localhost!
  }
}
```

**Required:**
```typescript
export const defaultConfig = {
  gateway: {
    port: process.env.GATEWAY_PORT || 18789,
    host: process.env.GATEWAY_HOST || "0.0.0.0",  // ✅ External access
    auth: {
      enabled: process.env.GATEWAY_AUTH === "true",
      apiKey: process.env.GATEWAY_API_KEY,
    }
  }
}
```

#### Health Check Endpoint

Add to gateway extension:
```typescript
pi.registerCommand("health", {
  description: "Health check endpoint",
  handler: async () => {
    return { status: "healthy", uptime: process.uptime() };
  }
});
```

### 3. Security Checklist

- [ ] Non-root user in Dockerfile
- [ ] Secrets in env files (not committed)
- [ ] Firewall rules (ufw allow 443,22)
- [ ] Fail2ban for brute force protection
- [ ] CORS origins configuration
- [ ] Rate limiting on gateway

### 4. DigitalOcean Specific

- [ ] Droplet: Ubuntu 22.04 LTS minimum 2GB RAM
- [ ] Floating IP for gateway stability
- [ ] Block storage for persistent data
- [ ] Firewall rules in DO dashboard
- [ ] Monitoring via DO Insights

### 5. Automation Scripts

#### deploy-vps.sh
```bash
#!/bin/bash
# One-command VPS deployment

# 1. Install Bun
# 2. Clone repo
# 3. Install dependencies
# 4. Build TypeScript
# 5. Install systemd service
# 6. Start service
# 7. Setup nginx + SSL

set -e
echo "🚀 Deploying 0xKobold to VPS..."
# ... implementation
```

## Estimated Effort

| Task | Complexity | Time |
|------|------------|------|
| Dockerfile | Low | 2-4 hours |
| docker-compose.yml | Low | 1-2 hours |
| systemd service | Medium | 2-3 hours |
| Nginx config | Medium | 3-4 hours |
| SSL automation | Medium | 2-3 hours |
| Health endpoints | Low | 1-2 hours |
| Deploy scripts | Medium | 4-6 hours |
| Documentation | Medium | 3-4 hours |
| Testing | High | 4-8 hours |
| **Total** | **Medium** | **22-36 hours** |

## Recommendation

✅ **Add VPS Deployment as 0.0.4 Priority**

This would make 0xKobold:
- Production-ready
- Scalable to multiple users
- Suitable for your Discord bot architecture
- Enterprise-grade reliability

## Next Steps

1. Create Dockerfile and docker-compose.yml
2. Add systemd service template
3. Build nginx reverse proxy config
4. Create deployment scripts
5. Write comprehensive VPS setup guide
6. Test on DigitalOcean droplet
