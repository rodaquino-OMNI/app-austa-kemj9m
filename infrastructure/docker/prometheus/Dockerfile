# Use official Prometheus base image
FROM prom/prometheus:v2.45.0

# Add metadata labels
LABEL maintainer="AUSTA SuperApp Team" \
      description="Prometheus monitoring for AUSTA SuperApp with healthcare compliance" \
      version="1.0" \
      compliance="HIPAA-ready" \
      security_baseline="enhanced"

# Temporarily switch to root for secure configuration
USER root

# Create directories with secure permissions
RUN mkdir -p /etc/prometheus /prometheus && \
    chmod 755 /etc/prometheus /prometheus

# Copy configuration files
COPY ../../src/backend/monitoring/prometheus.yml /etc/prometheus/
COPY ../../src/backend/monitoring/alerting-rules.yml /etc/prometheus/

# Set secure ownership and permissions
RUN chown -R nobody:nobody /etc/prometheus /prometheus && \
    chmod 644 /etc/prometheus/*.yml

# Switch to non-root user for security
USER nobody

# Expose Prometheus web UI and API port
EXPOSE 9090

# Configure persistent storage volume
VOLUME ["/prometheus"]

# Configure Prometheus startup with enhanced security and performance settings
ENTRYPOINT [ "/bin/prometheus" ]
CMD [ \
    "--config.file=/etc/prometheus/prometheus.yml", \
    "--storage.tsdb.path=/prometheus", \
    "--storage.tsdb.retention.time=15d", \
    "--storage.tsdb.retention.size=50GB", \
    "--storage.tsdb.wal-compression", \
    "--web.console.libraries=/usr/share/prometheus/console_libraries", \
    "--web.console.templates=/usr/share/prometheus/consoles", \
    "--web.enable-lifecycle", \
    "--web.enable-admin-api=false", \
    "--storage.tsdb.no-lockfile", \
    "--web.external-url=https://metrics.austa-superapp.com" \
]