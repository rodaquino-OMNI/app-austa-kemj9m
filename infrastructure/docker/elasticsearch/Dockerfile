# Base image with version pinned for stability
FROM docker.elastic.co/elasticsearch/elasticsearch:8.9.0

# Labels for container identification and maintenance
LABEL maintainer="AUSTA SuperApp Team" \
      description="Production Elasticsearch instance for AUSTA SuperApp" \
      version="1.0.0" \
      security.features="xpack,ssl,encryption" \
      monitoring.features="metrics,healthcheck,logging"

# Install additional system packages and security updates
USER root
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y \
        curl \
        netcat \
        procps \
        tini && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    chown -R elasticsearch:elasticsearch /usr/share/elasticsearch

# Switch back to elasticsearch user for security
USER elasticsearch

# Copy configuration files
COPY --chown=elasticsearch:elasticsearch elasticsearch.yml /usr/share/elasticsearch/config/
COPY --chown=elasticsearch:elasticsearch jvm.options /usr/share/elasticsearch/config/jvm.options.d/
COPY --chown=elasticsearch:elasticsearch log4j2.properties /usr/share/elasticsearch/config/
COPY --chown=elasticsearch:elasticsearch security/ /usr/share/elasticsearch/config/security/

# Create required directories with proper permissions
RUN mkdir -p /usr/share/elasticsearch/data && \
    mkdir -p /usr/share/elasticsearch/logs && \
    mkdir -p /usr/share/elasticsearch/config/certs && \
    chmod 0750 /usr/share/elasticsearch/data && \
    chmod 0750 /usr/share/elasticsearch/logs && \
    chmod 0750 /usr/share/elasticsearch/config/certs

# Set environment variables for configuration
ENV ES_JAVA_OPTS="-Xms4g -Xmx4g -XX:+UseG1GC -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/usr/share/elasticsearch/logs/" \
    discovery.type=single-node \
    xpack.security.enabled=true \
    xpack.security.transport.ssl.enabled=true \
    xpack.monitoring.enabled=true \
    xpack.monitoring.collection.enabled=true \
    bootstrap.memory_lock=true \
    cluster.name=austa-elasticsearch \
    network.host=0.0.0.0 \
    TZ=UTC

# Expose ports with comments
EXPOSE 9200 # HTTPS REST API
EXPOSE 9300 # Transport port for node communication
EXPOSE 9600 # Monitoring metrics endpoint

# Define volumes for persistence
VOLUME ["/usr/share/elasticsearch/data", "/usr/share/elasticsearch/logs", "/usr/share/elasticsearch/config/certs"]

# Health check with retry logic
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -sf --insecure https://localhost:9200/_cluster/health || exit 1

# Set resource limits
WORKDIR /usr/share/elasticsearch

# Use tini as init system
ENTRYPOINT ["/usr/bin/tini", "--"]

# Default command to start Elasticsearch
CMD ["./bin/elasticsearch"]

# Set ulimits for production environment
# These should be set in docker-compose or kubernetes deployment
# ulimit -n 65535
# ulimit -u 4096
# vm.max_map_count=262144 (set on host)

# Additional security measures
RUN elasticsearch-plugin install --batch ingest-attachment && \
    elasticsearch-plugin install --batch analysis-icu && \
    elasticsearch-certutil ca --out /usr/share/elasticsearch/config/certs/ca.p12 --pass "" && \
    elasticsearch-certutil cert --ca /usr/share/elasticsearch/config/certs/ca.p12 --ca-pass "" \
        --out /usr/share/elasticsearch/config/certs/elasticsearch.p12 --pass ""

# Set secure file permissions
RUN chmod 0640 /usr/share/elasticsearch/config/elasticsearch.yml && \
    chmod 0640 /usr/share/elasticsearch/config/jvm.options && \
    chmod 0640 /usr/share/elasticsearch/config/log4j2.properties

# Add security hardening
RUN echo "xpack.security.transport.ssl.verification_mode: certificate" >> /usr/share/elasticsearch/config/elasticsearch.yml && \
    echo "xpack.security.http.ssl.enabled: true" >> /usr/share/elasticsearch/config/elasticsearch.yml && \
    echo "xpack.security.audit.enabled: true" >> /usr/share/elasticsearch/config/elasticsearch.yml