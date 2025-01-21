# Stage 1: Dependencies
FROM node:18-alpine AS deps
LABEL maintainer="AUSTA SuperApp Team" \
      version="1.0.0" \
      description="AUSTA SuperApp Web Application"

# Install additional security packages
RUN apk add --no-cache \
    curl \
    dumb-init \
    python3 \
    # Required for node-gyp
    make \
    g++ \
    # Clean up
    && rm -rf /var/cache/apk/*

# Set working directory with appropriate permissions
WORKDIR /app
RUN chown -R node:node /app

# Copy package files with integrity verification
COPY --chown=node:node package*.json ./
COPY --chown=node:node yarn.lock ./

# Install dependencies with security checks
USER node
RUN npm ci --frozen-lockfile \
    && npm audit fix \
    # Clean npm cache
    && npm cache clean --force \
    # Remove unnecessary files
    && rm -rf /home/node/.npm

# Stage 2: Builder
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

# Set build environment variables
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_SHARP_PATH=/app/node_modules/sharp

# Build application with optimizations
USER node
RUN npm run build \
    # Remove source maps in production
    && find .next -name '*.map' -delete \
    # Clean development dependencies
    && rm -rf node_modules/.cache \
    && npm prune --production

# Stage 3: Runner
FROM node:18-alpine AS runner
LABEL org.opencontainers.image.source="https://github.com/austa/superapp-web"

# Install security updates and dumb-init
RUN apk add --no-cache \
    dumb-init \
    curl \
    # Clean up
    && rm -rf /var/cache/apk/*

# Create app directory with secure permissions
WORKDIR /app
RUN chown -R node:node /app

# Set secure environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_SHARP_PATH=/app/node_modules/sharp \
    NPM_CONFIG_LOGLEVEL=error \
    NEXT_OPTIMIZE_FONTS=1

# Copy necessary files from builder
COPY --from=builder --chown=node:node /app/next.config.ts ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Configure security permissions
RUN chmod -R 550 /app \
    && chmod -R 770 /app/.next/cache \
    && chmod 660 /app/package.json \
    # Create secure temp directory
    && mkdir -p /tmp/app-tmp \
    && chown -R node:node /tmp/app-tmp \
    && chmod 1777 /tmp/app-tmp

# Set secure user
USER node

# Configure healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Expose application port
EXPOSE 3000

# Set resource limits
ENV NODE_OPTIONS="--max-old-space-size=512"

# Start application with dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "start"]