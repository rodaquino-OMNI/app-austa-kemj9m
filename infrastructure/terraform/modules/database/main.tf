# AWS Provider version ~> 5.0 required for managing RDS and ElastiCache resources
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  db_name = "austa_${var.environment}"
  common_tags = merge(
    var.tags,
    {
      Project           = "AUSTA SuperApp"
      Environment      = var.environment
      ManagedBy        = "Terraform"
      ComplianceScope  = "HIPAA"
      DataClassification = "PHI"
    }
  )
}

# Security Group for Database Access
resource "aws_security_group" "database" {
  name_prefix = "${local.db_name}-db-"
  description = "Security group for AUSTA SuperApp database resources"
  vpc_id      = var.vpc_id

  # PostgreSQL access
  ingress {
    from_port       = var.rds_config.port
    to_port         = var.rds_config.port
    protocol        = "tcp"
    security_groups = var.app_security_group_ids
    description     = "PostgreSQL access from application layer"
  }

  # Redis access
  ingress {
    from_port       = var.redis_config.port
    to_port         = var.redis_config.port
    protocol        = "tcp"
    security_groups = var.app_security_group_ids
    description     = "Redis access from application layer"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = merge(local.common_tags, {
    Name = "${local.db_name}-db-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# RDS Parameter Group
resource "aws_db_parameter_group" "main" {
  name_prefix = "${local.db_name}-pg-"
  family      = var.rds_config.parameter_group_family
  description = "Custom parameter group for AUSTA SuperApp PostgreSQL"

  dynamic "parameter" {
    for_each = var.rds_config.parameters
    content {
      name  = parameter.key
      value = parameter.value
    }
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# RDS Subnet Group
resource "aws_db_subnet_group" "main" {
  name_prefix = "${local.db_name}-subnet-"
  description = "Subnet group for AUSTA SuperApp RDS instance"
  subnet_ids  = var.private_subnet_ids

  tags = local.common_tags
}

# IAM Role for Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name_prefix = "rds-monitoring-${var.environment}-"
  description = "IAM role for RDS enhanced monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  managed_policy_arns = ["arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"]
  tags               = local.common_tags
}

# RDS Instance
resource "aws_db_instance" "main" {
  identifier     = local.db_name
  engine         = "postgres"
  engine_version = var.rds_config.engine_version
  instance_class = var.rds_config.instance_class

  allocated_storage     = var.rds_config.allocated_storage
  max_allocated_storage = var.rds_config.max_allocated_storage
  storage_type         = "gp3"
  storage_encrypted    = true
  kms_key_id          = var.kms_key_id

  db_name  = replace(local.db_name, "-", "_")
  username = var.db_master_username
  password = var.db_master_password
  port     = var.rds_config.port

  multi_az               = var.rds_config.multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]

  backup_retention_period = var.rds_config.backup_retention_period
  backup_window          = var.rds_config.backup_window
  maintenance_window     = var.rds_config.maintenance_window

  auto_minor_version_upgrade = true
  copy_tags_to_snapshot     = true
  deletion_protection       = var.rds_config.deletion_protection

  enabled_cloudwatch_logs_exports = var.rds_config.enabled_cloudwatch_logs_exports
  monitoring_interval            = var.rds_config.monitoring_interval
  monitoring_role_arn           = aws_iam_role.rds_monitoring.arn

  performance_insights_enabled          = var.rds_config.performance_insights_enabled
  performance_insights_retention_period = var.rds_config.performance_insights_retention_period
  performance_insights_kms_key_id      = var.kms_key_id

  tags = local.common_tags

  depends_on = [aws_iam_role.rds_monitoring]
}

# ElastiCache Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  family      = var.redis_config.parameter_group_family
  name_prefix = "${local.db_name}-redis-pg-"
  description = "Custom parameter group for AUSTA SuperApp Redis cluster"

  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  tags = local.common_tags
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name_prefix = "${local.db_name}-redis-subnet-"
  description = "Subnet group for AUSTA SuperApp Redis cluster"
  subnet_ids  = var.private_subnet_ids

  tags = local.common_tags
}

# Redis Replication Group
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${local.db_name}-redis"
  description         = "Redis cluster for AUSTA SuperApp session management"

  engine               = "redis"
  engine_version      = var.redis_config.engine_version
  node_type           = var.redis_config.node_type
  num_cache_clusters  = var.redis_config.num_cache_clusters
  port                = var.redis_config.port

  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.database.id]
  parameter_group_name = aws_elasticache_parameter_group.main.name

  automatic_failover_enabled = var.redis_config.automatic_failover_enabled
  multi_az_enabled         = var.redis_config.multi_az_enabled

  snapshot_retention_limit = var.redis_config.snapshot_retention_limit
  snapshot_window         = var.redis_config.snapshot_window
  maintenance_window      = var.redis_config.maintenance_window

  transit_encryption_enabled  = var.redis_config.transit_encryption_enabled
  at_rest_encryption_enabled = var.redis_config.at_rest_encryption_enabled
  kms_key_id                = var.kms_key_id
  auth_token                = var.redis_auth_token

  notification_topic_arn = var.redis_config.notification_topic_arn

  tags = local.common_tags
}

# Outputs
output "rds_endpoint" {
  description = "The connection endpoint for the RDS instance"
  value       = aws_db_instance.main.endpoint
}

output "rds_port" {
  description = "The port number for the RDS instance"
  value       = aws_db_instance.main.port
}

output "redis_primary_endpoint" {
  description = "The primary endpoint for the Redis cluster"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "The reader endpoint for the Redis cluster"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "redis_port" {
  description = "The port number for the Redis cluster"
  value       = aws_elasticache_replication_group.main.port
}