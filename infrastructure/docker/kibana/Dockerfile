# Use official Kibana image as base
FROM docker.elastic.co/kibana/kibana:8.9.0

# Labels for container metadata
LABEL maintainer="AUSTA SuperApp Team" \
      description="Production Kibana instance for AUSTA SuperApp logging and analytics" \
      version="8.9.0" \
      security.features.enabled="true" \
      monitoring.features.enabled="true"

# Switch to root to perform system-level operations
USER root

# Install additional security packages and tools
RUN apt-get update && apt-get install -y \
    curl \
    procps \
    netcat \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /usr/share/kibana/data \
    && mkdir -p /usr/share/kibana/config/certs \
    && chown -R kibana:kibana /usr/share/kibana/data \
    && chown -R kibana:kibana /usr/share/kibana/config

# Copy configuration files
COPY --chown=kibana:kibana config/kibana.yml /usr/share/kibana/config/
COPY --chown=kibana:kibana config/node.options /usr/share/kibana/config/
COPY --chown=kibana:kibana scripts/healthcheck.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/healthcheck.sh

# Set secure environment variables
ENV ELASTICSEARCH_HOSTS=http://elasticsearch:9200 \
    XPACK_SECURITY_ENABLED=true \
    XPACK_MONITORING_ENABLED=true \
    XPACK_REPORTING_ENABLED=true \
    XPACK_ENCRYPTEDSAVEDOBJECTS_ENABLED=true \
    XPACK_SECURITY_AUDIT_ENABLED=true \
    TELEMETRY_ENABLED=false \
    LOGGING_VERBOSE=true \
    NODE_OPTIONS="--max-old-space-size=2048" \
    SERVER_HOST="0.0.0.0" \
    SERVER_NAME="austa-kibana" \
    SERVER_BASEPATH="" \
    SERVER_MAXPAYLOADBYTES=10485760

# Resource limits and performance tuning
ENV OPENSEARCH_JAVA_OPTS="-Xms2g -Xmx2g" \
    ELASTIC_APM_ENABLED=true \
    ELASTIC_APM_SERVICE_NAME="austa-kibana" \
    ELASTIC_APM_ENVIRONMENT="production"

# Expose Kibana web interface port
EXPOSE 5601

# Define volumes for persistence
VOLUME ["/usr/share/kibana/data", "/usr/share/kibana/config", "/usr/share/kibana/config/certs"]

# Switch back to kibana user for security
USER kibana

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD /usr/local/bin/healthcheck.sh

# Set working directory
WORKDIR /usr/share/kibana

# Default command to start Kibana
CMD ["kibana"]

# Set resource constraints
STOPSIGNAL SIGTERM

# Additional security hardening
RUN kibana-plugin list && \
    kibana-encryption-keys generate && \
    echo "xpack.security.enabled: true" >> /usr/share/kibana/config/kibana.yml && \
    echo "xpack.security.audit.enabled: true" >> /usr/share/kibana/config/kibana.yml && \
    echo "server.ssl.enabled: true" >> /usr/share/kibana/config/kibana.yml

# Performance optimization
RUN echo "optimize.bundleFilter.maxSizeBytes: 5242880" >> /usr/share/kibana/config/kibana.yml && \
    echo "server.compression.enabled: true" >> /usr/share/kibana/config/kibana.yml && \
    echo "server.keepaliveTimeout: 120000" >> /usr/share/kibana/config/kibana.yml

# Monitoring configuration
RUN echo "monitoring.kibana.collection.enabled: true" >> /usr/share/kibana/config/kibana.yml && \
    echo "monitoring.ui.container.elasticsearch.enabled: true" >> /usr/share/kibana/config/kibana.yml && \
    echo "monitoring.ui.container.logstash.enabled: true" >> /usr/share/kibana/config/kibana.yml