# Use official Fluentd v1.16-1 Alpine image as base
# fluent/fluentd:v1.16-1
FROM fluent/fluentd:v1.16-1

# Labels for container metadata
LABEL maintainer="AUSTA SuperApp Platform Team" \
      description="Production Fluentd image for secure log aggregation" \
      version="1.0.0"

# Install build dependencies
USER root
RUN apk add --no-cache --virtual .build-deps \
    build-base \
    ruby-dev \
    libffi-dev \
    gcc \
    libc-dev \
    make \
    openssl-dev

# Install production plugins with version pinning
# fluent-plugin-elasticsearch:5.3.0
# fluent-plugin-kubernetes_metadata_filter:3.2.0
RUN gem install \
    fluent-plugin-elasticsearch -v 5.3.0 \
    fluent-plugin-kubernetes_metadata_filter -v 3.2.0 \
    fluent-plugin-prometheus \
    fluent-plugin-record-modifier \
    fluent-plugin-rewrite-tag-filter \
    && gem sources --clear-all \
    && apk del .build-deps \
    && rm -rf /tmp/* /var/tmp/* /usr/lib/ruby/gems/*/cache/*.gem

# Create necessary directories with appropriate permissions
RUN mkdir -p /fluentd/certs \
    /var/log/fluentd-pos \
    /var/log/fluentd-buffer \
    && chown -R fluent:fluent /fluentd /var/log/fluentd* \
    && chmod -R 755 /fluentd \
    && chmod -R 775 /var/log/fluentd*

# Set secure file permissions for TLS certificates
RUN chmod 400 /fluentd/certs/* || true

# Configure environment variables for production settings
ENV FLUENT_ELASTICSEARCH_HOST=elasticsearch-master.monitoring.svc.cluster.local \
    FLUENT_ELASTICSEARCH_PORT=9200 \
    FLUENT_ELASTICSEARCH_SCHEME=https \
    FLUENT_ELASTICSEARCH_SSL_VERIFY=true \
    FLUENT_ELASTICSEARCH_SSL_VERSION=TLSv1_2 \
    FLUENTD_SYSTEMD_CONF=disable \
    BUFFER_SIZE_LIMIT=8GB \
    FLUSH_INTERVAL=30s \
    CHUNK_LIMIT_SIZE=2M \
    QUEUE_LIMIT_LENGTH=32

# Expose necessary ports
# 24224 - Forward protocol
# 9880  - HTTP input
# 24231 - Prometheus metrics
EXPOSE 24224 9880 24231

# Volume configuration
VOLUME ["/fluentd/etc", "/var/log/fluentd-pos", "/var/log/fluentd-buffer", "/fluentd/certs"]

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD ps aux | grep fluentd | grep -v grep > /dev/null && \
        curl -sk https://${FLUENT_ELASTICSEARCH_HOST}:${FLUENT_ELASTICSEARCH_PORT} > /dev/null && \
        test -w /var/log/fluentd-buffer && \
        test $(ps aux | grep fluentd | grep -v grep | awk '{print $6}') -lt 2097152 || exit 1

# Switch to non-root user
USER fluent

# Set default command with optimized Ruby GC settings
CMD exec fluentd -c /fluentd/etc/fluent.conf -p /fluentd/plugins \
    --gemfile /fluentd/Gemfile \
    -v \
    --under-supervisor \
    --no-supervisor-fork \
    --use-v1-config \
    --suppress-repeated-stacktrace \
    -o /fluentd/log/fluentd.log