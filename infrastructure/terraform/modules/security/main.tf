# AWS Provider configuration with required version
provider "aws" {
  version = "~> 5.0"
}

# Random provider for generating unique identifiers
provider "random" {
  version = "~> 3.5"
}

# Local variables for common tags and configurations
locals {
  common_tags = {
    Environment  = var.environment
    ManagedBy    = "Terraform"
    Service      = "AUSTA SuperApp"
    HIPAA        = "true"
    LGPD         = "true"
    SOC2         = "true"
    LastUpdated  = timestamp()
    SecurityLevel = "high"
  }

  # Enhanced security rules based on compliance mode
  security_rules = {
    ingress_https = {
      type        = "ingress"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
      description = "HTTPS inbound"
    }
    egress_all = {
      type        = "egress"
      from_port   = 0
      to_port     = 0
      protocol    = "-1"
      cidr_blocks = ["0.0.0.0/0"]
      description = "All outbound traffic"
    }
  }
}

# KMS key for data encryption
resource "aws_kms_key" "app_encryption" {
  description             = "KMS key for AUSTA SuperApp data encryption"
  deletion_window_in_days = 30
  enable_key_rotation    = true
  multi_region           = true
  
  tags = merge(local.common_tags, {
    Purpose = "DataEncryption"
  })

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })
}

# Security group for application components
resource "aws_security_group" "app_security_group" {
  name        = "${var.environment}-austa-app-sg"
  description = "Security group for AUSTA SuperApp with HIPAA compliance"
  vpc_id      = var.vpc_id
  
  tags = merge(local.common_tags, {
    Name = "${var.environment}-austa-app-sg"
  })

  dynamic "ingress" {
    for_each = local.security_rules
    content {
      description = ingress.value.description
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
    }
  }
}

# WAF ACL association for CloudFront
resource "aws_wafv2_web_acl_association" "cloudfront_waf" {
  resource_arn = var.waf_config.web_acl_arn
  web_acl_arn  = aws_wafv2_web_acl.app_waf.arn
}

# WAF Web ACL with enhanced security rules
resource "aws_wafv2_web_acl" "app_waf" {
  name        = "${var.environment}-austa-waf"
  description = "WAF rules for AUSTA SuperApp"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "RateBasedRule"
    priority = 1

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_config.rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RateBasedRule"
      sampled_requests_enabled  = true
    }
  }

  rule {
    name     = "GeoMatchRule"
    priority = 2

    override_action {
      none {}
    }

    statement {
      geo_match_statement {
        country_codes = var.waf_config.geo_match_statement
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "GeoMatchRule"
      sampled_requests_enabled  = true
    }
  }

  tags = local.common_tags
}

# CloudWatch Log Group for security monitoring
resource "aws_cloudwatch_log_group" "security_logs" {
  name              = "/aws/austa/${var.environment}/security"
  retention_in_days = var.security_monitoring.log_retention_days
  kms_key_id       = aws_kms_key.app_encryption.arn

  tags = merge(local.common_tags, {
    Purpose = "SecurityMonitoring"
  })
}

# CloudWatch Metric Alarm for security incidents
resource "aws_cloudwatch_metric_alarm" "security_incidents" {
  alarm_name          = "${var.environment}-austa-security-incidents"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "SecurityIncidents"
  namespace           = "AUSTA/Security"
  period              = var.security_monitoring.monitoring_interval
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "Security incident detected in AUSTA SuperApp"
  alarm_actions      = var.security_monitoring.alert_endpoints

  tags = local.common_tags
}

# KMS grant for application encryption operations
resource "aws_kms_grant" "app_encryption_grant" {
  name              = "${var.environment}-austa-app-grant"
  key_id            = aws_kms_key.app_encryption.id
  grantee_principal = var.app_role_arn
  operations        = ["Encrypt", "Decrypt", "GenerateDataKey", "DescribeKey"]

  constraints {
    encryption_context_equals = {
      Environment = var.environment
      Application = "AUSTA SuperApp"
    }
  }
}

# Outputs for use in other modules
output "security_group_id" {
  value       = aws_security_group.app_security_group.id
  description = "ID of the created security group"
}

output "kms_key_arn" {
  value       = aws_kms_key.app_encryption.arn
  description = "ARN of the KMS key for encryption"
}

output "waf_acl_arn" {
  value       = aws_wafv2_web_acl.app_waf.arn
  description = "ARN of the WAF ACL"
}

output "security_log_group_arn" {
  value       = aws_cloudwatch_log_group.security_logs.arn
  description = "ARN of the security log group"
}