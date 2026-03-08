# 0xKobold Production Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Build
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build TypeScript
RUN bun run build

# Stage 2: Production
FROM oven/bun:slim AS production

# Create non-root user for security
RUN groupadd -r kobold && useradd -r -g kobold kobold

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create config directory
RUN mkdir -p /home/kobold/.0xkobold && chown -R kobold:kobold /home/kobold

# Switch to non-root user
USER kobold

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD bun run dist/src/cli/index.js health || exit 1

# Expose gateway port
EXPOSE 18789

# Environment variables
ENV NODE_ENV=production
ENV GATEWAY_HOST=0.0.0.0
ENV GATEWAY_PORT=18789

# Start command
CMD ["bun", "run", "dist/src/cli/index.js", "gateway", "run"]
