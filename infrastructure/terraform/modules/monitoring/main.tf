# Terraform module for AUSTA SuperApp monitoring infrastructure
# Version: 1.0.0

terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11.0"
    }
  }
}

# Create dedicated monitoring namespace with security labels
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = var.namespace
    labels = {
      name           = "monitoring"
      managed-by     = "terraform"
      security-tier  = "critical"
      compliance     = "hipaa-lgpd"
      "istio-injection" = "enabled"
    }
    annotations = {
      "security.austa.health/audit-level" = "high"
      "network.austa.health/restricted"   = "true"
    }
  }
}

# Deploy Prometheus stack with enhanced security and monitoring
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = "45.7.1"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  values = [
    file("${path.module}/../../../infrastructure/helm/monitoring/values.yaml")
  ]

  set {
    name  = "prometheus.prometheusSpec.retention"
    value = var.retention_period
  }

  set {
    name  = "prometheus.prometheusSpec.securityContext.runAsNonRoot"
    value = "true"
  }

  set {
    name  = "prometheus.prometheusSpec.securityContext.fsGroup"
    value = "65534"
  }

  set {
    name  = "prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName"
    value = var.storage_config.prometheus.storage_class
  }

  set {
    name  = "prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage"
    value = var.storage_config.prometheus.size
  }

  set {
    name  = "alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.storageClassName"
    value = var.storage_config.prometheus.storage_class
  }
}

# Deploy Grafana with enhanced security
resource "helm_release" "grafana" {
  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  version    = "6.50.7"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  set_sensitive {
    name  = "adminPassword"
    value = var.grafana_admin_password
  }

  set {
    name  = "persistence.enabled"
    value = "true"
  }

  set {
    name  = "persistence.storageClassName"
    value = var.storage_config.prometheus.storage_class
  }

  set {
    name  = "securityContext.runAsNonRoot"
    value = "true"
  }
}

# Deploy ELK Stack for logging
resource "helm_release" "elastic" {
  name       = "elasticsearch"
  repository = "https://helm.elastic.co"
  chart      = "elasticsearch"
  version    = "7.17.3"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  set {
    name  = "replicas"
    value = var.storage_config.elasticsearch.replicas
  }

  set {
    name  = "persistence.enabled"
    value = "true"
  }

  set {
    name  = "persistence.storageClass"
    value = var.storage_config.elasticsearch.storage_class
  }

  set {
    name  = "persistence.size"
    value = var.storage_config.elasticsearch.size
  }
}

# Deploy Jaeger for distributed tracing
resource "helm_release" "jaeger" {
  name       = "jaeger"
  repository = "https://jaegertracing.github.io/helm-charts"
  chart      = "jaeger"
  version    = "0.71.1"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  set {
    name  = "storage.type"
    value = var.storage_config.jaeger.storage_type
  }

  set {
    name  = "storage.options.es.server-urls"
    value = "http://elasticsearch-master:9200"
  }

  set {
    name  = "collector.replicaCount"
    value = var.tracing_config.collector.replicas
  }

  set {
    name  = "collector.resources.requests.cpu"
    value = var.tracing_config.collector.resources.requests.cpu
  }

  set {
    name  = "collector.resources.requests.memory"
    value = var.tracing_config.collector.resources.requests.memory
  }
}

# Configure SLO monitoring rules
resource "kubernetes_config_map" "slo_rules" {
  metadata {
    name      = "slo-rules"
    namespace = kubernetes_namespace.monitoring.metadata[0].name
  }

  data = {
    "slo.rules" = <<-EOT
      groups:
      - name: slo_rules
        rules:
        - record: slo:availability:ratio
          expr: sum(rate(http_requests_total{code!~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
        - record: slo:latency:p99
          expr: histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
        - alert: AvailabilitySLOBreach
          expr: slo:availability:ratio < ${var.alert_config.thresholds.availability / 100}
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Availability SLO breach detected"
        - alert: LatencySLOBreach
          expr: slo:latency:p99 > ${var.alert_config.thresholds.latency_ms / 1000}
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Latency SLO breach detected"
    EOT
  }
}

# Configure SIEM integration if enabled
resource "kubernetes_secret" "siem_config" {
  count = var.siem_integration.enabled ? 1 : 0

  metadata {
    name      = "siem-config"
    namespace = kubernetes_namespace.monitoring.metadata[0].name
  }

  data = {
    "siem.yaml" = yamlencode({
      type     = var.siem_integration.type
      endpoint = var.siem_integration.config.endpoint
      index    = var.siem_integration.config.index
      token    = var.siem_integration.config.token
      tls      = var.siem_integration.config.tls
    })
  }
}

# Export monitoring endpoints
output "monitoring_endpoints" {
  value = {
    prometheus_url    = "http://prometheus-server.${var.namespace}.svc.cluster.local:9090"
    grafana_url      = "http://grafana.${var.namespace}.svc.cluster.local:3000"
    elasticsearch_url = "http://elasticsearch-master.${var.namespace}.svc.cluster.local:9200"
    jaeger_url       = "http://jaeger-query.${var.namespace}.svc.cluster.local:16686"
  }
  description = "Internal service endpoints for monitoring stack"
}

# Export SLO metrics
output "slo_metrics" {
  value = {
    availability_status = "slo:availability:ratio"
    latency_percentiles = {
      p99 = "slo:latency:p99"
    }
  }
  description = "SLO metric names for external consumption"
}