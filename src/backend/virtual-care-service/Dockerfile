# Build stage
FROM node:18-alpine AS builder

# Install build essentials
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl

# Set working directory
WORKDIR /app

# Copy package files for dependency caching
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies with npm ci for reproducible builds
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript with production optimizations
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production stage
FROM node:18-alpine

# Create non-root user/group
RUN addgroup -g 1000 nodegroup && \
    adduser -u 1000 -G nodegroup -s /bin/sh -D nodeuser

# Set working directory
WORKDIR /app

# Copy production dependencies and compiled code
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Set strict file permissions
RUN chown -R nodeuser:nodegroup /app && \
    chmod -R 644 /app && \
    find /app -type d -exec chmod 755 {} \;

# Configure production environment
ENV NODE_ENV=production \
    PORT=3002 \
    NODE_OPTIONS="--max-old-space-size=2048 --max-http-header-size=16384" \
    UV_THREADPOOL_SIZE=4

# Create and configure log volume
RUN mkdir -p /app/logs && \
    chown -R nodeuser:nodegroup /app/logs && \
    chmod 644 /app/logs

# Expose service port
EXPOSE 3002

# Create volume for logs
VOLUME ["/app/logs"]

# Switch to non-root user
USER nodeuser

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Add metadata labels
LABEL maintainer="AUSTA Healthcare" \
    service="virtual-care" \
    version="1.0.0" \
    environment="production" \
    security.scan-date="${BUILD_DATE}" \
    org.opencontainers.image.source="https://github.com/austa/virtual-care-service" \
    org.opencontainers.image.description="Virtual Care Service for secure video consultations"

# Security hardening
RUN apk add --no-cache curl && \
    rm -rf /var/cache/apk/* && \
    echo "nodeuser soft nofile 65535" >> /etc/security/limits.conf && \
    echo "nodeuser hard nofile 65535" >> /etc/security/limits.conf

# Set security options
SECURITY_OPTS="--security-opt=no-new-privileges:true"

# Start application with Node.js optimizations
CMD ["node", "--enable-source-maps", "dist/index.js"]