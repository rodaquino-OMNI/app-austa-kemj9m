# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for WAF configuration
locals {
  waf_rate_limit    = 2000
  waf_block_period  = 300
  waf_metric_prefix = "AustaSuperApp"
}

# AWS WAFv2 Web ACL for CloudFront Distribution
resource "aws_wafv2_web_acl" "cloudfront_waf" {
  name        = "${var.environment}-austa-superapp-waf"
  description = "HIPAA-compliant WAF rules for AUSTA SuperApp ${var.environment} environment"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rate-based rule to prevent DDoS attacks
  rule {
    name     = "RateLimitRule"
    priority = 1

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = local.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "${local.waf_metric_prefix}RateLimitMetric"
      sampled_requests_enabled  = true
    }
  }

  # AWS Managed Rules - Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "${local.waf_metric_prefix}CommonRulesMetric"
      sampled_requests_enabled  = true
    }
  }

  # AWS Managed Rules - Known Bad Inputs
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "${local.waf_metric_prefix}BadInputsMetric"
      sampled_requests_enabled  = true
    }
  }

  # AWS Managed Rules - SQL Injection Prevention
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "${local.waf_metric_prefix}SQLiMetric"
      sampled_requests_enabled  = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "${local.waf_metric_prefix}WAFMetrics"
    sampled_requests_enabled  = true
  }

  tags = {
    Environment    = var.environment
    Service       = "AUSTA SuperApp"
    ManagedBy     = "Terraform"
    HIPAA         = "true"
    SecurityLevel = "High"
    Compliance    = "HIPAA"
    CostCenter    = "Security"
  }
}

# Output WAF ACL ARN for CloudFront association
output "cloudfront_waf_arn" {
  description = "ARN of the WAF Web ACL for CloudFront"
  value       = aws_wafv2_web_acl.cloudfront_waf.arn
}

# Output WAF ACL ID for monitoring and logging integration
output "cloudfront_waf_id" {
  description = "ID of the WAF Web ACL for CloudFront"
  value       = aws_wafv2_web_acl.cloudfront_waf.id
}