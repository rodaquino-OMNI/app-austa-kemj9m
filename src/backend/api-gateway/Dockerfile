# Stage 1: Builder
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ 

# Set working directory
WORKDIR /app

# Copy package files with proper ownership
COPY --chown=node:node package*.json ./

# Install dependencies with security audit
RUN npm ci --audit=true \
    && npm audit fix --audit-level=high \
    && npm cache clean --force

# Copy source code and config files
COPY --chown=node:node . .

# Build TypeScript code with optimizations
RUN npm run build \
    && npm prune --production

# Stage 2: Production
FROM node:18-alpine

# Install security updates and required packages
RUN apk update && apk upgrade \
    && apk add --no-cache dumb-init curl

# Create non-root user and group
RUN addgroup -g 1001 -S node \
    && adduser -u 1001 -S node -G node

# Set working directory
WORKDIR /app

# Copy built artifacts from builder with correct permissions
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/src/healthcheck.js ./healthcheck.js

# Set security-related environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    API_VERSION=v1 \
    KONG_ADMIN_URL=http://kong-admin:8001 \
    KONG_PROXY_URL=http://kong-proxy:8000 \
    NODE_OPTIONS="--max-old-space-size=2048" \
    SECURITY_HEADERS_ENABLED=true \
    RATE_LIMIT_ENABLED=true \
    AUDIT_LOGGING_ENABLED=true

# Configure security limits and policies
RUN mkdir -p /tmp/api-gateway && chown node:node /tmp/api-gateway

# Set up health monitoring
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ["node", "./healthcheck.js"]

# Set container user
USER node

# Expose service port
EXPOSE 3000

# Set resource constraints
LABEL maintainer="AUSTA Healthcare" \
      application="api-gateway" \
      version="1.0.0" \
      security.hipaa.compliant="true" \
      security.updates.policy="auto" \
      monitoring.health.endpoint="/health" \
      vendor="AUSTA SuperApp"

# Configure container runtime security
SECURITY_OPT ["no-new-privileges:true", "seccomp=unconfined"]

# Set memory and CPU limits
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Use dumb-init as PID 1
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "./dist/index.js"]

# Define volumes for persistent data
VOLUME ["/tmp/api-gateway"]

# Set read-only root filesystem
READONLY_ROOTFS true