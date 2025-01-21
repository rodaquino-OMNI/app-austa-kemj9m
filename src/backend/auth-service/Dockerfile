# Stage 1: Build environment
FROM node:18-alpine AS builder
# node:18-alpine v18.19.0

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies with npm ci for deterministic builds
RUN npm ci --no-audit \
    && npm cache clean --force

# Copy source code and TypeScript config
COPY . .

# Build TypeScript code with optimizations
RUN npm run build \
    && npm prune --production \
    && npm audit

# Stage 2: Production environment
FROM node:18-alpine
# node:18-alpine v18.19.0

# Set working directory
WORKDIR /app

# Create non-root user and group
RUN addgroup -S authservice && \
    adduser -S -G authservice authservice

# Copy verified build artifacts from builder
COPY --from=builder --chown=authservice:authservice /app/dist ./dist
COPY --from=builder --chown=authservice:authservice /app/node_modules ./node_modules
COPY --from=builder --chown=authservice:authservice /app/package*.json ./

# Create log directory with appropriate permissions
RUN mkdir -p /app/dist/logs && \
    chown -R authservice:authservice /app/dist/logs && \
    chmod -R 550 /app && \
    chmod -R 770 /app/dist/logs

# Configure production environment variables
ENV NODE_ENV=production \
    PORT=4000 \
    NODE_OPTIONS="--max-old-space-size=2048" \
    UV_THREADPOOL_SIZE=4

# Security hardening
RUN apk add --no-cache dumb-init && \
    echo "fs.file-max = 65535" >> /etc/sysctl.conf && \
    echo "authservice soft nofile 65535" >> /etc/security/limits.conf && \
    echo "authservice hard nofile 65535" >> /etc/security/limits.conf

# Configure health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Expose service port
EXPOSE 4000

# Switch to non-root user
USER authservice

# Use dumb-init as PID 1
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application with clustering enabled
CMD ["node", "dist/cluster.js"]