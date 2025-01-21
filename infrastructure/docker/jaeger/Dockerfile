# Use official Jaeger base image with security patches
FROM jaegertracing/all-in-one:1.47.0

# Add metadata labels
LABEL com.austa.component="tracing" \
      com.austa.compliance="hipaa" \
      com.austa.security="enhanced" \
      maintainer="AUSTA SuperApp Platform Team" \
      description="Healthcare-compliant Jaeger tracing system" \
      version="1.0.0"

# Install additional security and monitoring tools
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd -r -s /bin/false jaeger-user

# Create necessary directories with proper permissions
RUN mkdir -p /etc/jaeger/certs \
    /etc/jaeger/config \
    /var/log/jaeger \
    && chown -R jaeger-user:jaeger-user /etc/jaeger /var/log/jaeger

# Copy configuration files
COPY --chown=jaeger-user:jaeger-user prometheus.yml /etc/jaeger/config/prometheus.yml

# Set secure permissions
RUN chmod 600 /etc/jaeger/config/* \
    && chmod 700 /etc/jaeger/certs

# Set environment variables for configuration
ENV SPAN_STORAGE_TYPE=elasticsearch \
    ES_SERVER_URLS=http://elasticsearch:9200 \
    ES_TLS_ENABLED=true \
    ES_TLS_SKIP_HOST_VERIFY=false \
    ES_USERNAME=${ES_USERNAME} \
    ES_PASSWORD=${ES_PASSWORD} \
    COLLECTOR_ZIPKIN_HOST_PORT=:9411 \
    COLLECTOR_OTLP_ENABLED=true \
    COLLECTOR_OTLP_TLS_ENABLED=true \
    JAEGER_AGENT_PORT=6831 \
    JAEGER_SAMPLER_TYPE=probabilistic \
    JAEGER_SAMPLER_PARAM=1 \
    JAEGER_TAGS=environment=production,compliance=hipaa \
    METRICS_STORAGE_TYPE=prometheus \
    QUERY_BASE_PATH=/jaeger \
    HEALTH_CHECK_HTTP_PORT=14269 \
    LOG_LEVEL=info \
    JAEGER_DISABLED=false \
    JAEGER_AGENT_TAGS=security=enhanced,healthcare=true

# Configure data retention and compliance settings
ENV JAEGER_RETENTION_DAYS=90 \
    JAEGER_AUDIT_LOGGING=true \
    JAEGER_PHI_PROTECTION=true \
    JAEGER_ENCRYPTION_KEY=${JAEGER_ENCRYPTION_KEY}

# Expose required ports
# 5775: UDP serve zipkin.thrift over compact thrift protocol
# 6831: UDP serve jaeger.thrift over compact thrift protocol
# 6832: UDP serve jaeger.thrift over binary thrift protocol
# 5778: HTTP serve configs, sampling strategies
# 16686: HTTP serve frontend
# 14250: gRPC accept model.proto
# 14268: HTTP accept jaeger.thrift directly from clients
# 14269: Health check server
# 9411: Zipkin compatible endpoint
# 4317: OTLP gRPC
# 4318: OTLP HTTP
EXPOSE 5775/udp 6831/udp 6832/udp 5778 16686 14250 14268 14269 9411 4317 4318

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD curl -f http://localhost:${HEALTH_CHECK_HTTP_PORT}/health || exit 1

# Switch to non-root user
USER jaeger-user

# Set secure workdir
WORKDIR /home/jaeger-user

# Command to run Jaeger with security and compliance settings
ENTRYPOINT ["/go/bin/all-in-one-linux"]
CMD ["--sampling.strategies-file=/etc/jaeger/config/sampling.json", \
     "--admin-http-host=0.0.0.0", \
     "--admin-http-port=14269", \
     "--query.base-path=/jaeger", \
     "--log-level=info", \
     "--metrics-backend=prometheus", \
     "--metrics-http-route=/metrics"]