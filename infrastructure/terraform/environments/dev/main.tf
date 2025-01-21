# AUSTA SuperApp Development Environment Infrastructure
# Version: 1.0.0
# Terraform >= 1.0.0 required

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11.0"
    }
  }

  backend "s3" {
    bucket         = "austa-terraform-state-dev"
    key            = "dev/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock-dev"
    kms_key_id     = "arn:aws:kms:us-west-2:${data.aws_caller_identity.current.account_id}:key/terraform-state"
  }
}

# Local variables for environment configuration
locals {
  environment = "dev"
  aws_region = "us-west-2"
  cluster_name = "austa-dev-eks"
  
  common_tags = {
    Environment      = "dev"
    Project         = "AUSTA SuperApp"
    ManagedBy       = "Terraform"
    HIPAA           = "true"
    SecurityLevel   = "enhanced"
    ComplianceStatus = "monitored"
  }
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Configure AWS Provider
provider "aws" {
  region = local.aws_region
  default_tags = local.common_tags
}

# Configure Kubernetes Provider
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", local.cluster_name]
  }
}

# Security Module Configuration
module "security" {
  source = "../../modules/security"
  
  environment = local.environment
  vpc_id      = module.vpc.vpc_id
  
  security_rules = {
    ingress_https = {
      type        = "ingress"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
      description = "HTTPS inbound"
      security_level = "high"
      compliance_required = true
    }
  }

  waf_config = {
    web_acl_arn = module.cloudfront.web_acl_arn
    rate_limit  = 2000
    block_period = 300
    ip_rate_limit = 100
    rule_priority = 1
    geo_match_statement = ["US", "BR"]
    ip_reputation_list = []
  }

  security_monitoring = {
    enable_ids = true
    enable_audit_logging = true
    log_retention_days = 30
    alert_endpoints = ["arn:aws:sns:${local.aws_region}:${data.aws_caller_identity.current.account_id}:security-alerts"]
    monitoring_interval = 60
  }

  compliance_mode = "HIPAA"
  enable_encryption = true
}

# Monitoring Module Configuration
module "monitoring" {
  source = "../../modules/monitoring"
  
  cluster_name = local.cluster_name
  namespace    = "monitoring"
  retention_period = "7d"
  
  storage_config = {
    prometheus = {
      storage_class = "gp3"
      size         = "100Gi"
    }
    elasticsearch = {
      storage_class = "gp3"
      size         = "200Gi"
      replicas     = 3
    }
    jaeger = {
      storage_type  = "elasticsearch"
      storage_class = "gp3"
      size         = "100Gi"
    }
  }

  alert_config = {
    thresholds = {
      availability = 99.9
      latency_ms   = 500
      error_rate   = 0.1
    }
    slack = {
      webhook_url = "https://hooks.slack.com/services/xxx/yyy/zzz"
      channel    = "austa-dev-alerts"
    }
    pagerduty = {
      service_key = "xxx"
      severity_map = {
        critical = "P1"
        warning  = "P2"
      }
    }
  }

  metrics_config = {
    scrape_interval = "30s"
    evaluation_interval = "30s"
    retention_size = "30GB"
    targets = [
      {
        job_name = "kubernetes-pods"
        scheme   = "http"
        path     = "/metrics"
        port     = 8080
      }
    ]
  }

  siem_integration = {
    enabled = true
    type    = "elasticsearch"
    config = {
      endpoint = "http://elasticsearch-master:9200"
      index    = "austa-security-logs"
      tls = {
        enabled     = true
        verify_cert = true
      }
    }
  }
}

# Output configuration
output "monitoring_endpoints" {
  value = module.monitoring.monitoring_endpoints
  description = "Endpoints for monitoring services"
}

output "security_group_id" {
  value = module.security.security_group_id
  description = "Security group ID for the application"
}

output "kms_key_arn" {
  value = module.security.kms_key_arn
  description = "KMS key ARN for encryption"
}