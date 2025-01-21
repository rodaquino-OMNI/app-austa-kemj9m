# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for RDS configuration
locals {
  db_name                = "austa_${var.environment}"
  db_port                = 5432
  db_username            = "austa_admin"
  parameter_group_family = "postgres15"
  common_tags = merge(var.tags, {
    Name        = "${local.db_name}-rds"
    Component   = "Database"
    Service     = "PostgreSQL"
  })
}

# IAM role for enhanced monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${local.db_name}-monitoring-role"

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

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# RDS subnet group
resource "aws_db_subnet_group" "main" {
  name        = "${local.db_name}_subnet_group"
  subnet_ids  = var.private_subnet_ids
  description = "Subnet group for ${local.db_name} RDS instances"

  tags = merge(local.common_tags, {
    Name = "${local.db_name}-subnet-group"
  })
}

# RDS parameter group
resource "aws_db_parameter_group" "main" {
  family = local.parameter_group_family
  name   = "${local.db_name}_params"

  parameter {
    name  = "ssl"
    value = "1"
  }

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "all"
  }

  tags = merge(local.common_tags, {
    Name = "${local.db_name}-parameter-group"
  })
}

# RDS instance
resource "aws_db_instance" "main" {
  identifier     = local.db_name
  engine         = "postgres"
  engine_version = var.db_config.engine_version

  instance_class        = var.db_config.instance_class
  allocated_storage    = var.db_config.allocated_storage
  max_allocated_storage = var.db_config.allocated_storage * 2
  storage_type         = "gp3"
  storage_encrypted    = true
  kms_key_id          = var.data_encryption_key_arn

  db_name  = local.db_name
  username = local.db_username
  port     = local.db_port

  multi_az               = var.db_config.multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = var.db_config.backup_retention_period
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                  = aws_iam_role.rds_monitoring.arn

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${local.db_name}-final-snapshot"
  copy_tags_to_snapshot     = true

  auto_minor_version_upgrade = true
  apply_immediately         = false

  tags = merge(local.common_tags, {
    Name = "${local.db_name}-primary"
  })
}

# Security group for RDS
resource "aws_security_group" "rds" {
  name        = "${local.db_name}-sg"
  description = "Security group for ${local.db_name} RDS instance"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = local.db_port
    to_port         = local.db_port
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
    description     = "Allow PostgreSQL access from application security group"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = merge(local.common_tags, {
    Name = "${local.db_name}-security-group"
  })
}

# Application security group (placeholder for reference)
resource "aws_security_group" "app" {
  name        = "${local.db_name}-app-sg"
  description = "Security group for application instances"
  vpc_id      = var.vpc_id

  tags = merge(local.common_tags, {
    Name = "${local.db_name}-app-security-group"
  })
}

# Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "rds_identifier" {
  description = "RDS instance identifier"
  value       = aws_db_instance.main.identifier
}