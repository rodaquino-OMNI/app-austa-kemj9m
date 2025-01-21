# Stage 1: Builder
FROM node:18-alpine AS builder

# Set build environment variables
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=error \
    YARN_CACHE_FOLDER=/yarn-cache \
    TS_NODE_TRANSPILE_ONLY=true

# Install build essentials and security patches
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++ \
    git \
    && apk upgrade --no-cache

# Set up yarn cache and workspace
WORKDIR /app
COPY package.json yarn.lock ./
COPY api-gateway/package.json ./api-gateway/
COPY auth-service/package.json ./auth-service/
COPY virtual-care-service/package.json ./virtual-care-service/
COPY health-records-service/package.json ./health-records-service/
COPY claims-service/package.json ./claims-service/
COPY marketplace-service/package.json ./marketplace-service/

# Install dependencies with strict version control
RUN yarn install --frozen-lockfile --production=false \
    && yarn cache clean

# Copy source code and configs
COPY . .
COPY tsconfig.json .

# Build TypeScript with strict checks
RUN yarn build \
    && yarn install --frozen-lockfile --production=true \
    && yarn cache clean

# Generate SBOM
RUN yarn add -D @cyclonedx/bom \
    && npx @cyclonedx/bom -o bom.xml

# Remove build dependencies
RUN apk del .build-deps

# Stage 2: Production
FROM node:18-alpine

# Set production environment variables
ENV NODE_ENV=production \
    TZ=UTC \
    NODE_OPTIONS="--max-old-space-size=2048" \
    SECURITY_HARDENING=enabled

# Install production dependencies
RUN apk add --no-cache \
    tini \
    dumb-init \
    tzdata \
    && apk upgrade --no-cache

# Create non-root user
RUN addgroup -g 1000 node-user \
    && adduser -u 1000 -G node-user -s /bin/sh -D node-user \
    && mkdir -p /app/logs /app/uploads /app/audit \
    && chown -R node-user:node-user /app

# Set working directory
WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=node-user:node-user /app/dist ./dist
COPY --from=builder --chown=node-user:node-user /app/node_modules ./node_modules
COPY --from=builder --chown=node-user:node-user /app/bom.xml ./bom.xml
COPY --from=builder --chown=node-user:node-user /app/package.json ./package.json
COPY --from=builder --chown=node-user:node-user /app/healthcheck.js ./healthcheck.js

# Configure security policies
RUN chmod 550 /app/healthcheck.js \
    && chmod -R 550 /app/dist \
    && chmod -R 550 /app/node_modules \
    && chmod 660 /app/bom.xml \
    && chmod 660 /app/package.json

# Switch to non-root user
USER node-user

# Expose service ports
EXPOSE 3000 3001 3002 3003 3004 3005

# Set up volume mounts
VOLUME ["/app/logs", "/app/uploads", "/app/audit"]

# Configure healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node healthcheck.js

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application with proper signal handling
CMD ["node", "dist/api-gateway/src/main.js"]