# Build stage
FROM node:18-alpine AS builder

# Install build dependencies and dumb-init
RUN apk add --no-cache dumb-init=1.2.5-r2 python3 make g++ \
    && mkdir -p /home/node/app \
    && chown -R node:node /home/node/app

# Set working directory
WORKDIR /home/node/app

# Switch to non-root user
USER node

# Copy package files with correct ownership
COPY --chown=node:node package*.json ./

# Install dependencies with strict security and offline mode
RUN npm ci --only=production --ignore-scripts \
    && npm cache clean --force

# Copy source code with correct ownership
COPY --chown=node:node . .

# Build TypeScript code with strict settings
RUN npm run build \
    && npm prune --production

# Production stage
FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init=1.2.5-r2 curl=8.4.0-r0 \
    && addgroup -g 1000 healthapp \
    && adduser -u 1000 -G healthapp -s /bin/sh -D healthapp \
    && mkdir -p /app/data /app/logs \
    && chown -R healthapp:healthapp /app

# Set working directory
WORKDIR /app

# Switch to non-root user
USER healthapp

# Copy built artifacts and dependencies
COPY --from=builder --chown=healthapp:healthapp /home/node/app/dist ./dist
COPY --from=builder --chown=healthapp:healthapp /home/node/app/node_modules ./node_modules
COPY --from=builder --chown=healthapp:healthapp /home/node/app/package.json ./

# Set secure environment defaults
ENV NODE_ENV=production \
    PORT=3002 \
    LOG_LEVEL=info \
    FHIR_VERSION=R4 \
    AUDIT_LOG_PATH=/app/logs/audit.log \
    MAX_OLD_SPACE_SIZE=2048

# Configure security policies
LABEL maintainer="AUSTA Healthcare" \
      service="health-records" \
      version="1.0.0" \
      compliance="hipaa" \
      fhir.version="R4" \
      security.baseline="1.0" \
      audit.enabled="true"

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Define persistent storage
VOLUME ["/app/data", "/app/logs"]

# Expose API port
EXPOSE 3002

# Set resource constraints
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Configure security options
SECURITY_OPTS="--security-opt=no-new-privileges:true \
    --security-opt=seccomp=unconfined \
    --cap-drop=ALL \
    --cap-add=NET_BIND_SERVICE"

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]