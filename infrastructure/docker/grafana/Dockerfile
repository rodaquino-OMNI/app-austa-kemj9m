# Base Grafana image
# grafana/grafana:10.0.0 - Enterprise-grade monitoring platform
FROM grafana/grafana:10.0.0

# Set maintainer label
LABEL maintainer="AUSTA SuperApp Platform Team"
LABEL description="HIPAA-compliant Grafana monitoring service for healthcare metrics"
LABEL version="1.0.0"

# Install required system dependencies
USER root
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Switch back to grafana user for security
USER grafana

# Environment variables for Grafana configuration
ENV GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER}
ENV GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
ENV GF_INSTALL_PLUGINS="grafana-piechart-panel,grafana-worldmap-panel,grafana-prometheus"
ENV GF_AUTH_ANONYMOUS_ENABLED="false"
ENV GF_SECURITY_ALLOW_EMBEDDING="false"
ENV GF_SECURITY_COOKIE_SECURE="true"
ENV GF_SECURITY_SESSION_LIFETIME="8h"
ENV GF_ANALYTICS_REPORTING_ENABLED="false"
ENV GF_SECURITY_AUDIT_ENABLED="true"
ENV GF_PATHS_PROVISIONING="/etc/grafana/provisioning"
ENV GF_SERVER_HTTP_PORT="3000"

# Install Grafana plugins
RUN grafana-cli plugins install grafana-piechart-panel 2.0.0 && \
    grafana-cli plugins install grafana-worldmap-panel 1.0.0 && \
    grafana-cli plugins install grafana-prometheus 1.0.0

# Create necessary directories
RUN mkdir -p /etc/grafana/provisioning/dashboards \
    /etc/grafana/provisioning/datasources \
    /etc/grafana/provisioning/alerting \
    /var/lib/grafana/dashboards

# Copy configuration files
COPY ./provisioning/dashboards /etc/grafana/provisioning/dashboards/
COPY ./provisioning/datasources /etc/grafana/provisioning/datasources/
COPY ./provisioning/alerting /etc/grafana/provisioning/alerting/
COPY ./dashboards /var/lib/grafana/dashboards/

# Set permissions
RUN chmod -R 777 /etc/grafana/provisioning/dashboards \
    /etc/grafana/provisioning/datasources \
    /etc/grafana/provisioning/alerting \
    /var/lib/grafana/dashboards

# HIPAA compliance configurations
RUN grafana-cli admin reset-admin-password ${GRAFANA_ADMIN_PASSWORD} && \
    chmod 600 /etc/grafana/grafana.ini

# Expose Grafana port
EXPOSE 3000

# Set up healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Set resource limits
ENV GOMAXPROCS=1
ENV GOMEMLIMIT=2G

# Volume configuration for persistent storage
VOLUME ["/var/lib/grafana", "/etc/grafana/provisioning/dashboards", "/etc/grafana/provisioning/datasources", "/etc/grafana/provisioning/alerting"]

# Start Grafana
ENTRYPOINT ["/run.sh"]