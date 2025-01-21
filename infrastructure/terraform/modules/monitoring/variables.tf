# Terraform ~> 1.5.0 required for variable validation features

variable "cluster_name" {
  type        = string
  description = "Name of the Kubernetes cluster where monitoring components will be deployed"
  
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", var.cluster_name))
    error_message = "Cluster name must consist of lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
  }
}

variable "namespace" {
  type        = string
  default     = "monitoring"
  description = "Kubernetes namespace where monitoring components will be deployed"
}

variable "retention_period" {
  type        = string
  default     = "15d"
  description = "Data retention period for monitoring components (format: [0-9]+(d|w|y))"
  
  validation {
    condition     = can(regex("^[0-9]+(d|w|y)$", var.retention_period))
    error_message = "Retention period must be in format: [number](d|w|y). Example: 15d, 4w, 1y"
  }
}

variable "storage_config" {
  type = object({
    prometheus = object({
      storage_class = string
      size         = string
      retention    = optional(string)
    })
    elasticsearch = object({
      storage_class = string
      size         = string
      replicas     = number
    })
    jaeger = object({
      storage_type  = string # "elasticsearch" or "cassandra"
      storage_class = string
      size         = string
    })
  })
  description = "Storage configuration for monitoring components"

  validation {
    condition     = contains(["elasticsearch", "cassandra"], var.storage_config.jaeger.storage_type)
    error_message = "Jaeger storage type must be either 'elasticsearch' or 'cassandra'."
  }
}

variable "grafana_admin_password" {
  type        = string
  sensitive   = true
  description = "Admin password for Grafana dashboard access"

  validation {
    condition     = length(var.grafana_admin_password) >= 12
    error_message = "Grafana admin password must be at least 12 characters long."
  }
}

variable "alert_config" {
  type = object({
    slack = optional(object({
      webhook_url = string
      channel    = string
    }))
    email = optional(object({
      smtp_host     = string
      smtp_port     = number
      from_address  = string
      to_addresses  = list(string)
    }))
    pagerduty = optional(object({
      service_key = string
      severity_map = map(string)
    }))
    thresholds = object({
      availability = number
      latency_ms   = number
      error_rate   = number
    })
  })
  description = "Alert configuration for monitoring components"

  validation {
    condition     = var.alert_config.thresholds.availability >= 99.9 && var.alert_config.thresholds.availability <= 100
    error_message = "Availability threshold must be between 99.9 and 100."
  }
}

variable "tracing_config" {
  type = object({
    sampling_rate = number
    storage_days  = number
    collector = object({
      replicas = number
      resources = object({
        requests = object({
          cpu    = string
          memory = string
        })
        limits = object({
          cpu    = string
          memory = string
        })
      })
    })
  })
  description = "Configuration for Jaeger distributed tracing"
  default = {
    sampling_rate = 0.1
    storage_days  = 7
    collector = {
      replicas = 2
      resources = {
        requests = {
          cpu    = "500m"
          memory = "1Gi"
        }
        limits = {
          cpu    = "1000m"
          memory = "2Gi"
        }
      }
    }
  }
}

variable "metrics_config" {
  type = object({
    scrape_interval = string
    evaluation_interval = string
    retention_size = string
    targets = list(object({
      job_name = string
      scheme   = string
      path     = string
      port     = number
    }))
  })
  description = "Configuration for Prometheus metrics collection"

  validation {
    condition     = can(regex("^[0-9]+[smh]$", var.metrics_config.scrape_interval))
    error_message = "Scrape interval must be in format: [number](s|m|h)."
  }
}

variable "siem_integration" {
  type = object({
    enabled = bool
    type    = string # "elasticsearch" or "splunk"
    config = object({
      endpoint = string
      index    = optional(string)
      token    = optional(string)
      tls = object({
        enabled     = bool
        verify_cert = bool
        ca_cert     = optional(string)
      })
    })
  })
  description = "Configuration for SIEM integration"
  default = {
    enabled = false
    type    = "elasticsearch"
    config = {
      endpoint = "http://elasticsearch-master:9200"
      tls = {
        enabled     = false
        verify_cert = true
      }
    }
  }
}