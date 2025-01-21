# Builder stage
FROM node:18-alpine AS builder

# Set working directory with appropriate permissions
WORKDIR /app

# Copy package files with hash verification
COPY package*.json ./
COPY --chown=node:node . .

# Install dependencies with strict security checks
RUN npm ci --audit=true \
    && npm run security:audit \
    && npm run build \
    # Prune dev dependencies and clear cache
    && npm prune --production \
    && npm cache clean --force

# Production stage
FROM node:18-alpine

# Set production environment variables
ENV NODE_ENV=production \
    MARKETPLACE_PORT=3005 \
    AUDIT_LOG_ENABLED=true

# Create non-root user
RUN addgroup -g 1000 marketplace && \
    adduser -u 1000 -G marketplace -s /bin/false -D marketplace && \
    mkdir -p /app /var/log/marketplace && \
    chown -R marketplace:marketplace /app /var/log/marketplace

# Set working directory
WORKDIR /app

# Copy built artifacts from builder stage
COPY --from=builder --chown=marketplace:marketplace /app/dist ./dist
COPY --from=builder --chown=marketplace:marketplace /app/node_modules ./node_modules
COPY --from=builder --chown=marketplace:marketplace /app/package.json ./package.json

# Security hardening
RUN apk add --no-cache curl tini \
    # Remove unnecessary tools and shell access
    && rm -rf /bin/ash /bin/sh \
    # Set restrictive permissions
    && chmod -R 444 /app \
    && chmod -R 555 /app/dist \
    && chmod -R 555 /app/node_modules \
    && chmod 755 /var/log/marketplace

# Configure security options
USER marketplace
EXPOSE 3005

# Health check configuration
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3005/health || exit 1

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# Security labels
LABEL org.opencontainers.image.vendor="AUSTA Healthcare" \
      org.opencontainers.image.title="Marketplace Service" \
      org.opencontainers.image.description="HIPAA-compliant digital healthcare marketplace service" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      security.hipaa.compliant="true"

# Volume configuration
VOLUME ["/var/log/marketplace"]

# Drop all capabilities except necessary ones
RUN setcap 'cap_net_bind_service=+ep' /usr/local/bin/node

# Read-only root filesystem
VOLUME ["/tmp", "/var/run"]