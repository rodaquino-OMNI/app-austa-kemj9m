# Core AWS region configuration
variable "aws_region" {
  type        = string
  description = "AWS region for infrastructure deployment with multi-region support"
  default     = "us-east-1"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-\\d{1}$", var.aws_region))
    error_message = "AWS region must be a valid region identifier"
  }
}

# Environment configuration
variable "environment" {
  type        = string
  description = "Deployment environment with specific security and scaling configurations"

  validation {
    condition     = contains(["dev", "staging", "prod", "dr"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod, dr"
  }
}

# VPC configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC with network segmentation"
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && regex("^10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}/16$", var.vpc_cidr)
    error_message = "VPC CIDR must be a valid IPv4 CIDR block in 10.x.x.x/16 range"
  }
}

# EKS cluster configuration
variable "eks_cluster_config" {
  type = object({
    cluster_version = string
    node_instance_types = list(string)
    node_group_size = object({
      min     = number
      max     = number
      desired = number
    })
  })
  description = "EKS cluster configuration with high availability and security settings"

  default = {
    cluster_version    = "1.27"
    node_instance_types = ["t3.xlarge", "t3.2xlarge"]
    node_group_size = {
      min     = 2
      max     = 10
      desired = 3
    }
  }

  validation {
    condition     = can(regex("^1\\.(2[6-7])$", var.eks_cluster_config.cluster_version))
    error_message = "Cluster version must be 1.26 or 1.27"
  }

  validation {
    condition     = alltrue([for t in var.eks_cluster_config.node_instance_types : can(regex("^t3\\.|^m5\\.|^r5\\.", t))])
    error_message = "Instance types must be from t3, m5, or r5 families"
  }

  validation {
    condition     = var.eks_cluster_config.node_group_size.min >= 2
    error_message = "Minimum node count must be at least 2 for HA"
  }
}

# RDS database configuration
variable "db_config" {
  type = object({
    instance_class          = string
    allocated_storage      = number
    engine_version         = string
    backup_retention_period = number
    multi_az               = bool
  })
  description = "RDS database configuration with HIPAA compliance settings"

  default = {
    instance_class          = "db.r6g.xlarge"
    allocated_storage      = 100
    engine_version         = "15.3"
    backup_retention_period = 30
    multi_az               = true
  }

  validation {
    condition     = can(regex("^db\\.(t3|r6g|m6g)\\.", var.db_config.instance_class))
    error_message = "Instance class must be from t3, r6g, or m6g families"
  }

  validation {
    condition     = var.db_config.allocated_storage >= 100
    error_message = "Allocated storage must be at least 100GB"
  }

  validation {
    condition     = can(regex("^15\\.[0-9]$", var.db_config.engine_version))
    error_message = "Engine version must be PostgreSQL 15.x"
  }

  validation {
    condition     = var.db_config.backup_retention_period >= 30
    error_message = "Backup retention must be at least 30 days for compliance"
  }
}

# ElastiCache Redis configuration
variable "redis_config" {
  type = object({
    node_type           = string
    num_cache_clusters = number
    engine_version     = string
  })
  description = "ElastiCache Redis configuration for session management"

  default = {
    node_type           = "cache.r6g.xlarge"
    num_cache_clusters = 3
    engine_version     = "7.0"
  }

  validation {
    condition     = can(regex("^cache\\.(t3|r6g|m6g)\\.", var.redis_config.node_type))
    error_message = "Node type must be from t3, r6g, or m6g families"
  }

  validation {
    condition     = var.redis_config.num_cache_clusters >= 3
    error_message = "Must have at least 3 cache clusters for HA"
  }

  validation {
    condition     = can(regex("^7\\.[0-9]$", var.redis_config.engine_version))
    error_message = "Engine version must be Redis 7.x"
  }
}

# Common resource tags
variable "tags" {
  type        = map(string)
  description = "Common resource tags for compliance and management"
  default = {
    Project            = "AUSTA SuperApp"
    ManagedBy         = "Terraform"
    HIPAA             = "true"
    Environment       = "var.environment"
    SecurityLevel     = "high"
    DataClassification = "phi"
  }
}