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
    bucket         = "austa-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    kms_key_id     = "arn:aws:kms:us-west-2:123456789012:key/staging-terraform-key"
  }
}

locals {
  environment = "staging"
  aws_region  = "us-west-2"
  availability_zones = [
    "us-west-2a",
    "us-west-2b",
    "us-west-2c"
  ]
  common_tags = {
    Environment        = "staging"
    Project           = "AUSTA SuperApp"
    ManagedBy         = "Terraform"
    HIPAA             = "true"
    DataClassification = "sensitive"
    BackupSchedule    = "daily"
    MonitoringLevel   = "enhanced"
  }
}

provider "aws" {
  region = local.aws_region
  default_tags {
    tags = local.common_tags
  }
  assume_role {
    role_arn     = "arn:aws:iam::123456789012:role/staging-terraform-role"
    session_name = "terraform-staging"
  }
}

provider "kubernetes" {
  host                   = module.aws_infrastructure.eks_cluster_endpoint
  cluster_ca_certificate = base64decode(module.aws_infrastructure.eks_cluster_ca_cert)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = [
      "eks",
      "get-token",
      "--cluster-name",
      module.aws_infrastructure.eks_cluster_name
    ]
  }
}

module "security" {
  source      = "terraform-aws-modules/security-group/aws"
  environment = local.environment
  vpc_id      = module.aws_infrastructure.vpc_id
  kms_key_arn = module.aws_infrastructure.kms_key_arn

  waf_config = {
    web_acl_name  = "staging-austa-waf"
    rate_limit    = 2000
    ip_rate_limit = 1000
    rule_groups = [
      "AWSManagedRulesCommonRuleSet",
      "AWSManagedRulesKnownBadInputsRuleSet"
    ]
  }

  security_groups = {
    eks_cluster = {
      name = "staging-eks-cluster-sg"
      rules = {
        ingress_https = {
          from_port   = 443
          to_port     = 443
          protocol    = "tcp"
          cidr_blocks = ["10.0.0.0/8"]
        }
      }
    }
  }
}

module "monitoring" {
  source       = "terraform-aws-modules/eks/aws//modules/monitoring"
  cluster_name = module.aws_infrastructure.eks_cluster_name

  enable_prometheus    = true
  enable_grafana      = true
  enable_alertmanager = true
  retention_period    = "15d"

  alert_config = {
    cpu_threshold    = 80
    memory_threshold = 80
    disk_threshold   = 75
  }
}

output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.aws_infrastructure.vpc_id
}

output "eks_cluster_name" {
  description = "The name of the EKS cluster"
  value       = module.aws_infrastructure.eks_cluster_name
}

output "monitoring_endpoints" {
  description = "Endpoints for monitoring services"
  value = {
    prometheus_endpoint = module.monitoring.prometheus_endpoint
    grafana_endpoint   = module.monitoring.grafana_endpoint
  }
  sensitive = true
}