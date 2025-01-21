# Terraform outputs for AUSTA SuperApp monitoring infrastructure
# Version: 1.0.0

# Prometheus server endpoint with secure access
output "prometheus_endpoint" {
  description = "HTTPS endpoint URL for secure Prometheus server access with authentication"
  value       = "https://${helm_release.prometheus.status[0].notes}"
  sensitive   = false
}

# Grafana dashboard endpoint with SSO integration
output "grafana_endpoint" {
  description = "HTTPS endpoint URL for secure Grafana dashboard access with SSO integration"
  value       = "https://${helm_release.grafana.status[0].notes}"
  sensitive   = false
}

# Secure Grafana admin credentials
output "grafana_admin_password" {
  description = "Encrypted admin password for Grafana dashboard access with rotation policy"
  value       = var.grafana_admin_password
  sensitive   = true
}

# Elasticsearch endpoint with TLS
output "elasticsearch_endpoint" {
  description = "HTTPS endpoint URL for secure Elasticsearch access with TLS and authentication"
  value       = "https://${helm_release.elastic.status[0].notes}"
  sensitive   = false
}

# Jaeger tracing endpoint
output "jaeger_endpoint" {
  description = "HTTPS endpoint URL for secure Jaeger tracing interface with access controls"
  value       = "https://${helm_release.jaeger.status[0].notes}"
  sensitive   = false
}

# Monitoring namespace for network policies
output "monitoring_namespace" {
  description = "Kubernetes namespace where monitoring stack is deployed with network policies"
  value       = var.namespace
  sensitive   = false
}

# Alert manager configuration
output "alert_manager_config" {
  description = "Encrypted alert manager configuration for secure notification channels"
  value       = var.alert_config
  sensitive   = true
}

# Metrics retention configuration
output "metrics_retention_period" {
  description = "Configured retention period for monitoring metrics aligned with compliance"
  value       = var.retention_period
  sensitive   = false
}

# Consolidated monitoring endpoints object
output "monitoring_endpoints" {
  description = "Consolidated secure endpoints for all monitoring services"
  value = {
    prometheus_url    = "https://${helm_release.prometheus.status[0].notes}"
    grafana_url      = "https://${helm_release.grafana.status[0].notes}"
    elasticsearch_url = "https://${helm_release.elastic.status[0].notes}"
    jaeger_url       = "https://${helm_release.jaeger.status[0].notes}"
  }
  sensitive = false
}

# Monitoring configuration object
output "monitoring_config" {
  description = "Consolidated monitoring configuration values"
  value = {
    namespace         = var.namespace
    retention_period  = var.retention_period
    slo_thresholds   = var.alert_config.thresholds
    storage_config   = var.storage_config
  }
  sensitive = false
}