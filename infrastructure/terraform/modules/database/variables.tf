# AWS Provider version ~> 5.0 required for managing RDS and ElastiCache resources

variable "environment" {
  description = "Environment name (dev/staging/prod) for resource naming and tagging"
  type        = string
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "vpc_id" {
  description = "ID of the VPC where database resources will be deployed"
  type        = string
  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must be valid"
  }
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for database subnet groups and high availability"
  type        = list(string)
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least two private subnets are required for high availability"
  }
}

variable "kms_key_id" {
  description = "KMS key ID for database encryption at rest"
  type        = string
  validation {
    condition     = can(regex("^arn:aws:kms:", var.kms_key_id))
    error_message = "KMS key ID must be a valid ARN"
  }
}

variable "rds_config" {
  description = "PostgreSQL RDS configuration settings with HIPAA-compliant defaults"
  type = object({
    engine_version                        = string
    instance_class                        = string
    allocated_storage                     = number
    max_allocated_storage                 = number
    backup_retention_period               = number
    backup_window                         = string
    maintenance_window                    = string
    multi_az                             = bool
    deletion_protection                   = bool
    performance_insights_enabled          = bool
    performance_insights_retention_period = number
    monitoring_interval                   = number
    enabled_cloudwatch_logs_exports       = list(string)
    parameter_group_family               = string
    parameters                           = map(string)
  })

  default = {
    engine_version                        = "15.3"
    instance_class                        = "db.r6g.xlarge"
    allocated_storage                     = 100
    max_allocated_storage                 = 1000
    backup_retention_period               = 35
    backup_window                         = "03:00-04:00"
    maintenance_window                    = "Mon:04:00-Mon:05:00"
    multi_az                             = true
    deletion_protection                   = true
    performance_insights_enabled          = true
    performance_insights_retention_period = 7
    monitoring_interval                   = 1
    enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]
    parameter_group_family               = "postgres15"
    parameters = {
      "ssl"                        = "1"
      "password_encryption"        = "scram-sha-256"
      "log_statement"             = "all"
      "log_min_duration_statement" = "1000"
    }
  }
}

variable "redis_config" {
  description = "Redis ElastiCache configuration settings with high availability defaults"
  type = object({
    engine_version              = string
    node_type                   = string
    num_cache_clusters          = number
    parameter_group_family      = string
    port                        = number
    snapshot_retention_limit    = number
    snapshot_window             = string
    maintenance_window          = string
    automatic_failover_enabled  = bool
    multi_az_enabled           = bool
    transit_encryption_enabled  = bool
    at_rest_encryption_enabled = bool
    notification_topic_arn      = string
  })

  default = {
    engine_version              = "7.0"
    node_type                   = "cache.r6g.large"
    num_cache_clusters          = 3
    parameter_group_family      = "redis7"
    port                        = 6379
    snapshot_retention_limit    = 35
    snapshot_window             = "02:00-03:00"
    maintenance_window          = "sun:03:00-sun:04:00"
    automatic_failover_enabled  = true
    multi_az_enabled           = true
    transit_encryption_enabled  = true
    at_rest_encryption_enabled = true
    notification_topic_arn      = null
  }
}

variable "tags" {
  description = "Additional tags to apply to all database resources"
  type        = map(string)
  default = {
    Terraform = "true"
    Module    = "database"
  }
}