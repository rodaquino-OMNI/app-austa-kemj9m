# AWS ElastiCache Redis Configuration for AUSTA SuperApp Platform
# Provider version: hashicorp/aws ~> 5.0

# Local variables for Redis configuration
locals {
  redis_family                = "redis7.x"
  port                       = 6379
  maintenance_window         = "sun:05:00-sun:07:00"
  snapshot_window            = "03:00-05:00"
  snapshot_retention         = 30
  monitoring_interval        = 60
  tls_security_policy       = "TLS1_2_2021"
  max_memory_policy         = "volatile-lru"
  eviction_policy           = "noeviction"
  cloudwatch_metric_interval = 60
}

# Redis subnet group for secure placement
resource "aws_elasticache_subnet_group" "redis" {
  name        = "${local.project_name}-${var.environment}-redis-subnet"
  subnet_ids  = var.private_subnet_ids
  
  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-redis-subnet"
  })
}

# Enhanced parameter group with security and performance optimizations
resource "aws_elasticache_parameter_group" "redis" {
  family = local.redis_family
  name   = "${local.project_name}-${var.environment}-redis-params"
  
  parameter {
    name  = "maxmemory-policy"
    value = local.max_memory_policy
  }
  
  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }
  
  parameter {
    name  = "timeout"
    value = "300"
  }
  
  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }
  
  parameter {
    name  = "maxmemory-samples"
    value = "10"
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-redis-params"
  })
}

# Redis replication group with high availability and encryption
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "${local.project_name}-${var.environment}-redis"
  description                   = "Redis cluster for AUSTA SuperApp with HIPAA compliance"
  node_type                     = var.redis_config.node_type
  num_cache_clusters           = var.redis_config.num_cache_clusters
  port                         = local.port
  parameter_group_name         = aws_elasticache_parameter_group.redis.name
  subnet_group_name            = aws_elasticache_subnet_group.redis.name
  security_group_ids           = [aws_security_group.redis.id]
  automatic_failover_enabled   = true
  multi_az_enabled            = true
  engine                      = "redis"
  engine_version              = var.redis_config.engine_version
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token                  = var.redis_config.auth_token
  maintenance_window          = local.maintenance_window
  snapshot_window             = local.snapshot_window
  snapshot_retention_limit    = local.snapshot_retention
  notification_topic_arn      = var.sns_topic_arn
  
  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-redis"
  })
}

# Security group for Redis access control
resource "aws_security_group" "redis" {
  name        = "${local.project_name}-${var.environment}-redis-sg"
  description = "Security group for Redis cluster with HIPAA compliance"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = local.port
    to_port         = local.port
    protocol        = "tcp"
    cidr_blocks     = [var.vpc_cidr]
    description     = "Allow Redis access from VPC"
  }

  egress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    cidr_blocks     = ["0.0.0.0/0"]
    description     = "Allow outbound traffic"
  }

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-redis-sg"
  })
}

# CloudWatch alarms for Redis monitoring
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${local.project_name}-${var.environment}-redis-cpu"
  alarm_description   = "Redis cluster CPU utilization"
  namespace           = "AWS/ElastiCache"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = local.cloudwatch_metric_interval
  evaluation_periods  = 2
  threshold           = 75
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  
  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.redis.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-redis-cpu-alarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${local.project_name}-${var.environment}-redis-memory"
  alarm_description   = "Redis cluster memory usage"
  namespace           = "AWS/ElastiCache"
  metric_name         = "DatabaseMemoryUsagePercentage"
  statistic           = "Average"
  period              = local.cloudwatch_metric_interval
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
  
  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.redis.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-redis-memory-alarm"
  })
}

# Outputs for other modules
output "redis_endpoint" {
  description = "Redis cluster endpoint for application configuration"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port for application configuration"
  value       = local.port
}

output "redis_security_group_id" {
  description = "Security group ID for application security group rules"
  value       = aws_security_group.redis.id
}