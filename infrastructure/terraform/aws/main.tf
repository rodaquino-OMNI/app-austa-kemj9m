# AWS Provider configuration for AUSTA SuperApp infrastructure
# Provider version: ~> 5.0
terraform {
  required_version = ">= 1.0.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "austa-terraform-state-${var.environment}"
    key            = "aws/${var.environment}/terraform.tfstate"
    region         = "${var.aws_region}"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key/terraform-state"
    dynamodb_table = "terraform-state-lock-${var.environment}"
    versioning     = true
  }
}

# AWS Provider with default tags for HIPAA compliance
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project             = "AUSTA SuperApp"
      Environment         = var.environment
      ManagedBy          = "Terraform"
      HIPAA              = "true"
      DataClassification = "PHI"
      SecurityLevel      = "High"
      ComplianceScope    = "HIPAA-BAA"
    }
  }
}

# Data sources for AWS account and availability zones
data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_kms_key" "terraform_state" {
  key_id = "alias/terraform-state"
}

# Local variables for resource configuration
locals {
  project_name = "austa-superapp"
  environment_prefix = var.environment
  
  security_controls = {
    encryption_required     = true
    audit_logging          = true
    backup_enabled         = true
    multi_az              = true
    compliance_monitoring = true
  }
  
  common_tags = {
    Project             = "AUSTA SuperApp"
    Environment         = var.environment
    ManagedBy          = "Terraform"
    HIPAA              = "true"
    DataClassification = "PHI"
    SecurityLevel      = "High"
    ComplianceScope    = "HIPAA-BAA"
  }
}

# VPC Module configuration
module "vpc" {
  source = "./vpc"
  
  vpc_cidr             = var.vpc_cidr
  environment          = var.environment
  availability_zones   = data.aws_availability_zones.available.names
  security_controls    = local.security_controls
  common_tags         = local.common_tags
}

# EKS Cluster configuration
module "eks" {
  source = "./eks"
  
  cluster_name         = "${local.project_name}-${var.environment}"
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.private_subnet_ids
  cluster_version     = var.eks_cluster_config.cluster_version
  node_instance_types = var.eks_cluster_config.node_instance_types
  node_group_size     = var.eks_cluster_config.node_group_size
  security_controls   = local.security_controls
  common_tags        = local.common_tags
}

# RDS Database configuration
module "rds" {
  source = "./rds"
  
  identifier          = "${local.project_name}-${var.environment}"
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.private_subnet_ids
  instance_class      = var.db_config.instance_class
  allocated_storage   = var.db_config.allocated_storage
  engine_version      = var.db_config.engine_version
  multi_az           = var.db_config.multi_az
  security_controls   = local.security_controls
  common_tags        = local.common_tags
}

# ElastiCache Redis configuration
module "redis" {
  source = "./redis"
  
  cluster_id          = "${local.project_name}-${var.environment}"
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.private_subnet_ids
  node_type           = var.redis_config.node_type
  num_cache_clusters  = var.redis_config.num_cache_clusters
  engine_version      = var.redis_config.engine_version
  security_controls   = local.security_controls
  common_tags        = local.common_tags
}

# Security monitoring and compliance
module "security" {
  source = "./security"
  
  project_name        = local.project_name
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  eks_cluster_name    = module.eks.cluster_name
  rds_instance_id     = module.rds.instance_id
  redis_cluster_id    = module.redis.cluster_id
  security_controls   = local.security_controls
  common_tags        = local.common_tags
}

# Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = module.redis.endpoint
  sensitive   = true
}

output "security_group_ids" {
  description = "Security group IDs"
  value = {
    eks   = module.eks.security_groups
    rds   = module.rds.security_group_id
    redis = module.redis.security_group_id
  }
  sensitive = true
}