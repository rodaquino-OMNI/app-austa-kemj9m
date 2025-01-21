# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /build

# Install build dependencies and security tools
RUN apk add --no-cache curl python3 make g++ \
    && npm install -g snyk@1.1130.0 typescript@5.0.0

# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies with exact versions for reproducibility
RUN npm ci

# Security scan of dependencies
RUN snyk test --severity-threshold=high || true

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript code
RUN npm run build

# Stage 2: Production stage
FROM node:18-alpine

# Install security updates and curl for healthcheck
RUN apk update && apk upgrade && \
    apk add --no-cache curl tini && \
    addgroup -S claims && \
    adduser -S claims -G claims

# Set working directory
WORKDIR /app

# Copy production dependencies and built code
COPY --from=builder /build/package*.json ./
COPY --from=builder /build/dist ./dist
RUN npm ci --only=production && \
    npm cache clean --force

# Set secure permissions
RUN chown -R claims:claims /app && \
    chmod -R 550 /app && \
    chmod -R 770 /app/dist

# Configure health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3003}/health || exit 1

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3003 \
    CLAIMS_SERVICE_PORT=3003 \
    NODE_OPTIONS="--max-old-space-size=2048" \
    TZ=UTC

# Expose service port
EXPOSE ${PORT}

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Switch to non-root user
USER claims

# Start the service
CMD ["node", "dist/index.js"]